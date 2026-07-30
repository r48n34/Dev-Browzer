import { useEffect, useState } from 'react';
import { Button, Group, Modal, Stack, TextInput } from '@mantine/core';
import type { SavedRoute } from '../types';
import { normalizePreviewUrl } from '../utils/url';

interface RouteModalProps {
  opened: boolean;
  route?: SavedRoute | null;
  defaultUrl: string;
  onClose: () => void;
  onSubmit: (name: string, url: string) => void;
}

export function RouteModal({ opened, route, defaultUrl, onClose, onSubmit }: RouteModalProps) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState(defaultUrl);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setName(route?.name ?? '');
      setUrl(route?.url ?? defaultUrl);
      setError(null);
    }
  }, [defaultUrl, opened, route]);

  const submit = () => {
    try {
      if (!name.trim()) {
        throw new Error('Give this route a name.');
      }
      onSubmit(name.trim(), normalizePreviewUrl(url));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save route.');
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={route ? 'Edit review route' : 'Save review route'}
      centered
      overlayProps={{ backgroundOpacity: 0.62, blur: 5 }}
    >
      <Stack>
        <TextInput
          label="Route name"
          placeholder="Pricing page"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          autoFocus
        />
        <TextInput
          label="Address"
          value={url}
          error={error}
          onChange={(event) => {
            setUrl(event.currentTarget.value);
            setError(null);
          }}
          onKeyDown={(event) => event.key === 'Enter' && submit()}
        />
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>{route ? 'Save changes' : 'Save route'}</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
