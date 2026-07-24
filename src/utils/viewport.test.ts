import { describe, expect, it } from 'vitest';
import {
  clampBoardScale,
  createCustomViewport,
  rotateViewport,
  validateViewportSize,
} from './viewport';

describe('viewport utilities', () => {
  it('clamps the board scale to the supported WebView2 range', () => {
    expect(clampBoardScale(0.1)).toBe(0.25);
    expect(clampBoardScale(0.65)).toBe(0.65);
    expect(clampBoardScale(2)).toBe(1);
  });

  it('validates and creates custom viewports', () => {
    const viewport = createCustomViewport('Laptop', 1440, 900);
    expect(viewport).toMatchObject({
      name: 'Laptop',
      width: 1440,
      height: 900,
      category: 'custom',
      builtIn: false,
    });
  });

  it('rejects viewport dimensions outside the supported range', () => {
    expect(() => validateViewportSize(239, 800)).toThrow('240 to 7680');
    expect(() => validateViewportSize(800, 7681)).toThrow('240 to 7680');
    expect(() => validateViewportSize(800.5, 600)).toThrow('whole numbers');
  });

  it('rotates a viewport without changing its identity', () => {
    const viewport = createCustomViewport('Kiosk', 1080, 1920);
    expect(rotateViewport(viewport)).toMatchObject({
      id: viewport.id,
      width: 1920,
      height: 1080,
      name: 'Kiosk (rotated)',
    });
  });
});
