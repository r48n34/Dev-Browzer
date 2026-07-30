import type { SavedRoute } from '../types';
import { areUrlsEqual } from './url';

export function getActiveRouteIndex(routes: SavedRoute[], currentUrl: string): number {
  return routes.findIndex((route) => areUrlsEqual(route.url, currentUrl));
}

export function getAdjacentRoute(
  routes: SavedRoute[],
  currentUrl: string,
  direction: -1 | 1,
): SavedRoute | null {
  if (routes.length === 0) {
    return null;
  }
  const activeIndex = getActiveRouteIndex(routes, currentUrl);
  const origin = activeIndex >= 0 ? activeIndex : direction === 1 ? -1 : routes.length;
  const nextIndex = origin + direction;
  return routes[nextIndex] ?? null;
}
