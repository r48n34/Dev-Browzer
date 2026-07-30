import { MIN_BOARD_SCALE, type PreviewBoardLayout, type ViewportDefinition } from '../types';
import { arrangePreviewLayouts, getPreviewCardSize } from './previewLayout';

export interface FittedPreviewLayouts {
  scale: number;
  layouts: Record<string, PreviewBoardLayout>;
  fits: boolean;
}

function getLayoutBounds(
  viewports: ViewportDefinition[],
  layouts: Record<string, PreviewBoardLayout>,
): { width: number; height: number } {
  return viewports.reduce(
    (bounds, viewport) => {
      const layout = layouts[viewport.id];
      if (!layout) {
        return bounds;
      }
      const size = getPreviewCardSize(viewport, layout.scale);
      return {
        width: Math.max(bounds.width, layout.x + size.width),
        height: Math.max(bounds.height, layout.y + size.height),
      };
    },
    { width: 0, height: 0 },
  );
}

export function fitPreviewLayouts(
  viewports: ViewportDefinition[],
  availableWidth: number,
  availableHeight: number,
): FittedPreviewLayouts {
  const safeWidth = Math.max(320, Math.floor(availableWidth));
  const safeHeight = Math.max(320, Math.floor(availableHeight));

  for (let percentage = 100; percentage >= MIN_BOARD_SCALE * 100; percentage -= 5) {
    const scale = percentage / 100;
    const scales = Object.fromEntries(viewports.map((viewport) => [viewport.id, scale]));
    const layouts = arrangePreviewLayouts(viewports, scales, scale, safeWidth);
    const bounds = getLayoutBounds(viewports, layouts);
    if (bounds.width <= safeWidth && bounds.height <= safeHeight) {
      return { scale, layouts, fits: true };
    }
  }

  const scale = MIN_BOARD_SCALE;
  const scales = Object.fromEntries(viewports.map((viewport) => [viewport.id, scale]));
  return {
    scale,
    layouts: arrangePreviewLayouts(viewports, scales, scale, safeWidth),
    fits: false,
  };
}
