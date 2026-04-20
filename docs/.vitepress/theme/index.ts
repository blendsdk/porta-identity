/**
 * Custom VitePress theme entry point.
 *
 * Extends the default VitePress theme. Custom Vue components,
 * CSS overrides, and layout wrappers can be added here later.
 *
 * @see https://vitepress.dev/guide/custom-theme
 */
import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'

export default {
  extends: DefaultTheme,
  // Custom enhancements can be added here later:
  // - Custom Vue components
  // - Custom CSS overrides (import './custom.css')
  // - Layout wrappers
} satisfies Theme
