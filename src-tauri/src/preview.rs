use std::{
    collections::{HashMap, HashSet},
    fs,
    sync::{mpsc, Mutex},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use base64::{engine::general_purpose::STANDARD as BASE64, Engine as _};
use serde::{Deserialize, Serialize};
use tauri::{
    webview::{NewWindowResponse, PageLoadEvent, WebviewBuilder},
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, State, Webview, WebviewUrl,
};
#[cfg(windows)]
use tauri::{PhysicalPosition, PhysicalSize, Rect};
use url::Url;

const NAVIGATION_EVENT: &str = "devbrowzer://navigation";
const STATUS_EVENT: &str = "devbrowzer://status";
const ACTIVE_PREVIEW_EVENT: &str = "devbrowzer://active-preview";
const NAVIGATION_TITLE_PREFIX: &str = "__DEVBROWZER_NAV__";
const TRANSACTION_WINDOW: Duration = Duration::from_millis(1_500);
const MIN_VIEWPORT_SIZE: u32 = 240;
const MAX_VIEWPORT_SIZE: u32 = 7_680;
const MIN_SCALE: f64 = 0.25;
const MAX_SCALE: f64 = 1.0;
const TOOLBAR_ORIGIN: &str = "__toolbar__";
const POPUP_ORIGIN: &str = "__popup__";

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PreviewSpec {
    id: String,
    #[allow(dead_code)]
    name: String,
    width: u32,
    height: u32,
    device_profile: PreviewDeviceProfile,
}

#[derive(Debug, Clone, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
struct PreviewDeviceProfile {
    device_pixel_ratio: f64,
    user_agent: String,
    touch_enabled: bool,
    color_scheme: String,
    network_profile: String,
    reduced_motion: bool,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewLayout {
    id: String,
    x: i32,
    y: i32,
    width: u32,
    height: u32,
    viewport_width: u32,
    viewport_height: u32,
    scale: f64,
    visible: bool,
    occlusion: Option<PreviewRectangle>,
}

#[derive(Debug, Clone, Copy, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewRectangle {
    x: i32,
    y: i32,
    width: u32,
    height: u32,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct NavigationPayload {
    source_id: String,
    url: String,
    epoch: u64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct StatusPayload {
    source_id: String,
    state: &'static str,
    message: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreviewCapture {
    id: String,
    path: String,
    width: u32,
    height: u32,
    captured_at: u128,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CaptureSession {
    name: String,
    captures: Vec<PreviewCaptureInput>,
    annotations: HashMap<String, String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PreviewCaptureInput {
    id: String,
    path: String,
    width: u32,
    height: u32,
}

#[derive(Default)]
pub struct PreviewCoordinator {
    inner: Mutex<CoordinatorState>,
}

#[derive(Debug)]
struct CoordinatorState {
    preview_ids: HashSet<String>,
    preview_specs: HashMap<String, PreviewSpec>,
    canonical_url: Option<String>,
    epoch: u64,
    sync_enabled: bool,
    globally_visible: bool,
    layout_visibility: HashMap<String, bool>,
    failed_previews: HashSet<String>,
    pending_followers: HashSet<String>,
    transaction_origin: Option<String>,
    transaction_started: Option<Instant>,
    divergence_counts: HashMap<String, u8>,
}

impl Default for CoordinatorState {
    fn default() -> Self {
        Self {
            preview_ids: HashSet::new(),
            preview_specs: HashMap::new(),
            canonical_url: None,
            epoch: 0,
            sync_enabled: true,
            globally_visible: true,
            layout_visibility: HashMap::new(),
            failed_previews: HashSet::new(),
            pending_followers: HashSet::new(),
            transaction_origin: None,
            transaction_started: None,
            divergence_counts: HashMap::new(),
        }
    }
}

#[derive(Debug)]
enum NavigationAction {
    Noop,
    Propagate {
        url: String,
        targets: Vec<String>,
        epoch: u64,
        emit: bool,
    },
    RestoreFollower {
        url: String,
        target: String,
        report_conflict: bool,
    },
}

impl PreviewCoordinator {
    fn begin_navigation(&self, url: String, source: Option<&str>) -> (u64, Vec<String>) {
        let mut state = self
            .inner
            .lock()
            .expect("preview coordinator lock poisoned");
        start_transaction(&mut state, url, source.unwrap_or(TOOLBAR_ORIGIN).to_owned())
    }

    fn record_navigation(&self, source_id: &str, url: &str) -> NavigationAction {
        let mut state = self
            .inner
            .lock()
            .expect("preview coordinator lock poisoned");
        if state.canonical_url.as_deref() == Some(url) {
            state.pending_followers.remove(source_id);
            return NavigationAction::Noop;
        }

        if !state.sync_enabled {
            state.epoch += 1;
            state.canonical_url = Some(url.to_owned());
            state.pending_followers.clear();
            return NavigationAction::Propagate {
                url: url.to_owned(),
                targets: Vec::new(),
                epoch: state.epoch,
                emit: true,
            };
        }

        let transaction_active = state
            .transaction_started
            .is_some_and(|started| started.elapsed() <= TRANSACTION_WINDOW);
        let is_current_origin =
            state.transaction_origin.as_deref() == Some(source_id) && transaction_active;

        if transaction_active
            && (is_current_origin || state.transaction_origin.as_deref() == Some(TOOLBAR_ORIGIN))
        {
            let (epoch, targets) =
                start_transaction(&mut state, url.to_owned(), source_id.to_owned());
            return NavigationAction::Propagate {
                url: url.to_owned(),
                targets,
                epoch,
                emit: true,
            };
        }

        if transaction_active {
            let canonical = state
                .canonical_url
                .clone()
                .unwrap_or_else(|| url.to_owned());
            let divergence_count = state
                .divergence_counts
                .entry(source_id.to_owned())
                .and_modify(|count| *count = count.saturating_add(1))
                .or_insert(1);
            return NavigationAction::RestoreFollower {
                url: canonical,
                target: source_id.to_owned(),
                report_conflict: *divergence_count > 1,
            };
        }

        let (epoch, targets) = start_transaction(&mut state, url.to_owned(), source_id.to_owned());
        NavigationAction::Propagate {
            url: url.to_owned(),
            targets,
            epoch,
            emit: true,
        }
    }

    fn set_previews(&self, previews: &[PreviewSpec], canonical_url: String) {
        let mut state = self
            .inner
            .lock()
            .expect("preview coordinator lock poisoned");
        let ids = previews
            .iter()
            .map(|preview| preview.id.clone())
            .collect::<HashSet<_>>();
        state.layout_visibility.retain(|id, _| ids.contains(id));
        state.failed_previews.retain(|id| ids.contains(id));
        state.preview_ids = ids;
        state.preview_specs = previews
            .iter()
            .cloned()
            .map(|preview| (preview.id.clone(), preview))
            .collect();
        state.canonical_url = Some(canonical_url);
        state.epoch += 1;
        state.transaction_origin = Some(TOOLBAR_ORIGIN.to_owned());
        state.transaction_started = Some(Instant::now());
        state.pending_followers = state.preview_ids.clone();
        state.divergence_counts.clear();
    }
}

fn start_transaction(
    state: &mut CoordinatorState,
    url: String,
    origin: String,
) -> (u64, Vec<String>) {
    state.epoch += 1;
    state.canonical_url = Some(url);
    state.transaction_origin = Some(origin.clone());
    state.transaction_started = Some(Instant::now());
    state.divergence_counts.clear();
    state.pending_followers = state
        .preview_ids
        .iter()
        .filter(|id| id.as_str() != origin)
        .cloned()
        .collect();
    (
        state.epoch,
        state.pending_followers.iter().cloned().collect(),
    )
}

#[tauri::command]
pub async fn reconcile_previews(
    webview: Webview,
    app: AppHandle,
    coordinator: State<'_, PreviewCoordinator>,
    previews: Vec<PreviewSpec>,
    url: String,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let canonical_url = validate_preview_url(&url)?;
    validate_preview_specs(&previews)?;

    let desired_ids: HashSet<String> = previews.iter().map(|preview| preview.id.clone()).collect();
    let (current_ids, current_specs) = {
        let state = coordinator
            .inner
            .lock()
            .map_err(|_| "Unable to access preview state.".to_owned())?;
        (state.preview_ids.clone(), state.preview_specs.clone())
    };

    for removed_id in current_ids.difference(&desired_ids) {
        if let Some(preview) = app.get_webview(&preview_label(removed_id)) {
            let _ = preview.close();
        }
    }

    for preview in &previews {
        if current_specs
            .get(&preview.id)
            .is_some_and(|current| current != preview)
        {
            if let Some(existing) = app.get_webview(&preview_label(&preview.id)) {
                let _ = existing.close();
            }
        }
    }

    coordinator.set_previews(&previews, canonical_url.clone());

    let parent = app
        .get_window("main")
        .ok_or_else(|| "The main workbench window is unavailable.".to_owned())?;
    let parsed_url = Url::parse(&canonical_url).map_err(|error| error.to_string())?;

    for preview_spec in previews {
        if app.get_webview(&preview_label(&preview_spec.id)).is_some() {
            continue;
        }

        let label = preview_label(&preview_spec.id);
        let source_id = preview_spec.id.clone();
        let navigation_app = app.clone();
        let title_app = app.clone();
        let popup_app = app.clone();
        let status_app = app.clone();
        let title_source_id = source_id.clone();
        let popup_source_id = source_id.clone();
        let status_source_id = source_id.clone();
        let script = navigation_observer_script();
        let device_profile = preview_spec.device_profile.clone();

        let mut builder = WebviewBuilder::new(&label, WebviewUrl::External(parsed_url.clone()))
            .devtools(true)
            .zoom_hotkeys_enabled(false)
            .initialization_script(script)
            .on_navigation(move |next_url| {
                if !is_allowed_url(next_url) {
                    return false;
                }
                handle_navigation_event(&navigation_app, &source_id, next_url.as_str());
                true
            })
            .on_document_title_changed(move |_webview, title| {
                if let Some(url) = decode_navigation_title(&title) {
                    handle_navigation_event(&title_app, &title_source_id, &url);
                }
            })
            .on_new_window(move |next_url, _features| {
                if is_allowed_url(&next_url) {
                    handle_popup_navigation(&popup_app, &popup_source_id, next_url.as_str());
                }
                NewWindowResponse::Deny
            })
            .on_page_load(move |_webview, payload| match payload.event() {
                PageLoadEvent::Started => {
                    emit_status(&status_app, &status_source_id, "loading", None);
                }
                PageLoadEvent::Finished => {
                    #[cfg(not(windows))]
                    emit_status(&status_app, &status_source_id, "ready", None);
                }
            });
        if !device_profile.user_agent.trim().is_empty() {
            builder = builder.user_agent(device_profile.user_agent.trim());
        }

        let child = parent
            .add_child(
                builder,
                LogicalPosition::new(-10_000.0, -10_000.0),
                LogicalSize::new(1.0, 1.0),
            )
            .map_err(|error| format!("Unable to create preview {}: {error}", preview_spec.id))?;
        let _ = child.hide();
        install_native_navigation_observers(&child, app.clone(), preview_spec.id.clone())?;
        apply_device_profile(&child, &preview_spec)?;
    }

    navigate_targets(
        &app,
        &canonical_url,
        desired_ids.into_iter().collect::<Vec<_>>(),
    );
    Ok(())
}

#[tauri::command]
pub async fn set_preview_layout(
    webview: Webview,
    app: AppHandle,
    coordinator: State<'_, PreviewCoordinator>,
    layouts: Vec<PreviewLayout>,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let (globally_visible, failed_previews) = {
        let mut state = coordinator
            .inner
            .lock()
            .map_err(|_| "Unable to access preview state.".to_owned())?;
        for layout in &layouts {
            state
                .layout_visibility
                .insert(layout.id.clone(), layout.visible);
        }
        (state.globally_visible, state.failed_previews.clone())
    };

    for layout in layouts {
        let scale = layout.scale.clamp(MIN_SCALE, MAX_SCALE);
        let preview = match app.get_webview(&preview_label(&layout.id)) {
            Some(preview) => preview,
            None => continue,
        };
        set_preview_bounds_and_zoom(&preview, &layout, scale)?;
        if globally_visible && layout.visible && !failed_previews.contains(&layout.id) {
            preview.show().map_err(|error| error.to_string())?;
        } else {
            preview.hide().map_err(|error| error.to_string())?;
        }
    }

    Ok(())
}

#[tauri::command]
pub async fn bring_preview_to_front(
    webview: Webview,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let preview = app
        .get_webview(&preview_label(&id))
        .ok_or_else(|| format!("Unknown preview: {id}"))?;
    bring_webview_to_front(&preview)
}

#[tauri::command]
pub async fn navigate_previews(
    webview: Webview,
    app: AppHandle,
    coordinator: State<'_, PreviewCoordinator>,
    url: String,
    source: Option<String>,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let canonical_url = validate_preview_url(&url)?;
    let (_, targets) = coordinator.begin_navigation(canonical_url.clone(), source.as_deref());
    navigate_targets(&app, &canonical_url, targets);
    Ok(())
}

#[tauri::command]
pub async fn reload_previews(webview: Webview, app: AppHandle) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    for preview in preview_webviews(&app) {
        preview.reload().map_err(|error| error.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn reload_preview(webview: Webview, app: AppHandle, id: String) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let preview = app
        .get_webview(&preview_label(&id))
        .ok_or_else(|| format!("Preview {id} does not exist."))?;
    preview.reload().map_err(|error| error.to_string())
}

#[tauri::command]
pub async fn open_preview_devtools(
    webview: Webview,
    app: AppHandle,
    id: String,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let preview = app
        .get_webview(&preview_label(&id))
        .ok_or_else(|| format!("Preview {id} does not exist."))?;
    preview.open_devtools();
    Ok(())
}

#[tauri::command]
pub async fn set_previews_visible(
    webview: Webview,
    app: AppHandle,
    coordinator: State<'_, PreviewCoordinator>,
    visible: bool,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let (layout_visibility, failed_previews) = {
        let mut state = coordinator
            .inner
            .lock()
            .map_err(|_| "Unable to access preview state.".to_owned())?;
        state.globally_visible = visible;
        (
            state.layout_visibility.clone(),
            state.failed_previews.clone(),
        )
    };
    for preview in preview_webviews(&app) {
        let id = preview_id(preview.label());
        if visible
            && layout_visibility.get(id).copied().unwrap_or(false)
            && !failed_previews.contains(id)
        {
            preview.show().map_err(|error| error.to_string())?;
        } else {
            preview.hide().map_err(|error| error.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn set_navigation_sync(
    webview: Webview,
    coordinator: State<'_, PreviewCoordinator>,
    enabled: bool,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    let mut state = coordinator
        .inner
        .lock()
        .map_err(|_| "Unable to access preview state.".to_owned())?;
    state.sync_enabled = enabled;
    state.transaction_started = None;
    state.transaction_origin = None;
    state.pending_followers.clear();
    state.divergence_counts.clear();
    Ok(())
}

#[tauri::command]
pub async fn close_previews(
    webview: Webview,
    app: AppHandle,
    coordinator: State<'_, PreviewCoordinator>,
) -> Result<(), String> {
    ensure_main_caller(&webview)?;
    for preview in preview_webviews(&app) {
        let _ = preview.close();
    }
    let mut state = coordinator
        .inner
        .lock()
        .map_err(|_| "Unable to access preview state.".to_owned())?;
    *state = CoordinatorState::default();
    Ok(())
}

fn handle_navigation_event(app: &AppHandle, source_id: &str, raw_url: &str) {
    let Ok(url) = validate_preview_url(raw_url) else {
        return;
    };
    let coordinator = app.state::<PreviewCoordinator>();
    match coordinator.record_navigation(source_id, &url) {
        NavigationAction::Noop => {}
        NavigationAction::Propagate {
            url,
            targets,
            epoch,
            emit,
        } => {
            navigate_targets(app, &url, targets);
            if emit {
                emit_navigation(app, source_id, &url, epoch);
            }
        }
        NavigationAction::RestoreFollower {
            url,
            target,
            report_conflict,
        } => {
            navigate_targets(app, &url, vec![target.clone()]);
            if report_conflict {
                emit_status(
                    app,
                    &target,
                    "error",
                    Some(
                        "This preview repeatedly redirected away from the synchronized URL.".into(),
                    ),
                );
            }
        }
    }
}

fn handle_popup_navigation(app: &AppHandle, source_id: &str, raw_url: &str) {
    let Ok(url) = validate_preview_url(raw_url) else {
        return;
    };
    let coordinator = app.state::<PreviewCoordinator>();
    let (epoch, targets) = coordinator.begin_navigation(url.clone(), Some(POPUP_ORIGIN));
    navigate_targets(app, &url, targets);
    emit_navigation(app, source_id, &url, epoch);
}

fn navigate_targets(app: &AppHandle, url: &str, target_ids: Vec<String>) {
    let Ok(parsed_url) = Url::parse(url) else {
        return;
    };
    for target_id in target_ids {
        if let Some(preview) = app.get_webview(&preview_label(&target_id)) {
            let _ = preview.navigate(parsed_url.clone());
        }
    }
}

fn emit_navigation(app: &AppHandle, source_id: &str, url: &str, epoch: u64) {
    let _ = app.emit_to(
        "main",
        NAVIGATION_EVENT,
        NavigationPayload {
            source_id: source_id.to_owned(),
            url: url.to_owned(),
            epoch,
        },
    );
}

fn emit_status(app: &AppHandle, source_id: &str, state: &'static str, message: Option<String>) {
    let _ = app.emit_to(
        "main",
        STATUS_EVENT,
        StatusPayload {
            source_id: source_id.to_owned(),
            state,
            message,
        },
    );
}

fn ensure_main_caller(webview: &Webview) -> Result<(), String> {
    if webview.label() != "main" {
        return Err("This command is only available to the trusted workbench shell.".to_owned());
    }
    Ok(())
}

fn unix_millis() -> Result<u128, String> {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis())
        .map_err(|error| error.to_string())
}

fn escape_html(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(windows)]
fn capture_preview_png(preview: &Webview) -> Result<Vec<u8>, String> {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;

    let (sender, receiver) = mpsc::channel::<Result<String, String>>();
    preview
        .with_webview(move |platform_webview| unsafe {
            let Ok(core_webview) = platform_webview.controller().CoreWebView2() else {
                let _ = sender.send(Err("Unable to access the WebView2 capture API.".to_owned()));
                return;
            };
            let method = HSTRING::from("Page.captureScreenshot");
            let parameters = HSTRING::from(
                serde_json::json!({
                    "format": "png",
                    "fromSurface": true,
                    "captureBeyondViewport": false
                })
                .to_string(),
            );
            let callback_sender = sender.clone();
            let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(
                move |result, response| {
                    let payload = result
                        .map(|_| response)
                        .map_err(|error| format!("Unable to capture preview: {error}"));
                    let _ = callback_sender.send(payload);
                    Ok(())
                },
            ));
            if let Err(error) =
                core_webview.CallDevToolsProtocolMethod(&method, &parameters, &handler)
            {
                let _ = sender.send(Err(format!("Unable to capture preview: {error}")));
            }
        })
        .map_err(|error| error.to_string())?;

    let response = receiver
        .recv_timeout(Duration::from_secs(15))
        .map_err(|_| "Timed out while capturing the preview.".to_owned())??;
    let payload: serde_json::Value =
        serde_json::from_str(&response).map_err(|error| error.to_string())?;
    let encoded = payload
        .get("data")
        .and_then(serde_json::Value::as_str)
        .ok_or_else(|| "WebView2 returned an invalid screenshot.".to_owned())?;
    BASE64.decode(encoded).map_err(|error| error.to_string())
}

#[cfg(not(windows))]
fn capture_preview_png(_preview: &Webview) -> Result<Vec<u8>, String> {
    Err("Preview capture is currently available on Windows only.".to_owned())
}

fn validate_preview_url(input: &str) -> Result<String, String> {
    let parsed = Url::parse(input).map_err(|_| "Enter a valid HTTP(S) address.".to_owned())?;
    if !is_allowed_url(&parsed) {
        return Err("Only HTTP and HTTPS addresses can be previewed.".to_owned());
    }
    if parsed.host_str().is_none() {
        return Err("The preview address must include a host.".to_owned());
    }
    Ok(parsed.to_string())
}

fn is_allowed_url(url: &Url) -> bool {
    matches!(url.scheme(), "http" | "https") && url.host_str().is_some()
}

fn validate_preview_specs(previews: &[PreviewSpec]) -> Result<(), String> {
    let mut ids = HashSet::new();
    for preview in previews {
        if !is_valid_preview_id(&preview.id) {
            return Err(format!("Invalid preview identifier: {}", preview.id));
        }
        if !ids.insert(&preview.id) {
            return Err(format!("Duplicate preview identifier: {}", preview.id));
        }
        if preview.width < MIN_VIEWPORT_SIZE
            || preview.height < MIN_VIEWPORT_SIZE
            || preview.width > MAX_VIEWPORT_SIZE
            || preview.height > MAX_VIEWPORT_SIZE
        {
            return Err(format!(
                "Preview {} must be between {MIN_VIEWPORT_SIZE} and {MAX_VIEWPORT_SIZE} pixels.",
                preview.id
            ));
        }
        let profile = &preview.device_profile;
        if !profile.device_pixel_ratio.is_finite()
            || !(0.5..=4.0).contains(&profile.device_pixel_ratio)
        {
            return Err(format!(
                "Preview {} has an invalid device pixel ratio.",
                preview.id
            ));
        }
        if profile.user_agent.len() > 512 {
            return Err(format!("Preview {} has an invalid user agent.", preview.id));
        }
        if !matches!(profile.color_scheme.as_str(), "system" | "light" | "dark") {
            return Err(format!(
                "Preview {} has an invalid color scheme.",
                preview.id
            ));
        }
        if !matches!(
            profile.network_profile.as_str(),
            "online" | "fast-3g" | "slow-3g" | "offline"
        ) {
            return Err(format!(
                "Preview {} has an invalid network profile.",
                preview.id
            ));
        }
    }
    Ok(())
}

fn is_valid_preview_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= 96
        && id
            .chars()
            .all(|character| character.is_ascii_alphanumeric() || matches!(character, '-' | '_'))
}

fn preview_label(id: &str) -> String {
    format!("preview-{id}")
}

fn preview_id(label: &str) -> &str {
    label.strip_prefix("preview-").unwrap_or(label)
}

fn preview_webviews(app: &AppHandle) -> Vec<Webview> {
    app.webviews()
        .into_values()
        .filter(|webview| webview.label().starts_with("preview-"))
        .collect()
}

fn decode_navigation_title(title: &str) -> Option<String> {
    let encoded = title.strip_prefix(NAVIGATION_TITLE_PREFIX)?;
    let decoded = BASE64.decode(encoded).ok()?;
    let url = String::from_utf8(decoded).ok()?;
    validate_preview_url(&url).ok()
}

fn navigation_observer_script() -> String {
    format!(
        r#"
(() => {{
  if (window.top !== window || window.__DEVBROWZER_NAV_OBSERVER__) return;
  window.__DEVBROWZER_NAV_OBSERVER__ = true;
  const prefix = "{NAVIGATION_TITLE_PREFIX}";
  const report = () => {{
    const originalTitle = document.title;
    const encoded = btoa(unescape(encodeURIComponent(window.location.href)));
    const marker = prefix + encoded;
    document.title = marker;
    queueMicrotask(() => {{
      if (document.title === marker) document.title = originalTitle;
    }});
  }};
  for (const method of ["pushState", "replaceState"]) {{
    const original = history[method].bind(history);
    history[method] = (...args) => {{
      const result = original(...args);
      queueMicrotask(report);
      return result;
    }};
  }}
  addEventListener("popstate", report);
  addEventListener("hashchange", report);
  addEventListener("DOMContentLoaded", report, {{ once: true }});
}})();
"#
    )
}

#[cfg(windows)]
fn call_devtools_method(preview: &Webview, method: &str, parameters: serde_json::Value) {
    use webview2_com::CallDevToolsProtocolMethodCompletedHandler;
    use windows::core::HSTRING;

    let method = method.to_owned();
    let parameters = parameters.to_string();
    let _ = preview.with_webview(move |platform_webview| unsafe {
        let Ok(core_webview) = platform_webview.controller().CoreWebView2() else {
            return;
        };
        let method = HSTRING::from(method);
        let parameters = HSTRING::from(parameters);
        let handler = CallDevToolsProtocolMethodCompletedHandler::create(Box::new(|_, _| Ok(())));
        let _ = core_webview.CallDevToolsProtocolMethod(&method, &parameters, &handler);
    });
}

#[cfg(windows)]
fn apply_device_profile(preview: &Webview, spec: &PreviewSpec) -> Result<(), String> {
    let profile = &spec.device_profile;
    if (profile.device_pixel_ratio - 1.0).abs() >= f64::EPSILON {
        call_devtools_method(
            preview,
            "Emulation.setDeviceMetricsOverride",
            serde_json::json!({
                // Width and height must remain zero so WebView2 derives the CSS viewport from
                // SetBoundsAndZoomFactor. A fixed emulated size is divided by the board zoom.
                "width": 0,
                "height": 0,
                "deviceScaleFactor": profile.device_pixel_ratio,
                "mobile": false
            }),
        );
    }
    call_devtools_method(
        preview,
        "Emulation.setTouchEmulationEnabled",
        serde_json::json!({
            "enabled": profile.touch_enabled,
            "maxTouchPoints": if profile.touch_enabled { 5 } else { 1 }
        }),
    );

    let mut media_features = Vec::new();
    if profile.color_scheme != "system" {
        media_features.push(serde_json::json!({
            "name": "prefers-color-scheme",
            "value": profile.color_scheme
        }));
    }
    if profile.reduced_motion {
        media_features.push(serde_json::json!({
            "name": "prefers-reduced-motion",
            "value": "reduce"
        }));
    }
    call_devtools_method(
        preview,
        "Emulation.setEmulatedMedia",
        serde_json::json!({ "features": media_features }),
    );

    call_devtools_method(preview, "Network.enable", serde_json::json!({}));
    let (offline, latency, download, upload, connection_type) =
        match profile.network_profile.as_str() {
            "fast-3g" => (false, 150, 200_000, 93_750, "cellular3g"),
            "slow-3g" => (false, 400, 50_000, 50_000, "cellular3g"),
            "offline" => (true, 0, 0, 0, "none"),
            _ => (false, 0, -1, -1, "none"),
        };
    call_devtools_method(
        preview,
        "Network.emulateNetworkConditions",
        serde_json::json!({
            "offline": offline,
            "latency": latency,
            "downloadThroughput": download,
            "uploadThroughput": upload,
            "connectionType": connection_type
        }),
    );
    Ok(())
}

#[tauri::command]
pub async fn capture_previews(
    webview: Webview,
    app: AppHandle,
    coordinator: State<'_, PreviewCoordinator>,
    ids: Vec<String>,
) -> Result<Vec<PreviewCapture>, String> {
    ensure_main_caller(&webview)?;
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    let specs = coordinator
        .inner
        .lock()
        .map_err(|_| "Unable to access preview state.".to_owned())?
        .preview_specs
        .clone();
    let captured_at = unix_millis()?;
    let capture_directory = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?
        .join("captures")
        .join(captured_at.to_string());
    fs::create_dir_all(&capture_directory).map_err(|error| error.to_string())?;

    let mut captures = Vec::new();
    for id in ids {
        if !is_valid_preview_id(&id) {
            return Err(format!("Invalid preview identifier: {id}"));
        }
        let spec = specs
            .get(&id)
            .ok_or_else(|| format!("Preview {id} does not exist."))?;
        let preview = app
            .get_webview(&preview_label(&id))
            .ok_or_else(|| format!("Preview {id} does not exist."))?;
        let png = capture_preview_png(&preview)?;
        let path = capture_directory.join(format!("{id}.png"));
        fs::write(&path, png).map_err(|error| error.to_string())?;
        captures.push(PreviewCapture {
            id,
            path: path.to_string_lossy().to_string(),
            width: spec.width,
            height: spec.height,
            captured_at,
        });
    }

    Ok(captures)
}

#[tauri::command]
pub async fn export_capture_report(
    webview: Webview,
    app: AppHandle,
    project_name: String,
    sessions: Vec<CaptureSession>,
) -> Result<String, String> {
    ensure_main_caller(&webview)?;
    if sessions.is_empty() {
        return Err("Capture at least one preview set before exporting a report.".to_owned());
    }

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|error| error.to_string())?;
    let capture_root = app_data.join("captures");
    let canonical_capture_root = capture_root
        .canonicalize()
        .map_err(|_| "The capture directory is unavailable.".to_owned())?;
    let report_directory = app_data.join("reports");
    fs::create_dir_all(&report_directory).map_err(|error| error.to_string())?;

    let mut html = String::from(
        "<!doctype html><html><head><meta charset=\"utf-8\"><meta name=\"viewport\" \
         content=\"width=device-width\"><title>Dev Browzer review</title><style>\
         body{font:15px system-ui;margin:32px;color:#202124;background:#f6f7f9}\
         main{max-width:1200px;margin:auto}section,article{background:white;border:1px solid \
         #dfe1e5;border-radius:12px;padding:20px;margin:16px 0}img{max-width:100%;height:auto;\
         border:1px solid #dfe1e5}.meta{color:#687078;font-size:13px}.note{white-space:pre-wrap;\
         padding:12px;background:#f4f1ff;border-radius:8px}</style></head><body><main>",
    );
    html.push_str("<h1>");
    html.push_str(&escape_html(&project_name));
    html.push_str(" responsive review</h1>");

    for session in sessions {
        html.push_str("<section><h2>");
        html.push_str(&escape_html(&session.name));
        html.push_str("</h2>");
        for capture in session.captures {
            if !is_valid_preview_id(&capture.id) {
                continue;
            }
            let path = std::path::PathBuf::from(&capture.path);
            let Ok(canonical_path) = path.canonicalize() else {
                continue;
            };
            if !canonical_path.starts_with(&canonical_capture_root) {
                continue;
            }
            let image = fs::read(&canonical_path).map_err(|error| error.to_string())?;
            let encoded = BASE64.encode(image);
            html.push_str("<article><h3>");
            html.push_str(&escape_html(&capture.id));
            html.push_str("</h3><p class=\"meta\">");
            html.push_str(&format!("{} × {}", capture.width, capture.height));
            html.push_str("</p><img alt=\"");
            html.push_str(&escape_html(&capture.id));
            html.push_str("\" src=\"data:image/png;base64,");
            html.push_str(&encoded);
            html.push_str("\">");
            if let Some(note) = session.annotations.get(&capture.id) {
                if !note.trim().is_empty() {
                    html.push_str("<p class=\"note\">");
                    html.push_str(&escape_html(note));
                    html.push_str("</p>");
                }
            }
            html.push_str("</article>");
        }
        html.push_str("</section>");
    }
    html.push_str("</main></body></html>");

    let report_path = report_directory.join(format!("review-{}.html", unix_millis()?));
    fs::write(&report_path, html).map_err(|error| error.to_string())?;
    Ok(report_path.to_string_lossy().to_string())
}

#[cfg(not(windows))]
fn apply_device_profile(_preview: &Webview, _spec: &PreviewSpec) -> Result<(), String> {
    Ok(())
}

#[derive(Debug, PartialEq)]
struct PhysicalBounds {
    left: i32,
    top: i32,
    right: i32,
    bottom: i32,
}

#[derive(Debug, PartialEq)]
struct NativeGeometry {
    bounds: PhysicalBounds,
    zoom_factor: f64,
}

impl NativeGeometry {
    fn width(&self) -> i32 {
        self.bounds.right - self.bounds.left
    }

    fn height(&self) -> i32 {
        self.bounds.bottom - self.bounds.top
    }

    fn controller_bounds(&self) -> PhysicalBounds {
        PhysicalBounds {
            left: 0,
            top: 0,
            right: self.width(),
            bottom: self.height(),
        }
    }
}

fn calculate_native_geometry(layout: &PreviewLayout, density: f64) -> NativeGeometry {
    let left = (layout.x as f64 * density).round() as i32;
    let top = (layout.y as f64 * density).round() as i32;
    let desired_width = (layout.width as f64 * density).round().max(1.0) as i32;
    let desired_height = (layout.height as f64 * density).round().max(1.0) as i32;
    let requested_scale = layout.scale.clamp(MIN_SCALE, MAX_SCALE);
    let mut best: Option<(f64, i32, i32, f64)> = None;

    for width_delta in -16_i32..=16 {
        let width = desired_width.saturating_add(width_delta);
        if width <= 0 {
            continue;
        }
        for height_delta in -16_i32..=16 {
            let height = desired_height.saturating_add(height_delta);
            if height <= 0 {
                continue;
            }

            let width_low = width as f64 / (density * layout.viewport_width as f64);
            let width_high =
                width as f64 / (density * layout.viewport_width.saturating_sub(1).max(1) as f64);
            let height_low = height as f64 / (density * layout.viewport_height as f64);
            let height_high =
                height as f64 / (density * layout.viewport_height.saturating_sub(1).max(1) as f64);
            let low = width_low.max(height_low);
            let high = width_high.min(height_high);
            if low >= high {
                continue;
            }

            let zoom_factor = if requested_scale >= low && requested_scale < high {
                requested_scale
            } else {
                (low + high) / 2.0
            };
            let score = (zoom_factor - requested_scale).abs() * 100_000.0
                + f64::from(width_delta.abs() + height_delta.abs());
            if best
                .as_ref()
                .is_none_or(|(best_score, ..)| score < *best_score)
            {
                best = Some((score, width, height, zoom_factor));
            }
        }
    }

    let (_, width, height, zoom_factor) =
        best.unwrap_or((0.0, desired_width, desired_height, requested_scale));
    NativeGeometry {
        bounds: PhysicalBounds {
            left,
            top,
            right: left.saturating_add(width),
            bottom: top.saturating_add(height),
        },
        zoom_factor,
    }
}

#[cfg(windows)]
fn set_preview_bounds_and_zoom(
    preview: &Webview,
    layout: &PreviewLayout,
    _scale: f64,
) -> Result<(), String> {
    use windows::Win32::Foundation::RECT;

    let density = preview
        .window()
        .scale_factor()
        .map_err(|error| error.to_string())?;
    let geometry = calculate_native_geometry(layout, density);
    let occlusion = calculate_native_occlusion(layout, &geometry, density);
    preview
        .set_bounds(Rect {
            position: PhysicalPosition::new(geometry.bounds.left, geometry.bounds.top).into(),
            size: PhysicalSize::new(geometry.width() as u32, geometry.height() as u32).into(),
        })
        .map_err(|error| error.to_string())?;

    let controller_bounds = geometry.controller_bounds();
    let bounds = RECT {
        left: controller_bounds.left,
        top: controller_bounds.top,
        right: controller_bounds.right,
        bottom: controller_bounds.bottom,
    };

    preview
        .with_webview(move |platform_webview| unsafe {
            let controller = platform_webview.controller();
            if let Err(error) = controller.SetBoundsAndZoomFactor(bounds, geometry.zoom_factor) {
                eprintln!("SetBoundsAndZoomFactor failed: {error}");
            }
            let _ = apply_controller_occlusion(
                &controller,
                geometry.width(),
                geometry.height(),
                occlusion,
            );
        })
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn calculate_native_occlusion(
    layout: &PreviewLayout,
    geometry: &NativeGeometry,
    density: f64,
) -> Option<PhysicalBounds> {
    let occlusion = layout.occlusion?;
    let relative_left = (occlusion.x as f64 - layout.x as f64) * density;
    let relative_top = (occlusion.y as f64 - layout.y as f64) * density;
    let relative_right = (occlusion.x as f64 + occlusion.width as f64 - layout.x as f64) * density;
    let relative_bottom =
        (occlusion.y as f64 + occlusion.height as f64 - layout.y as f64) * density;

    let left = relative_left.floor().clamp(0.0, geometry.width() as f64) as i32;
    let top = relative_top.floor().clamp(0.0, geometry.height() as f64) as i32;
    let right = relative_right.ceil().clamp(0.0, geometry.width() as f64) as i32;
    let bottom = relative_bottom.ceil().clamp(0.0, geometry.height() as f64) as i32;

    (left < right && top < bottom).then_some(PhysicalBounds {
        left,
        top,
        right,
        bottom,
    })
}

#[cfg(windows)]
unsafe fn apply_controller_occlusion(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
    width: i32,
    height: i32,
    occlusion: Option<PhysicalBounds>,
) -> Result<(), String> {
    use windows::{
        core::{Free, Owned},
        Win32::Graphics::Gdi::{CombineRgn, CreateRectRgn, SetWindowRgn, RGN_DIFF},
    };

    let mut hwnd = Default::default();
    unsafe {
        controller
            .ParentWindow(&mut hwnd)
            .map_err(|error| error.to_string())?;

        let Some(occlusion) = occlusion else {
            if SetWindowRgn(hwnd, None, true) == 0 {
                return Err("Unable to clear the preview clipping region.".to_owned());
            }
            return Ok(());
        };

        let mut visible_region = CreateRectRgn(0, 0, width, height);
        let occlusion_region = Owned::new(CreateRectRgn(
            occlusion.left,
            occlusion.top,
            occlusion.right,
            occlusion.bottom,
        ));
        CombineRgn(
            Some(visible_region),
            Some(visible_region),
            Some(*occlusion_region),
            RGN_DIFF,
        );

        if SetWindowRgn(hwnd, Some(visible_region), true) == 0 {
            visible_region.free();
            return Err("Unable to apply the preview clipping region.".to_owned());
        }
    }

    Ok(())
}

#[cfg(windows)]
fn bring_webview_to_front(preview: &Webview) -> Result<(), String> {
    preview
        .with_webview(move |platform_webview| unsafe {
            let controller = platform_webview.controller();
            let _ = bring_controller_to_front(&controller);
        })
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
unsafe fn bring_controller_to_front(
    controller: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2Controller,
) -> Result<(), String> {
    use windows::Win32::UI::WindowsAndMessaging::{
        SetWindowPos, HWND_TOP, SWP_ASYNCWINDOWPOS, SWP_NOACTIVATE, SWP_NOMOVE, SWP_NOOWNERZORDER,
        SWP_NOSIZE,
    };

    let mut hwnd = Default::default();
    unsafe {
        controller
            .ParentWindow(&mut hwnd)
            .map_err(|error| error.to_string())?;
        SetWindowPos(
            hwnd,
            Some(HWND_TOP),
            0,
            0,
            0,
            0,
            SWP_ASYNCWINDOWPOS | SWP_NOACTIVATE | SWP_NOMOVE | SWP_NOOWNERZORDER | SWP_NOSIZE,
        )
        .map_err(|error| error.to_string())
    }
}

#[cfg(not(windows))]
fn bring_webview_to_front(_preview: &Webview) -> Result<(), String> {
    Ok(())
}

#[cfg(not(windows))]
fn set_preview_bounds_and_zoom(
    preview: &Webview,
    layout: &PreviewLayout,
    scale: f64,
) -> Result<(), String> {
    preview
        .set_position(LogicalPosition::new(layout.x as f64, layout.y as f64))
        .map_err(|error| error.to_string())?;
    preview
        .set_size(LogicalSize::new(layout.width as f64, layout.height as f64))
        .map_err(|error| error.to_string())?;
    preview.set_zoom(scale).map_err(|error| error.to_string())
}

#[cfg(windows)]
fn install_native_navigation_observers(
    preview: &Webview,
    app: AppHandle,
    source_id: String,
) -> Result<(), String> {
    use webview2_com::{
        FocusChangedEventHandler, HistoryChangedEventHandler, NavigationCompletedEventHandler,
        SourceChangedEventHandler,
    };

    preview
        .with_webview(move |platform_webview| unsafe {
            let controller = platform_webview.controller();
            let focus_app = app.clone();
            let focus_source_id = source_id.clone();
            let focus_handler = FocusChangedEventHandler::create(Box::new(
                move |controller, _args| {
                    if let Some(controller) = controller {
                        let _ = bring_controller_to_front(&controller);
                    }
                    let _ = focus_app.emit(ACTIVE_PREVIEW_EVENT, &focus_source_id);
                    Ok(())
                },
            ));
            let mut focus_token = 0;
            if let Err(error) = controller.add_GotFocus(&focus_handler, &mut focus_token) {
                emit_status(
                    &app,
                    &source_id,
                    "error",
                    Some(format!("Unable to observe WebView2 focus changes: {error}")),
                );
            }

            let Ok(core_webview) = controller.CoreWebView2() else {
                emit_status(
                    &app,
                    &source_id,
                    "error",
                    Some("Unable to access the WebView2 navigation controller.".to_owned()),
                );
                return;
            };

            let source_app = app.clone();
            let source_preview_id = source_id.clone();
            let source_handler = SourceChangedEventHandler::create(Box::new(
                move |sender, _args| {
                    if let Some(sender) = sender {
                        if let Ok(url) = read_native_webview_url(&sender) {
                            handle_navigation_event(&source_app, &source_preview_id, &url);
                        }
                    }
                    Ok(())
                },
            ));
            let mut source_token = 0;
            if let Err(error) =
                core_webview.add_SourceChanged(&source_handler, &mut source_token)
            {
                emit_status(
                    &app,
                    &source_id,
                    "error",
                    Some(format!("Unable to observe WebView2 source changes: {error}")),
                );
            }

            let history_app = app.clone();
            let history_preview_id = source_id.clone();
            let history_handler = HistoryChangedEventHandler::create(Box::new(
                move |sender, _args| {
                    if let Some(sender) = sender {
                        if let Ok(url) = read_native_webview_url(&sender) {
                            handle_navigation_event(&history_app, &history_preview_id, &url);
                        }
                    }
                    Ok(())
                },
            ));
            let mut history_token = 0;
            if let Err(error) =
                core_webview.add_HistoryChanged(&history_handler, &mut history_token)
            {
                emit_status(
                    &app,
                    &source_id,
                    "error",
                    Some(format!("Unable to observe WebView2 history changes: {error}")),
                );
            }

            let completed_app = app.clone();
            let completed_preview_id = source_id.clone();
            let completed_handler = NavigationCompletedEventHandler::create(Box::new(
                move |_sender, args| {
                    let Some(args) = args else {
                        return Ok(());
                    };
                    let mut success = windows::core::BOOL::default();
                    args.IsSuccess(&mut success)?;
                    if success.as_bool() {
                        set_preview_available(
                            &completed_app,
                            &completed_preview_id,
                            true,
                        );
                        emit_status(&completed_app, &completed_preview_id, "ready", None);
                    } else {
                        use webview2_com::Microsoft::Web::WebView2::Win32::
                            COREWEBVIEW2_WEB_ERROR_STATUS;
                        let mut status = COREWEBVIEW2_WEB_ERROR_STATUS::default();
                        args.WebErrorStatus(&mut status)?;
                        if is_nonfatal_navigation_status(status) {
                            set_preview_available(
                                &completed_app,
                                &completed_preview_id,
                                true,
                            );
                        } else {
                            set_preview_available(
                                &completed_app,
                                &completed_preview_id,
                                false,
                            );
                            emit_status(
                                &completed_app,
                                &completed_preview_id,
                                "error",
                                Some(format!("WebView2 navigation failed: {status:?}")),
                            );
                        }
                    }
                    Ok(())
                },
            ));
            let mut completed_token = 0;
            if let Err(error) =
                core_webview.add_NavigationCompleted(&completed_handler, &mut completed_token)
            {
                emit_status(
                    &app,
                    &source_id,
                    "error",
                    Some(format!("Unable to observe WebView2 load completion: {error}")),
                );
            }
        })
        .map_err(|error| error.to_string())
}

#[cfg(windows)]
fn is_nonfatal_navigation_status(
    status: webview2_com::Microsoft::Web::WebView2::Win32::COREWEBVIEW2_WEB_ERROR_STATUS,
) -> bool {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
        COREWEBVIEW2_WEB_ERROR_STATUS_VALID_AUTHENTICATION_CREDENTIALS_REQUIRED,
        COREWEBVIEW2_WEB_ERROR_STATUS_VALID_PROXY_AUTHENTICATION_REQUIRED,
    };

    matches!(
        status,
        COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED
            | COREWEBVIEW2_WEB_ERROR_STATUS_VALID_AUTHENTICATION_CREDENTIALS_REQUIRED
            | COREWEBVIEW2_WEB_ERROR_STATUS_VALID_PROXY_AUTHENTICATION_REQUIRED
    )
}

#[cfg(windows)]
fn set_preview_available(app: &AppHandle, source_id: &str, available: bool) {
    let coordinator = app.state::<PreviewCoordinator>();
    let should_show = {
        let Ok(mut state) = coordinator.inner.lock() else {
            return;
        };
        if available {
            state.failed_previews.remove(source_id);
        } else {
            state.failed_previews.insert(source_id.to_owned());
        }
        state.globally_visible
            && state
                .layout_visibility
                .get(source_id)
                .copied()
                .unwrap_or(false)
            && available
    };

    if let Some(preview) = app.get_webview(&preview_label(source_id)) {
        if should_show {
            let _ = preview.show();
        } else {
            let _ = preview.hide();
        }
    }
}

#[cfg(windows)]
unsafe fn read_native_webview_url(
    webview: &webview2_com::Microsoft::Web::WebView2::Win32::ICoreWebView2,
) -> windows::core::Result<String> {
    use windows::{core::PWSTR, Win32::System::Com::CoTaskMemFree};

    let mut source = PWSTR::null();
    unsafe {
        webview.Source(&mut source)?;
    }
    let url = unsafe { source.to_string() };
    if !source.is_null() {
        unsafe {
            CoTaskMemFree(Some(source.0.cast()));
        }
    }
    Ok(url?)
}

#[cfg(not(windows))]
fn install_native_navigation_observers(
    _preview: &Webview,
    _app: AppHandle,
    _source_id: String,
) -> Result<(), String> {
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn default_profile() -> PreviewDeviceProfile {
        PreviewDeviceProfile {
            device_pixel_ratio: 1.0,
            user_agent: String::new(),
            touch_enabled: false,
            color_scheme: "system".into(),
            network_profile: "online".into(),
            reduced_motion: false,
        }
    }

    fn preview_spec(id: &str) -> PreviewSpec {
        PreviewSpec {
            id: id.into(),
            name: id.into(),
            width: 390,
            height: 844,
            device_profile: default_profile(),
        }
    }

    fn coordinator_with_ids() -> PreviewCoordinator {
        let coordinator = PreviewCoordinator::default();
        coordinator.set_previews(
            &[
                preview_spec("phone"),
                preview_spec("tablet"),
                preview_spec("desktop"),
            ],
            "http://localhost/".to_owned(),
        );
        coordinator
    }

    #[test]
    fn validates_only_http_and_https_urls() {
        assert_eq!(
            validate_preview_url("http://localhost:5173/a?b=1#c").unwrap(),
            "http://localhost:5173/a?b=1#c"
        );
        assert!(validate_preview_url("javascript:alert(1)").is_err());
        assert!(validate_preview_url("file:///C:/secret.txt").is_err());
    }

    #[cfg(windows)]
    #[test]
    fn classifies_canceled_navigation_as_nonfatal() {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED,
            COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
        };

        assert!(is_nonfatal_navigation_status(
            COREWEBVIEW2_WEB_ERROR_STATUS_OPERATION_CANCELED,
        ));
        assert!(!is_nonfatal_navigation_status(
            COREWEBVIEW2_WEB_ERROR_STATUS_CONNECTION_ABORTED,
        ));
    }

    #[test]
    fn validates_preview_dimensions_and_identifiers() {
        let valid = PreviewSpec {
            id: "phone-portrait".into(),
            name: "Phone".into(),
            width: 390,
            height: 844,
            device_profile: default_profile(),
        };
        assert!(validate_preview_specs(&[valid]).is_ok());

        let invalid = PreviewSpec {
            id: "bad label!".into(),
            name: "Invalid".into(),
            width: 100,
            height: 100,
            device_profile: default_profile(),
        };
        assert!(validate_preview_specs(&[invalid]).is_err());

        let invalid_profile = PreviewSpec {
            device_profile: PreviewDeviceProfile {
                device_pixel_ratio: 8.0,
                ..default_profile()
            },
            ..preview_spec("invalid-profile")
        };
        assert!(validate_preview_specs(&[invalid_profile]).is_err());
    }

    #[test]
    fn source_navigation_propagates_to_followers() {
        let coordinator = coordinator_with_ids();
        {
            let mut state = coordinator.inner.lock().unwrap();
            state.transaction_started = None;
        }

        let action = coordinator.record_navigation("phone", "http://localhost/products");
        match action {
            NavigationAction::Propagate {
                targets, url, emit, ..
            } => {
                assert_eq!(url, "http://localhost/products");
                assert!(emit);
                assert_eq!(targets.len(), 2);
                assert!(!targets.contains(&"phone".to_owned()));
            }
            _ => panic!("expected propagation"),
        }
    }

    #[test]
    fn follower_echoes_do_not_create_navigation_loops() {
        let coordinator = coordinator_with_ids();
        let _ = coordinator.begin_navigation("http://localhost/next".to_owned(), Some("phone"));
        assert!(matches!(
            coordinator.record_navigation("tablet", "http://localhost/next"),
            NavigationAction::Noop
        ));
    }

    #[test]
    fn divergent_followers_are_restored_to_the_canonical_url() {
        let coordinator = coordinator_with_ids();
        let _ = coordinator.begin_navigation("http://localhost/next".to_owned(), Some("phone"));
        let action =
            coordinator.record_navigation("tablet", "http://localhost/tablet-only-redirect");
        match action {
            NavigationAction::RestoreFollower {
                url,
                target,
                report_conflict,
            } => {
                assert_eq!(url, "http://localhost/next");
                assert_eq!(target, "tablet");
                assert!(!report_conflict);
            }
            _ => panic!("expected follower restoration"),
        }

        let repeated =
            coordinator.record_navigation("tablet", "http://localhost/tablet-only-redirect");
        assert!(matches!(
            repeated,
            NavigationAction::RestoreFollower {
                report_conflict: true,
                ..
            }
        ));
    }

    #[test]
    fn toolbar_redirect_adopts_the_first_preview_as_source() {
        let coordinator = coordinator_with_ids();
        let _ = coordinator.begin_navigation("http://localhost/requested".to_owned(), None);

        let action = coordinator.record_navigation("phone", "http://localhost/redirected");
        assert!(matches!(
            action,
            NavigationAction::Propagate {
                ref url,
                ref targets,
                emit: true,
                ..
            } if url == "http://localhost/redirected"
                && targets.len() == 2
                && !targets.contains(&"phone".to_owned())
        ));
    }

    #[test]
    fn reconciliation_prunes_removed_preview_state() {
        let coordinator = coordinator_with_ids();
        {
            let mut state = coordinator.inner.lock().unwrap();
            state.layout_visibility.insert("removed".into(), true);
            state.failed_previews.insert("removed".into());
        }
        coordinator.set_previews(&[preview_spec("phone")], "http://localhost/".to_owned());

        let state = coordinator.inner.lock().unwrap();
        assert!(!state.layout_visibility.contains_key("removed"));
        assert!(!state.failed_previews.contains("removed"));
        assert_eq!(state.pending_followers, HashSet::from(["phone".to_owned()]));
    }

    #[test]
    fn fits_integer_native_bounds_to_exact_css_viewport() {
        let layout = PreviewLayout {
            id: "phone".into(),
            x: 10,
            y: 20,
            width: 98,
            height: 211,
            viewport_width: 390,
            viewport_height: 844,
            scale: 0.25,
            visible: true,
            occlusion: None,
        };
        for density in [1.0, 1.25, 1.5] {
            let geometry = calculate_native_geometry(&layout, density);
            let native_width = geometry.bounds.right - geometry.bounds.left;
            let native_height = geometry.bounds.bottom - geometry.bounds.top;

            assert_eq!(
                (f64::from(native_width) / (density * geometry.zoom_factor)).ceil(),
                390.0
            );
            assert_eq!(
                (f64::from(native_height) / (density * geometry.zoom_factor)).ceil(),
                844.0
            );
            assert!((native_width - (98.0 * density).round() as i32).abs() <= 1);
            assert!((native_height - (211.0 * density).round() as i32).abs() <= 1);
            assert_eq!(
                geometry.controller_bounds(),
                PhysicalBounds {
                    left: 0,
                    top: 0,
                    right: native_width,
                    bottom: native_height,
                }
            );
        }
    }

    #[cfg(windows)]
    #[test]
    fn clips_a_background_preview_to_the_active_card_bounds() {
        let layout = PreviewLayout {
            id: "desktop".into(),
            x: 100,
            y: 200,
            width: 400,
            height: 300,
            viewport_width: 1_600,
            viewport_height: 1_200,
            scale: 0.25,
            visible: true,
            occlusion: Some(PreviewRectangle {
                x: 50,
                y: 250,
                width: 200,
                height: 100,
            }),
        };
        let geometry = NativeGeometry {
            bounds: PhysicalBounds {
                left: 100,
                top: 200,
                right: 500,
                bottom: 500,
            },
            zoom_factor: 0.25,
        };

        assert_eq!(
            calculate_native_occlusion(&layout, &geometry, 1.0),
            Some(PhysicalBounds {
                left: 0,
                top: 50,
                right: 150,
                bottom: 150,
            })
        );
    }

    #[test]
    fn title_bridge_decodes_spa_navigation() {
        let encoded = BASE64.encode("http://localhost:4173/spa?x=1#result");
        assert_eq!(
            decode_navigation_title(&format!("{NAVIGATION_TITLE_PREFIX}{encoded}")).unwrap(),
            "http://localhost:4173/spa?x=1#result"
        );
        assert!(decode_navigation_title("Normal page title").is_none());
    }

    #[test]
    fn escapes_capture_report_content() {
        assert_eq!(
            escape_html("<script>'review' & \"capture\"</script>"),
            "&lt;script&gt;&#39;review&#39; &amp; &quot;capture&quot;&lt;/script&gt;"
        );
    }
}
