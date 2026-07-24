import { DEFAULT_VIEWPORT_IDS } from '../config/viewports';
import {
  MIN_BOARD_SCALE,
  RECENT_URL_LIMIT,
  STORE_SCHEMA_VERSION,
  type PersistedAppState,
  type ProjectWorkspace,
  type RecentUrl,
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
    ? data.projects.filter(isProjectWorkspace).map((project) => ({
        ...project,
        boardScale: clampBoardScale(project.boardScale),
        previewLayouts: sanitizePreviewLayouts(project.previewLayouts),
        enabledViewportIds:
          project.enabledViewportIds.length > 0
            ? project.enabledViewportIds
            : [...DEFAULT_VIEWPORT_IDS],
      }))
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
