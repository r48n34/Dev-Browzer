import { LazyStore } from '@tauri-apps/plugin-store';
import type { PersistedAppState } from '../types';
import { isTauriRuntime } from '../native/bridge';
import { createEmptyPersistedState, migratePersistedState } from '../utils/project';

const STORE_FILE = 'dev-browzer.json';
const STORE_KEY = 'appState';
const BROWSER_KEY = 'dev-browzer.app-state';

let tauriStore: LazyStore | null = null;

function getTauriStore(): LazyStore {
  tauriStore ??= new LazyStore(STORE_FILE, { autoSave: 150 });
  return tauriStore;
}

export async function loadPersistedState(): Promise<PersistedAppState> {
  try {
    if (isTauriRuntime()) {
      const stored = await getTauriStore().get<unknown>(STORE_KEY);
      return migratePersistedState(stored);
    }

    const stored = localStorage.getItem(BROWSER_KEY);
    return migratePersistedState(stored ? JSON.parse(stored) : null);
  } catch {
    return createEmptyPersistedState();
  }
}

export async function savePersistedState(state: PersistedAppState): Promise<void> {
  if (isTauriRuntime()) {
    await getTauriStore().set(STORE_KEY, state);
    return;
  }
  localStorage.setItem(BROWSER_KEY, JSON.stringify(state));
}
