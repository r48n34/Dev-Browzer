import type { NavigationHistory } from '../types';
import { areUrlsEqual } from './url';

export function createNavigationHistory(url: string): NavigationHistory {
  return { entries: [url], index: 0 };
}

export function pushNavigationHistory(history: NavigationHistory, url: string): NavigationHistory {
  if (areUrlsEqual(history.entries[history.index] ?? '', url)) {
    return history;
  }

  return {
    entries: [...history.entries.slice(0, history.index + 1), url],
    index: history.index + 1,
  };
}

export function moveNavigationHistory(
  history: NavigationHistory,
  direction: -1 | 1,
): NavigationHistory {
  return {
    ...history,
    index: Math.min(history.entries.length - 1, Math.max(0, history.index + direction)),
  };
}

export function canMoveHistory(history: NavigationHistory, direction: -1 | 1): boolean {
  const nextIndex = history.index + direction;
  return nextIndex >= 0 && nextIndex < history.entries.length;
}
