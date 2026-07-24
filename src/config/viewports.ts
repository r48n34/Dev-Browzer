import type { ViewportDefinition } from '../types';

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
  (viewport) => viewport.id !== 'desktop-4k',
).map((viewport) => viewport.id);

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
