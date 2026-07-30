import { useEffect, useState } from 'react';
import {
  Box,
  Group,
  Kbd,
  Modal,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from '@mantine/core';
import { IconCommand, IconSearch } from '@tabler/icons-react';
import type { WorkbenchCommand } from '../commands/registry';
import { filterWorkbenchCommands } from '../commands/registry';

interface CommandPaletteProps {
  opened: boolean;
  commands: WorkbenchCommand[];
  onClose: () => void;
}

export function CommandPalette({ opened, commands, onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (opened) {
      setQuery('');
    }
  }, [opened]);

  const visibleCommands = filterWorkbenchCommands(commands, query);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      padding={0}
      size={620}
      centered
      overlayProps={{ backgroundOpacity: 0.62, blur: 5 }}
      aria-label="Command palette"
    >
      <TextInput
        value={query}
        onChange={(event) => setQuery(event.currentTarget.value)}
        placeholder="Search commands, projects, and viewports"
        leftSection={<IconSearch size={18} />}
        variant="unstyled"
        size="lg"
        px="md"
        autoFocus
        aria-label="Search commands"
      />
      <Box className="command-divider" />
      <ScrollArea.Autosize mah={430}>
        <Stack gap={3} p="xs">
          {visibleCommands.map((command) => (
            <UnstyledButton
              key={command.id}
              className="command-item"
              disabled={command.disabled}
              onClick={() => {
                command.run();
                onClose();
              }}
            >
              <Group justify="space-between" wrap="nowrap">
                <Group gap="sm" wrap="nowrap" miw={0}>
                  <Box className="command-icon">
                    <IconCommand size={16} />
                  </Box>
                  <Box miw={0}>
                    <Text size="sm" fw={650} truncate>
                      {command.label}
                    </Text>
                    <Text size="xs" c="dimmed" truncate>
                      {command.description}
                    </Text>
                  </Box>
                </Group>
                {command.shortcut && <Kbd>{command.shortcut}</Kbd>}
              </Group>
            </UnstyledButton>
          ))}
          {visibleCommands.length === 0 && (
            <Text size="sm" c="dimmed" ta="center" py="xl">
              No matching command
            </Text>
          )}
        </Stack>
      </ScrollArea.Autosize>
    </Modal>
  );
}
