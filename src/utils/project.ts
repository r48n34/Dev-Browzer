import { DEFAULT_VIEWPORT_IDS } from '../config/viewports';
import {
  MIN_BOARD_SCALE,
  RECENT_URL_LIMIT,
  STORE_SCHEMA_VERSION,
  type PreviewDeviceProfile,
  type PersistedAppState,
  type ProjectWorkspace,
  type RecentUrl,
  type SavedRoute,
  type WorkspacePreset,
} from '../types';
import { clampBoardScale } from './viewport';
import { sanitizePreviewLayouts } from './previewLayout';

export function createProjectWorkspace(name: string, url: string): ProjectWorkspace {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    baseUrl: url,
    currentUrl: url,
    enabledViewportIds: [...DEFAULT_VIEWPORT_IDS],
    customViewports: [],
    boardScale: MIN_BOARD_SCALE,
    previewLayouts: {},
    syncNavigation: true,
    savedRoutes: [],
    workspacePresets: [],
    deviceProfiles: {},
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
}

export function createEmptyPersistedState(): PersistedAppState {
  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    projects: [],
    activeProjectId: null,
    recentUrls: [],
  };
}

export function migratePersistedState(input: unknown): PersistedAppState {
  const fallback = createEmptyPersistedState();
  if (!input || typeof input !== 'object') {
    return fallback;
  }

  const data = input as Partial<PersistedAppState>;
  const projects = Array.isArray(data.projects)
    ? data.projects.filter(isProjectWorkspace).map((project) => {
        const candidate = project as ProjectWorkspace;
        return {
          ...candidate,
          boardScale: clampBoardScale(candidate.boardScale),
          previewLayouts: sanitizePreviewLayouts(candidate.previewLayouts),
          enabledViewportIds:
            candidate.enabledViewportIds.length > 0
              ? candidate.enabledViewportIds
              : [...DEFAULT_VIEWPORT_IDS],
          savedRoutes: Array.isArray(candidate.savedRoutes)
            ? candidate.savedRoutes.filter(isSavedRoute)
            : [],
          workspacePresets: Array.isArray(candidate.workspacePresets)
            ? candidate.workspacePresets.filter(isWorkspacePreset).map((preset) => ({
                ...preset,
                boardScale: clampBoardScale(preset.boardScale),
                previewLayouts: sanitizePreviewLayouts(preset.previewLayouts),
              }))
            : [],
          deviceProfiles: sanitizeDeviceProfiles(candidate.deviceProfiles),
        };
      })
    : [];
  const activeProjectId =
    typeof data.activeProjectId === 'string' &&
    projects.some((project) => project.id === data.activeProjectId)
      ? data.activeProjectId
      : (projects[0]?.id ?? null);

  return {
    schemaVersion: STORE_SCHEMA_VERSION,
    projects,
    activeProjectId,
    recentUrls: Array.isArray(data.recentUrls)
      ? data.recentUrls.filter(isRecentUrl).slice(0, RECENT_URL_LIMIT)
      : [],
  };
}

export function duplicateProjectWorkspace(
  project: ProjectWorkspace,
  name = `${project.name} copy`,
): ProjectWorkspace {
  const now = new Date().toISOString();
  return {
    ...project,
    id: crypto.randomUUID(),
    name,
    savedRoutes: project.savedRoutes.map((route) => ({ ...route, id: crypto.randomUUID() })),
    workspacePresets: project.workspacePresets.map((preset) => ({
      ...preset,
      id: crypto.randomUUID(),
      previewLayouts: { ...preset.previewLayouts },
    })),
    deviceProfiles: { ...project.deviceProfiles },
    previewLayouts: { ...project.previewLayouts },
    createdAt: now,
    updatedAt: now,
    lastOpenedAt: now,
  };
}

export function addRecentUrl(
  recentUrls: RecentUrl[],
  url: string,
  projectId: string,
  visitedAt = new Date().toISOString(),
): RecentUrl[] {
  const next = recentUrls.filter((entry) => entry.url !== url || entry.projectId !== projectId);
  return [{ url, projectId, visitedAt }, ...next].slice(0, RECENT_URL_LIMIT);
}

function isProjectWorkspace(value: unknown): value is ProjectWorkspace {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const project = value as Partial<ProjectWorkspace>;
  return (
    typeof project.id === 'string' &&
    typeof project.name === 'string' &&
    typeof project.baseUrl === 'string' &&
    typeof project.currentUrl === 'string' &&
    Array.isArray(project.enabledViewportIds) &&
    Array.isArray(project.customViewports) &&
    typeof project.boardScale === 'number' &&
    Number.isFinite(project.boardScale) &&
    typeof project.syncNavigation === 'boolean' &&
    typeof project.createdAt === 'string' &&
    typeof project.updatedAt === 'string' &&
    typeof project.lastOpenedAt === 'string'
  );
}

function isSavedRoute(value: unknown): value is SavedRoute {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const route = value as Partial<SavedRoute>;
  return (
    typeof route.id === 'string' && typeof route.name === 'string' && typeof route.url === 'string'
  );
}

function isWorkspacePreset(value: unknown): value is WorkspacePreset {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const preset = value as Partial<WorkspacePreset>;
  return (
    typeof preset.id === 'string' &&
    typeof preset.name === 'string' &&
    Array.isArray(preset.enabledViewportIds) &&
    typeof preset.boardScale === 'number' &&
    Number.isFinite(preset.boardScale) &&
    typeof preset.createdAt === 'string'
  );
}

function sanitizeDeviceProfiles(input: unknown): Record<string, PreviewDeviceProfile> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).flatMap(([id, value]) => {
      if (!id || !value || typeof value !== 'object') {
        return [];
      }
      const profile = value as Partial<PreviewDeviceProfile>;
      const colorScheme = profile.colorScheme;
      const networkProfile = profile.networkProfile;
      if (
        typeof profile.devicePixelRatio !== 'number' ||
        !Number.isFinite(profile.devicePixelRatio) ||
        typeof profile.userAgent !== 'string' ||
        typeof profile.touchEnabled !== 'boolean' ||
        (colorScheme !== 'system' && colorScheme !== 'light' && colorScheme !== 'dark') ||
        (networkProfile !== 'online' &&
          networkProfile !== 'fast-3g' &&
          networkProfile !== 'slow-3g' &&
          networkProfile !== 'offline') ||
        typeof profile.reducedMotion !== 'boolean'
      ) {
        return [];
      }
      return [
        [
          id,
          {
            devicePixelRatio: Math.min(4, Math.max(0.5, profile.devicePixelRatio)),
            userAgent: profile.userAgent,
            touchEnabled: profile.touchEnabled,
            colorScheme,
            networkProfile,
            reducedMotion: profile.reducedMotion,
          },
        ],
      ];
    }),
  );
}

function isRecentUrl(value: unknown): value is RecentUrl {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const recent = value as Partial<RecentUrl>;
  return (
    typeof recent.url === 'string' &&
    typeof recent.projectId === 'string' &&
    typeof recent.visitedAt === 'string'
  );
}
