/**
 * Secret display component.
 * Shows a one-time secret value (e.g., generated client_secret) with:
 * - The secret text in a monospace font
 * - A copy-to-clipboard button
 * - A prominent warning that the secret will not be shown again
 * - An optional dismiss/close callback
 *
 * Used in the client creation wizard after generating a client secret
 * and in the client detail page when rotating secrets.
 */

import {
  makeStyles,
  tokens,
  Card,
  Text,
  Button,
  MessageBar,
  MessageBarBody,
  MessageBarTitle,
} from '@fluentui/react-components';
import {
  DismissRegular,
  ShieldLockRegular,
} from '@fluentui/react-icons';
import { CopyButton } from './CopyButton';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  secretCard: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  secretValue: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase300,
    wordBreak: 'break-all',
    flex: 1,
    userSelect: 'all',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
  },
  icon: {
    flexShrink: 0,
    color: tokens.colorPaletteYellowForeground1,
  },
});

/** Props for the SecretDisplay component */
export interface SecretDisplayProps {
  /** The secret value to display */
  secret: string;
  /** Label shown in the warning message (e.g., "Client Secret") */
  label?: string;
  /** Callback when the user dismisses/closes the secret display */
  onDismiss?: () => void;
}

/**
 * One-time secret display with copy button and security warning.
 * Shows a prominent warning that the secret will not be shown again,
 * encouraging the user to copy it immediately.
 */
export function SecretDisplay({
  secret,
  label = 'Secret',
  onDismiss,
}: SecretDisplayProps) {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      {/* Security warning — the secret is only available now */}
      <MessageBar intent="warning" icon={<ShieldLockRegular />}>
        <MessageBarBody>
          <MessageBarTitle>Save this {label.toLowerCase()} now</MessageBarTitle>
          This {label.toLowerCase()} will only be shown once. Copy it and store it
          securely — you will not be able to retrieve it later.
        </MessageBarBody>
      </MessageBar>

      {/* The secret value with copy support */}
      <Card className={styles.secretCard}>
        <Text className={styles.secretValue}>{secret}</Text>
        <CopyButton value={secret} />
      </Card>

      {/* Action buttons */}
      <div className={styles.actions}>
        {onDismiss && (
          <Button
            appearance="secondary"
            icon={<DismissRegular />}
            onClick={onDismiss}
          >
            I&apos;ve copied the {label.toLowerCase()}
          </Button>
        )}
      </div>
    </div>
  );
}
