/**
 * Confirm dialog component.
 *
 * Generic modal confirmation dialog for destructive or important actions.
 * Renders a title, body content, and confirm/cancel action buttons using
 * FluentUI v9 Dialog primitives.
 *
 * **When to use:** Any user action that is irreversible or has significant
 * consequences (delete, revoke, archive, suspend). For destructive actions,
 * set `destructive={true}` to render a red confirm button.
 *
 * **Provider requirement:** Must be rendered inside a `FluentProvider`.
 *
 * @example
 * ```tsx
 * import { ConfirmDialog } from '../components/ConfirmDialog';
 *
 * function DeleteOrgButton({ orgName }: { orgName: string }) {
 *   const [open, setOpen] = useState(false);
 *   const [loading, setLoading] = useState(false);
 *
 *   const handleConfirm = async () => {
 *     setLoading(true);
 *     await api.del(`/organizations/${orgName}`);
 *     setOpen(false);
 *   };
 *
 *   return (
 *     <>
 *       <Button onClick={() => setOpen(true)}>Delete</Button>
 *       <ConfirmDialog
 *         open={open}
 *         onDismiss={() => setOpen(false)}
 *         onConfirm={handleConfirm}
 *         title="Delete Organization"
 *         confirmLabel="Delete"
 *         destructive
 *         loading={loading}
 *       >
 *         Are you sure you want to delete <strong>{orgName}</strong>?
 *         This action cannot be undone.
 *       </ConfirmDialog>
 *     </>
 *   );
 * }
 * ```
 *
 * @module ConfirmDialog
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
 * Modal confirmation dialog with confirm/cancel buttons.
 *
 * When `destructive` is `true`, the confirm button renders with a red
 * background. When `loading` is `true`, the confirm button shows
 * "Processing..." and is disabled to prevent double-submission.
 *
 * For dangerous operations (e.g. org delete), pair this with a
 * `TypeToConfirm` component as the `children` to require the user
 * to type a confirmation phrase before the confirm button enables.
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
