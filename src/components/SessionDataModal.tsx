import { useCallback, useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Table,
  Tabs,
  Text,
  TextInput,
  Tooltip,
} from '@mantine/core';
import {
  IconAlertTriangle,
  IconCookie,
  IconDatabase,
  IconEdit,
  IconPlus,
  IconRefresh,
  IconTrash,
} from '@tabler/icons-react';
import {
  clearBrowserCookies,
  clearBrowserLocalStorage,
  deleteBrowserCookie,
  deleteBrowserLocalStorage,
  getBrowserSessionData,
  setBrowserCookie,
  setBrowserLocalStorage,
} from '../native/bridge';
import type { BrowserCookie, BrowserSessionData, BrowserStorageEntry } from '../types';
import {
  createCookieDraft,
  formatCookieExpiry,
  parseCookieDraft,
  type BrowserCookieDraft,
} from '../utils/sessionData';

interface SessionDataModalProps {
  opened: boolean;
  previewId: string | null;
  previewName: string | null;
  url: string;
  onClose: () => void;
}

interface PendingConfirmation {
  title: string;
  message: string;
  confirmLabel: string;
  run: () => Promise<void>;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function SessionDataModal({
  opened,
  previewId,
  previewName,
  url,
  onClose,
}: SessionDataModalProps) {
  const [data, setData] = useState<BrowserSessionData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cookieEditor, setCookieEditor] = useState<BrowserCookie | 'create' | null>(null);
  const [storageEditor, setStorageEditor] = useState<BrowserStorageEntry | 'create' | null>(null);
  const [confirmation, setConfirmation] = useState<PendingConfirmation | null>(null);

  const load = useCallback(async () => {
    if (!previewId) {
      setData(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setData(await getBrowserSessionData(previewId));
    } catch (loadError) {
      setError(getErrorMessage(loadError));
    } finally {
      setLoading(false);
    }
  }, [previewId, url]);

  useEffect(() => {
    if (opened) {
      void load();
    } else {
      setCookieEditor(null);
      setStorageEditor(null);
      setConfirmation(null);
    }
  }, [load, opened]);

  const mutate = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (mutationError) {
      setError(getErrorMessage(mutationError));
      throw mutationError;
    } finally {
      setBusy(false);
    }
  };

  const requestCookieDelete = (cookie: BrowserCookie) =>
    setConfirmation({
      title: `Delete cookie “${cookie.name}”?`,
      message: 'The cookie will be removed from the current browser session.',
      confirmLabel: 'Delete cookie',
      run: () => mutate(() => deleteBrowserCookie(previewId!, cookie)),
    });

  const requestStorageDelete = (entry: BrowserStorageEntry) =>
    setConfirmation({
      title: `Delete “${entry.key}”?`,
      message: 'This local storage value will be removed from the current origin.',
      confirmLabel: 'Delete value',
      run: () => mutate(() => deleteBrowserLocalStorage(previewId!, entry.key)),
    });

