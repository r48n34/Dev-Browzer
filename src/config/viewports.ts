import type {
  PreviewDeviceProfile,
  ViewportDefinition,
  ViewportPreset,
  ViewportPresetId,
} from '../types';

export const BUILT_IN_VIEWPORTS: ViewportDefinition[] = [
  {
    id: 'phone-portrait',
    name: 'Phone portrait',
    width: 390,
    height: 844,
    category: 'phone',
    builtIn: true,
  },
  {
    id: 'phone-landscape',
    name: 'Phone landscape',
    width: 844,
    height: 390,
    category: 'phone',
    builtIn: true,
  },
  {
    id: 'ipad-portrait',
    name: 'iPad portrait',
    width: 768,
    height: 1024,
    category: 'tablet',
    builtIn: true,
  },
  {
    id: 'ipad-landscape',
    name: 'iPad landscape',
    width: 1024,
    height: 768,
    category: 'tablet',
    builtIn: true,
  },
  {
    id: 'desktop-hd',
    name: 'HD desktop',
    width: 1920,
    height: 1080,
    category: 'desktop',
    builtIn: true,
  },
  {
    id: 'desktop-2k',
    name: '2K / QHD',
    width: 2560,
    height: 1440,
    category: 'desktop',
    builtIn: true,
  },
  {
    id: 'desktop-4k',
    name: '4K / UHD',
    width: 3840,
    height: 2160,
    category: 'desktop',
    builtIn: true,
  },
];

export const DEFAULT_VIEWPORT_IDS = BUILT_IN_VIEWPORTS.filter(
  (viewport) =>
    viewport.id === 'phone-portrait' ||
    viewport.id === 'ipad-portrait' ||
    viewport.id === 'desktop-hd',
).map((viewport) => viewport.id);

export const VIEWPORT_PRESETS: ViewportPreset[] = [
  {
    id: 'essential',
    name: 'Essential',
    description: 'Phone, tablet, and desktop',
    viewportIds: ['phone-portrait', 'ipad-portrait', 'desktop-hd'],
  },
  {
    id: 'mobile',
    name: 'Mobile',
    description: 'Phone and tablet orientations',
    viewportIds: ['phone-portrait', 'phone-landscape', 'ipad-portrait', 'ipad-landscape'],
  },
  {
    id: 'desktop',
    name: 'Desktop',
    description: 'HD, 2K, and 4K screens',
    viewportIds: ['desktop-hd', 'desktop-2k', 'desktop-4k'],
  },
  {
    id: 'all',
    name: 'All',
    description: 'Every built-in viewport',
    viewportIds: BUILT_IN_VIEWPORTS.map((viewport) => viewport.id),
  },
];

export const DEFAULT_DEVICE_PROFILE: PreviewDeviceProfile = {
  devicePixelRatio: 1,
  userAgent: '',
  touchEnabled: false,
  colorScheme: 'system',
  networkProfile: 'online',
  reducedMotion: false,
};

export function getViewportPreset(id: ViewportPresetId): ViewportPreset {
  return VIEWPORT_PRESETS.find((preset) => preset.id === id) ?? VIEWPORT_PRESETS[0];
}

export function matchViewportPreset(enabledIds: string[]): ViewportPresetId | null {
  const enabled = new Set(enabledIds);
  return (
    VIEWPORT_PRESETS.find(
      (preset) =>
        preset.viewportIds.length === enabled.size &&
        preset.viewportIds.every((id) => enabled.has(id)),
    )?.id ?? null
  );
}

export function getPreviewDeviceProfile(
  profiles: Record<string, PreviewDeviceProfile>,
  viewportId: string,
): PreviewDeviceProfile {
  return { ...DEFAULT_DEVICE_PROFILE, ...profiles[viewportId] };
}

export function getProjectViewports(
  enabledIds: string[],
  customViewports: ViewportDefinition[],
): ViewportDefinition[] {
  const byId = new Map(
    [...BUILT_IN_VIEWPORTS, ...customViewports].map((viewport) => [viewport.id, viewport]),
  );
  return enabledIds.flatMap((id) => {
    const viewport = byId.get(id);
    return viewport ? [viewport] : [];
  });
}
