import { createContext, useContext } from 'react';
import type {
  NavigationHistory,
  PersistedAppState,
  PreviewBoardLayout,
  PreviewDeviceProfile,
  PreviewStatusPayload,
  ProjectWorkspace,
  SavedRoute,
  ViewportDefinition,
  WorkspacePreset,
} from '../types';

export interface DevBrowzerContextValue {
  state: PersistedAppState;
  activeProject: ProjectWorkspace | null;
  navigationHistory: NavigationHistory | null;
  previewStatuses: Record<string, PreviewStatusPayload>;
  initialized: boolean;
  createProject: (name: string, url: string, viewportIds?: string[]) => ProjectWorkspace;
  duplicateProject: (projectId: string) => void;
  updateProject: (projectId: string, patch: Partial<ProjectWorkspace>) => void;
  deleteProject: (projectId: string) => void;
  selectProject: (projectId: string) => void;
  navigate: (url: string, options?: { pushHistory?: boolean; source?: string | null }) => void;
  moveHistory: (direction: -1 | 1) => void;
  toggleViewport: (viewportId: string) => void;
  setEnabledViewportIds: (viewportIds: string[]) => void;
  addCustomViewport: (viewport: ViewportDefinition) => void;
  duplicateCustomViewport: (viewportId: string) => void;
  updateCustomViewport: (viewport: ViewportDefinition) => void;
  removeCustomViewport: (viewportId: string) => void;
  addSavedRoute: (name: string, url: string) => SavedRoute | null;
  updateSavedRoute: (route: SavedRoute) => void;
  removeSavedRoute: (routeId: string) => void;
  moveSavedRoute: (routeId: string, direction: -1 | 1) => void;
  reorderSavedRoute: (sourceId: string, targetId: string) => void;
  saveWorkspacePreset: (name: string) => WorkspacePreset | null;
  applyWorkspacePreset: (presetId: string) => void;
  removeWorkspacePreset: (presetId: string) => void;
  setDeviceProfile: (viewportId: string, profile: PreviewDeviceProfile) => void;
  setBoardScale: (scale: number) => void;
  setPreviewLayout: (viewportId: string, layout: PreviewBoardLayout) => void;
  setPreviewLayouts: (layouts: Record<string, PreviewBoardLayout>) => void;
  resetPreviewLayouts: () => void;
  setSyncNavigation: (enabled: boolean) => void;
}

export const DevBrowzerContext = createContext<DevBrowzerContextValue | null>(null);

export function useDevBrowzer(): DevBrowzerContextValue {
  const context = useContext(DevBrowzerContext);
  if (!context) {
    throw new Error('useDevBrowzer must be used inside DevBrowzerProvider.');
  }
  return context;
}
