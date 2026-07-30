import { useEffect, useState } from 'react';
import { Button, Group, Modal, Select, Stack, Text, TextInput } from '@mantine/core';
import { VIEWPORT_PRESETS } from '../config/viewports';
import type { ProjectWorkspace } from '../types';
import type { ViewportPresetId } from '../types';
import { normalizePreviewUrl } from '../utils/url';

interface ProjectModalProps {
  opened: boolean;
  project?: ProjectWorkspace | null;
  required?: boolean;
  onClose: () => void;
  onSubmit: (name: string, url: string, viewportPresetId: ViewportPresetId) => void;
}

export function ProjectModal({
  opened,
  project,
  required = false,
  onClose,
  onSubmit,
}: ProjectModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('http://localhost:5173');
  const [viewportPresetId, setViewportPresetId] = useState<ViewportPresetId>('essential');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }
    setName(project?.name ?? '');
    setUrl(project?.baseUrl ?? 'http://localhost:5173');
    setViewportPresetId('essential');
    setError(null);
  }, [opened, project]);

  const submit = () => {
    try {
      const normalizedUrl = normalizePreviewUrl(url);
      if (!name.trim()) {
        throw new Error('Give this project a name.');
      }
      onSubmit(name.trim(), normalizedUrl, viewportPresetId);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save project.');
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      closeOnClickOutside={!required}
      closeOnEscape={!required}
      withCloseButton={!required}
      title={project ? 'Edit project' : 'Add a project'}
      centered
      overlayProps={{ backgroundOpacity: 0.62, blur: 5 }}
    >
      <Stack gap="md">
        {!project && (
          <Text size="sm" c="dimmed">
            Connect a site and start with the screen sizes you review most often. You can change
            them at any time.
          </Text>
        )}
        <TextInput
          label="Project name"
          placeholder="Marketing site"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          autoFocus
        />
        <TextInput
          label="Development URL"
          description="Localhost, LAN, and public HTTP(S) addresses are supported."
          placeholder="http://localhost:5173"
          value={url}
          error={error}
          onChange={(event) => {
            setUrl(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              submit();
            }
          }}
        />
        {!project && (
          <Select
            label="Starting viewport set"
            description="Essential keeps the first workspace fast and easy to scan."
            value={viewportPresetId}
            data={VIEWPORT_PRESETS.map((preset) => ({
              value: preset.id,
              label: `${preset.name} — ${preset.description}`,
            }))}
            onChange={(value) => setViewportPresetId((value as ViewportPresetId) ?? 'essential')}
            allowDeselect={false}
          />
        )}
        <Group justify="flex-end">
          {!required && (
            <Button variant="subtle" color="gray" onClick={onClose}>
              Cancel
            </Button>
          )}
          <Button onClick={submit}>{project ? 'Save changes' : 'Create workspace'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
