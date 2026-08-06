import { MantineProvider } from '@mantine/core';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getBrowserSessionData, setBrowserCookie } from '../native/bridge';
import { SessionDataModal } from './SessionDataModal';

vi.mock('../native/bridge', () => ({
  clearBrowserCookies: vi.fn(),
  clearBrowserLocalStorage: vi.fn(),
  deleteBrowserCookie: vi.fn(),
  deleteBrowserLocalStorage: vi.fn(),
  getBrowserSessionData: vi.fn(),
  setBrowserCookie: vi.fn(),
  setBrowserLocalStorage: vi.fn(),
}));

const sessionData = {
  origin: 'http://localhost:5173',
  cookies: [
    {
      name: 'theme',
      value: 'light',
      domain: 'localhost',
      path: '/',
      expires: null,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    },
  ],
  localStorage: [],
};

describe('SessionDataModal', () => {
  beforeEach(() => {
    vi.mocked(getBrowserSessionData).mockResolvedValue(sessionData);
    vi.mocked(setBrowserCookie).mockResolvedValue();
  });

  it('edits and saves a cookie value without crashing', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <SessionDataModal
          opened
          previewId="phone-portrait"
          previewName="Phone portrait"
          url="http://localhost:5173"
          onClose={() => undefined}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Edit cookie theme' }));
    const value = await screen.findByRole('textbox', { name: 'Value' });
    await user.clear(value);
    await user.type(value, 'dark');
    expect(value).toHaveValue('dark');

    await user.click(screen.getByRole('button', { name: 'Save cookie' }));
    expect(setBrowserCookie).toHaveBeenCalledWith(
      'phone-portrait',
      expect.objectContaining({ name: 'theme', value: 'dark' }),
    );
  });

  it('accepts punctuation in a new cookie value', async () => {
    const user = userEvent.setup();
    render(
      <MantineProvider>
        <SessionDataModal
          opened
          previewId="phone-portrait"
          previewName="Phone portrait"
          url="http://localhost:5173"
          onClose={() => undefined}
        />
      </MantineProvider>,
    );

    await user.click(await screen.findByRole('button', { name: 'Add' }));
    await user.type(await screen.findByRole('textbox', { name: 'Name' }), 'session');
    await user.type(screen.getByRole('textbox', { name: 'Value' }), 'token=a=b;c');
    await user.click(screen.getByRole('button', { name: 'Save cookie' }));

    expect(setBrowserCookie).toHaveBeenCalledWith(
      'phone-portrait',
      expect.objectContaining({ name: 'session', value: 'token=a=b;c' }),
    );
  });
});
