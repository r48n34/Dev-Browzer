import { useEffect, useRef, useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Autocomplete,
  Box,
  Button,
  Group,
  Kbd,
  Menu,
  Select,
  Switch,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconCommand,
  IconCopy,
  IconDots,
  IconHome,
  IconMoon,
  IconPlus,
  IconRefresh,
  IconSettings,
  IconSun,
  IconTrash,
} from '@tabler/icons-react';
import { reloadPreviews } from '../native/bridge';
import { useDevBrowzer } from '../state/context';
import { canMoveHistory } from '../utils/history';
import { normalizePreviewUrl } from '../utils/url';

interface TopToolbarProps {
  onAddProject: () => void;
  onEditProject: () => void;
  onDuplicateProject: () => void;
  onDeleteProject: () => void;
  onOpenCommands: () => void;
}

export function TopToolbar({
  onAddProject,
  onEditProject,
  onDuplicateProject,
  onDeleteProject,
  onOpenCommands,
}: TopToolbarProps) {
  const {
    state,
    activeProject,
    navigationHistory,
    navigate,
    moveHistory,
    selectProject,
    setSyncNavigation,
  } = useDevBrowzer();
  const [address, setAddress] = useState(activeProject?.currentUrl ?? '');
  const [addressError, setAddressError] = useState<string | null>(null);
  const addressRef = useRef<HTMLInputElement>(null);
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const recentUrls = [
    ...new Set(
      state.recentUrls
        .filter((entry) => entry.projectId === activeProject?.id)
        .map((entry) => entry.url),
    ),
  ].slice(0, 8);

  useEffect(() => {
    setAddress(activeProject?.currentUrl ?? '');
    setAddressError(null);
  }, [activeProject?.currentUrl, activeProject?.id]);

  useEffect(() => {
    const focusAddress = () => {
      addressRef.current?.focus();
      addressRef.current?.select();
    };
    window.addEventListener('devbrowzer:focus-address', focusAddress);
    return () => window.removeEventListener('devbrowzer:focus-address', focusAddress);
  }, []);

  const submitAddress = (event: FormEvent) => {
    event.preventDefault();
    try {
      const url = normalizePreviewUrl(address);
      setAddress(url);
      setAddressError(null);
      navigate(url);
    } catch (error) {
      setAddressError(error instanceof Error ? error.message : 'Invalid address.');
    }
  };

  return (
    <Group gap="xs" wrap="nowrap" className="top-toolbar">
      <Select
        aria-label="Active project"
        value={activeProject?.id ?? null}
        data={state.projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={(value) => value && selectProject(value)}
        placeholder="Choose project"
        className="project-select"
        allowDeselect={false}
        searchable
      />

      <Group gap={2} wrap="nowrap" className="navigation-actions">
        <Tooltip label="Back · Alt+Left">
          <ActionIcon
            variant="subtle"
            aria-label="Back"
            disabled={!navigationHistory || !canMoveHistory(navigationHistory, -1)}
            onClick={() => moveHistory(-1)}
          >
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Forward · Alt+Right">
          <ActionIcon
            variant="subtle"
            aria-label="Forward"
            disabled={!navigationHistory || !canMoveHistory(navigationHistory, 1)}
            onClick={() => moveHistory(1)}
          >
            <IconArrowRight size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Project home">
          <ActionIcon
            variant="subtle"
            aria-label="Project home"
            disabled={!activeProject}
            onClick={() => activeProject && navigate(activeProject.baseUrl)}
          >
            <IconHome size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Reload all · Ctrl+R">
          <ActionIcon
            variant="subtle"
            aria-label="Reload all previews"
            disabled={!activeProject}
            onClick={() => void reloadPreviews()}
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Box component="form" onSubmit={submitAddress} className="address-form">
        <Autocomplete
          ref={addressRef}
          aria-label="Preview address"
          value={address}
          error={addressError}
          data={recentUrls}
          onChange={(value) => {
            setAddress(value);
            setAddressError(null);
          }}
          onOptionSubmit={(value) => {
            setAddress(value);
            navigate(value);
          }}
          placeholder="localhost:5173"
          leftSection={<Box className="secure-dot" data-secure={address.startsWith('https:')} />}
          rightSection={
            <Button type="submit" variant="subtle" size="compact-xs" px={8}>
              Go
            </Button>
          }
          rightSectionWidth={44}
          rightSectionPointerEvents="all"
          disabled={!activeProject}
          comboboxProps={{ shadow: 'md' }}
        />
      </Box>

      <Switch
        checked={activeProject?.syncNavigation ?? true}
        onChange={(event) => setSyncNavigation(event.currentTarget.checked)}
        label="Sync"
        aria-label="Synchronize navigation"
        disabled={!activeProject}
        size="sm"
        className="sync-control"
      />

      <Tooltip label="Commands · Ctrl+K">
        <Button
          variant="subtle"
          size="compact-sm"
          leftSection={<IconCommand size={17} />}
          rightSection={<Kbd className="command-shortcut">Ctrl K</Kbd>}
          onClick={onOpenCommands}
          aria-label="Open command palette"
          className="command-button"
        >
          Commands
        </Button>
      </Tooltip>

      <Menu width={230} shadow="md" position="bottom-end">
        <Menu.Target>
          <ActionIcon variant="default" aria-label="More actions">
            <IconDots size={18} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
          <Menu.Label>Project</Menu.Label>
          <Menu.Item leftSection={<IconPlus size={16} />} onClick={onAddProject}>
            New project
          </Menu.Item>
          <Menu.Item
            leftSection={<IconSettings size={16} />}
            onClick={onEditProject}
            disabled={!activeProject}
          >
            Edit project
          </Menu.Item>
          <Menu.Item
            leftSection={<IconCopy size={16} />}
            onClick={onDuplicateProject}
            disabled={!activeProject}
          >
            Duplicate project
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            leftSection={colorScheme === 'dark' ? <IconSun size={16} /> : <IconMoon size={16} />}
            onClick={() => toggleColorScheme()}
          >
            Use {colorScheme === 'dark' ? 'light' : 'dark'} theme
          </Menu.Item>
          <Menu.Divider />
          <Menu.Item
            color="red"
            leftSection={<IconTrash size={16} />}
            onClick={onDeleteProject}
            disabled={!activeProject}
          >
            Delete project
          </Menu.Item>
        </Menu.Dropdown>
      </Menu>
    </Group>
  );
}
