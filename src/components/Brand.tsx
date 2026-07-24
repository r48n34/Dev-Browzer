import { Box, Group, Text, ThemeIcon } from '@mantine/core';
import { IconViewportWide } from '@tabler/icons-react';

export function Brand() {
  return (
    <Group gap="sm" wrap="nowrap">
      <ThemeIcon size={36} radius="md" variant="gradient" gradient={{ from: 'violet', to: 'cyan' }}>
        <IconViewportWide size={22} stroke={1.8} />
      </ThemeIcon>
      <Box>
        <Text fw={750} size="lg" lh={1.05}>
          Dev Browzer
        </Text>
        <Text size="xs" c="dimmed" mt={3}>
          Responsive workbench
        </Text>
      </Box>
    </Group>
  );
}
