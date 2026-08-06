export const STORE_SCHEMA_VERSION = 3;
export const RECENT_URL_LIMIT = 50;
export const MIN_VIEWPORT_SIZE = 240;
export const MAX_VIEWPORT_SIZE = 7680;
export const MIN_BOARD_SCALE = 0.25;
export const MAX_BOARD_SCALE = 1;

export type ViewportCategory = 'phone' | 'tablet' | 'desktop' | 'custom';
export type ViewportPresetId = 'essential' | 'mobile' | 'desktop' | 'all';
export type PreviewColorScheme = 'system' | 'light' | 'dark';
export type PreviewNetworkProfile = 'online' | 'fast-3g' | 'slow-3g' | 'offline';

export interface ViewportPreset {
  id: ViewportPresetId;
  name: string;
  description: string;
  viewportIds: string[];
}

export interface ViewportDefinition {
  id: string;
  name: string;
  width: number;
  height: number;
  category: ViewportCategory;
  builtIn: boolean;
}

export interface PreviewBoardLayout {
  x: number;
  y: number;
  scale: number;
}

export interface SavedRoute {
  id: string;
  name: string;
  url: string;
}

export interface WorkspacePreset {
  id: string;
  name: string;
  enabledViewportIds: string[];
  boardScale: number;
  previewLayouts: Record<string, PreviewBoardLayout>;
  createdAt: string;
}

export interface PreviewDeviceProfile {
  devicePixelRatio: number;
  userAgent: string;
  touchEnabled: boolean;
  colorScheme: PreviewColorScheme;
  networkProfile: PreviewNetworkProfile;
  reducedMotion: boolean;
}

export interface ProjectWorkspace {
  id: string;
  name: string;
  baseUrl: string;
  currentUrl: string;
  enabledViewportIds: string[];
  customViewports: ViewportDefinition[];
  boardScale: number;
  previewLayouts: Record<string, PreviewBoardLayout>;
  syncNavigation: boolean;
  savedRoutes: SavedRoute[];
  workspacePresets: WorkspacePreset[];
  deviceProfiles: Record<string, PreviewDeviceProfile>;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
}

export interface RecentUrl {
  url: string;
  projectId: string;
  visitedAt: string;
}

export interface PersistedAppState {
  schemaVersion: number;
  projects: ProjectWorkspace[];
  activeProjectId: string | null;
  recentUrls: RecentUrl[];
}

export interface PreviewSpec {
  id: string;
  name: string;
  width: number;
  height: number;
  deviceProfile: PreviewDeviceProfile;
}

export interface PreviewLayout {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  viewportWidth: number;
  viewportHeight: number;
  scale: number;
  visible: boolean;
  occlusion?: PreviewRectangle;
}

export interface PreviewRectangle {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PreviewLoadState = 'idle' | 'loading' | 'ready' | 'error';

export interface PreviewStatusPayload {
  sourceId: string;
  state: PreviewLoadState;
  message?: string;
}

export interface PreviewNavigationPayload {
  sourceId: string;
  url: string;
  epoch: number;
}

export interface NavigationHistory {
  entries: string[];
  index: number;
}

export interface PreviewCapture {
  id: string;
  path: string;
  width: number;
  height: number;
  capturedAt: number;
}

export interface CaptureSession {
  id: string;
  name: string;
  capturedAt: number;
  captures: PreviewCapture[];
  annotations: Record<string, string>;
}

export type BrowserCookieSameSite = 'Strict' | 'Lax' | 'None';

export interface BrowserCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: number | null;
  httpOnly: boolean;
  secure: boolean;
  sameSite: BrowserCookieSameSite | null;
}

export interface BrowserStorageEntry {
  key: string;
  value: string;
}

export interface BrowserSessionData {
  origin: string;
  cookies: BrowserCookie[];
  localStorage: BrowserStorageEntry[];
}
