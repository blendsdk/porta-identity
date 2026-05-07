/**
 * Theme preference hook.
 *
 * Manages light/dark mode for the admin GUI. Reads the initial preference
 * from `localStorage` (key: `porta-admin-theme`), falling back to the
 * browser's `prefers-color-scheme` media query if no saved preference exists.
 *
 * Returns the resolved FluentUI `Theme` object, the current `mode` string,
 * and a `toggleTheme()` function. Toggling persists the new preference and
 * reloads the page to ensure all Griffel styles re-evaluate.
 *
 * ## Why page reload on toggle?
 *
 * Griffel (FluentUI's CSS-in-JS engine) computes styles at render time
 * using theme tokens. A full reload ensures every component picks up the
 * new theme consistently. This is a deliberate trade-off for simplicity
 * over a more complex runtime theme-swap mechanism.
 *
 * @example
 * ```tsx
 * import { useThemePreference } from '../hooks/useTheme';
 *
 * function ThemeToggle() {
 *   const { mode, toggleTheme } = useThemePreference();
 *   return (
 *     <Button onClick={toggleTheme}>
 *       {mode === 'dark' ? '☀️ Light Mode' : '🌙 Dark Mode'}
 *     </Button>
 *   );
 * }
 *
 * // In the app root — pass theme to FluentProvider
 * function App() {
 *   const { theme } = useThemePreference();
 *   return <FluentProvider theme={theme}>...</FluentProvider>;
 * }
 * ```
 *
 * @see {@link getTheme} — resolves a `ThemeMode` to a FluentUI `Theme` object
 * @module useTheme
 */

import type { Theme } from '@fluentui/react-components';
import { useEffect, useState } from 'react';
import { getTheme, type ThemeMode } from '../theme';

const STORAGE_KEY = 'porta-admin-theme';

/** Detect system color scheme preference */
function getSystemPreference(): ThemeMode {
  if (typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark';
  }
  return 'light';
}

/** Load saved theme or use system preference */
function loadTheme(): ThemeMode {
  if (typeof window !== 'undefined') {
    const saved = localStorage.getItem(STORAGE_KEY) as ThemeMode | null;
    if (saved === 'light' || saved === 'dark') return saved;
  }
  return getSystemPreference();
}

/**
 * Hook for theme preference management.
 *
 * @returns `theme` (FluentUI Theme object), `mode` (`"light"` | `"dark"`),
 *          and `toggleTheme` (switches mode, persists, and reloads page)
 */
export function useThemePreference(): {
  theme: Theme;
  mode: ThemeMode;
  toggleTheme: () => void;
} {
  const [mode, setMode] = useState<ThemeMode>(loadTheme);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
  }, [mode]);

  const toggleTheme = () => {
    setMode((prev) => (prev === 'light' ? 'dark' : 'light'));
    window.location.reload(); // Reload to apply theme change globally
  };

  return { theme: getTheme(mode), mode, toggleTheme };
}
