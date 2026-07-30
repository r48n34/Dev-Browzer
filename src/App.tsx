import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AppShell,
  Box,
  Burger,
  Center,
  Loader,
  MantineProvider,
  Text,
  createTheme,
} from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import type { WorkbenchCommand } from './commands/registry';
import { Brand } from './components/Brand';
import { CaptureDrawer } from './components/CaptureDrawer';
import { CommandPalette } from './components/CommandPalette';
import { CustomViewportModal } from './components/CustomViewportModal';
import { DeviceProfileModal } from './components/DeviceProfileModal';
import { PreviewBoard } from './components/PreviewBoard';
import { ProjectModal } from './components/ProjectModal';
import { RouteModal } from './components/RouteModal';
import { TopToolbar } from './components/TopToolbar';
import { ViewportSidebar } from './components/ViewportSidebar';
import { WorkspacePresetModal } from './components/WorkspacePresetModal';
import {
  VIEWPORT_PRESETS,
  getPreviewDeviceProfile,
  getProjectViewports,
  getViewportPreset,
} from './config/viewports';
import { useWorkbenchShortcuts } from './hooks/useWorkbenchShortcuts';
import {
  capturePreviews,
  exportCaptureReport,
  reloadPreviews,
  setPreviewsVisible,
} from './native/bridge';
import { useDevBrowzer } from './state/context';
import type { CaptureSession, SavedRoute, ViewportDefinition, ViewportPresetId } from './types';
import { canMoveHistory } from './utils/history';
import { getAdjacentRoute } from './utils/routes';

const theme = createTheme({
  primaryColor: 'violet',
  defaultRadius: 'md',
  fontFamily:
    'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      'Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
});

export function App() {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Workbench />
    </MantineProvider>
  );
}

function dispatchBoardCommand(command: 'fit' | 'arrange' | 'actual-size' | 'reset') {
  window.dispatchEvent(new CustomEvent('devbrowzer:board-command', { detail: command }));
}

