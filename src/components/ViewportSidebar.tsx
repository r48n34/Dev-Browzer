import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Checkbox,
  Divider,
  Group,
  ScrollArea,
  Stack,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowsExchange,
  IconDeviceDesktop,
  IconDeviceMobile,
  IconDeviceTablet,
  IconEdit,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { BUILT_IN_VIEWPORTS } from '../config/viewports';
import { useDevBrowzer } from '../state/context';
import type { ViewportCategory, ViewportDefinition } from '../types';
import { rotateViewport } from '../utils/viewport';

interface ViewportSidebarProps {
  onAddCustom: () => void;
  onEditCustom: (viewport: ViewportDefinition) => void;
}

const CATEGORY_META: Record<
  Exclude<ViewportCategory, 'custom'>,
  { label: string; icon: typeof IconDeviceMobile }
> = {
  phone: { label: 'Phones', icon: IconDeviceMobile },
  tablet: { label: 'Tablets', icon: IconDeviceTablet },
  desktop: { label: 'Desktops', icon: IconDeviceDesktop },
};

export function ViewportSidebar({ onAddCustom, onEditCustom }: ViewportSidebarProps) {
  const { activeProject, toggleViewport, removeCustomViewport, updateCustomViewport } =
    useDevBrowzer();

  if (!activeProject) {
    return (
      <Box p="md">
        <Text size="sm" c="dimmed">
          Add a project to configure preview sizes.
        </Text>
      </Box>
    );
  }

  return (
    <ScrollArea h="calc(100vh - 78px)" type="auto">
      <Stack gap="lg" p="md">
        <Box>
          <Text fw={700} size="sm">
            Viewports
          </Text>
          <Text size="xs" c="dimmed" mt={3}>
            Enabled views render together and stay in sync.
          </Text>
        </Box>

        {(Object.keys(CATEGORY_META) as Array<Exclude<ViewportCategory, 'custom'>>).map(
          (category) => {
            const meta = CATEGORY_META[category];
            const Icon = meta.icon;
            const viewports = BUILT_IN_VIEWPORTS.filter(
              (viewport) => viewport.category === category,
            );
            return (
              <Stack gap="xs" key={category}>
                <Group gap="xs">
                  <Icon size={16} />
                  <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                    {meta.label}
                  </Text>
                </Group>
                {viewports.map((viewport) => (
                  <Checkbox
                    key={viewport.id}
                    checked={activeProject.enabledViewportIds.includes(viewport.id)}
                    onChange={() => toggleViewport(viewport.id)}
                    label={
                      <Group justify="space-between" wrap="nowrap" gap="xs">
                        <Text size="sm">{viewport.name}</Text>
                        <Badge size="xs" variant="light" color="gray">
                          {viewport.width}×{viewport.height}
                        </Badge>
                      </Group>
                    }
                    styles={{ body: { width: '100%' }, labelWrapper: { flex: 1 } }}
                  />
                ))}
              </Stack>
            );
          },
        )}

        <Divider />
        <Stack gap="xs">
          <Group justify="space-between">
            <Text size="xs" fw={700} tt="uppercase" c="dimmed">
              Custom
            </Text>
            <Tooltip label="Add custom viewport">
              <ActionIcon size="sm" variant="subtle" onClick={onAddCustom}>
                <IconPlus size={16} />
              </ActionIcon>
            </Tooltip>
          </Group>
          {activeProject.customViewports.length === 0 ? (
            <Text size="xs" c="dimmed">
              Add a viewport for a specific laptop, kiosk, or display.
            </Text>
          ) : (
            activeProject.customViewports.map((viewport) => (
              <Group key={viewport.id} wrap="nowrap" gap="xs">
                <Checkbox
                  checked={activeProject.enabledViewportIds.includes(viewport.id)}
                  onChange={() => toggleViewport(viewport.id)}
                  label={
                    <Box>
                      <Text size="sm">{viewport.name}</Text>
                      <Text size="xs" c="dimmed">
                        {viewport.width} × {viewport.height}
                      </Text>
                    </Box>
                  }
                  styles={{ root: { flex: 1 } }}
                />
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={`Rotate ${viewport.name}`}
                  onClick={() => updateCustomViewport(rotateViewport(viewport))}
                >
                  <IconArrowsExchange size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  aria-label={`Edit ${viewport.name}`}
                  onClick={() => onEditCustom(viewport)}
                >
                  <IconEdit size={14} />
                </ActionIcon>
                <ActionIcon
                  size="sm"
                  variant="subtle"
                  color="red"
                  aria-label={`Remove ${viewport.name}`}
                  onClick={() => removeCustomViewport(viewport.id)}
                >
                  <IconTrash size={14} />
                </ActionIcon>
              </Group>
            ))
          )}
          <Button
            variant="light"
            size="xs"
            leftSection={<IconPlus size={15} />}
            onClick={onAddCustom}
            fullWidth
          >
            Custom viewport
          </Button>
        </Stack>
      </Stack>
    </ScrollArea>
  );
}
