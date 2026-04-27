/**
 * FluentUI v9 theme configuration.
 * Supports light and dark modes with system preference detection.
 */

import {
  webLightTheme,
  webDarkTheme,
  type Theme,
} from '@fluentui/react-components';

/** Available themes */
export const themes = {
  light: webLightTheme,
  dark: webDarkTheme,
} as const;

export type ThemeMode = keyof typeof themes;

/** Get the FluentUI theme object for a given mode */
export function getTheme(mode: ThemeMode): Theme {
  return themes[mode];
}
