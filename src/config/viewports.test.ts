import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DEVICE_PROFILE,
  getPreviewDeviceProfile,
  getViewportPreset,
  matchViewportPreset,
} from './viewports';

describe('viewport presets and profiles', () => {
  it('matches built-in sets regardless of identifier order', () => {
    const essential = getViewportPreset('essential');
    expect(matchViewportPreset([...essential.viewportIds].reverse())).toBe('essential');
  });

  it('returns no preset for a mixed custom set', () => {
    expect(matchViewportPreset(['phone-portrait', 'custom'])).toBeNull();
  });

  it('merges stored device settings over safe defaults', () => {
    const profile = getPreviewDeviceProfile(
      {
        phone: {
          ...DEFAULT_DEVICE_PROFILE,
          devicePixelRatio: 3,
          touchEnabled: true,
        },
      },
      'phone',
    );
    expect(profile).toMatchObject({ devicePixelRatio: 3, touchEnabled: true });
  });
});
