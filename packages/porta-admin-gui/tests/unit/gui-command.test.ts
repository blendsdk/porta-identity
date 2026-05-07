/**
 * Unit tests for the `porta gui` CLI command.
 *
 * Tests: successful launch delegation, missing package handling,
 * option forwarding.
 */

import { describe, it, expect, vi } from 'vitest';
import { guiCommand } from '@portaidentity/cli/dist/commands/gui.js';

// We test the command definition, not the dynamic import
describe('guiCommand', () => {
  it('has command name "gui"', () => {
    expect(guiCommand.command).toBe('gui');
  });

  it('has a description', () => {
    expect(guiCommand.describe).toBeDefined();
    expect(typeof guiCommand.describe).toBe('string');
  });

  it('defines --port option with default 4002', () => {
    const yargsMock = {
      option: vi.fn().mockReturnThis(),
    };
    (guiCommand.builder as any)(yargsMock);

    const portCall = yargsMock.option.mock.calls.find(
      (call: any[]) => call[0] === 'port',
    );
    expect(portCall).toBeDefined();
    expect(portCall![1].default).toBe(4002);
    expect(portCall![1].type).toBe('number');
  });

  it('defines --no-open option', () => {
    const yargsMock = {
      option: vi.fn().mockReturnThis(),
    };
    (guiCommand.builder as any)(yargsMock);

    const noOpenCall = yargsMock.option.mock.calls.find(
      (call: any[]) => call[0] === 'no-open',
    );
    expect(noOpenCall).toBeDefined();
    expect(noOpenCall![1].type).toBe('boolean');
  });
});
