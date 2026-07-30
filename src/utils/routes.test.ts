import { describe, expect, it } from 'vitest';
import type { SavedRoute } from '../types';
import { getActiveRouteIndex, getAdjacentRoute } from './routes';

const routes: SavedRoute[] = [
  { id: 'home', name: 'Home', url: 'http://localhost/' },
  { id: 'pricing', name: 'Pricing', url: 'http://localhost/pricing' },
];

describe('saved route navigation', () => {
  it('recognizes normalized equivalent URLs', () => {
    expect(getActiveRouteIndex(routes, 'http://localhost')).toBe(0);
  });

  it('steps from the current route without wrapping', () => {
    expect(getAdjacentRoute(routes, routes[0].url, 1)?.id).toBe('pricing');
    expect(getAdjacentRoute(routes, routes[0].url, -1)).toBeNull();
  });

  it('starts at the nearest edge when the current URL is unsaved', () => {
    expect(getAdjacentRoute(routes, 'http://localhost/other', 1)?.id).toBe('home');
    expect(getAdjacentRoute(routes, 'http://localhost/other', -1)?.id).toBe('pricing');
  });
});
