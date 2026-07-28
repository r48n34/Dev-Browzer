import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import { App } from './App';
import { DevBrowzerProvider } from './state/DevBrowzerProvider';

describe('Dev Browzer workbench', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('guides first-time users into a six-preview workspace', async () => {
    const user = userEvent.setup();
    render(
      <DevBrowzerProvider>
        <App />
      </DevBrowzerProvider>,
    );

    expect(await screen.findByRole('dialog', { name: 'Add a project' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Project name'), 'Demo app');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));

    expect(await screen.findByText('Preview board')).toBeInTheDocument();
    expect(screen.getByText('6 viewports')).toBeInTheDocument();
    expect(screen.getByTestId('preview-surface-phone-portrait')).toBeInTheDocument();
    expect(screen.getByTestId('preview-surface-desktop-2k')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-surface-desktop-4k')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Disable Phone portrait' }));
    expect(screen.getByText('5 viewports')).toBeInTheDocument();
    expect(screen.queryByTestId('preview-surface-phone-portrait')).not.toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /Phone portrait/ })).not.toBeChecked();
  });

  it('normalizes address-bar navigation', async () => {
    const user = userEvent.setup();
    render(
      <DevBrowzerProvider>
        <App />
      </DevBrowzerProvider>,
    );

    await user.type(await screen.findByLabelText('Project name'), 'Demo app');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    const address = await screen.findByLabelText('Preview address');
    await user.clear(address);
    await user.type(address, 'localhost:4173/spa?test=1#section');
    await user.click(screen.getByRole('button', { name: 'Go' }));

    await waitFor(() => {
      expect(address).toHaveValue('http://localhost:4173/spa?test=1#section');
    });
  });

  it('enables 4K and creates a rotatable custom viewport', async () => {
    const user = userEvent.setup();
    render(
      <DevBrowzerProvider>
        <App />
      </DevBrowzerProvider>,
    );

    await user.type(await screen.findByLabelText('Project name'), 'Demo app');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a project' })).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('checkbox', { name: '4K / UHD 3840×2160' }));
    expect(screen.getByText('7 viewports')).toBeInTheDocument();
    expect(screen.getByTestId('preview-surface-desktop-4k')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Custom viewport' }));
    expect(await screen.findByRole('dialog', { name: 'Add custom viewport' })).toBeInTheDocument();
    await user.type(screen.getByLabelText('Name'), 'Laptop');
    await user.clear(screen.getByLabelText('Width'));
    await user.type(screen.getByLabelText('Width'), '1200');
    await user.clear(screen.getByLabelText('Height'));
    await user.type(screen.getByLabelText('Height'), '800');
    await user.click(screen.getByRole('button', { name: 'Save viewport' }));

    expect(screen.getByText('8 viewports')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Rotate Laptop' }));
    expect(screen.getAllByText('800 × 1200').length).toBeGreaterThan(0);
  });

  it('scales and repositions an individual preview card', async () => {
    const user = userEvent.setup();
    render(
      <DevBrowzerProvider>
        <App />
      </DevBrowzerProvider>,
    );

    await user.type(await screen.findByLabelText('Project name'), 'Demo app');
    await user.click(screen.getByRole('button', { name: 'Create workspace' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Add a project' })).not.toBeInTheDocument();
    });

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

    const landscapeCard = screen
      .getByTestId('preview-header-phone-landscape')
      .closest('.preview-card');
    expect(landscapeCard).not.toBeNull();
    fireEvent.pointerDown(landscapeCard!);
    expect(landscapeCard).toHaveAttribute('data-active', 'true');
    expect(card).toHaveAttribute('data-active', 'false');

    fireEvent.pointerDown(header, { pointerId: 8, clientX: 130, clientY: 100 });
    expect(card).toHaveAttribute('data-active', 'true');
    expect(landscapeCard).toHaveAttribute('data-active', 'false');
  });
});
