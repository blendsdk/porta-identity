/** Shared bounded layout for irreversible Admin UI confirmation dialogs. */

import {
  at,
  Button,
  col,
  fixed,
  Group,
  grow,
  row,
  Scroller,
  spacer,
  stringWidth,
  Text,
  wrapText,
} from '@jsvision/ui';

/** Inputs required to render one complete deletion target and its fixed cascade warning. */
export interface DeleteConfirmationLayoutOptions {
  /** Live dialog width, already capped to the terminal viewport. */
  readonly dialogWidth: number;
  /** Complete target and parent context retained for vertical inspection. */
  readonly details: string;
  /** Short affected-data warning kept visible above the action row. */
  readonly warning: string;
  /** Safe default action. */
  readonly keep: Button;
  /** Destructive action whose face may be clipped on a narrow terminal. */
  readonly remove: Button;
}

/** Result used by a dialog to mount the layout and explicitly restore safe initial focus. */
export interface DeleteConfirmationLayout {
  /** Complete Layout DSL tree. */
  readonly content: ReturnType<typeof col>;
  /** Scrollable target details that remain inspectable on a small terminal. */
  readonly details: Scroller;
}

/**
 * Returns a destructive button label that fits the confirmation row while retaining its action.
 *
 * The complete target remains available in the scrollable details; only the redundant button copy
 * is shortened.
 */
export function deleteActionLabel(target: string, dialogWidth: number): string {
  const full = `Delete ${target}`;
  const contentWidth = Math.max(1, dialogWidth - 6);
  const keepWidth = new Button('Keep').measure().width;
  const maximumButtonWidth = Math.max(1, contentWidth - keepWidth - 2);
  const chromeWidth = new Button('').measure().width;
  const maximumTextWidth = Math.max(1, maximumButtonWidth - chromeWidth);
  if (stringWidth(full) <= maximumTextWidth) return full;

  const prefix = 'Delete ';
  const targetWidth = Math.max(0, maximumTextWidth - stringWidth(prefix) - 1);
  let clippedTarget = '';
  for (const character of target) {
    if (stringWidth(clippedTarget + character) > targetWidth) break;
    clippedTarget += character;
  }
  return `${prefix}${clippedTarget}…`;
}

/**
 * Builds a compact confirmation layout without truncating the authoritative target text.
 *
 * The cascade warning remains visible while long target details scroll vertically. Button bounds
 * are capped to the available row, and only the redundant target copy in an oversized destructive
 * label is shortened with an ellipsis.
 */
export function deleteConfirmationLayout(
  options: DeleteConfirmationLayoutOptions,
): DeleteConfirmationLayout {
  const contentWidth = Math.max(1, options.dialogWidth - 6);
  const detailsWidth = Math.max(1, contentWidth - 1);
  const detailsHeight = Math.max(1, wrapText(options.details, detailsWidth).length);
  const detailsContent = new Group();
  detailsContent.add(at(new Text(options.details), 0, 0, detailsWidth, detailsHeight));
  const details = new Scroller({
    content: detailsContent,
    extent: { width: detailsWidth, height: detailsHeight },
    scrollbars: 'vertical',
  });
  const warningHeight = Math.max(1, wrapText(options.warning, contentWidth).length);

  return {
    content: col(
      { gap: 1, padding: { top: 1, right: 2, bottom: 1, left: 2 } },
      fixed(new Text(options.warning), warningHeight),
      grow(details),
      fixed(row({ gap: 1 }, spacer(), options.keep, options.remove), 2),
    ),
    details,
  };
}
