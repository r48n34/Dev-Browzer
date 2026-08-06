import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Box,
  Button,
  Group,
  Menu,
  Paper,
  Slider,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconArrowsMaximize,
  IconCamera,
  IconCode,
  IconDotsVertical,
  IconExternalLink,
  IconFocus2,
  IconGripVertical,
  IconLayoutGrid,
  IconRefresh,
  IconRulerMeasure,
  IconX,
  IconZoomReset,
} from '@tabler/icons-react';
import { getProjectViewports } from '../config/viewports';
import { usePreviewGeometry } from '../hooks/usePreviewGeometry';
import {
  bringPreviewToFront,
  isTauriRuntime,
  openPreviewDevtools,
  reloadPreview,
} from '../native/bridge';
import { useDevBrowzer } from '../state/context';
import type { PreviewBoardLayout, PreviewLoadState, ViewportDefinition } from '../types';
import { fitPreviewLayouts } from '../utils/fitLayout';
import {
  PREVIEW_BOARD_GAP,
  arrangePreviewLayouts,
  getPreviewCardSize,
} from '../utils/previewLayout';
import { getFriendlyPreviewError, summarizePreviewStatuses } from '../utils/previewStatus';

interface PreviewBoardProps {
  previewsVisible: boolean;
  focusedId: string | null;
  onFocus: (id: string | null) => void;
  onEditProject: () => void;
  onCapture: () => void;
  activeId: string | null;
  onActiveChange: (id: string) => void;
}

interface DragSession {
  id: string;
  pointerId: number;
  startX: number;
  startY: number;
  originLayout: PreviewBoardLayout;
  currentLayout: PreviewBoardLayout;
}

const STATUS_META: Record<PreviewLoadState, { color: string; label: string; className: string }> = {
  idle: { color: 'gray', label: 'Waiting', className: 'status-idle' },
  loading: { color: 'yellow', label: 'Loading', className: 'status-loading' },
  ready: { color: 'teal', label: 'Ready', className: 'status-ready' },
  error: { color: 'red', label: 'Unavailable', className: 'status-error' },
};

function getEffectiveScale(
  viewport: ViewportDefinition,
  selectedScale: number,
  focused: boolean,
  customized: boolean,
): number {
  if (!focused || customized) {
    return selectedScale;
  }
  return Math.max(selectedScale, viewport.category === 'desktop' ? 0.5 : 0.75);
}

