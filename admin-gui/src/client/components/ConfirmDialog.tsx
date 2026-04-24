/**
 * Confirm dialog component.
 * Generic confirmation dialog for destructive or important actions.
 * Uses FluentUI v9 Dialog components.
 */

import {
  Dialog,
  DialogTrigger,
  DialogSurface,
  DialogTitle,
  DialogBody,
  DialogContent,
  DialogActions,
  Button,
} from '@fluentui/react-components';
import type { ReactNode } from 'react';

/** Props for the ConfirmDialog component */
export interface ConfirmDialogProps {
  /** Whether the dialog is open */
  open: boolean;
  /** Callback when the dialog is dismissed (cancel or close) */
  onDismiss: () => void;
  /** Callback when the action is confirmed */
  onConfirm: () => void;
  /** Dialog title */
  title: string;
  /** Dialog body content */
  children: ReactNode;
  /** Confirm button label (default: "Confirm") */
  confirmLabel?: string;
  /** Cancel button label (default: "Cancel") */
  cancelLabel?: string;
  /** Whether the confirm action is destructive (red button) */
  destructive?: boolean;
  /** Whether the confirm button is disabled */
  confirmDisabled?: boolean;
  /** Whether a confirm action is in progress */
  loading?: boolean;
}

/**
 * Modal confirmation dialog.
 * Renders a title, body content, and confirm/cancel buttons.
 * For destructive actions, pair with TypeToConfirm as the body content.
 */
export function ConfirmDialog({
  open,
  onDismiss,
  onConfirm,
  title,
  children,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  confirmDisabled = false,
  loading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={(_e, data) => { if (!data.open) onDismiss(); }}>
      <DialogSurface>
        <DialogBody>
          <DialogTitle>{title}</DialogTitle>
          <DialogContent>{children}</DialogContent>
          <DialogActions>
            <DialogTrigger disableButtonEnhancement>
              <Button appearance="secondary" onClick={onDismiss}>
                {cancelLabel}
              </Button>
            </DialogTrigger>
            <Button
              appearance={destructive ? 'primary' : 'primary'}
              style={destructive ? { backgroundColor: 'var(--colorPaletteRedBackground3)' } : undefined}
              onClick={onConfirm}
              disabled={confirmDisabled || loading}
            >
              {loading ? 'Processing...' : confirmLabel}
            </Button>
          </DialogActions>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  );
}