function Workbench() {
  const {
    state,
    initialized,
    activeProject,
    navigationHistory,
    previewStatuses,
    createProject,
    duplicateProject,
    updateProject,
    deleteProject,
    selectProject,
    addCustomViewport,
    updateCustomViewport,
    addSavedRoute,
    updateSavedRoute,
    saveWorkspacePreset,
    setDeviceProfile,
    setEnabledViewportIds,
    navigate,
    moveHistory,
  } = useDevBrowzer();
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'edit' | null>(null);
  const [customViewportModal, setCustomViewportModal] = useState<
    ViewportDefinition | 'create' | null
  >(null);
  const [routeModal, setRouteModal] = useState<SavedRoute | 'create' | null>(null);
  const [deviceProfileViewport, setDeviceProfileViewport] = useState<ViewportDefinition | null>(
    null,
  );
  const [workspacePresetModal, setWorkspacePresetModal] = useState(false);
  const [commandsOpened, setCommandsOpened] = useState(false);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [captureDrawerOpened, setCaptureDrawerOpened] = useState(false);
  const [captureSessions, setCaptureSessions] = useState<CaptureSession[]>([]);
  const [captureExportPath, setCaptureExportPath] = useState<string | null>(null);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const firstRun = initialized && !activeProject;
  const overlayOpen =
    firstRun ||
    projectModalMode !== null ||
    customViewportModal !== null ||
    routeModal !== null ||
    deviceProfileViewport !== null ||
    workspacePresetModal ||
    commandsOpened ||
    captureDrawerOpened;

  const activeViewports = useMemo(
    () =>
      activeProject
        ? getProjectViewports(activeProject.enabledViewportIds, activeProject.customViewports)
        : [],
    [activeProject],
  );

  useEffect(() => {
    void setPreviewsVisible(!overlayOpen && document.visibilityState !== 'hidden');
  }, [overlayOpen]);

  useEffect(() => {
    const listener = () => {
      void setPreviewsVisible(!overlayOpen && document.visibilityState !== 'hidden');
    };
    document.addEventListener('visibilitychange', listener);
    return () => document.removeEventListener('visibilitychange', listener);
  }, [overlayOpen]);

  useEffect(() => {
    if (focusedId && activeProject && !activeProject.enabledViewportIds.includes(focusedId)) {
      setFocusedId(null);
    }
  }, [activeProject, focusedId]);

  const editingCustomViewport = useMemo(
    () => (customViewportModal === 'create' ? null : customViewportModal),
    [customViewportModal],
  );
  const editingRoute = useMemo(() => (routeModal === 'create' ? null : routeModal), [routeModal]);

  const focusAddress = useCallback(() => {
    window.dispatchEvent(new Event('devbrowzer:focus-address'));
  }, []);
  const openCommands = useCallback(() => setCommandsOpened(true), []);
  const goBack = useCallback(() => {
    if (navigationHistory && canMoveHistory(navigationHistory, -1)) {
      moveHistory(-1);
    }
  }, [moveHistory, navigationHistory]);
  const goForward = useCallback(() => {
    if (navigationHistory && canMoveHistory(navigationHistory, 1)) {
      moveHistory(1);
    }
  }, [moveHistory, navigationHistory]);
  const reloadAll = useCallback(() => {
    if (activeProject) {
      void reloadPreviews();
    }
  }, [activeProject]);
  const exitFocus = useCallback(() => setFocusedId(null), []);

  useWorkbenchShortcuts({
    openCommands,
    focusAddress,
    moveBack: goBack,
    moveForward: goForward,
    reload: reloadAll,
    exitFocus,
  });

  const captureReadyPreviews = useCallback(async () => {
    if (!activeProject) {
      return;
    }
    try {
      setCaptureError(null);
      const readyViewportIds = activeProject.enabledViewportIds.filter(
        (viewportId) => previewStatuses[viewportId]?.state === 'ready',
      );
      if (readyViewportIds.length === 0) {
        setCaptureError('Wait for at least one preview to finish loading before capturing.');
        setCaptureDrawerOpened(true);
        return;
      }
      const captures = await capturePreviews(readyViewportIds);
      if (captures.length === 0) {
        setCaptureError('Native capture is available in the packaged Tauri application.');
        setCaptureDrawerOpened(true);
        return;
      }
      const capturedAt = captures[0]?.capturedAt ?? Date.now();
      const session: CaptureSession = {
        id: crypto.randomUUID(),
        name: new Date(capturedAt).toLocaleString(),
        capturedAt,
        captures,
        annotations: {},
      };
      setCaptureSessions((current) => [...current, session]);
      setCaptureExportPath(null);
      setCaptureDrawerOpened(true);
    } catch (error) {
      setCaptureError(error instanceof Error ? error.message : String(error));
      setCaptureDrawerOpened(true);
    }
  }, [activeProject, previewStatuses]);

  const commands = useMemo<WorkbenchCommand[]>(() => {
    const previousRoute = activeProject
      ? getAdjacentRoute(activeProject.savedRoutes, activeProject.currentUrl, -1)
      : null;
    const nextRoute = activeProject
      ? getAdjacentRoute(activeProject.savedRoutes, activeProject.currentUrl, 1)
      : null;
    const base: WorkbenchCommand[] = [
      {
        id: 'focus-address',
        label: 'Focus address bar',
        description: 'Enter a local or public HTTP(S) address',
        shortcut: 'Ctrl L',
        run: focusAddress,
      },
      {
        id: 'navigate-back',
        label: 'Go back',
        description: 'Move backward in project navigation history',
        shortcut: 'Alt ←',
        disabled: !navigationHistory || !canMoveHistory(navigationHistory, -1),
        run: goBack,
      },
      {
        id: 'navigate-forward',
        label: 'Go forward',
        description: 'Move forward in project navigation history',
        shortcut: 'Alt →',
        disabled: !navigationHistory || !canMoveHistory(navigationHistory, 1),
        run: goForward,
      },
      {
        id: 'reload-all',
        label: 'Reload all previews',
        description: 'Reload every enabled viewport together',
        shortcut: 'Ctrl R',
        disabled: !activeProject,
        run: reloadAll,
      },
      {
        id: 'fit-board',
        label: 'Fit all previews',
        description: 'Choose the largest common scale that fits the workbench',
        disabled: !activeProject,
        run: () => dispatchBoardCommand('fit'),
      },
      {
        id: 'arrange-board',
        label: 'Auto arrange',
        description: 'Pack previews into rows while preserving their scales',
        disabled: !activeProject,
        run: () => dispatchBoardCommand('arrange'),
      },
      {
        id: 'actual-size',
        label: 'Use actual size',
        description: 'Set every preview to 100% and arrange the board',
        disabled: !activeProject,
        run: () => dispatchBoardCommand('actual-size'),
      },
      {
        id: 'reset-layout',
        label: 'Reset layout',
        description: 'Clear saved positions and return to the default scale',
        disabled: !activeProject,
        run: () => dispatchBoardCommand('reset'),
      },
      {
        id: 'capture',
        label: 'Capture ready previews',
        description: 'Save a synchronized screenshot set locally',
        disabled:
          !activeProject ||
          !activeProject.enabledViewportIds.some(
            (viewportId) => previewStatuses[viewportId]?.state === 'ready',
          ),
        run: () => void captureReadyPreviews(),
      },
      {
        id: 'previous-route',
        label: 'Previous review route',
        description: previousRoute?.name ?? 'No previous saved route',
        disabled: !previousRoute,
        run: () => previousRoute && navigate(previousRoute.url),
      },
      {
        id: 'next-route',
        label: 'Next review route',
        description: nextRoute?.name ?? 'No next saved route',
        disabled: !nextRoute,
        run: () => nextRoute && navigate(nextRoute.url),
      },
      {
        id: 'new-project',
        label: 'New project',
        description: 'Connect another development site',
        run: () => setProjectModalMode('create'),
      },
    ];

    for (const preset of VIEWPORT_PRESETS) {
      base.push({
        id: `viewport-preset-${preset.id}`,
        label: `Use ${preset.name} viewport set`,
        description: preset.description,
        disabled: !activeProject,
        keywords: ['viewport', 'device', 'preset'],
        run: () => setEnabledViewportIds(preset.viewportIds),
      });
    }
    for (const viewport of activeViewports) {
      base.push({
        id: `focus-${viewport.id}`,
        label: `Focus ${viewport.name}`,
        description: `${viewport.width} × ${viewport.height}`,
        keywords: ['focus', 'viewport'],
        run: () => setFocusedId(viewport.id),
      });
    }
    for (const project of state.projects) {
      base.push({
        id: `project-${project.id}`,
        label: `Switch to ${project.name}`,
        description: project.baseUrl,
        keywords: ['project', 'workspace'],
        disabled: project.id === activeProject?.id,
        run: () => selectProject(project.id),
      });
    }
    return base;
  }, [
    activeProject,
    activeViewports,
    captureReadyPreviews,
    focusAddress,
    goBack,
    goForward,
    navigate,
    navigationHistory,
    previewStatuses,
    reloadAll,
    selectProject,
    setEnabledViewportIds,
    state.projects,
  ]);

  if (!initialized) {
    return (
      <Center h="100vh">
        <Box ta="center">
          <Loader size="sm" />
          <Text size="sm" c="dimmed" mt="md">
            Restoring your workbench…
          </Text>
        </Box>
      </Center>
    );
  }

  return (
    <>
      <AppShell
        header={{ height: 72 }}
        navbar={{
          width: 300,
          breakpoint: 860,
          collapsed: { mobile: !navbarOpened, desktop: !navbarOpened },
        }}
        padding={0}
      >
        <AppShell.Header className="app-header">
          <Box className="header-brand">
            <Burger
              opened={navbarOpened}
              onClick={toggleNavbar}
              size="sm"
              aria-label="Toggle workspace sidebar"
            />
            <Brand />
          </Box>
          <Box className="header-toolbar">
            <TopToolbar
              onAddProject={() => setProjectModalMode('create')}
              onEditProject={() => setProjectModalMode('edit')}
              onDuplicateProject={() => activeProject && duplicateProject(activeProject.id)}
              onDeleteProject={() => {
                if (
                  activeProject &&
                  window.confirm(`Delete “${activeProject.name}” and its saved workspace?`)
                ) {
                  deleteProject(activeProject.id);
                }
              }}
              onOpenCommands={openCommands}
            />
          </Box>
        </AppShell.Header>

        <AppShell.Navbar className="app-navbar">
          <ViewportSidebar
            onAddCustom={() => setCustomViewportModal('create')}
            onEditCustom={(viewport) => setCustomViewportModal(viewport)}
            onEditDeviceProfile={setDeviceProfileViewport}
            onAddRoute={() => setRouteModal('create')}
            onEditRoute={setRouteModal}
            onSaveWorkspace={() => setWorkspacePresetModal(true)}
          />
        </AppShell.Navbar>

        <AppShell.Main className="app-main">
          {activeProject ? (
            <PreviewBoard
              previewsVisible={!overlayOpen}
              focusedId={focusedId}
              onFocus={setFocusedId}
              onEditProject={() => setProjectModalMode('edit')}
              onCapture={() => void captureReadyPreviews()}
            />
          ) : (
            <Center h="calc(100vh - 72px)">
              <Text c="dimmed">Create a project to begin.</Text>
            </Center>
          )}
        </AppShell.Main>
      </AppShell>

      <ProjectModal
        opened={firstRun || projectModalMode !== null}
        required={firstRun}
        project={projectModalMode === 'edit' ? activeProject : null}
        onClose={() => setProjectModalMode(null)}
        onSubmit={(name, url, viewportPresetId: ViewportPresetId) => {
          if (projectModalMode === 'edit' && activeProject) {
            updateProject(activeProject.id, {
              name,
              baseUrl: url,
              currentUrl: url,
            });
          } else {
            createProject(name, url, getViewportPreset(viewportPresetId).viewportIds);
          }
          setProjectModalMode(null);
        }}
      />

      <CustomViewportModal
        opened={customViewportModal !== null}
        viewport={editingCustomViewport}
        onClose={() => setCustomViewportModal(null)}
        onSubmit={(viewport) => {
          if (editingCustomViewport) {
            updateCustomViewport(viewport);
          } else {
            addCustomViewport(viewport);
          }
          setCustomViewportModal(null);
        }}
      />

      <RouteModal
        opened={routeModal !== null}
        route={editingRoute}
        defaultUrl={activeProject?.currentUrl ?? 'http://localhost:5173'}
        onClose={() => setRouteModal(null)}
        onSubmit={(name, url) => {
          if (editingRoute) {
            updateSavedRoute({ ...editingRoute, name, url });
          } else {
            addSavedRoute(name, url);
          }
          setRouteModal(null);
        }}
      />

      <WorkspacePresetModal
        opened={workspacePresetModal}
        onClose={() => setWorkspacePresetModal(false)}
        onSubmit={(name) => {
          saveWorkspacePreset(name);
          setWorkspacePresetModal(false);
        }}
      />

      <DeviceProfileModal
        opened={deviceProfileViewport !== null}
        viewport={deviceProfileViewport}
        profile={
          deviceProfileViewport && activeProject
            ? getPreviewDeviceProfile(activeProject.deviceProfiles, deviceProfileViewport.id)
            : null
        }
        onClose={() => setDeviceProfileViewport(null)}
        onSubmit={(profile) => {
          if (deviceProfileViewport) {
            setDeviceProfile(deviceProfileViewport.id, profile);
          }
          setDeviceProfileViewport(null);
        }}
      />

      <CommandPalette
        opened={commandsOpened}
        commands={commands}
        onClose={() => setCommandsOpened(false)}
      />

      <CaptureDrawer
        opened={captureDrawerOpened}
        sessions={captureSessions}
        exportPath={captureExportPath}
        error={captureError}
        onClose={() => setCaptureDrawerOpened(false)}
        onAnnotate={(sessionId, viewportId, annotation) =>
          setCaptureSessions((current) =>
            current.map((session) =>
              session.id === sessionId
                ? {
                    ...session,
                    annotations: { ...session.annotations, [viewportId]: annotation },
                  }
                : session,
            ),
          )
        }
        onExport={() => {
          if (!activeProject) {
            return;
          }
          setCaptureError(null);
          void exportCaptureReport(activeProject.name, captureSessions)
            .then(setCaptureExportPath)
            .catch((error: unknown) =>
              setCaptureError(error instanceof Error ? error.message : String(error)),
            );
        }}
      />
    </>
  );
}
