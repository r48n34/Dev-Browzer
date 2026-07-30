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
  Tabs,
  Text,
  Tooltip,
} from '@mantine/core';
import {
  IconArrowsExchange,
  IconCopy,
  IconDeviceDesktop,
  IconDeviceDesktopCog,
  IconDeviceMobile,
  IconDeviceTablet,
  IconEdit,
  IconPlus,
  IconRoute,
  IconTrash,
  IconViewportWide,
} from '@tabler/icons-react';
import { BUILT_IN_VIEWPORTS, VIEWPORT_PRESETS, matchViewportPreset } from '../config/viewports';
import { useDevBrowzer } from '../state/context';
import type { SavedRoute, ViewportCategory, ViewportDefinition } from '../types';
import { rotateViewport } from '../utils/viewport';
import { RoutesPanel } from './RoutesPanel';
import { WorkspacePresetsPanel } from './WorkspacePresetsPanel';

interface ViewportSidebarProps {
  onAddCustom: () => void;
  onEditCustom: (viewport: ViewportDefinition) => void;
  onEditDeviceProfile: (viewport: ViewportDefinition) => void;
  onAddRoute: () => void;
  onEditRoute: (route: SavedRoute) => void;
  onSaveWorkspace: () => void;
}

const CATEGORY_META: Record<
  Exclude<ViewportCategory, 'custom'>,
  { label: string; icon: typeof IconDeviceMobile }
> = {
  phone: { label: 'Phones', icon: IconDeviceMobile },
  tablet: { label: 'Tablets', icon: IconDeviceTablet },
  desktop: { label: 'Desktops', icon: IconDeviceDesktop },
};

export function ViewportSidebar({
  onAddCustom,
  onEditCustom,
  onEditDeviceProfile,
  onAddRoute,
  onEditRoute,
  onSaveWorkspace,
}: ViewportSidebarProps) {
  const {
    activeProject,
    duplicateCustomViewport,
    removeCustomViewport,
    setEnabledViewportIds,
    toggleViewport,
    updateCustomViewport,
  } = useDevBrowzer();

  if (!activeProject) {
    return (
      <Box p="md">
        <Text size="sm" c="dimmed">
          Add a project to configure preview sizes.
        </Text>
      </Box>
    );
  }

  const activePreset = matchViewportPreset(activeProject.enabledViewportIds);

  const setCategory = (category: Exclude<ViewportCategory, 'custom'>, enabled: boolean) => {
    const categoryIds = BUILT_IN_VIEWPORTS.filter((viewport) => viewport.category === category).map(
      (viewport) => viewport.id,
    );
    const next = enabled
      ? [...new Set([...activeProject.enabledViewportIds, ...categoryIds])]
      : activeProject.enabledViewportIds.filter((id) => !categoryIds.includes(id));
    setEnabledViewportIds(next);
  };

  return (
    <Tabs defaultValue="viewports" className="sidebar-tabs">
      <Tabs.List grow mx="md" mt="sm">
        <Tabs.Tab value="viewports" leftSection={<IconViewportWide size={15} />}>
          Viewports
        </Tabs.Tab>
        <Tabs.Tab value="routes" leftSection={<IconRoute size={15} />}>
          Routes
        </Tabs.Tab>
      </Tabs.List>

      <ScrollArea h="calc(100vh - 124px)" type="auto">
        <Tabs.Panel value="viewports">
          <Stack gap="lg" p="md">
            <Box>
              <Text fw={700} size="sm">
                Quick sets
              </Text>
              <Text size="xs" c="dimmed" mt={3}>
                Switch the complete board in one click.
              </Text>
              <Group gap={6} mt="sm">
                {VIEWPORT_PRESETS.map((preset) => (
                  <Button
                    key={preset.id}
                    size="compact-xs"
                    variant={activePreset === preset.id ? 'filled' : 'default'}
                    onClick={() => setEnabledViewportIds(preset.viewportIds)}
                    aria-pressed={activePreset === preset.id}
                  >
                    {preset.name}
                  </Button>
                ))}
              </Group>
            </Box>

            {(Object.keys(CATEGORY_META) as Array<Exclude<ViewportCategory, 'custom'>>).map(
              (category) => {
                const meta = CATEGORY_META[category];
                const Icon = meta.icon;
                const viewports = BUILT_IN_VIEWPORTS.filter(
                  (viewport) => viewport.category === category,
                );
                const enabledCount = viewports.filter((viewport) =>
                  activeProject.enabledViewportIds.includes(viewport.id),
                ).length;
                const enabledOutsideCategory =
                  activeProject.enabledViewportIds.length - enabledCount;
                return (
                  <Stack gap="xs" key={category}>
                    <Group justify="space-between">
                      <Group gap="xs">
                        <Icon size={16} />
                        <Text size="xs" fw={700} tt="uppercase" c="dimmed">
                          {meta.label}
                        </Text>
                      </Group>
                      <Group gap={2}>
                        <Button
                          variant="subtle"
                          size="compact-xs"
                          onClick={() => setCategory(category, true)}
                          disabled={enabledCount === viewports.length}
                        >
                          Select all
                        </Button>
                        <Button
                          variant="subtle"
                          color="gray"
                          size="compact-xs"
                          onClick={() => setCategory(category, false)}
                          disabled={enabledCount === 0 || enabledOutsideCategory === 0}
                        >
                          Clear
                        </Button>
                      </Group>
                    </Group>
                    {viewports.map((viewport) => (
                      <Group key={viewport.id} wrap="nowrap" gap={4}>
                        <Checkbox
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
                          styles={{
                            root: { flex: 1 },
                            body: { width: '100%' },
                            labelWrapper: { flex: 1 },
                          }}
                        />
                        <Tooltip label="Device profile">
                          <ActionIcon
                            size="sm"
                            variant="subtle"
                            aria-label={`Configure ${viewport.name} device profile`}
                            onClick={() => onEditDeviceProfile(viewport)}
                          >
                            <IconDeviceDesktopCog size={14} />
                          </ActionIcon>
                        </Tooltip>
                      </Group>
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
                  <Group key={viewport.id} wrap="nowrap" gap={3}>
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
                    <Tooltip label="Rotate">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={`Rotate ${viewport.name}`}
                        onClick={() => updateCustomViewport(rotateViewport(viewport))}
                      >
                        <IconArrowsExchange size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Device profile">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={`Configure ${viewport.name} device profile`}
                        onClick={() => onEditDeviceProfile(viewport)}
                      >
                        <IconDeviceDesktopCog size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Duplicate">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={`Duplicate ${viewport.name}`}
                        onClick={() => duplicateCustomViewport(viewport.id)}
                      >
                        <IconCopy size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Edit">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        aria-label={`Edit ${viewport.name}`}
                        onClick={() => onEditCustom(viewport)}
                      >
                        <IconEdit size={14} />
                      </ActionIcon>
                    </Tooltip>
                    <Tooltip label="Remove">
                      <ActionIcon
                        size="sm"
                        variant="subtle"
                        color="red"
                        aria-label={`Remove ${viewport.name}`}
                        onClick={() => removeCustomViewport(viewport.id)}
                      >
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
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

            <Divider />
            <WorkspacePresetsPanel onSave={onSaveWorkspace} />
          </Stack>
        </Tabs.Panel>

        <Tabs.Panel value="routes">
          <Box p="md">
            <RoutesPanel onAdd={onAddRoute} onEdit={onEditRoute} />
          </Box>
        </Tabs.Panel>
      </ScrollArea>
    </Tabs>
  );
}
