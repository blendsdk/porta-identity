/**
 * Toast notification hook.
 *
 * Provides a simplified API to dispatch toast notifications using FluentUI v9's
 * Toaster system. Returns a `toasterId` (which must be passed to
 * {@link ToastProvider}) and convenience methods for each intent level.
 *
 * ## Default timeouts
 *
 * | Method      | Intent    | Auto-dismiss |
 * |-------------|-----------|-------------|
 * | `success()` | success   | 3 000 ms    |
 * | `info()`    | info      | 3 000 ms    |
 * | `warning()` | warning   | 4 000 ms    |
 * | `error()`   | error     | 5 000 ms    |
 * | `notify()`  | custom    | 3 000 ms (default, overridable) |
 *
 * ## Setup requirement
 *
 * A `<ToastProvider toasterId={toasterId}>` must be present in the component
 * tree (typically at the app root). Without it, dispatched toasts are silently
 * ignored by FluentUI.
 *
 * @example
 * ```tsx
 * import { useToast } from '../hooks/useToast';
 *
 * function SaveButton({ onSave }: { onSave: () => Promise<void> }) {
 *   const { success, error } = useToast();
 *
 *   const handleSave = async () => {
 *     try {
 *       await onSave();
 *       success('Saved', 'Changes have been saved successfully.');
 *     } catch (err) {
 *       error('Save failed', err instanceof Error ? err.message : 'Unknown error');
 *     }
 *   };
 *
 *   return <Button onClick={handleSave}>Save</Button>;
 * }
 * ```
 *
 * @see {@link ToastProvider} — the component that renders the FluentUI Toaster
 * @module useToast
 */

import { useId } from 'react';
import {
  useToastController,
  ToastTitle,
  ToastBody,
  Toast,
  type ToastIntent,
} from '@fluentui/react-components';
import { createElement } from 'react';

/** Toast dispatch options */
export interface ToastOptions {
  /** Toast title */
  title: string;
  /** Toast body text (optional) */
  body?: string;
  /** Toast intent/severity */
  intent: ToastIntent;
  /** Auto-dismiss timeout in ms (default: 3000) */
  timeout?: number;
}

/** Return value of useToast */
export interface UseToastReturn {
  /** The toaster ID (pass to ToastProvider) */
  toasterId: string;
  /** Show a success toast */
  success: (title: string, body?: string) => void;
  /** Show an error toast */
  error: (title: string, body?: string) => void;
  /** Show an info toast */
  info: (title: string, body?: string) => void;
  /** Show a warning toast */
  warning: (title: string, body?: string) => void;
  /** Show a toast with custom options */
  notify: (options: ToastOptions) => void;
}

/**
 * Hook providing toast notification dispatch methods.
 * Wraps FluentUI v9's toast controller with a simpler API.
 */
export function useToast(): UseToastReturn {
  const toasterId = useId();
  const { dispatchToast } = useToastController(toasterId);

  const notify = ({ title, body, intent, timeout = 3000 }: ToastOptions) => {
    dispatchToast(
      createElement(
        Toast,
        null,
        createElement(ToastTitle, null, title),
        body ? createElement(ToastBody, null, body) : null,
      ),
      { intent, timeout },
    );
  };

  const success = (title: string, body?: string) =>
    notify({ title, body, intent: 'success' });

  const error = (title: string, body?: string) =>
    notify({ title, body, intent: 'error', timeout: 5000 });

  const info = (title: string, body?: string) =>
    notify({ title, body, intent: 'info' });

  const warning = (title: string, body?: string) =>
    notify({ title, body, intent: 'warning', timeout: 4000 });

  return { toasterId, success, error, info, warning, notify };
}
