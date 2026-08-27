/** Focused tests for the native JSVision host boundary. */

import { createApplication } from '@jsvision/ui';
import { describe, expect, it, vi } from 'vitest';

const nativeHost = vi.hoisted(() => ({ createHost: vi.fn() }));

vi.mock('@jsvision/core', async (importOriginal) => ({
  ...(await importOriginal()),
  createHost: nativeHost.createHost,
}));

import { runAdminApplication } from '../../src/admin/application.js';

const server = new URL('https://porta.example.test');

describe('native admin host', () => {
  it('should render and restore the host after the keyboard quit command', async () => {
    const stop = vi.fn();
    const render = vi.fn();
    nativeHost.createHost.mockImplementation((options) => ({
      start: async () => {
        queueMicrotask(() =>
          options.onInput({
            type: 'key',
            key: 'x',
            ctrl: false,
            alt: true,
            shift: false,
            codepoint: 120,
          }),
        );
      },
      stop,
      render,
    }));

    await expect(
      runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        applicationFactory: createApplication,
      }),
    ).resolves.toBe(0);
    expect(render).toHaveBeenCalled();
    expect(stop).toHaveBeenCalledOnce();
  });

  it('should propagate a native host signal after aborting the application', async () => {
    nativeHost.createHost.mockImplementation((options) => ({
      start: async () => queueMicrotask(() => options.onBeforeExit(143)),
      stop: vi.fn(),
      render: vi.fn(),
    }));

    await expect(
      runAdminApplication({
        server,
        insecure: false,
        viewport: { width: 80, height: 24 },
        applicationFactory: createApplication,
      }),
    ).resolves.toBe(143);
  });
});
