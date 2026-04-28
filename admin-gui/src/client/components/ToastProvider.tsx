/**
 * Toast provider component.
 *
 * Wraps the app with FluentUI v9's `Toaster` instance for toast notifications.
 * The `toasterId` must come from the {@link useToast} hook, which returns both
 * the ID and the dispatch methods (`success`, `error`, `info`, `warning`).
 *
 * **Placement:** At the app root level, inside `FluentProvider` and `AuthProvider`
 * but outside the main page content. Toasts render at `position="bottom-end"`.
 *
 * **Provider requirement:** Must be rendered inside a `FluentProvider`.
 *
 * @example
 * ```tsx
 * import { useToast } from '../hooks/useToast';
 * import { ToastProvider } from '../components/ToastProvider';
 *
 * function App() {
 *   const { toasterId } = useToast();
 *   return (
 *     <FluentProvider theme={theme}>
 *       <ToastProvider toasterId={toasterId}>
 *         <MainContent />
 *       </ToastProvider>
 *     </FluentProvider>
 *   );
 * }
 * ```
 *
 * @see {@link useToast} — the hook that provides `toasterId` and dispatch methods
 * @module ToastProvider
 */

import { Toaster } from '@fluentui/react-components';
import type { ReactNode } from 'react';

/** Props for the ToastProvider */
export interface ToastProviderProps {
  /** The toaster ID from useToast() */
  toasterId: string;
  /** Child components */
  children: ReactNode;
}

/**
 * Provides the FluentUI Toaster instance for toast notifications.
 * Place at the app root level, inside FluentProvider.
 */
export function ToastProvider({ toasterId, children }: ToastProviderProps) {
  return (
    <>
      {children}
      <Toaster toasterId={toasterId} position="bottom-end" />
    </>
  );
}
