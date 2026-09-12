/** Selectable single-line values that must never be edited by the Admin UI. */

import { Input, signal } from '@jsvision/ui';
import type { DispatchEvent } from '@jsvision/ui';

/**
 * Presents an immutable value with the selection and clipboard behavior of a normal input.
 *
 * Navigation and copying remain available. Any typing, deletion, cut, or paste gesture is allowed
 * to complete normally and then the original value is restored immediately.
 */
export class SelectableReadOnlyInput extends Input {
  /** Exact immutable value restored after every input event. */
  protected readonly originalValue: string;

  /** Creates a selectable field containing one immutable value. */
  constructor(value: string) {
    super({ value: signal(value), maxLength: value.length });
    this.originalValue = value;
  }

  /** Allows selection and copying while discarding every mutation. */
  override onEvent(event: DispatchEvent): void {
    super.onEvent(event);
    if (this.value.peek() !== this.originalValue) this.value.set(this.originalValue);
  }
}
