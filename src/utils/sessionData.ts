import type { BrowserCookie, BrowserCookieSameSite } from '../types';

export interface BrowserCookieDraft {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: string;
  httpOnly: boolean;
  secure: boolean;
  sameSite: BrowserCookieSameSite | null;
}

export function createCookieDraft(cookie?: BrowserCookie): BrowserCookieDraft {
  return {
    name: cookie?.name ?? '',
    value: cookie?.value ?? '',
    domain: cookie?.domain ?? '',
    path: cookie?.path || '/',
    expires: cookie?.expires == null ? '' : formatDatetimeLocal(cookie.expires),
    httpOnly: cookie?.httpOnly ?? false,
    secure: cookie?.secure ?? false,
    sameSite: cookie?.sameSite ?? null,
  };
}

function formatDatetimeLocal(seconds: number): string {
  const date = new Date(seconds * 1_000);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export function parseCookieDraft(draft: BrowserCookieDraft): BrowserCookie {
  const name = draft.name.trim();
  if (!name) {
    throw new Error('Cookie name is required.');
  }
  if (
    [...name].some((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint <= 31 || codePoint === 127 || character === ';' || character === '=';
    })
  ) {
    throw new Error('Cookie name contains an unsupported character.');
  }
  const path = draft.path.trim() || '/';
  if (!path.startsWith('/')) {
    throw new Error('Cookie path must start with /.');
  }
  const expires = draft.expires ? Date.parse(draft.expires) / 1_000 : null;
  if (expires !== null && !Number.isFinite(expires)) {
    throw new Error('Enter a valid expiry date.');
  }
  return {
    name,
    value: draft.value,
    domain: draft.domain.trim(),
    path,
    expires,
    httpOnly: draft.httpOnly,
    secure: draft.secure,
    sameSite: draft.sameSite,
  };
}

export function formatCookieExpiry(expires: number | null): string {
  return expires == null ? 'Session' : new Date(expires * 1_000).toLocaleString();
}
