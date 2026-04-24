/**
 * Theme preference hook.
 * Persists preference to localStorage, respects system preference as default.
 */

import { useState, useEffect } from 'react';
import { getTheme, type ThemeMode } from '../theme';
import type { Theme } from '@fluentui/react-components';

const STORAGE_KEY = 'porta-admin-theme';

/** Detect system color scheme preference */
function getSystemPreference(): ThemeMode {
  if (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  ) {
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
 * Persists preference to localStorage, respects system preference as default.
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
  };

  return { theme: getTheme(mode), mode, toggleTheme };
}
