import { useState } from 'react';
import { ActionIcon, Badge, Box, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconArrowDown,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconEdit,
  IconGripVertical,
  IconPlayerPlay,
  IconPlus,
  IconRoute,
  IconTrash,
} from '@tabler/icons-react';
import { useDevBrowzer } from '../state/context';
import type { SavedRoute } from '../types';
import { getActiveRouteIndex, getAdjacentRoute } from '../utils/routes';

interface RoutesPanelProps {
  onAdd: () => void;
  onEdit: (route: SavedRoute) => void;
}

export function RoutesPanel({ onAdd, onEdit }: RoutesPanelProps) {
  const { activeProject, navigate, moveSavedRoute, removeSavedRoute, reorderSavedRoute } =
    useDevBrowzer();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  if (!activeProject) {
    return null;
  }

  const routes = activeProject.savedRoutes;
  const activeIndex = getActiveRouteIndex(routes, activeProject.currentUrl);
  const previous = getAdjacentRoute(routes, activeProject.currentUrl, -1);
  const next = getAdjacentRoute(routes, activeProject.currentUrl, 1);

  return (
    <Stack gap="md">
      <Box>
        <Group justify="space-between">
          <Group gap="xs">
            <IconRoute size={16} />
            <Text fw={700} size="sm">
              Review routes
            </Text>
          </Group>
          <Badge variant="light" color="gray">
            {routes.length}
          </Badge>
        </Group>
        <Text size="xs" c="dimmed" mt={3}>
          Save pages and step through them without retyping addresses.
        </Text>
      </Box>

      <Group grow gap="xs">
        <Button
          variant="default"
          size="compact-sm"
          leftSection={<IconArrowLeft size={14} />}
          disabled={!previous}
          onClick={() => previous && navigate(previous.url)}
        >
          Previous
        </Button>
        <Button
          variant="default"
          size="compact-sm"
          rightSection={<IconArrowRight size={14} />}
          disabled={!next}
          onClick={() => next && navigate(next.url)}
        >
          Next
        </Button>
      </Group>

      {routes.length === 0 ? (
        <Box className="sidebar-empty-state">
          <Text size="sm" fw={650}>
            Build a review queue
          </Text>
          <Text size="xs" c="dimmed" mt={4}>
            Save the current page, then add the other routes you check before a release.
          </Text>
        </Box>
      ) : (
        <Stack gap={6}>
          {routes.map((route, index) => (
            <Box
              key={route.id}
              className="route-item"
              data-active={activeIndex === index}
              data-dragging={draggingId === route.id}
              role="group"
              aria-label={route.name}
              draggable
              onDragStart={() => setDraggingId(route.id)}
              onDragEnd={() => setDraggingId(null)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                if (draggingId) {
                  reorderSavedRoute(draggingId, route.id);
                }
                setDraggingId(null);
              }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Box className="route-drag-handle" aria-hidden="true">
                  <IconGripVertical size={14} />
                </Box>
                <Button
                  variant="subtle"
                  color="gray"
                  className="route-main-action"
                  leftSection={<IconPlayerPlay size={14} />}
                  onClick={() => navigate(route.url)}
                >
                  <Box miw={0} ta="left">
                    <Text size="sm" fw={650} truncate>
                      {route.name}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {route.url}
                    </Text>
                  </Box>
                </Button>
                <Group gap={1} wrap="nowrap">
                  <Tooltip label="Move up">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      aria-label={`Move ${route.name} up`}
                      disabled={index === 0}
                      onClick={() => moveSavedRoute(route.id, -1)}
                    >
                      <IconArrowUp size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Move down">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      aria-label={`Move ${route.name} down`}
                      disabled={index === routes.length - 1}
                      onClick={() => moveSavedRoute(route.id, 1)}
                    >
                      <IconArrowDown size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Edit route">
                    <ActionIcon
                      size="sm"
                      variant="subtle"
                      aria-label={`Edit ${route.name}`}
                      onClick={() => onEdit(route)}
                    >
                      <IconEdit size={14} />
                    </ActionIcon>
                  </Tooltip>
                  <Tooltip label="Remove route">
                    <ActionIcon
                      size="sm"
                      color="red"
                      variant="subtle"
                      aria-label={`Remove ${route.name}`}
                      onClick={() => removeSavedRoute(route.id)}
                    >
                      <IconTrash size={14} />
                    </ActionIcon>
                  </Tooltip>
                </Group>
              </Group>
            </Box>
          ))}
        </Stack>
      )}

      <Button variant="light" size="sm" leftSection={<IconPlus size={15} />} onClick={onAdd}>
        Save current route
      </Button>
    </Stack>
  );
}
