/**
 * Notification panel component.
 * Slide-out panel showing system notifications and alerts.
 * Placeholder shell — notification data will be connected later.
 */

import {
  makeStyles,
  tokens,
  Text,
  Title3,
  Button,
  Drawer,
  DrawerHeader,
  DrawerHeaderTitle,
  DrawerBody,
} from '@fluentui/react-components';
import { DismissRegular, AlertRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    color: tokens.colorNeutralForeground3,
  },
  icon: {
    fontSize: '36px',
  },
});

/** Props for the NotificationPanel */
export interface NotificationPanelProps {
  /** Whether the panel is open */
  open: boolean;
  /** Callback to close the panel */
  onDismiss: () => void;
}

/**
 * Side drawer showing notifications and system alerts.
 * Currently shows an empty state — will be populated after API integration.
 */
export function NotificationPanel({ open, onDismiss }: NotificationPanelProps) {
  const styles = useStyles();

  return (
    <Drawer
      open={open}
      onOpenChange={(_e, data) => { if (!data.open) onDismiss(); }}
      position="end"
      size="small"
    >
      <DrawerHeader>
        <DrawerHeaderTitle
          action={
            <Button
              appearance="subtle"
              icon={<DismissRegular />}
              onClick={onDismiss}
              aria-label="Close notifications"
            />
          }
        >
          Notifications
        </DrawerHeaderTitle>
      </DrawerHeader>
      <DrawerBody>
        <div className={styles.empty}>
          <span className={styles.icon}>
            <AlertRegular />
          </span>
          <Title3>No notifications</Title3>
          <Text>You&apos;re all caught up!</Text>
        </div>
      </DrawerBody>
    </Drawer>
  );
}
