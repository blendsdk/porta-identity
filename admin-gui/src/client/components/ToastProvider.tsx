/**
 * Toast provider component.
 * Wraps the app with FluentUI v9's Toaster for toast notifications.
 * Use the useToast hook to dispatch toasts from any component.
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