export function PreviewBoard({
  previewsVisible,
  focusedId,
  onFocus,
  onEditProject,
  onCapture,
  activeId,
  onActiveChange,
}: PreviewBoardProps) {
  const {
    activeProject,
    previewStatuses,
    setBoardScale,
    setPreviewLayout,
    setPreviewLayouts,
    resetPreviewLayouts,
    toggleViewport,
  } = useDevBrowzer();
  const [liveLayouts, setLiveLayouts] = useState<Record<string, PreviewBoardLayout>>({});
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [fitLimited, setFitLimited] = useState(false);
  const dragRef = useRef<DragSession | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);

  const allViewports = useMemo(
    () =>
      activeProject
        ? getProjectViewports(activeProject.enabledViewportIds, activeProject.customViewports)
        : [],
    [activeProject],
  );
  const renderedViewports = focusedId
    ? allViewports.filter((viewport) => viewport.id === focusedId)
    : allViewports;
  const { registerCard, registerSurface, measure } = usePreviewGeometry(
    allViewports,
    previewsVisible,
    activeId,
  );

  const scaleById = useMemo(
    () =>
      Object.fromEntries(
        allViewports.map((viewport) => [
          viewport.id,
          activeProject?.previewLayouts[viewport.id]?.scale ?? activeProject?.boardScale ?? 0.25,
        ]),
      ),
    [activeProject, allViewports],
  );
  const automaticLayouts = useMemo(
    () => arrangePreviewLayouts(allViewports, scaleById, activeProject?.boardScale ?? 0.25),
    [activeProject?.boardScale, allViewports, scaleById],
  );
  const statusSummary = useMemo(
    () =>
      summarizePreviewStatuses(
        allViewports.map((viewport) => viewport.id),
        previewStatuses,
      ),
    [allViewports, previewStatuses],
  );

  const getCurrentLayout = useCallback(
    (viewportId: string): PreviewBoardLayout =>
      liveLayouts[viewportId] ??
      activeProject?.previewLayouts[viewportId] ??
      automaticLayouts[viewportId] ?? { x: 0, y: 0, scale: activeProject?.boardScale ?? 0.25 },
    [activeProject, automaticLayouts, liveLayouts],
  );

  useEffect(() => {
    setLiveLayouts({});
    setDraggingId(null);
    dragRef.current = null;
  }, [activeProject?.id]);

  useEffect(() => {
    measure();
  }, [activeProject?.previewLayouts, focusedId, liveLayouts, measure]);

  useEffect(() => {
    const handlePointerMove = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      const layout = {
        ...drag.originLayout,
        x: Math.max(0, Math.round(drag.originLayout.x + event.clientX - drag.startX)),
        y: Math.max(0, Math.round(drag.originLayout.y + event.clientY - drag.startY)),
      };
      dragRef.current = { ...drag, currentLayout: layout };
      setLiveLayouts((current) => ({ ...current, [drag.id]: layout }));
    };

    const handlePointerUp = (event: globalThis.PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) {
        return;
      }
      setPreviewLayout(drag.id, drag.currentLayout);
      setLiveLayouts((current) => {
        const next = { ...current };
        delete next[drag.id];
        return next;
      });
      dragRef.current = null;
      setDraggingId(null);
      document.body.style.userSelect = '';
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      document.body.style.userSelect = '';
    };
  }, [setPreviewLayout]);

  const autoArrange = useCallback(() => {
    if (!activeProject) {
      return;
    }
    const scales = Object.fromEntries(
      allViewports.map((viewport) => [viewport.id, getCurrentLayout(viewport.id).scale]),
    );
    const maxWidth = Math.max(320, (workspaceRef.current?.clientWidth ?? 1648) - 48);
    const arranged = arrangePreviewLayouts(
      allViewports,
      scales,
      activeProject.boardScale,
      maxWidth,
    );
    setLiveLayouts({});
    setFitLimited(false);
    setPreviewLayouts({ ...activeProject.previewLayouts, ...arranged });
  }, [activeProject, allViewports, getCurrentLayout, setPreviewLayouts]);

  const fitAll = useCallback(() => {
    if (!activeProject) {
      return;
    }
    const width = Math.max(320, (workspaceRef.current?.clientWidth ?? 1648) - 48);
    const height = Math.max(320, window.innerHeight - 230);
    const fitted = fitPreviewLayouts(allViewports, width, height);
    setLiveLayouts({});
    setFitLimited(!fitted.fits);
    setBoardScale(fitted.scale);
    setPreviewLayouts(fitted.layouts);
  }, [activeProject, allViewports, setBoardScale, setPreviewLayouts]);

  const useActualSize = useCallback(() => {
    if (!activeProject) {
      return;
    }
    const scales = Object.fromEntries(allViewports.map((viewport) => [viewport.id, 1]));
    const width = Math.max(320, (workspaceRef.current?.clientWidth ?? 1648) - 48);
    setLiveLayouts({});
    setFitLimited(false);
    setBoardScale(1);
    setPreviewLayouts(arrangePreviewLayouts(allViewports, scales, 1, width));
  }, [activeProject, allViewports, setBoardScale, setPreviewLayouts]);

  const resetBoard = useCallback(() => {
    setLiveLayouts({});
    setFitLimited(false);
    resetPreviewLayouts();
  }, [resetPreviewLayouts]);

  useEffect(() => {
    const listener = (event: Event) => {
      const command = (event as CustomEvent<string>).detail;
      if (command === 'fit') {
        fitAll();
      } else if (command === 'arrange') {
        autoArrange();
      } else if (command === 'actual-size') {
        useActualSize();
      } else if (command === 'reset') {
        resetBoard();
      }
    };
    window.addEventListener('devbrowzer:board-command', listener);
    return () => window.removeEventListener('devbrowzer:board-command', listener);
  }, [autoArrange, fitAll, resetBoard, useActualSize]);

  if (!activeProject) {
    return null;
  }

  const activateBoard = (viewportId: string) => {
    onActiveChange(viewportId);
    void bringPreviewToFront(viewportId);
  };

  const startDragging = (viewportId: string, event: PointerEvent<HTMLElement>) => {
    const target = event.target as HTMLElement;
    if (
      focusedId ||
      target.closest('button, a, input, [role="button"], [role="slider"], [data-no-drag]')
    ) {
      return;
    }
    const layout = getCurrentLayout(viewportId);
    dragRef.current = {
      id: viewportId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originLayout: layout,
      currentLayout: layout,
    };
    setDraggingId(viewportId);
    document.body.style.userSelect = 'none';
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const cardLayouts = renderedViewports.map((viewport) => {
    const saved = activeProject.previewLayouts[viewport.id];
    const current = getCurrentLayout(viewport.id);
    const focused = focusedId === viewport.id;
    const scale = getEffectiveScale(viewport, current.scale, focused, Boolean(saved));
    const size = getPreviewCardSize(viewport, scale);
    return { viewport, current, focused, scale, size };
  });
  const canvasWidth = Math.max(
    320,
    ...cardLayouts.map(({ current, size }) => current.x + size.width + PREVIEW_BOARD_GAP),
  );
  const canvasHeight = Math.max(
    320,
    ...cardLayouts.map(({ current, size }) => current.y + size.height + PREVIEW_BOARD_GAP),
  );

  return (
    <Box ref={workspaceRef} className="preview-workspace">
      {statusSummary.total > 0 && statusSummary.unavailable === statusSummary.total && (
        <Alert
          className="server-health-alert"
          color="red"
          icon={<IconAlertTriangle size={18} />}
          title="Development server unavailable"
        >
          <Group justify="space-between" align="center" gap="sm">
            <Text size="sm">
              None of the previews can reach this address. Check that the server is running or
              update the project URL.
            </Text>
            <Group gap="xs">
              <Button
                size="compact-xs"
                variant="light"
                color="red"
                onClick={() => void Promise.all(allViewports.map(({ id }) => reloadPreview(id)))}
              >
                Retry all
              </Button>
              <Button size="compact-xs" variant="default" onClick={onEditProject}>
                Edit URL
              </Button>
            </Group>
          </Group>
        </Alert>
      )}
      {fitLimited && (
        <Alert className="fit-notice" color="violet" title="Minimum scale reached">
          Every preview is arranged at 25%. Scroll the board to review the remaining workspace.
        </Alert>
      )}
      <Paper className="board-toolbar" radius="lg" withBorder>
        <Group justify="space-between" wrap="wrap" gap="md">
          <Group gap="xs">
            <Text fw={700}>Preview board</Text>
            <Badge variant="light" color="gray">
              {allViewports.length} {allViewports.length === 1 ? 'viewport' : 'viewports'}
            </Badge>
            {focusedId ? (
              <Button
                size="compact-xs"
                variant="light"
                leftSection={<IconX size={14} />}
                onClick={() => onFocus(null)}
              >
                Exit focus
              </Button>
            ) : (
              <>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<IconRulerMeasure size={14} />}
                  onClick={fitAll}
                >
                  Fit all
                </Button>
                <Button
                  size="compact-xs"
                  variant="subtle"
                  leftSection={<IconLayoutGrid size={14} />}
                  onClick={autoArrange}
                >
                  Arrange
                </Button>
                <Menu width={180} shadow="md">
                  <Menu.Target>
                    <ActionIcon variant="subtle" size="sm" aria-label="More layout actions">
                      <IconDotsVertical size={15} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item leftSection={<IconZoomReset size={15} />} onClick={useActualSize}>
                      Actual size (100%)
                    </Menu.Item>
                    <Menu.Item leftSection={<IconRefresh size={15} />} onClick={resetBoard}>
                      Reset layout
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </>
            )}
          </Group>
          <Group gap="md" wrap="nowrap">
            <Group gap={5} wrap="nowrap" className="session-summary" aria-label="Session summary">
              <Badge variant="light" color="teal">
                {statusSummary.ready} ready
              </Badge>
              {statusSummary.loading > 0 && (
                <Badge variant="light" color="yellow">
                  {statusSummary.loading} loading
                </Badge>
              )}
              {statusSummary.unavailable > 0 && (
                <Badge variant="light" color="red">
                  {statusSummary.unavailable} unavailable
                </Badge>
              )}
            </Group>
            {statusSummary.unavailable > 0 && (
              <Button
                size="compact-xs"
                variant="subtle"
                color="red"
                leftSection={<IconRefresh size={14} />}
                onClick={() =>
                  void Promise.all(
                    allViewports
                      .filter(({ id }) => previewStatuses[id]?.state === 'error')
                      .map(({ id }) => reloadPreview(id)),
                  )
                }
              >
                Retry failed
              </Button>
            )}
            <Button
              size="compact-xs"
              variant="light"
              leftSection={<IconCamera size={14} />}
              onClick={onCapture}
              disabled={statusSummary.ready === 0}
            >
              Capture
            </Button>
            <Group gap="sm" wrap="nowrap" className="zoom-control">
              <Text size="xs" c="dimmed">
                Scale
              </Text>
              <Slider
                thumbLabel="Scale all previews"
                min={25}
                max={100}
                step={5}
                value={Math.round(activeProject.boardScale * 100)}
                onChange={(value) => {
                  setLiveLayouts({});
                  setFitLimited(false);
                  setBoardScale(value / 100);
                }}
                label={(value) => `${value}%`}
                w={140}
                disabled={Boolean(focusedId)}
              />
              <Badge variant="outline" color="gray" w={55}>
                {Math.round(activeProject.boardScale * 100)}%
              </Badge>
            </Group>
          </Group>
        </Group>
      </Paper>

      <Box
        className="preview-grid"
        data-focused={Boolean(focusedId)}
        style={
          focusedId
            ? undefined
            : {
                width: canvasWidth,
                height: canvasHeight,
              }
        }
      >
        {cardLayouts.map(({ viewport, current, focused, scale, size }) => {
          const renderWidth = Math.round(viewport.width * scale);
          const renderHeight = Math.round(viewport.height * scale);
          const previewStatus = previewStatuses[viewport.id];
          const state = previewStatus?.state ?? 'loading';
          const status = STATUS_META[state];

          return (
            <Paper
              key={viewport.id}
              ref={registerCard(viewport.id)}
              className="preview-card"
              data-dragging={draggingId === viewport.id}
              data-active={activeId === viewport.id}
              radius="lg"
              withBorder
              onPointerDownCapture={() => activateBoard(viewport.id)}
              style={
                focused
                  ? { width: size.width }
                  : {
                      width: size.width,
                      left: current.x,
                      top: current.y,
                    }
              }
            >
              <Group
                justify="space-between"
                wrap="nowrap"
                className="preview-card-header"
                data-testid={`preview-header-${viewport.id}`}
                onPointerDown={(event) => startDragging(viewport.id, event)}
              >
                <Group gap={5} wrap="nowrap" miw={0}>
                  <Tooltip label={focused ? 'Exit focus to move this preview' : 'Drag to move'}>
                    <Box component="span" className="preview-drag-handle" aria-hidden="true">
                      <IconGripVertical size={16} />
                    </Box>
                  </Tooltip>
                  <Box miw={0}>
                    <Group gap={7} wrap="nowrap">
                      <Box className={`status-dot ${status.className}`} />
                      <Text fw={700} size="sm" truncate>
                        {viewport.name}
                      </Text>
                    </Group>
                    <Text size="xs" c="dimmed" mt={2}>
                      {viewport.width} × {viewport.height}
                    </Text>
                  </Box>
                </Group>
                <Group gap={3} wrap="nowrap">
                  {state !== 'ready' && (
                    <Tooltip label={status.label}>
                      <Badge size="xs" variant="light" color={status.color}>
                        {state === 'error' ? <IconAlertTriangle size={11} /> : status.label}
                      </Badge>
                    </Tooltip>
                  )}
                  <Tooltip label="Reload this preview">
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={`Reload ${viewport.name}`}
                      onClick={() => void reloadPreview(viewport.id)}
                    >
                      <IconRefresh size={15} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label={focused ? 'Exit focus' : 'Focus this preview'}>
                    <ActionIcon
                      variant="subtle"
                      size="sm"
                      aria-label={`Focus ${viewport.name}`}
                      onClick={() => onFocus(focused ? null : viewport.id)}
                    >
                      {focused ? <IconArrowsMaximize size={15} /> : <IconFocus2 size={15} />}
                    </ActionIcon>
                  </Tooltip>
                  <Menu width={190} shadow="md" position="bottom-end">
                    <Menu.Target>
                      <ActionIcon
                        variant="subtle"
                        size="sm"
                        aria-label={`More actions for ${viewport.name}`}
                        data-no-drag
                      >
                        <IconDotsVertical size={15} />
                      </ActionIcon>
                    </Menu.Target>
                    <Menu.Dropdown>
                      <Menu.Item
                        leftSection={<IconCode size={15} />}
                        onClick={() => void openPreviewDevtools(viewport.id)}
                      >
                        Open DevTools
                      </Menu.Item>
                      <Menu.Item
                        color="red"
                        leftSection={<IconX size={15} />}
                        disabled={allViewports.length === 1}
                        onClick={() => toggleViewport(viewport.id)}
                      >
                        Disable preview
                      </Menu.Item>
                    </Menu.Dropdown>
                  </Menu>
                </Group>
              </Group>

              <Group className="preview-card-scale" gap="xs" wrap="nowrap">
                <Text size="xs" c="dimmed">
                  Scale
                </Text>
                <Slider
                  key={`${viewport.id}-${Math.round(scale * 100)}`}
                  thumbLabel={`${viewport.name} scale`}
                  min={25}
                  max={100}
                  step={5}
                  defaultValue={Math.round(scale * 100)}
                  onChangeEnd={(value) => {
                    const layout = { ...current, scale: value / 100 };
                    setPreviewLayout(viewport.id, layout);
                  }}
                  label={(value) => `${value}%`}
                  className="preview-scale-slider"
                />
                <Badge variant="outline" color="gray" w={52}>
                  {Math.round(scale * 100)}%
                </Badge>
              </Group>

              <Box className="preview-stage">
                <Box
                  ref={registerSurface(viewport.id)}
                  className="preview-surface"
                  style={{ width: renderWidth, height: renderHeight }}
                  data-preview-scale={scale}
                  data-testid={`preview-surface-${viewport.id}`}
                >
                  {state === 'error' ? (
                    <Box className="preview-error-state">
                      <IconAlertTriangle size={26} />
                      <Text size="sm" fw={700}>
                        Preview unavailable
                      </Text>
                      <Text size="xs" c="dimmed" ta="center" lineClamp={3}>
                        {getFriendlyPreviewError(previewStatus?.message)}
                      </Text>
                      <Button
                        size="compact-xs"
                        variant="light"
                        leftSection={<IconRefresh size={14} />}
                        onClick={() => void reloadPreview(viewport.id)}
                      >
                        Retry
                      </Button>
                    </Box>
                  ) : !isTauriRuntime() ? (
                    <Box className="browser-preview-placeholder">
                      <IconExternalLink size={24} />
                      <Text size="xs" fw={650} ta="center" lineClamp={2}>
                        {activeProject.currentUrl}
                      </Text>
                      <Text size="xs" c="dimmed" ta="center">
                        Native preview appears in the Tauri app
                      </Text>
                    </Box>
                  ) : null}
                </Box>
              </Box>
            </Paper>
          );
        })}
      </Box>
    </Box>
  );
}
