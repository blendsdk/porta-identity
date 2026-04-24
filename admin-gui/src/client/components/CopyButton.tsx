/**
 * Copy button component.
 * One-click copy-to-clipboard with visual feedback (icon changes to checkmark).
 */

import { Button, Tooltip } from '@fluentui/react-components';
import type { ButtonProps } from '@fluentui/react-components';
import { CopyRegular, CheckmarkRegular } from '@fluentui/react-icons';

import { useCopyToClipboard } from '../hooks/useCopyToClipboard';

/** Props for the CopyButton component */
export interface CopyButtonProps {
  /** The text to copy when clicked */
  value: string;
  /** Tooltip text (default: "Copy to clipboard") */
  tooltip?: string;
  /** Button size (default: "small") */
  size?: ButtonProps['size'];
  /** Button appearance (default: "subtle") */
  appearance?: ButtonProps['appearance'];
}

/**
 * Button that copies a value to the clipboard with visual feedback.
 * Shows a copy icon normally, switches to a checkmark for 2 seconds after copy.
 */
export function CopyButton({
  value,
  tooltip = 'Copy to clipboard',
  size = 'small',
  appearance = 'subtle',
}: CopyButtonProps) {
  const { copy, copied } = useCopyToClipboard();

  return (
    <Tooltip
      content={copied ? 'Copied!' : tooltip}
      relationship="label"
    >
      <Button
        appearance={appearance}
        size={size}
        icon={copied ? <CheckmarkRegular /> : <CopyRegular />}
        onClick={() => copy(value)}
        aria-label={copied ? 'Copied' : tooltip}
      />
    </Tooltip>
  );
}
