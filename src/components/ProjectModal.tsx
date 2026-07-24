import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import type { ProjectWorkspace } from '../types';
import { normalizePreviewUrl } from '../utils/url';

interface ProjectModalProps {
  opened: boolean;
  project?: ProjectWorkspace | null;
  required?: boolean;
  onClose: () => void;
  onSubmit: (name: string, url: string) => void;
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
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }
    setName(project?.name ?? '');
    setUrl(project?.baseUrl ?? 'http://localhost:5173');
    setError(null);
  }, [opened, project]);

  const submit = () => {
    try {
      const normalizedUrl = normalizePreviewUrl(url);
      if (!name.trim()) {
        throw new Error('Give this project a name.');
      }
      onSubmit(name.trim(), normalizedUrl);
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
