import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';

interface WorkspacePresetModalProps {
  opened: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
}

export function WorkspacePresetModal({ opened, onClose, onSubmit }: WorkspacePresetModalProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setName('');
      setError(null);
    }
  }, [opened]);

  const submit = () => {
    if (!name.trim()) {
      setError('Give this workspace preset a name.');
      return;
    }
    onSubmit(name.trim());
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Save workspace preset"
      centered
      overlayProps={{ backgroundOpacity: 0.62, blur: 5 }}
    >
      <Stack>
        <TextInput
          label="Preset name"
          description="Saves enabled viewports, positions, and scale."
          placeholder="Release review"
          value={name}
          error={error}
          onChange={(event) => {
            setName(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
          autoFocus
        />
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Save preset</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
