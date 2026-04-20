// Custom VitePress theme — extends default with a beta announcement banner
// displayed at the top of every page via the 'layout-top' slot.
import { h } from 'vue';
import DefaultTheme from 'vitepress/theme';
import BetaBanner from './BetaBanner.vue';
import type { Theme } from 'vitepress';

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'layout-top': () => h(BetaBanner),
    });
  },
} satisfies Theme;
