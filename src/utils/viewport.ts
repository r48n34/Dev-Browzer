import {
  MAX_BOARD_SCALE,
  MAX_VIEWPORT_SIZE,
  MIN_BOARD_SCALE,
  MIN_VIEWPORT_SIZE,
  type ViewportDefinition,
} from '../types';

export function clampBoardScale(value: number): number {
  return Math.min(MAX_BOARD_SCALE, Math.max(MIN_BOARD_SCALE, value));
}

export function validateViewportSize(width: number, height: number): void {
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < MIN_VIEWPORT_SIZE ||
    height < MIN_VIEWPORT_SIZE ||
    width > MAX_VIEWPORT_SIZE ||
    height > MAX_VIEWPORT_SIZE
  ) {
    throw new Error(
      `Viewport dimensions must be whole numbers from ${MIN_VIEWPORT_SIZE} to ${MAX_VIEWPORT_SIZE}.`,
    );
  }
}

export function rotateViewport(viewport: ViewportDefinition): ViewportDefinition {
  return {
    ...viewport,
    width: viewport.height,
    height: viewport.width,
    name: viewport.name.endsWith(' (rotated)')
      ? viewport.name.replace(' (rotated)', '')
      : `${viewport.name} (rotated)`,
  };
}

export function createCustomViewport(
  name: string,
  width: number,
  height: number,
): ViewportDefinition {
  validateViewportSize(width, height);
  const trimmedName = name.trim();
  if (!trimmedName) {
    throw new Error('Give the custom viewport a name.');
  }

  return {
    id: `custom-${crypto.randomUUID()}`,
    name: trimmedName,
    width,
    height,
    category: 'custom',
    builtIn: false,
  };
}
