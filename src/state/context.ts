import { createContext, useContext } from 'react';
import type {
  NavigationHistory,
  PersistedAppState,
  PreviewBoardLayout,
  PreviewStatusPayload,
  ProjectWorkspace,
  ViewportDefinition,
} from '../types';

export interface DevBrowzerContextValue {
  state: PersistedAppState;
  activeProject: ProjectWorkspace | null;
  navigationHistory: NavigationHistory | null;
  previewStatuses: Record<string, PreviewStatusPayload>;
  initialized: boolean;
  createProject: (name: string, url: string) => ProjectWorkspace;
  updateProject: (projectId: string, patch: Partial<ProjectWorkspace>) => void;
  deleteProject: (projectId: string) => void;
  selectProject: (projectId: string) => void;
  navigate: (url: string, options?: { pushHistory?: boolean; source?: string | null }) => void;
  moveHistory: (direction: -1 | 1) => void;
  toggleViewport: (viewportId: string) => void;
  addCustomViewport: (viewport: ViewportDefinition) => void;
  updateCustomViewport: (viewport: ViewportDefinition) => void;
  removeCustomViewport: (viewportId: string) => void;
  setBoardScale: (scale: number) => void;
  setPreviewLayout: (viewportId: string, layout: PreviewBoardLayout) => void;
  setPreviewLayouts: (layouts: Record<string, PreviewBoardLayout>) => void;
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
