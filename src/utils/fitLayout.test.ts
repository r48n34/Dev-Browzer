import { describe, expect, it } from 'vitest';
import { MIN_BOARD_SCALE, type ViewportDefinition } from '../types';
import { fitPreviewLayouts } from './fitLayout';

const viewports: ViewportDefinition[] = [
  {
    id: 'phone',
    name: 'Phone',
    width: 390,
    height: 844,
    category: 'phone',
    builtIn: true,
  },
  {
    id: 'desktop',
    name: 'Desktop',
    width: 1920,
    height: 1080,
    category: 'desktop',
    builtIn: true,
  },
];

describe('fitPreviewLayouts', () => {
  it('chooses the largest five-percent scale that fits', () => {
    const result = fitPreviewLayouts(viewports, 900, 900);
    expect(result.fits).toBe(true);
    expect(result.scale).toBeGreaterThanOrEqual(MIN_BOARD_SCALE);
    expect(result.layouts.phone?.scale).toBe(result.scale);
    expect(result.layouts.desktop?.scale).toBe(result.scale);
  });

  it('falls back to the minimum scale when the board is too small', () => {
    const result = fitPreviewLayouts(viewports, 320, 320);
    expect(result.fits).toBe(false);
    expect(result.scale).toBe(MIN_BOARD_SCALE);
  });
});
