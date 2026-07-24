export const STORE_SCHEMA_VERSION = 2;
export const RECENT_URL_LIMIT = 50;
export const MIN_VIEWPORT_SIZE = 240;
export const MAX_VIEWPORT_SIZE = 7680;
export const MIN_BOARD_SCALE = 0.25;
export const MAX_BOARD_SCALE = 1;

export type ViewportCategory = 'phone' | 'tablet' | 'desktop' | 'custom';

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
