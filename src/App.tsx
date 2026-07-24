import { useEffect, useMemo, useState } from 'react';
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
import { Brand } from './components/Brand';
import { CustomViewportModal } from './components/CustomViewportModal';
import { PreviewBoard } from './components/PreviewBoard';
import { ProjectModal } from './components/ProjectModal';
import { TopToolbar } from './components/TopToolbar';
import { ViewportSidebar } from './components/ViewportSidebar';
import { setPreviewsVisible } from './native/bridge';
import { useDevBrowzer } from './state/context';
import type { ViewportDefinition } from './types';

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

function Workbench() {
  const {
    initialized,
    activeProject,
    createProject,
    updateProject,
    deleteProject,
    addCustomViewport,
    updateCustomViewport,
  } = useDevBrowzer();
  const [navbarOpened, { toggle: toggleNavbar }] = useDisclosure(true);
  const [projectModalMode, setProjectModalMode] = useState<'create' | 'edit' | null>(null);
  const [customViewportModal, setCustomViewportModal] = useState<
    ViewportDefinition | 'create' | null
  >(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const firstRun = initialized && !activeProject;
  const overlayOpen = firstRun || projectModalMode !== null || customViewportModal !== null;

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
        header={{ height: 78 }}
        navbar={{
          width: 280,
          breakpoint: 'md',
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
              aria-label="Toggle viewport sidebar"
            />
            <Brand />
          </Box>
          <Box className="header-toolbar">
            <TopToolbar
              onAddProject={() => setProjectModalMode('create')}
              onEditProject={() => setProjectModalMode('edit')}
              onDeleteProject={() => {
                if (
                  activeProject &&
                  window.confirm(`Delete “${activeProject.name}” and its saved workspace?`)
                ) {
                  deleteProject(activeProject.id);
                }
              }}
            />
          </Box>
        </AppShell.Header>

        <AppShell.Navbar className="app-navbar">
          <ViewportSidebar
            onAddCustom={() => setCustomViewportModal('create')}
            onEditCustom={(viewport) => setCustomViewportModal(viewport)}
          />
        </AppShell.Navbar>

        <AppShell.Main className="app-main">
          {activeProject ? (
            <PreviewBoard
              previewsVisible={!overlayOpen}
              focusedId={focusedId}
              onFocus={setFocusedId}
            />
          ) : (
            <Center h="calc(100vh - 78px)">
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
        onSubmit={(name, url) => {
          if (projectModalMode === 'edit' && activeProject) {
            updateProject(activeProject.id, {
              name,
              baseUrl: url,
              currentUrl: url,
            });
          } else {
            createProject(name, url);
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
    </>
  );
}
