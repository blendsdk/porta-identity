/**
 * FluentUI v9 theme configuration.
 *
 * Defines the available theme modes (light / dark) and provides a
 * `getTheme()` resolver that maps a mode string to the corresponding
 * FluentUI `Theme` object. Currently uses FluentUI's built-in
 * `webLightTheme` and `webDarkTheme` without customization.
 *
 * To add custom brand colors or token overrides, use FluentUI's
 * `createLightTheme()` / `createDarkTheme()` with a `BrandVariants`
 * object and replace the theme values here.
 *
 * @example
 * ```ts
 * import { getTheme, type ThemeMode } from './theme';
 *
 * const mode: ThemeMode = 'dark';
 * const theme = getTheme(mode);
 * // → returns webDarkTheme (FluentUI Theme object)
 *
 * <FluentProvider theme={theme}>...</FluentProvider>
 * ```
 *
 * @see {@link useThemePreference} — the hook that manages theme persistence and toggling
 * @module theme
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

/**
 * Resolve a theme mode to a FluentUI Theme object.
 *
 * @param mode - `"light"` or `"dark"`
 * @returns The corresponding FluentUI theme (webLightTheme or webDarkTheme)
 */
export function getTheme(mode: ThemeMode): Theme {
  return themes[mode];
}
