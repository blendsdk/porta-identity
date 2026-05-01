/**
 * @vitest-environment jsdom
 */

/**
 * Placeholder app render tests.
 * Validates that the placeholder SPA renders correctly
 * with the "Under Development" message and auth controls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { App } from '../../src/client/App';

// Mock window.matchMedia (not implemented in jsdom)
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

// Mock fetch for /auth/me — returns unauthenticated session
beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          authenticated: false,
          user: null,
          environment: { environment: 'test', version: '1.0.0' },
        }),
    }),
  );
});

describe('Placeholder App', () => {
  it('renders the Porta Admin title', async () => {
    render(<App />);
    expect(await screen.findByText('Porta Admin')).toBeInTheDocument();
  });

  it('shows Under Development badge', async () => {
    render(<App />);
    expect(await screen.findByText('Under Development')).toBeInTheDocument();
  });

  it('shows CLI usage guidance', async () => {
    render(<App />);
    expect(await screen.findByText('Porta CLI')).toBeInTheDocument();
  });

  it('shows Sign In button when not authenticated', async () => {
    render(<App />);
    expect(await screen.findByText('Sign In')).toBeInTheDocument();
  });

  it('shows Sign Out button when authenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            authenticated: true,
            user: {
              id: 'test-id',
              email: 'admin@porta.local',
              name: 'Test Admin',
              roles: ['porta-admin'],
              orgId: 'org-1',
            },
            environment: { environment: 'test', version: '1.0.0' },
            csrfToken: 'test-csrf-token',
          }),
      }),
    );

    render(<App />);
    expect(await screen.findByText('Sign Out')).toBeInTheDocument();
    expect(screen.getByText('Test Admin')).toBeInTheDocument();
    expect(screen.getByText('admin@porta.local')).toBeInTheDocument();
    expect(screen.getByText('porta-admin')).toBeInTheDocument();
  });

  it('shows theme toggle button', async () => {
    render(<App />);
    expect(await screen.findByText('Dark Mode')).toBeInTheDocument();
  });
});
