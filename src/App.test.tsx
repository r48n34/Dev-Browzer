import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { DevBrowzerProvider } from './state/DevBrowzerProvider';

function renderApp() {
  return render(
    <DevBrowzerProvider>
      <App />
    </DevBrowzerProvider>,
  );
}

async function createWorkspace(name = 'Demo app') {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText('Project name'), name);
  await user.click(screen.getByRole('button', { name: 'Create workspace' }));
  await screen.findByText('Preview board');
  return user;
}

describe('Dev Browzer workbench', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('guides first-time users into an essential three-preview workspace', async () => {
    renderApp();

    expect(await screen.findByRole('dialog', { name: 'Add a project' })).toBeInTheDocument();
    const user = await createWorkspace();

    expect(screen.getByText('3 viewports')).toBeInTheDocument();
    expect(screen.getByTestId('preview-surface-phone-portrait')).toBeInTheDocument();
    expect(screen.getByTestId('preview-surface-ipad-portrait')).toBeInTheDocument();
    expect(screen.getByTestId('preview-surface-desktop-hd')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-surface-desktop-2k')).not.toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: /Phone portrait/ }));
    expect(screen.getByText('2 viewports')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-surface-phone-portrait')).not.toBeInTheDocument();
  });

  it('normalizes address-bar navigation', async () => {
    renderApp();
    const user = await createWorkspace();
    const address = screen.getByRole('textbox', { name: 'Preview address' });
    await user.clear(address);
    await user.type(address, 'localhost:4173/spa?test=1#section');
    await user.click(screen.getByRole('button', { name: 'Go' }));

    await waitFor(() => {
      expect(address).toHaveValue('http://localhost:4173/spa?test=1#section');
    });
  });

  it('enables 4K and creates a rotatable custom viewport', async () => {
    renderApp();
    const user = await createWorkspace();

    await user.click(screen.getByRole('checkbox', { name: '4K / UHD 3840×2160' }));
    expect(screen.getByText('4 viewports')).toBeInTheDocument();
    expect(screen.getByTestId('preview-surface-desktop-4k')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Custom viewport' }));
    expect(await screen.findByRole('dialog', { name: 'Add custom viewport' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Laptop');
    await user.clear(screen.getByLabelText('Width'));
    await user.type(screen.getByLabelText('Width'), '1200');
    await user.clear(screen.getByLabelText('Height'));
    await user.type(screen.getByLabelText('Height'), '800');
    await user.click(screen.getByRole('button', { name: 'Save viewport' }));

    expect(screen.getByText('5 viewports')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rotate Laptop' }));
    expect(screen.getAllByText('800 × 1200').length).toBeGreaterThan(0);
  });

  it('scales and repositions an individual preview card', async () => {
    renderApp();
    const user = await createWorkspace();

    const surface = screen.getByTestId('preview-surface-phone-portrait');
    expect(surface).toHaveStyle({ width: '98px', height: '211px' });
    const scale = screen.getByRole('slider', { name: 'Phone portrait scale' });
    act(() => scale.focus());
    await user.keyboard('{ArrowRight}');
    await waitFor(() => {
      expect(surface).toHaveStyle({ width: '117px', height: '253px' });
    });

    const header = screen.getByTestId('preview-header-phone-portrait');
    const card = header.closest('.preview-card');
    expect(card).not.toBeNull();
    expect(card).toHaveStyle({ left: '0px', top: '0px' });

    fireEvent.pointerDown(header, { pointerId: 7, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(window, { pointerId: 7, clientX: 130, clientY: 100 });
    fireEvent.pointerUp(window, { pointerId: 7, clientX: 130, clientY: 100 });

    await waitFor(() => {
      expect(card).toHaveStyle({ left: '120px', top: '90px' });
    });

    const tabletCard = screen.getByTestId('preview-header-ipad-portrait').closest('.preview-card');
    expect(tabletCard).not.toBeNull();
    fireEvent.pointerDown(tabletCard!);
    expect(tabletCard).toHaveAttribute('data-active', 'true');
    expect(card).toHaveAttribute('data-active', 'false');

    fireEvent.pointerDown(header, { pointerId: 8, clientX: 130, clientY: 100 });
    expect(card).toHaveAttribute('data-active', 'true');
    expect(tabletCard).toHaveAttribute('data-active', 'false');
  });

  it('applies viewport sets and restores a saved workspace preset', async () => {
    renderApp();
    const user = await createWorkspace();

    await user.click(screen.getByRole('button', { name: 'Mobile' }));
    expect(screen.getByText('4 viewports')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save current workspace' }));
    await user.type(await screen.findByLabelText('Preset name'), 'Mobile review');
    await user.click(screen.getByRole('button', { name: 'Save preset' }));

    await user.click(screen.getByRole('button', { name: 'Essential' }));
    expect(screen.getByText('3 viewports')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Mobile review' }));
    expect(screen.getByText('4 viewports')).toBeInTheDocument();
  });

  it('saves review routes and opens the command palette with shortcuts', async () => {
    renderApp();
    const user = await createWorkspace();

    await user.click(screen.getByRole('tab', { name: 'Routes' }));
    await user.click(screen.getByRole('button', { name: 'Save current route' }));
    await user.type(await screen.findByLabelText('Route name'), 'Home');
    await user.click(screen.getByRole('button', { name: 'Save route' }));
    expect(screen.getByRole('group', { name: 'Home' })).toBeInTheDocument();

    await user.keyboard('{Control>}k{/Control}');
    expect(await screen.findByLabelText('Search commands')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Search commands'), 'fit all');
    await user.click(screen.getByRole('button', { name: /Fit all previews/ }));

    const address = screen.getByRole('textbox', { name: 'Preview address' });
    await user.keyboard('{Control>}l{/Control}');
    expect(address).toHaveFocus();
  });

  it('opens a per-viewport device profile', async () => {
    renderApp();
    const user = await createWorkspace();

    await user.click(
      screen.getByRole('button', {
        name: 'Configure Phone portrait device profile',
      }),
    );

    expect(await screen.findByRole('dialog', { name: /Device profile/ })).toBeInTheDocument();
    expect(screen.getByLabelText('Device pixel ratio')).toHaveValue('1');
    await user.click(screen.getByRole('button', { name: 'Apply profile' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: /Device profile/ })).not.toBeInTheDocument();
    });
  });

  it('opens the cookie and local storage manager for the current preview', async () => {
    renderApp();
    const user = await createWorkspace();

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a project' })).not.toBeInTheDocument();
    });

    await user.keyboard('{Control>}k{/Control}');
    await user.type(await screen.findByLabelText('Search commands'), 'cookies');
    await user.click(screen.getByRole('button', { name: /Manage cookies and local storage/ }));

    expect(
      await screen.findByRole('dialog', { name: 'Cookies & local storage' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Cookie and local storage management is available in the Windows Tauri app.',
      ),
    ).toBeInTheDocument();
  });
});
