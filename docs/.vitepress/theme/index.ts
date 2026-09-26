// Custom VitePress theme — extends the default theme with a release-version
// banner displayed at the top of every page via the 'layout-top' slot.
import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import VersionBanner from './VersionBanner.vue';
import type { Theme } from 'vitepress';

declare module 'vitepress' {
  interface ThemeConfig {
    /** Coordinated release version read from the root package manifest. */
    portaVersion: string;
  }
}

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(VersionBanner),
    });
  },
} satisfies Theme;
