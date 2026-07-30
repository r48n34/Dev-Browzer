import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getPreviewDeviceProfile, getProjectViewports } from '../config/viewports';
import {
  closePreviews,
  listenForPreviewNavigation,
  listenForPreviewStatus,
  navigatePreviews,
  reconcilePreviews,
  setNavigationSync,
} from '../native/bridge';
import { loadPersistedState, savePersistedState } from '../persistence/storage';
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
import { MIN_BOARD_SCALE } from '../types';
import {
  canMoveHistory,
  createNavigationHistory,
  moveNavigationHistory,
  pushNavigationHistory,
} from '../utils/history';
import {
  addRecentUrl,
  createEmptyPersistedState,
  createProjectWorkspace,
  duplicateProjectWorkspace,
} from '../utils/project';
import { normalizePreviewUrl } from '../utils/url';
import { clampBoardScale } from '../utils/viewport';
import { DevBrowzerContext, type DevBrowzerContextValue } from './context';

interface DevBrowzerProviderProps {
  children: ReactNode;
}

export function DevBrowzerProvider({ children }: DevBrowzerProviderProps) {
  const [state, setState] = useState<PersistedAppState>(createEmptyPersistedState);
  const [initialized, setInitialized] = useState(false);
  const [navigationHistory, setNavigationHistory] = useState<NavigationHistory | null>(null);
  const [previewStatuses, setPreviewStatuses] = useState<Record<string, PreviewStatusPayload>>({});
  const saveTimerRef = useRef<number | null>(null);
  const stateRef = useRef(state);
  const activeProject =
    state.projects.find((project) => project.id === state.activeProjectId) ?? null;

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let cancelled = false;
    void loadPersistedState().then((loaded) => {
      if (cancelled) {
        return;
      }
      setState(loaded);
      const active =
        loaded.projects.find((project) => project.id === loaded.activeProjectId) ??
        loaded.projects[0] ??
        null;
      setNavigationHistory(active ? createNavigationHistory(active.currentUrl) : null);
      setInitialized(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!initialized) {
      return;
    }
    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = window.setTimeout(() => {
      void savePersistedState(state);
    }, 150);
    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    };
  }, [initialized, state]);

  useEffect(() => {
    if (!initialized || !activeProject) {
      void closePreviews();
      return;
    }

    const viewports = getProjectViewports(
      activeProject.enabledViewportIds,
      activeProject.customViewports,
    );
    void setNavigationSync(activeProject.syncNavigation);
    void reconcilePreviews(
      viewports.map(({ id, name, width, height }) => ({
        id,
        name,
        width,
        height,
        deviceProfile: getPreviewDeviceProfile(activeProject.deviceProfiles, id),
      })),
      activeProject.currentUrl,
    );
  }, [
    activeProject?.currentUrl,
    activeProject?.customViewports,
    activeProject?.deviceProfiles,
    activeProject?.enabledViewportIds,
    activeProject?.id,
    activeProject?.syncNavigation,
    initialized,
  ]);

  const applyNavigation = useCallback(
    (
      projectId: string,
      rawUrl: string,
      options: { pushHistory?: boolean; invokeNative?: boolean; source?: string | null } = {},
    ) => {
      const url = normalizePreviewUrl(rawUrl);
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        projects: current.projects.map((project) =>
          project.id === projectId
            ? { ...project, currentUrl: url, updatedAt: now, lastOpenedAt: now }
            : project,
        ),
        recentUrls: addRecentUrl(current.recentUrls, url, projectId, now),
      }));
      if (options.pushHistory !== false) {
        setNavigationHistory((history) =>
          history ? pushNavigationHistory(history, url) : createNavigationHistory(url),
        );
      }
      if (options.invokeNative !== false) {
        void navigatePreviews(url, options.source ?? null);
      }
    },
    [],
  );

  useEffect(() => {
    let unlistenNavigation: () => void = () => undefined;
    let unlistenStatus: () => void = () => undefined;

    void listenForPreviewNavigation((payload) => {
      const current = stateRef.current;
      const project = current.projects.find(
        (candidate) => candidate.id === current.activeProjectId,
      );
      if (!project) {
        return;
      }
      applyNavigation(project.id, payload.url, {
        invokeNative: false,
        pushHistory: true,
        source: payload.sourceId,
      });
    }).then((unlisten) => {
      unlistenNavigation = unlisten;
    });

    void listenForPreviewStatus((payload) => {
      setPreviewStatuses((current) => ({ ...current, [payload.sourceId]: payload }));
    }).then((unlisten) => {
      unlistenStatus = unlisten;
    });

    return () => {
      unlistenNavigation();
      unlistenStatus();
    };
  }, [applyNavigation]);

  useEffect(
    () => () => {
      void closePreviews();
    },
    [],
  );

  const createProject = useCallback((name: string, rawUrl: string, viewportIds?: string[]) => {
    const project = createProjectWorkspace(name, normalizePreviewUrl(rawUrl));
    if (viewportIds?.length) {
      project.enabledViewportIds = [...viewportIds];
    }
    setState((current) => ({
      ...current,
      projects: [...current.projects, project],
      activeProjectId: project.id,
      recentUrls: addRecentUrl(current.recentUrls, project.currentUrl, project.id),
    }));
    setNavigationHistory(createNavigationHistory(project.currentUrl));
    return project;
  }, []);

  const duplicateProject = useCallback((projectId: string) => {
    setState((current) => {
      const source = current.projects.find((project) => project.id === projectId);
      if (!source) {
        return current;
      }
      const project = duplicateProjectWorkspace(source);
      setNavigationHistory(createNavigationHistory(project.currentUrl));
      return {
        ...current,
        projects: [...current.projects, project],
        activeProjectId: project.id,
        recentUrls: addRecentUrl(current.recentUrls, project.currentUrl, project.id),
      };
    });
  }, []);

  const updateProject = useCallback((projectId: string, patch: Partial<ProjectWorkspace>) => {
    const now = new Date().toISOString();
    setState((current) => ({
      ...current,
      projects: current.projects.map((project) =>
        project.id === projectId
          ? { ...project, ...patch, id: project.id, updatedAt: now }
          : project,
      ),
    }));
  }, []);

  const deleteProject = useCallback((projectId: string) => {
    setState((current) => {
      const projects = current.projects.filter((project) => project.id !== projectId);
      const nextActiveId =
        current.activeProjectId === projectId ? (projects[0]?.id ?? null) : current.activeProjectId;
      const nextActive = projects.find((project) => project.id === nextActiveId) ?? null;
      setNavigationHistory(nextActive ? createNavigationHistory(nextActive.currentUrl) : null);
      return {
        ...current,
        projects,
        activeProjectId: nextActiveId,
        recentUrls: current.recentUrls.filter((entry) => entry.projectId !== projectId),
      };
    });
  }, []);

  const selectProject = useCallback(
    (projectId: string) => {
      const now = new Date().toISOString();
      setState((current) => ({
        ...current,
        activeProjectId: projectId,
        projects: current.projects.map((project) =>
          project.id === projectId ? { ...project, lastOpenedAt: now } : project,
        ),
      }));
      setNavigationHistory((history) => {
        const project = state.projects.find((candidate) => candidate.id === projectId);
        return project ? createNavigationHistory(project.currentUrl) : history;
      });
    },
    [state.projects],
  );

  const navigate = useCallback<DevBrowzerContextValue['navigate']>(
    (url, options) => {
      if (!state.activeProjectId) {
        return;
      }
      applyNavigation(state.activeProjectId, url, {
        invokeNative: true,
        pushHistory: options?.pushHistory,
        source: options?.source,
      });
    },
    [applyNavigation, state.activeProjectId],
  );

  const moveHistory = useCallback(
    (direction: -1 | 1) => {
      setNavigationHistory((current) => {
        if (!current || !canMoveHistory(current, direction) || !state.activeProjectId) {
          return current;
        }
        const next = moveNavigationHistory(current, direction);
        const url = next.entries[next.index];
        applyNavigation(state.activeProjectId, url, {
          pushHistory: false,
          invokeNative: true,
        });
        return next;
      });
    },
    [applyNavigation, state.activeProjectId],
  );

  const toggleViewport = useCallback(
    (viewportId: string) => {
      if (!activeProject) {
        return;
      }
      const enabled = activeProject.enabledViewportIds.includes(viewportId);
      const enabledViewportIds = enabled
        ? activeProject.enabledViewportIds.filter((id) => id !== viewportId)
        : [...activeProject.enabledViewportIds, viewportId];
      if (enabledViewportIds.length === 0) {
        return;
      }
      updateProject(activeProject.id, { enabledViewportIds });
    },
    [activeProject, updateProject],
  );

  const setEnabledViewportIds = useCallback(
    (viewportIds: string[]) => {
      if (!activeProject) {
        return;
      }
      const uniqueIds = [...new Set(viewportIds)];
      if (uniqueIds.length === 0) {
        return;
      }
      updateProject(activeProject.id, { enabledViewportIds: uniqueIds });
    },
    [activeProject, updateProject],
  );

  const addCustomViewport = useCallback(
    (viewport: ViewportDefinition) => {
      if (!activeProject) {
        return;
      }
      updateProject(activeProject.id, {
        customViewports: [...activeProject.customViewports, viewport],
        enabledViewportIds: [...activeProject.enabledViewportIds, viewport.id],
      });
    },
    [activeProject, updateProject],
  );

  const duplicateCustomViewport = useCallback(
    (viewportId: string) => {
      if (!activeProject) {
        return;
      }
      const source = activeProject.customViewports.find((viewport) => viewport.id === viewportId);
      if (!source) {
        return;
      }
      const viewport: ViewportDefinition = {
        ...source,
        id: crypto.randomUUID(),
        name: `${source.name} copy`,
      };
      updateProject(activeProject.id, {
        customViewports: [...activeProject.customViewports, viewport],
        enabledViewportIds: [...activeProject.enabledViewportIds, viewport.id],
      });
    },
    [activeProject, updateProject],
  );

  const updateCustomViewport = useCallback(
    (viewport: ViewportDefinition) => {
      if (!activeProject) {
        return;
      }
      updateProject(activeProject.id, {
        customViewports: activeProject.customViewports.map((item) =>
          item.id === viewport.id ? viewport : item,
        ),
      });
    },
    [activeProject, updateProject],
  );

  const removeCustomViewport = useCallback(
    (viewportId: string) => {
      if (!activeProject) {
        return;
      }
      updateProject(activeProject.id, {
        customViewports: activeProject.customViewports.filter(
          (viewport) => viewport.id !== viewportId,
        ),
        enabledViewportIds: activeProject.enabledViewportIds.filter((id) => id !== viewportId),
        previewLayouts: Object.fromEntries(
          Object.entries(activeProject.previewLayouts).filter(([id]) => id !== viewportId),
        ),
      });
    },
    [activeProject, updateProject],
  );

  const addSavedRoute = useCallback(
    (name: string, rawUrl: string): SavedRoute | null => {
      if (!activeProject) {
        return null;
      }
      const route = {
        id: crypto.randomUUID(),
        name: name.trim(),
        url: normalizePreviewUrl(rawUrl),
      };
      updateProject(activeProject.id, { savedRoutes: [...activeProject.savedRoutes, route] });
      return route;
    },
    [activeProject, updateProject],
  );

  const updateSavedRoute = useCallback(
    (route: SavedRoute) => {
      if (!activeProject) {
        return;
      }
      updateProject(activeProject.id, {
        savedRoutes: activeProject.savedRoutes.map((item) =>
          item.id === route.id
            ? { ...route, name: route.name.trim(), url: normalizePreviewUrl(route.url) }
            : item,
        ),
      });
    },
    [activeProject, updateProject],
  );

  const removeSavedRoute = useCallback(
    (routeId: string) => {
      if (activeProject) {
        updateProject(activeProject.id, {
          savedRoutes: activeProject.savedRoutes.filter((route) => route.id !== routeId),
        });
      }
    },
    [activeProject, updateProject],
  );

  const moveSavedRoute = useCallback(
    (routeId: string, direction: -1 | 1) => {
      if (!activeProject) {
        return;
      }
      const currentIndex = activeProject.savedRoutes.findIndex((route) => route.id === routeId);
      const nextIndex = currentIndex + direction;
      if (currentIndex < 0 || nextIndex < 0 || nextIndex >= activeProject.savedRoutes.length) {
        return;
      }
      const savedRoutes = [...activeProject.savedRoutes];
      const [route] = savedRoutes.splice(currentIndex, 1);
      savedRoutes.splice(nextIndex, 0, route);
      updateProject(activeProject.id, { savedRoutes });
    },
    [activeProject, updateProject],
  );

  const reorderSavedRoute = useCallback(
    (sourceId: string, targetId: string) => {
      if (!activeProject || sourceId === targetId) {
        return;
      }
      const sourceIndex = activeProject.savedRoutes.findIndex((route) => route.id === sourceId);
      const targetIndex = activeProject.savedRoutes.findIndex((route) => route.id === targetId);
      if (sourceIndex < 0 || targetIndex < 0) {
        return;
      }
      const savedRoutes = [...activeProject.savedRoutes];
      const [route] = savedRoutes.splice(sourceIndex, 1);
      savedRoutes.splice(targetIndex, 0, route);
      updateProject(activeProject.id, { savedRoutes });
    },
    [activeProject, updateProject],
  );

  const saveWorkspacePreset = useCallback(
    (name: string): WorkspacePreset | null => {
      if (!activeProject) {
        return null;
      }
      const preset: WorkspacePreset = {
        id: crypto.randomUUID(),
        name: name.trim(),
        enabledViewportIds: [...activeProject.enabledViewportIds],
        boardScale: activeProject.boardScale,
        previewLayouts: { ...activeProject.previewLayouts },
        createdAt: new Date().toISOString(),
      };
      updateProject(activeProject.id, {
        workspacePresets: [...activeProject.workspacePresets, preset],
      });
      return preset;
    },
    [activeProject, updateProject],
  );

  const applyWorkspacePreset = useCallback(
    (presetId: string) => {
      if (!activeProject) {
        return;
      }
      const preset = activeProject.workspacePresets.find((item) => item.id === presetId);
      if (!preset || preset.enabledViewportIds.length === 0) {
        return;
      }
      updateProject(activeProject.id, {
        enabledViewportIds: [...preset.enabledViewportIds],
        boardScale: clampBoardScale(preset.boardScale),
        previewLayouts: { ...preset.previewLayouts },
      });
    },
    [activeProject, updateProject],
  );

  const removeWorkspacePreset = useCallback(
    (presetId: string) => {
      if (activeProject) {
        updateProject(activeProject.id, {
          workspacePresets: activeProject.workspacePresets.filter(
            (preset) => preset.id !== presetId,
          ),
        });
      }
    },
    [activeProject, updateProject],
  );

  const setDeviceProfile = useCallback(
    (viewportId: string, profile: PreviewDeviceProfile) => {
      if (activeProject) {
        updateProject(activeProject.id, {
          deviceProfiles: { ...activeProject.deviceProfiles, [viewportId]: profile },
        });
      }
    },
    [activeProject, updateProject],
  );

  const setBoardScale = useCallback(
    (scale: number) => {
      if (activeProject) {
        const boardScale = clampBoardScale(scale);
        updateProject(activeProject.id, {
          boardScale,
          previewLayouts: Object.fromEntries(
            Object.entries(activeProject.previewLayouts).map(([id, layout]) => [
              id,
              { ...layout, scale: boardScale },
            ]),
          ),
        });
      }
    },
    [activeProject, updateProject],
  );

  const setPreviewLayout = useCallback(
    (viewportId: string, layout: PreviewBoardLayout) => {
      if (activeProject) {
        updateProject(activeProject.id, {
          previewLayouts: {
            ...activeProject.previewLayouts,
            [viewportId]: {
              x: Math.max(0, Math.round(layout.x)),
              y: Math.max(0, Math.round(layout.y)),
              scale: clampBoardScale(layout.scale),
            },
          },
        });
      }
    },
    [activeProject, updateProject],
  );

  const setPreviewLayouts = useCallback(
    (layouts: Record<string, PreviewBoardLayout>) => {
      if (activeProject) {
        updateProject(activeProject.id, { previewLayouts: layouts });
      }
    },
    [activeProject, updateProject],
  );

  const resetPreviewLayouts = useCallback(() => {
    if (activeProject) {
      updateProject(activeProject.id, {
        boardScale: MIN_BOARD_SCALE,
        previewLayouts: {},
      });
    }
  }, [activeProject, updateProject]);

  const setSyncNavigation = useCallback(
    (enabled: boolean) => {
      if (activeProject) {
        updateProject(activeProject.id, { syncNavigation: enabled });
        void setNavigationSync(enabled);
      }
    },
    [activeProject, updateProject],
  );

  const value = useMemo<DevBrowzerContextValue>(
    () => ({
      state,
      activeProject,
      navigationHistory,
      previewStatuses,
      initialized,
      createProject,
      duplicateProject,
      updateProject,
      deleteProject,
      selectProject,
      navigate,
      moveHistory,
      toggleViewport,
      setEnabledViewportIds,
      addCustomViewport,
      duplicateCustomViewport,
      updateCustomViewport,
      removeCustomViewport,
      addSavedRoute,
      updateSavedRoute,
      removeSavedRoute,
      moveSavedRoute,
      reorderSavedRoute,
      saveWorkspacePreset,
      applyWorkspacePreset,
      removeWorkspacePreset,
      setDeviceProfile,
      setBoardScale,
      setPreviewLayout,
      setPreviewLayouts,
      resetPreviewLayouts,
      setSyncNavigation,
    }),
    [
      activeProject,
      addCustomViewport,
      addSavedRoute,
      applyWorkspacePreset,
      createProject,
      deleteProject,
      duplicateCustomViewport,
      duplicateProject,
      initialized,
      moveHistory,
      moveSavedRoute,
      navigate,
      navigationHistory,
      previewStatuses,
      reorderSavedRoute,
      removeSavedRoute,
      removeCustomViewport,
      removeWorkspacePreset,
      resetPreviewLayouts,
      saveWorkspacePreset,
      selectProject,
      setBoardScale,
      setDeviceProfile,
      setEnabledViewportIds,
      setPreviewLayout,
      setPreviewLayouts,
      setSyncNavigation,
      state,
      toggleViewport,
      updateCustomViewport,
      updateProject,
      updateSavedRoute,
    ],
  );

  return <DevBrowzerContext.Provider value={value}>{children}</DevBrowzerContext.Provider>;
}