  return (
    <>
      <Modal
        opened={opened}
        onClose={onClose}
        title="Cookies & local storage"
        size="xl"
        centered
        overlayProps={{ backgroundOpacity: 0.62, blur: 5 }}
      >
        <Stack gap="md">
          <Group justify="space-between" wrap="nowrap">
            <div>
              <Text size="sm" fw={600} lineClamp={1}>
                {previewName ?? 'Current preview'}
              </Text>
              <Text size="xs" c="dimmed" lineClamp={1}>
                {data?.origin ?? url}
              </Text>
            </div>
            <Tooltip label="Refresh session data">
              <ActionIcon
                variant="default"
                aria-label="Refresh session data"
                onClick={() => void load()}
                disabled={loading || busy || !previewId}
              >
                <IconRefresh size={17} />
              </ActionIcon>
            </Tooltip>
          </Group>

          {error && (
            <Alert color="red" icon={<IconAlertTriangle size={17} />}>
              {error}
            </Alert>
          )}

          {!previewId ? (
            <Alert color="yellow">Enable a preview before managing session data.</Alert>
          ) : loading ? (
            <Group justify="center" py="xl">
              <Loader size="sm" />
              <Text size="sm" c="dimmed">
                Reading session data…
              </Text>
            </Group>
          ) : !data ? (
            <Alert color="violet">
              Cookie and local storage management is available in the Windows Tauri app.
            </Alert>
          ) : (
            <Tabs defaultValue="cookies">
              <Tabs.List>
                <Tabs.Tab value="cookies" leftSection={<IconCookie size={16} />}>
                  Cookies ({data.cookies.length})
                </Tabs.Tab>
                <Tabs.Tab value="local-storage" leftSection={<IconDatabase size={16} />}>
                  Local storage ({data.localStorage.length})
                </Tabs.Tab>
              </Tabs.List>

              <Tabs.Panel value="cookies" pt="md">
                <Group justify="space-between" mb="sm">
                  <Text size="xs" c="dimmed">
                    Cookies available to this URL, including HttpOnly values.
                  </Text>
                  <Group gap="xs">
                    <Button
                      size="compact-xs"
                      variant="default"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => setCookieEditor('create')}
                    >
                      Add
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      disabled={data.cookies.length === 0 || busy}
                      onClick={() =>
                        setConfirmation({
                          title: 'Clear cookies for this URL?',
                          message: `All ${data.cookies.length} applicable cookies will be removed from the current browser session.`,
                          confirmLabel: 'Clear cookies',
                          run: () => mutate(() => clearBrowserCookies(previewId)),
                        })
                      }
                    >
                      Clear
                    </Button>
                  </Group>
                </Group>
                <ScrollArea.Autosize mah={390} type="auto">
                  <Table striped highlightOnHover verticalSpacing="xs">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Name</Table.Th>
                        <Table.Th>Value</Table.Th>
                        <Table.Th>Scope</Table.Th>
                        <Table.Th>Expires</Table.Th>
                        <Table.Th w={76}>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.cookies.map((cookie) => (
                        <Table.Tr key={`${cookie.name}:${cookie.domain}:${cookie.path}`}>
                          <Table.Td>
                            <Group gap={4} wrap="nowrap">
                              <Text size="sm" fw={600} maw={160} truncate="end">
                                {cookie.name}
                              </Text>
                              {cookie.httpOnly && (
                                <Badge size="xs" variant="light">
                                  HttpOnly
                                </Badge>
                              )}
                              {cookie.secure && (
                                <Badge size="xs" variant="light" color="teal">
                                  Secure
                                </Badge>
                              )}
                            </Group>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" ff="monospace" maw={210} truncate="end">
                              {cookie.value || '—'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" maw={180} truncate="end">
                              {cookie.domain}
                              {cookie.path}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" c="dimmed">
                              {formatCookieExpiry(cookie.expires)}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={2} wrap="nowrap">
                              <ActionIcon
                                variant="subtle"
                                aria-label={`Edit cookie ${cookie.name}`}
                                onClick={() => setCookieEditor(cookie)}
                              >
                                <IconEdit size={15} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                aria-label={`Delete cookie ${cookie.name}`}
                                onClick={() => requestCookieDelete(cookie)}
                              >
                                <IconTrash size={15} />
                              </ActionIcon>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                  {data.cookies.length === 0 && (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      No cookies for this URL.
                    </Text>
                  )}
                </ScrollArea.Autosize>
              </Tabs.Panel>

              <Tabs.Panel value="local-storage" pt="md">
                <Group justify="space-between" mb="sm">
                  <Text size="xs" c="dimmed">
                    Values stored by {data.origin}.
                  </Text>
                  <Group gap="xs">
                    <Button
                      size="compact-xs"
                      variant="default"
                      leftSection={<IconPlus size={14} />}
                      onClick={() => setStorageEditor('create')}
                    >
                      Add
                    </Button>
                    <Button
                      size="compact-xs"
                      variant="subtle"
                      color="red"
                      leftSection={<IconTrash size={14} />}
                      disabled={data.localStorage.length === 0 || busy}
                      onClick={() =>
                        setConfirmation({
                          title: 'Clear local storage?',
                          message: `All ${data.localStorage.length} values for ${data.origin} will be removed.`,
                          confirmLabel: 'Clear local storage',
                          run: () => mutate(() => clearBrowserLocalStorage(previewId)),
                        })
                      }
                    >
                      Clear
                    </Button>
                  </Group>
                </Group>
                <ScrollArea.Autosize mah={390} type="auto">
                  <Table striped highlightOnHover verticalSpacing="xs">
                    <Table.Thead>
                      <Table.Tr>
                        <Table.Th>Key</Table.Th>
                        <Table.Th>Value</Table.Th>
                        <Table.Th w={76}>Actions</Table.Th>
                      </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                      {data.localStorage.map((entry) => (
                        <Table.Tr key={entry.key}>
                          <Table.Td>
                            <Text size="sm" fw={600} maw={240} truncate="end">
                              {entry.key}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Text size="xs" ff="monospace" maw={430} truncate="end">
                              {entry.value || '—'}
                            </Text>
                          </Table.Td>
                          <Table.Td>
                            <Group gap={2} wrap="nowrap">
                              <ActionIcon
                                variant="subtle"
                                aria-label={`Edit local storage ${entry.key}`}
                                onClick={() => setStorageEditor(entry)}
                              >
                                <IconEdit size={15} />
                              </ActionIcon>
                              <ActionIcon
                                variant="subtle"
                                color="red"
                                aria-label={`Delete local storage ${entry.key}`}
                                onClick={() => requestStorageDelete(entry)}
                              >
                                <IconTrash size={15} />
                              </ActionIcon>
                            </Group>
                          </Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                  {data.localStorage.length === 0 && (
                    <Text size="sm" c="dimmed" ta="center" py="xl">
                      No local storage values for this origin.
                    </Text>
                  )}
                </ScrollArea.Autosize>
              </Tabs.Panel>
            </Tabs>
          )}
        </Stack>
      </Modal>

      <CookieEditorModal
        cookie={cookieEditor === 'create' ? null : cookieEditor}
        opened={cookieEditor !== null}
        busy={busy}
        onClose={() => setCookieEditor(null)}
        onSave={async (cookie) => {
          const previous = cookieEditor === 'create' ? null : cookieEditor;
          await mutate(async () => {
            await setBrowserCookie(previewId!, cookie);
            if (
              previous &&
              (previous.name !== cookie.name ||
                previous.domain !== cookie.domain ||
                previous.path !== cookie.path)
            ) {
              await deleteBrowserCookie(previewId!, previous);
            }
          });
          setCookieEditor(null);
        }}
      />

      <StorageEditorModal
        entry={storageEditor === 'create' ? null : storageEditor}
        opened={storageEditor !== null}
        busy={busy}
        onClose={() => setStorageEditor(null)}
        onSave={async (entry) => {
          const previous = storageEditor === 'create' ? null : storageEditor;
          await mutate(async () => {
            await setBrowserLocalStorage(previewId!, entry.key, entry.value);
            if (previous && previous.key !== entry.key) {
              await deleteBrowserLocalStorage(previewId!, previous.key);
            }
          });
          setStorageEditor(null);
        }}
      />

      <Modal
        opened={confirmation !== null}
        onClose={() => setConfirmation(null)}
        title={confirmation?.title}
        centered
        size="sm"
        overlayProps={{ backgroundOpacity: 0.7, blur: 5 }}
      >
        <Stack>
          <Alert color="red" icon={<IconAlertTriangle size={17} />}>
            {confirmation?.message}
          </Alert>
          <Group justify="flex-end">
            <Button variant="subtle" color="gray" onClick={() => setConfirmation(null)}>
              Cancel
            </Button>
            <Button
              color="red"
              loading={busy}
              onClick={() => {
                if (!confirmation) return;
                void confirmation
                  .run()
                  .then(() => setConfirmation(null))
                  .catch(() => undefined);
              }}
            >
              {confirmation?.confirmLabel}
            </Button>
          </Group>
        </Stack>
      </Modal>
    </>
  );
}

interface CookieEditorModalProps {
  cookie: BrowserCookie | null;
  opened: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (cookie: BrowserCookie) => Promise<void>;
}

function CookieEditorModal({ cookie, opened, busy, onClose, onSave }: CookieEditorModalProps) {
  const [draft, setDraft] = useState<BrowserCookieDraft>(() =>
    createCookieDraft(cookie ?? undefined),
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setDraft(createCookieDraft(cookie ?? undefined));
      setError(null);
    }
  }, [cookie, opened]);

  const updateDraft = <Key extends keyof BrowserCookieDraft>(
    key: Key,
    value: BrowserCookieDraft[Key],
  ) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const submit = () => {
    try {
      const parsed = parseCookieDraft(draft);
      setError(null);
      void onSave(parsed).catch((saveError: unknown) => setError(getErrorMessage(saveError)));
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  };

  return (
    <Modal opened={opened} onClose={onClose} title={cookie ? 'Edit cookie' : 'Add cookie'} centered>
      <Stack>
        <Group grow align="flex-start">
          <TextInput
            label="Name"
            value={draft.name}
            onChange={(event) => updateDraft('name', event.currentTarget.value)}
            autoFocus
          />
          <TextInput
            label="Value"
            value={draft.value}
            onChange={(event) => updateDraft('value', event.currentTarget.value)}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput
            label="Domain"
            description="Blank uses the current host."
            value={draft.domain}
            onChange={(event) => updateDraft('domain', event.currentTarget.value)}
          />
          <TextInput
            label="Path"
            value={draft.path}
            onChange={(event) => updateDraft('path', event.currentTarget.value)}
          />
        </Group>
        <Group grow align="flex-start">
          <TextInput
            type="datetime-local"
            step={1}
            label="Expires"
            description="Blank creates a session cookie."
            value={draft.expires}
            onChange={(event) => updateDraft('expires', event.currentTarget.value)}
          />
          <Select
            label="SameSite"
            placeholder="Unspecified"
            value={draft.sameSite}
            data={['Strict', 'Lax', 'None']}
            clearable
            onChange={(value) => updateDraft('sameSite', value as BrowserCookieDraft['sameSite'])}
          />
        </Group>
        <Group>
          <Switch
            label="Secure"
            checked={draft.secure}
            onChange={(event) => updateDraft('secure', event.currentTarget.checked)}
          />
          <Switch
            label="HttpOnly"
            checked={draft.httpOnly}
            onChange={(event) => updateDraft('httpOnly', event.currentTarget.checked)}
          />
        </Group>
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Save cookie
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

interface StorageEditorModalProps {
  entry: BrowserStorageEntry | null;
  opened: boolean;
  busy: boolean;
  onClose: () => void;
  onSave: (entry: BrowserStorageEntry) => Promise<void>;
}

function StorageEditorModal({ entry, opened, busy, onClose, onSave }: StorageEditorModalProps) {
  const [key, setKey] = useState('');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (opened) {
      setKey(entry?.key ?? '');
      setValue(entry?.value ?? '');
      setError(null);
    }
  }, [entry, opened]);

  const submit = () => {
    if (!key) {
      setError('Key is required.');
      return;
    }
    setError(null);
    void onSave({ key, value }).catch((saveError: unknown) => setError(getErrorMessage(saveError)));
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={entry ? 'Edit local storage' : 'Add local storage'}
      centered
    >
      <Stack>
        <TextInput
          label="Key"
          value={key}
          onChange={(event) => setKey(event.currentTarget.value)}
          autoFocus
        />
        <TextInput
          label="Value"
          value={value}
          onChange={(event) => setValue(event.currentTarget.value)}
        />
        {error && <Alert color="red">{error}</Alert>}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={busy} onClick={submit}>
            Save value
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
