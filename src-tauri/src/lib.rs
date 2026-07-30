mod preview;

use preview::PreviewCoordinator;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .manage(PreviewCoordinator::default())
        .invoke_handler(tauri::generate_handler![
            preview::reconcile_previews,
            preview::set_preview_layout,
            preview::navigate_previews,
            preview::reload_previews,
            preview::reload_preview,
            preview::open_preview_devtools,
            preview::capture_previews,
            preview::export_capture_report,
            preview::bring_preview_to_front,
            preview::set_previews_visible,
            preview::set_navigation_sync,
            preview::close_previews,
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Dev Browzer");
}
