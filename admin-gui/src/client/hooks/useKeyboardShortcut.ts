/**
 * Keyboard shortcut hook.
 * Registers a global keyboard shortcut that triggers a callback.
 * Automatically cleans up the event listener on unmount.
 */

import { useEffect, useCallback } from 'react';

/** Options for the keyboard shortcut hook */
export interface KeyboardShortcutOptions {
  /** Whether the shortcut is currently enabled (default: true) */
  enabled?: boolean;
}

/**
 * Register a global keyboard shortcut.
 * Supports modifier keys via the shortcut string format: "mod+k", "shift+/".
 * "mod" maps to Cmd on macOS and Ctrl on other platforms.
 *
 * @param shortcut - Key combo string (e.g., "mod+k", "escape", "shift+?")
 * @param handler - Callback invoked when the shortcut is triggered
 * @param options - Optional configuration
 *
 * @example
 * ```tsx
 * useKeyboardShortcut('mod+k', () => setSearchOpen(true));
 * useKeyboardShortcut('escape', () => setSearchOpen(false), { enabled: isOpen });
 * ```
 */
export function useKeyboardShortcut(
  shortcut: string,
  handler: () => void,
  options: KeyboardShortcutOptions = {},
): void {
  const { enabled = true } = options;

  const handleKeyDown = useCallback(
    (event: KeyboardEvent) => {
      if (!enabled) return;

      // Don't trigger shortcuts when typing in form fields
      const target = event.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        // Allow Escape to work even in inputs
        if (shortcut.toLowerCase() !== 'escape') {
          return;
        }
      }

      const parts = shortcut.toLowerCase().split('+');
      const key = parts[parts.length - 1];
      const needsMod = parts.includes('mod');
      const needsShift = parts.includes('shift');
      const needsAlt = parts.includes('alt');

      // "mod" maps to Cmd on macOS, Ctrl on other platforms
      const isMac = navigator.platform.toLowerCase().includes('mac');
      const modPressed = isMac ? event.metaKey : event.ctrlKey;

      if (needsMod && !modPressed) return;
      if (needsShift && !event.shiftKey) return;
      if (needsAlt && !event.altKey) return;

      // Match the key
      if (event.key.toLowerCase() === key) {
        event.preventDefault();
        handler();
      }
    },
    [shortcut, handler, enabled],
  );

  useEffect(() => {
    if (!enabled) return;

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleKeyDown, enabled]);
}
