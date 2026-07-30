import { describe, expect, it } from 'vitest';
import { DEFAULT_VIEWPORT_IDS } from '../config/viewports';
import { RECENT_URL_LIMIT, type RecentUrl } from '../types';
import {
  addRecentUrl,
  createEmptyPersistedState,
  createProjectWorkspace,
  duplicateProjectWorkspace,
  migratePersistedState,
} from './project';

describe('project persistence', () => {
  it('creates a workspace with all focused defaults', () => {
    const project = createProjectWorkspace('Storefront', 'http://localhost:5173/');
    expect(project.enabledViewportIds).toEqual(DEFAULT_VIEWPORT_IDS);
    expect(project.boardScale).toBe(0.25);
    expect(project.previewLayouts).toEqual({});
    expect(project.syncNavigation).toBe(true);
    expect(project.savedRoutes).toEqual([]);
    expect(project.workspacePresets).toEqual([]);
    expect(project.deviceProfiles).toEqual({});
  });

  it('returns safe defaults for malformed data', () => {
    expect(migratePersistedState({ projects: 'broken' })).toEqual(createEmptyPersistedState());
  });

  it('repairs an unknown active project', () => {
    const project = createProjectWorkspace('App', 'http://localhost/');
    const migrated = migratePersistedState({
      schemaVersion: 0,
      projects: [project],
      activeProjectId: 'missing',
      recentUrls: [],
    });
    expect(migrated.activeProjectId).toBe(project.id);
    expect(migrated.schemaVersion).toBe(3);
  });

  it('clamps board scale while migrating older workspace data', () => {
    const project = {
      ...createProjectWorkspace('App', 'http://localhost/'),
      boardScale: 4,
    };
    const migrated = migratePersistedState({
      schemaVersion: 0,
      projects: [project],
      activeProjectId: project.id,
      recentUrls: [],
    });

    expect(migrated.projects[0]?.boardScale).toBe(1);
  });

  it('migrates and sanitizes individual preview layouts', () => {
    const project = {
      ...createProjectWorkspace('App', 'http://localhost/'),
      previewLayouts: {
        phone: { x: -20.4, y: 49.6, scale: 4 },
        broken: { x: 'left', y: 0, scale: 0.5 },
      },
    };
    const migrated = migratePersistedState({
      schemaVersion: 1,
      projects: [project],
      activeProjectId: project.id,
      recentUrls: [],
    });

    expect(migrated.projects[0]?.previewLayouts).toEqual({
      phone: { x: 0, y: 50, scale: 1 },
    });
  });

  it('deduplicates and caps recent URLs', () => {
    let recent: RecentUrl[] = [];
    for (let index = 0; index < RECENT_URL_LIMIT + 10; index += 1) {
      recent = addRecentUrl(recent, `http://localhost/${index}`, 'project');
    }
    recent = addRecentUrl(recent, 'http://localhost/20', 'project', 'now');

    expect(recent).toHaveLength(RECENT_URL_LIMIT);
    expect(recent[0]).toMatchObject({ url: 'http://localhost/20', visitedAt: 'now' });
    expect(recent.filter((entry) => entry.url === 'http://localhost/20')).toHaveLength(1);
  });

  it('adds new collections while migrating a version 2 workspace', () => {
    const project = createProjectWorkspace('App', 'http://localhost/');
    const legacy = { ...project } as Partial<typeof project>;
    delete legacy.savedRoutes;
    delete legacy.workspacePresets;
    delete legacy.deviceProfiles;

    const migrated = migratePersistedState({
      schemaVersion: 2,
      projects: [legacy],
      activeProjectId: project.id,
      recentUrls: [],
    });

    expect(migrated.projects[0]).toMatchObject({
      savedRoutes: [],
      workspacePresets: [],
      deviceProfiles: {},
    });
  });

  it('duplicates projects with new project and nested route identifiers', () => {
    const project = createProjectWorkspace('App', 'http://localhost/');
    project.savedRoutes = [{ id: 'route', name: 'Home', url: 'http://localhost/' }];
    const duplicate = duplicateProjectWorkspace(project);

    expect(duplicate.id).not.toBe(project.id);
    expect(duplicate.name).toBe('App copy');
    expect(duplicate.savedRoutes[0]?.id).not.toBe('route');
  });
});
