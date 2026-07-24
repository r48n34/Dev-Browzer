import {
  MAX_BOARD_SCALE,
  MIN_BOARD_SCALE,
  type PreviewBoardLayout,
  type ViewportDefinition,
} from '../types';
import { clampBoardScale } from './viewport';

export const PREVIEW_BOARD_GAP = 24;
export const PREVIEW_BOARD_AUTO_WIDTH = 1600;
export const PREVIEW_CARD_MIN_WIDTH = 310;
export const PREVIEW_CARD_CHROME_HEIGHT = 122;

export interface PreviewCardSize {
  width: number;
  height: number;
}

export function getPreviewCardSize(viewport: ViewportDefinition, scale: number): PreviewCardSize {
  const safeScale = clampBoardScale(scale);
  return {
    width: Math.max(Math.round(viewport.width * safeScale) + 24, PREVIEW_CARD_MIN_WIDTH),
    height: Math.round(viewport.height * safeScale) + PREVIEW_CARD_CHROME_HEIGHT,
  };
}

export function arrangePreviewLayouts(
  viewports: ViewportDefinition[],
  scales: Record<string, number>,
  fallbackScale: number,
  maxRowWidth = PREVIEW_BOARD_AUTO_WIDTH,
): Record<string, PreviewBoardLayout> {
  const layouts: Record<string, PreviewBoardLayout> = {};
  let x = 0;
  let y = 0;
  let rowHeight = 0;

  for (const viewport of viewports) {
    const scale = clampBoardScale(scales[viewport.id] ?? fallbackScale);
    const size = getPreviewCardSize(viewport, scale);
    if (x > 0 && x + size.width > maxRowWidth) {
      x = 0;
      y += rowHeight + PREVIEW_BOARD_GAP;
      rowHeight = 0;
    }

    layouts[viewport.id] = { x, y, scale };
    x += size.width + PREVIEW_BOARD_GAP;
    rowHeight = Math.max(rowHeight, size.height);
  }

  return layouts;
}

export function sanitizePreviewLayouts(input: unknown): Record<string, PreviewBoardLayout> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(input).flatMap(([id, value]) => {
      if (!id || !value || typeof value !== 'object') {
        return [];
      }
      const layout = value as Partial<PreviewBoardLayout>;
      if (
        typeof layout.x !== 'number' ||
        !Number.isFinite(layout.x) ||
        typeof layout.y !== 'number' ||
        !Number.isFinite(layout.y) ||
        typeof layout.scale !== 'number' ||
        !Number.isFinite(layout.scale)
      ) {
        return [];
      }

      return [
        [
          id,
          {
            x: Math.max(0, Math.round(layout.x)),
            y: Math.max(0, Math.round(layout.y)),
            scale: Math.min(
              MAX_BOARD_SCALE,
              Math.max(MIN_BOARD_SCALE, clampBoardScale(layout.scale)),
            ),
          },
        ],
      ];
    }),
  );
}
