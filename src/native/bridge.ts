import { invoke } from '@tauri-apps/api/core';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import type {
  BrowserCookie,
  BrowserSessionData,
  PreviewLayout,
  CaptureSession,
  PreviewCapture,
  PreviewNavigationPayload,
  PreviewSpec,
  PreviewStatusPayload,
} from '../types';

export const NAVIGATION_EVENT = 'devbrowzer://navigation';
export const STATUS_EVENT = 'devbrowzer://status';
export const ACTIVE_PREVIEW_EVENT = 'devbrowzer://active-preview';

export function isTauriRuntime(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

async function invokeIfTauri<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T | null> {
  if (!isTauriRuntime()) {
    return null;
  }
  return invoke<T>(command, args);
}

export async function reconcilePreviews(previews: PreviewSpec[], url: string): Promise<void> {
  await invokeIfTauri('reconcile_previews', { previews, url });
}

export async function setPreviewLayout(layouts: PreviewLayout[]): Promise<void> {
  await invokeIfTauri('set_preview_layout', { layouts });
}

export async function navigatePreviews(url: string, source: string | null = null): Promise<void> {
  await invokeIfTauri('navigate_previews', { url, source });
}

export async function reloadPreviews(): Promise<void> {
  await invokeIfTauri('reload_previews');
}

export async function reloadPreview(id: string): Promise<void> {
  await invokeIfTauri('reload_preview', { id });
}

export async function openPreviewDevtools(id: string): Promise<void> {
  await invokeIfTauri('open_preview_devtools', { id });
}

export async function capturePreviews(ids: string[]): Promise<PreviewCapture[]> {
  return (await invokeIfTauri<PreviewCapture[]>('capture_previews', { ids })) ?? [];
}

export async function exportCaptureReport(
  projectName: string,
  sessions: CaptureSession[],
): Promise<string | null> {
  return invokeIfTauri<string>('export_capture_report', { projectName, sessions });
}

export async function bringPreviewToFront(id: string): Promise<void> {
  await invokeIfTauri('bring_preview_to_front', { id });
}

export async function setPreviewsVisible(visible: boolean): Promise<void> {
  await invokeIfTauri('set_previews_visible', { visible });
}

export async function closePreviews(): Promise<void> {
  await invokeIfTauri('close_previews');
}

export async function setNavigationSync(enabled: boolean): Promise<void> {
  await invokeIfTauri('set_navigation_sync', { enabled });
}

export async function getBrowserSessionData(id: string): Promise<BrowserSessionData | null> {
  return invokeIfTauri<BrowserSessionData>('get_browser_session_data', { id });
}

export async function setBrowserCookie(id: string, cookie: BrowserCookie): Promise<void> {
  await invokeIfTauri('set_browser_cookie', { id, cookie });
}

export async function deleteBrowserCookie(
  id: string,
  cookie: Pick<BrowserCookie, 'name' | 'domain' | 'path'>,
): Promise<void> {
  await invokeIfTauri('delete_browser_cookie', { id, cookie });
}

export async function clearBrowserCookies(id: string): Promise<void> {
  await invokeIfTauri('clear_browser_cookies', { id });
}

export async function setBrowserLocalStorage(
  id: string,
  key: string,
  value: string,
): Promise<void> {
  await invokeIfTauri('set_browser_local_storage', { id, key, value });
}

export async function deleteBrowserLocalStorage(id: string, key: string): Promise<void> {
  await invokeIfTauri('delete_browser_local_storage', { id, key });
}

export async function clearBrowserLocalStorage(id: string): Promise<void> {
  await invokeIfTauri('clear_browser_local_storage', { id });
}

export async function listenForPreviewNavigation(
  listener: (payload: PreviewNavigationPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  return listen<PreviewNavigationPayload>(NAVIGATION_EVENT, (event) => listener(event.payload));
}

export async function listenForPreviewStatus(
  listener: (payload: PreviewStatusPayload) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  return listen<PreviewStatusPayload>(STATUS_EVENT, (event) => listener(event.payload));
}

export async function listenForActivePreview(
  listener: (viewportId: string) => void,
): Promise<UnlistenFn> {
  if (!isTauriRuntime()) {
    return () => undefined;
  }
  return listen<string>(ACTIVE_PREVIEW_EVENT, (event) => listener(event.payload));
}
