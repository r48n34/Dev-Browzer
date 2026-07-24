import { useEffect, useState, type FormEvent } from 'react';
import {
  ActionIcon,
  Box,
  Button,
  Group,
  Menu,
  Select,
  Switch,
  TextInput,
  Tooltip,
  useMantineColorScheme,
} from '@mantine/core';
import {
  IconArrowLeft,
  IconArrowRight,
  IconChevronDown,
  IconHome,
  IconHistory,
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
  onDeleteProject: () => void;
}

export function TopToolbar({ onAddProject, onEditProject, onDeleteProject }: TopToolbarProps) {
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
  const { colorScheme, toggleColorScheme } = useMantineColorScheme();
  const recentUrls = state.recentUrls
    .filter((entry) => entry.projectId === activeProject?.id)
    .slice(0, 8);

  useEffect(() => {
    setAddress(activeProject?.currentUrl ?? '');
    setAddressError(null);
  }, [activeProject?.currentUrl, activeProject?.id]);

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
    <Group gap="sm" wrap="nowrap" className="top-toolbar">
      <Select
        aria-label="Active project"
        value={activeProject?.id ?? null}
        data={state.projects.map((project) => ({ value: project.id, label: project.name }))}
        onChange={(value) => value && selectProject(value)}
        placeholder="Choose project"
        w={190}
        allowDeselect={false}
        searchable
      />
      <Menu width={200} shadow="md">
        <Menu.Target>
          <ActionIcon variant="default" aria-label="Project actions">
            <IconChevronDown size={17} />
          </ActionIcon>
        </Menu.Target>
        <Menu.Dropdown>
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

      <Group gap={4} wrap="nowrap">
        <Tooltip label="Back">
          <ActionIcon
            variant="subtle"
            aria-label="Back"
            disabled={!navigationHistory || !canMoveHistory(navigationHistory, -1)}
            onClick={() => moveHistory(-1)}
          >
            <IconArrowLeft size={18} />
          </ActionIcon>
        </Tooltip>
        <Tooltip label="Forward">
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
        <Tooltip label="Reload all previews">
          <ActionIcon
            variant="subtle"
            aria-label="Reload all previews"
            disabled={!activeProject}
            onClick={() => void reloadPreviews()}
          >
            <IconRefresh size={18} />
          </ActionIcon>
        </Tooltip>
        <Menu width={380} shadow="md" position="bottom-end">
          <Menu.Target>
            <Tooltip label="Recent addresses">
              <ActionIcon
                variant="subtle"
                aria-label="Recent addresses"
                disabled={recentUrls.length === 0}
              >
                <IconHistory size={18} />
              </ActionIcon>
            </Tooltip>
          </Menu.Target>
          <Menu.Dropdown>
            <Menu.Label>Recent addresses</Menu.Label>
            {recentUrls.map((entry) => (
              <Menu.Item
                key={`${entry.url}-${entry.visitedAt}`}
                onClick={() => {
                  setAddress(entry.url);
                  navigate(entry.url);
                }}
              >
                <Box className="recent-url-item">{entry.url}</Box>
              </Menu.Item>
            ))}
          </Menu.Dropdown>
        </Menu>
      </Group>

      <Box component="form" onSubmit={submitAddress} className="address-form">
        <TextInput
          aria-label="Preview address"
          value={address}
          error={addressError}
          onChange={(event) => {
            setAddress(event.currentTarget.value);
            setAddressError(null);
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
        />
      </Box>

      <Switch
        checked={activeProject?.syncNavigation ?? true}
        onChange={(event) => setSyncNavigation(event.currentTarget.checked)}
        label="Sync"
        aria-label="Synchronize navigation"
        disabled={!activeProject}
        size="sm"
      />
      <Tooltip label={`Use ${colorScheme === 'dark' ? 'light' : 'dark'} theme`}>
        <ActionIcon
          variant="subtle"
          aria-label="Toggle color scheme"
          onClick={() => toggleColorScheme()}
        >
          {colorScheme === 'dark' ? <IconSun size={18} /> : <IconMoon size={18} />}
        </ActionIcon>
      </Tooltip>
    </Group>
  );
}
