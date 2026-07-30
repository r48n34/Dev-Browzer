import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core';
import { IconDeviceDesktopCog } from '@tabler/icons-react';
import { DEFAULT_DEVICE_PROFILE } from '../config/viewports';
import type {
  PreviewColorScheme,
  PreviewDeviceProfile,
  PreviewNetworkProfile,
  ViewportDefinition,
} from '../types';

interface DeviceProfileModalProps {
  opened: boolean;
  viewport?: ViewportDefinition | null;
  profile?: PreviewDeviceProfile | null;
  onClose: () => void;
  onSubmit: (profile: PreviewDeviceProfile) => void;
}

export function DeviceProfileModal({
  opened,
  viewport,
  profile,
  onClose,
  onSubmit,
}: DeviceProfileModalProps) {
  const [draft, setDraft] = useState<PreviewDeviceProfile>(DEFAULT_DEVICE_PROFILE);

  useEffect(() => {
    if (opened) {
      setDraft({ ...DEFAULT_DEVICE_PROFILE, ...profile });
    }
  }, [opened, profile]);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={`Device profile${viewport ? ` — ${viewport.name}` : ''}`}
      centered
      overlayProps={{ backgroundOpacity: 0.62, blur: 5 }}
    >
      <Stack>
        <Alert icon={<IconDeviceDesktopCog size={17} />} variant="light">
          Changes recreate this preview so WebView2 can apply the selected environment.
        </Alert>
        <Group grow align="flex-start">
          <NumberInput
            label="Device pixel ratio"
            value={draft.devicePixelRatio}
            min={0.5}
            max={4}
            step={0.5}
            decimalScale={1}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                devicePixelRatio: typeof value === 'number' ? value : 1,
              }))
            }
          />
          <Select
            label="Color scheme"
            value={draft.colorScheme}
            data={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
            onChange={(value) =>
              setDraft((current) => ({
                ...current,
                colorScheme: (value as PreviewColorScheme) ?? 'system',
              }))
            }
            allowDeselect={false}
          />
        </Group>
        <TextInput
          label="User agent"
          description="Leave blank to use the installed WebView2 user agent."
          placeholder="Default WebView2 user agent"
          value={draft.userAgent}
          onChange={(event) =>
            setDraft((current) => ({ ...current, userAgent: event.currentTarget.value }))
          }
        />
        <Select
          label="Network profile"
          value={draft.networkProfile}
          data={[
            { value: 'online', label: 'Online — no throttling' },
            { value: 'fast-3g', label: 'Fast 3G' },
            { value: 'slow-3g', label: 'Slow 3G' },
            { value: 'offline', label: 'Offline' },
          ]}
          onChange={(value) =>
            setDraft((current) => ({
              ...current,
              networkProfile: (value as PreviewNetworkProfile) ?? 'online',
            }))
          }
          allowDeselect={false}
        />
        <Switch
          label="Emulate touch input"
          checked={draft.touchEnabled}
          onChange={(event) =>
            setDraft((current) => ({ ...current, touchEnabled: event.currentTarget.checked }))
          }
        />
        <Switch
          label="Prefer reduced motion"
          checked={draft.reducedMotion}
          onChange={(event) =>
            setDraft((current) => ({ ...current, reducedMotion: event.currentTarget.checked }))
          }
        />
        <Group justify="flex-end" mt="sm">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => onSubmit(draft)}>Apply profile</Button>
        </Group>
      </Stack>
    </Modal>
  );
}
