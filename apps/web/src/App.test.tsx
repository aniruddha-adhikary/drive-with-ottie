import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { App } from './App';

afterEach(() => {
  window.location.hash = '';
});

describe('web shell', () => {
  it('identifies itself as an incomplete development prototype', () => {
    render(<App />);
    expect(screen.getByTestId('development-banner')).toHaveTextContent(/incomplete development prototype/i);
    expect(screen.getByTestId('development-banner')).toHaveTextContent(/release_ready=false/);
  });

  it('opens the lesson by default and links the fixture inspector as a secondary route', async () => {
    render(<App />);
    const nav = screen.getByRole('navigation', { name: 'Development routes' });
    expect(within(nav).getByRole('link', { name: 'Lesson' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Fixture inspector' })).toHaveAttribute('href', '#/inspector');
    expect(await screen.findByText(/preparing the road scene|loading lesson/i, undefined, { timeout: 15_000 })).toBeInTheDocument();
  });
});

describe('fixture inspector route (F0 smoke)', () => {
  it('switches fixtures and camera presets without a WebGL context', async () => {
    window.location.hash = '#/inspector';
    const user = userEvent.setup();
    render(<App />);
    expect(await screen.findByTestId('world-summary')).toHaveTextContent('development_fixture');
    expect(screen.getByTestId('scene-label')).toHaveTextContent(/WebGL unavailable/);

    const fixtures = screen.getByRole('group', { name: 'Development fixture' });
    await user.click(within(fixtures).getByRole('button', { name: /stop/i }));
    expect(screen.getByTestId('world-summary')).toHaveTextContent(/stop/i);

    const cameras = screen.getByRole('group', { name: 'Camera view' });
    await user.click(within(cameras).getByRole('button', { name: 'approach ego' }));
    expect(within(cameras).getByRole('button', { name: 'approach ego' })).toHaveAttribute('aria-pressed', 'true');
  });

  it('lists every downstream module with its owner', async () => {
    window.location.hash = '#/inspector';
    render(<App />);
    const status = await screen.findByTestId('module-status');
    for (const name of ['asset-registry', 'scenario-core', 'scenario-validation', 'renderer-geometry', 'renderer-cameras', 'renderer-evidence', 'learning-state', 'review-export']) {
      expect(status).toHaveTextContent(`@ottie/${name}`);
    }
  });
});
