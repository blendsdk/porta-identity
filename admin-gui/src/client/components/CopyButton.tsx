/**
 * Copy button component.
 *
 * One-click copy-to-clipboard button with visual feedback. Shows a copy icon
 * normally, and briefly switches to a checkmark icon after a successful copy.
 * Wraps the {@link useCopyToClipboard} hook with a FluentUI Button + Tooltip.
 *
 * **When to use:** Next to any value the user might need to copy — IDs, secrets,
 * URLs, slugs, tokens, etc.
 *
 * **Provider requirement:** Must be rendered inside a `FluentProvider`.
 *
 * @example
 * ```tsx
 * import { CopyButton } from '../components/CopyButton';
 *
 * function ClientIdField({ clientId }: { clientId: string }) {
 *   return (
 *     <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
 *       <code>{clientId}</code>
 *       <CopyButton value={clientId} tooltip="Copy client ID" />
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link useCopyToClipboard} — the underlying hook that manages clipboard state
 * @module CopyButton
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
