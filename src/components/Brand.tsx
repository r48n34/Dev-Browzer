import { Box, Group, Text, ThemeIcon } from '@mantine/core';
import { IconViewportWide } from '@tabler/icons-react';

export function Brand() {
  return (
    <Group gap="sm" >
      <ThemeIcon size={36} radius="md" variant="gradient" gradient={{ from: 'violet', to: 'cyan' }}>
        <IconViewportWide size={22} stroke={1.8} />
      </ThemeIcon>
    </Group>
  );
}
