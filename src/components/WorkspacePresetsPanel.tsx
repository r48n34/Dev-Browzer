import { ActionIcon, Box, Button, Group, Stack, Text, Tooltip } from '@mantine/core';
import { IconBookmark, IconPlus, IconTrash } from '@tabler/icons-react';
import { useDevBrowzer } from '../state/context';

interface WorkspacePresetsPanelProps {
  onSave: () => void;
}

export function WorkspacePresetsPanel({ onSave }: WorkspacePresetsPanelProps) {
  const { activeProject, applyWorkspacePreset, removeWorkspacePreset } = useDevBrowzer();
  if (!activeProject) {
    return null;
  }

  return (
    <Stack gap="sm">
      <Box>
        <Group gap="xs">
          <IconBookmark size={16} />
          <Text fw={700} size="sm">
            Workspace presets
          </Text>
        </Group>
        <Text size="xs" c="dimmed" mt={3}>
          Restore a saved viewport arrangement and scale.
        </Text>
      </Box>
      {activeProject.workspacePresets.map((preset) => (
        <Group key={preset.id} gap={4} wrap="nowrap">
          <Button
            variant="default"
            size="compact-sm"
            className="workspace-preset-button"
            onClick={() => applyWorkspacePreset(preset.id)}
          >
            <Text size="sm" truncate>
              {preset.name}
            </Text>
          </Button>
          <Tooltip label="Remove preset">
            <ActionIcon
              variant="subtle"
              color="red"
              aria-label={`Remove ${preset.name}`}
              onClick={() => removeWorkspacePreset(preset.id)}
            >
              <IconTrash size={14} />
            </ActionIcon>
          </Tooltip>
        </Group>
      ))}
      <Button
        variant="light"
        size="compact-sm"
        leftSection={<IconPlus size={14} />}
        onClick={onSave}
      >
        Save current workspace
      </Button>
    </Stack>
  );
}
