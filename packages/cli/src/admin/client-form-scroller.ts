/** Focus-aware scrolling shared by OIDC client forms. */

import { grow, Group, Scroller } from '@jsvision/ui';
import type { Size2D, View } from '@jsvision/ui';

/** Returns leaf views, including controls that may become focusable after mounting. */
function leafDescendants(root: View): View[] {
  const result: View[] = [];
  const visit = (view: View): void => {
    if (view instanceof Group) {
      for (const child of view.children) visit(child);
    } else {
      result.push(view);
    }
  };
  visit(root);
  return result;
}

/**
 * Vertical scroller that reveals the focused control in a complete OIDC client form.
 *
 * The content retains its comfortable logical height while the viewport may shrink to a compact
 * terminal. Keeping focus and scrolling coupled prevents keyboard navigation from moving into a
 * clipped control.
 */
export class ClientFormScroller extends Scroller {
  /** Creates a scrolling viewport over one complete client form. */
  public constructor(content: Group, extent: () => Size2D) {
    // A growing initial layout prevents nested DSL rows from first solving at their small intrinsic
    // frame width before Scroller applies the complete content extent.
    super({ content: grow(content), extent, scrollbars: 'vertical' });
    this.onMount(() => {
      // Some controls, such as explicit login methods, become focusable only after another field
      // changes. Observe every leaf so those later transitions retain focus-driven scrolling.
      const targets = leafDescendants(content);
      this.bind(
        () => {
          let focused: View | null = null;
          for (const target of targets) {
            target.focusSignal()();
            if (target.state.focused) focused = target;
          }
          return focused;
        },
        (focused) => this.revealFocused(focused),
      );
    });
  }

  /** Adjusts only the vertical offset needed to reveal one focused descendant. */
  protected revealFocused(target: View | null): void {
    if (!target || this.vpH <= 0) return;
    let top = 0;
    let current: View | null = target;
    while (current && current !== this.content) {
      top += current.bounds.y;
      current = current.parent;
    }
    if (!current) return;
    // Leave guidance below the focused control visible when the logical form has room for it.
    const bottom = top + Math.max(1, target.bounds.height) + 3;
    const offset = this.dy.peek();
    if (top < offset) this.dy.set(top);
    else if (bottom > offset + this.vpH) this.dy.set(Math.min(this.maxY, bottom - this.vpH));
  }
}
