import { describe, expect, it } from 'vitest';
import type { ViewportDefinition } from '../types';
import {
  PREVIEW_BOARD_GAP,
  arrangePreviewLayouts,
  getPreviewCardSize,
  sanitizePreviewLayouts,
} from './previewLayout';

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

describe('preview board layout utilities', () => {
  it('packs cards into rows using their individual scales', () => {
    const layouts = arrangePreviewLayouts(viewports, { phone: 0.5, desktop: 0.25 }, 0.25, 700);
    const phoneSize = getPreviewCardSize(viewports[0], 0.5);

    expect(layouts.phone).toEqual({ x: 0, y: 0, scale: 0.5 });
    expect(layouts.desktop).toEqual({
      x: 0,
      y: phoneSize.height + PREVIEW_BOARD_GAP,
      scale: 0.25,
    });
  });

  it('drops malformed layouts and clamps persisted values', () => {
    expect(
      sanitizePreviewLayouts({
        phone: { x: -4, y: 19.6, scale: 0.1 },
        invalid: { x: 1, y: Number.NaN, scale: 0.5 },
      }),
    ).toEqual({
      phone: { x: 0, y: 20, scale: 0.25 },
    });
  });
});
