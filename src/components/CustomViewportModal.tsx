import { useEffect, useState } from 'react';
import {
  ActionIcon,
  Button,
  Group,
  Modal,
  NumberInput,
  Stack,
  TextInput,
  Tooltip,
} from '@mantine/core';
import { IconArrowsExchange } from '@tabler/icons-react';
import type { ViewportDefinition } from '../types';
import { createCustomViewport, rotateViewport, validateViewportSize } from '../utils/viewport';

interface CustomViewportModalProps {
  opened: boolean;
  viewport?: ViewportDefinition | null;
  onClose: () => void;
  onSubmit: (viewport: ViewportDefinition) => void;
}

export function CustomViewportModal({
  opened,
  viewport,
  onClose,
  onSubmit,
}: CustomViewportModalProps) {
  const [name, setName] = useState('');
  const [width, setWidth] = useState<number | string>(1440);
  const [height, setHeight] = useState<number | string>(900);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!opened) {
      return;
    }
    setName(viewport?.name ?? '');
    setWidth(viewport?.width ?? 1440);
    setHeight(viewport?.height ?? 900);
    setError(null);
  }, [opened, viewport]);

  const rotate = () => {
    const draft: ViewportDefinition = {
      id: viewport?.id ?? 'draft',
      name: name || 'Custom viewport',
      width: Number(width),
      height: Number(height),
      category: 'custom',
      builtIn: false,
    };
    const rotated = rotateViewport(draft);
    setWidth(rotated.width);
    setHeight(rotated.height);
  };

  const submit = () => {
    try {
      const numericWidth = Number(width);
      const numericHeight = Number(height);
      validateViewportSize(numericWidth, numericHeight);
      const next = viewport
        ? {
            ...viewport,
            name: name.trim(),
            width: numericWidth,
            height: numericHeight,
          }
        : createCustomViewport(name, numericWidth, numericHeight);
      if (!next.name) {
        throw new Error('Give the custom viewport a name.');
      }
      onSubmit(next);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to save viewport.');
    }
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={viewport ? 'Edit custom viewport' : 'Add custom viewport'}
      centered
      overlayProps={{ backgroundOpacity: 0.62, blur: 5 }}
    >
      <Stack>
        <TextInput
          label="Name"
          placeholder="Laptop"
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
          autoFocus
        />
        <Group align="flex-end" grow>
          <NumberInput
            label="Width"
            value={width}
            onChange={setWidth}
            min={240}
            max={7680}
            allowDecimal={false}
            error={error}
          />
          <Tooltip label="Swap orientation">
            <ActionIcon variant="light" size={36} mb={error ? 24 : 0} onClick={rotate}>
              <IconArrowsExchange size={18} />
            </ActionIcon>
          </Tooltip>
          <NumberInput
            label="Height"
            value={height}
            onChange={setHeight}
            min={240}
            max={7680}
            allowDecimal={false}
          />
        </Group>
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit}>Save viewport</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
