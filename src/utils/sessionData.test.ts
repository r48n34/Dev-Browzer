import { describe, expect, it } from 'vitest';
import { createCookieDraft, formatCookieExpiry, parseCookieDraft } from './sessionData';

describe('session data helpers', () => {
  it('converts cookie expiry dates between the editor and WebView2 seconds', () => {
    const draft = createCookieDraft({
      name: 'theme',
      value: 'dark',
      domain: 'localhost',
      path: '/',
      expires: 1_800_000_000,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    });

    expect(parseCookieDraft(draft)).toMatchObject({
      name: 'theme',
      expires: 1_800_000_000,
    });
    expect(formatCookieExpiry(null)).toBe('Session');
  });

  it('rejects invalid cookie names and paths', () => {
    expect(() => parseCookieDraft({ ...createCookieDraft(), name: 'bad=name' })).toThrow(
      'unsupported character',
    );
    expect(() =>
      parseCookieDraft({ ...createCookieDraft(), name: 'valid', path: 'nested' }),
    ).toThrow('must start with /');
  });
});
