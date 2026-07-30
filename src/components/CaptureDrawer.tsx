import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Drawer,
  Group,
  Image,
  ScrollArea,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
} from '@mantine/core';
import { IconDownload, IconPhoto, IconSparkles } from '@tabler/icons-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { isTauriRuntime } from '../native/bridge';
import type { CaptureSession } from '../types';

interface CaptureDrawerProps {
  opened: boolean;
  sessions: CaptureSession[];
  exportPath?: string | null;
  error?: string | null;
  onClose: () => void;
  onAnnotate: (sessionId: string, viewportId: string, annotation: string) => void;
  onExport: () => void;
}

type CompareMode = 'current' | 'side-by-side' | 'difference';

function toImageSource(path: string): string {
  return isTauriRuntime() ? convertFileSrc(path) : '';
}

export function CaptureDrawer({
  opened,
  sessions,
  exportPath,
  error,
  onClose,
  onAnnotate,
  onExport,
}: CaptureDrawerProps) {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [baselineId, setBaselineId] = useState<string | null>(null);
  const [viewportId, setViewportId] = useState<string | null>(null);
  const [mode, setMode] = useState<CompareMode>('current');

  const session = sessions.find((item) => item.id === sessionId) ?? sessions.at(-1) ?? null;
  const baseline = sessions.find((item) => item.id === baselineId) ?? null;
  const capture =
    session?.captures.find((item) => item.id === viewportId) ?? session?.captures[0] ?? null;
  const baselineCapture = baseline?.captures.find((item) => item.id === capture?.id) ?? null;

  useEffect(() => {
    if (opened && sessions.length > 0) {
      const latest = sessions.at(-1) ?? null;
      setSessionId((current) =>
        current && sessions.some((sessionItem) => sessionItem.id === current)
          ? current
          : (latest?.id ?? null),
      );
      setViewportId((current) =>
        current && latest?.captures.some((item) => item.id === current)
          ? current
          : (latest?.captures[0]?.id ?? null),
      );
    }
  }, [opened, sessions]);

  const sessionOptions = useMemo(
    () =>
      sessions.map((item, index) => ({
        value: item.id,
        label: `${index + 1}. ${item.name}`,
      })),
    [sessions],
  );

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      title="Capture review"
      position="right"
      size="xl"
      overlayProps={{ backgroundOpacity: 0.35, blur: 3 }}
    >
      <ScrollArea h="calc(100vh - 90px)" type="auto">
        <Stack gap="md" pr="sm">
          {error && (
            <Alert color="red" title="Capture action failed">
              {error}
            </Alert>
          )}
          {sessions.length === 0 ? (
            <Box className="capture-empty-state">
              <IconPhoto size={32} />
              <Text fw={700}>No captures yet</Text>
              <Text size="sm" c="dimmed">
                Capture the ready previews to create a synchronized review set.
              </Text>
            </Box>
          ) : (
            <>
              <Group grow align="flex-start">
                <Select
                  label="Capture"
                  value={session?.id ?? null}
                  data={sessionOptions}
                  onChange={(value) => {
                    setSessionId(value);
                    const next = sessions.find((item) => item.id === value);
                    setViewportId(next?.captures[0]?.id ?? null);
                  }}
                  allowDeselect={false}
                />
                <Select
                  label="Baseline"
                  placeholder="Choose an earlier capture"
                  value={baseline?.id ?? null}
                  data={sessionOptions.filter((item) => item.value !== session?.id)}
                  onChange={setBaselineId}
                  clearable
                />
                <Select
                  label="Viewport"
                  value={capture?.id ?? null}
                  data={
                    session?.captures.map((item) => ({
                      value: item.id,
                      label: `${item.id} · ${item.width}×${item.height}`,
                    })) ?? []
                  }
                  onChange={setViewportId}
                  allowDeselect={false}
                />
              </Group>

              <Group justify="space-between">
                <SegmentedControl
                  value={mode}
                  onChange={(value) => setMode(value as CompareMode)}
                  data={[
                    { value: 'current', label: 'Current' },
                    { value: 'side-by-side', label: 'Compare' },
                    { value: 'difference', label: 'Difference' },
                  ]}
                  disabled={!baselineCapture}
                />
                <Button variant="light" leftSection={<IconDownload size={16} />} onClick={onExport}>
                  Export report
                </Button>
              </Group>

              {exportPath && (
                <Alert icon={<IconSparkles size={16} />} color="teal">
                  Report saved to {exportPath}
                </Alert>
              )}

              {capture && (
                <>
                  <Box className="capture-canvas" data-mode={mode}>
                    {mode === 'side-by-side' && baselineCapture ? (
                      <Group align="flex-start" grow wrap="nowrap">
                        <Stack gap={5}>
                          <Text size="xs" c="dimmed">
                            Baseline
                          </Text>
                          <Image
                            src={toImageSource(baselineCapture.path)}
                            alt={`Baseline ${baselineCapture.id}`}
                            fit="contain"
                          />
                        </Stack>
                        <Stack gap={5}>
                          <Text size="xs" c="dimmed">
                            Current
                          </Text>
                          <Image
                            src={toImageSource(capture.path)}
                            alt={`Current ${capture.id}`}
                            fit="contain"
                          />
                        </Stack>
                      </Group>
                    ) : (
                      <Box className="capture-image-stack">
                        <Image
                          src={toImageSource(capture.path)}
                          alt={`Capture ${capture.id}`}
                          fit="contain"
                        />
                        {mode === 'difference' && baselineCapture && (
                          <Image
                            className="capture-difference-layer"
                            src={toImageSource(baselineCapture.path)}
                            alt={`Difference baseline ${baselineCapture.id}`}
                            fit="contain"
                          />
                        )}
                      </Box>
                    )}
                  </Box>

                  <Textarea
                    label="Review note"
                    description="Notes are included in the exported local report."
                    minRows={3}
                    value={session?.annotations[capture.id] ?? ''}
                    onChange={(event) =>
                      session && onAnnotate(session.id, capture.id, event.currentTarget.value)
                    }
                    placeholder="Record layout issues, expected changes, or follow-up work."
                  />
                  <Text size="xs" c="dimmed">
                    Image saved to {capture.path}
                  </Text>
                </>
              )}
            </>
          )}
        </Stack>
      </ScrollArea>
    </Drawer>
  );
}
