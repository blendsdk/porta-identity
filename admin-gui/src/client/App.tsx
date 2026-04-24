/**
 * Root application component.
 * Sets up FluentUI theming, React Query, auth context, org context,
 * toast notifications, error boundary, and routing.
 * Uses createBrowserRouter for data-aware routing with breadcrumb support.
 */

import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './hooks/useAuth';
import { useThemePreference } from './hooks/useTheme';
import { OrgContextProvider } from './hooks/useOrgContext';
import { useToast } from './hooks/useToast';
import { ToastProvider } from './components/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';
import { router } from './router';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Inner app component that uses hooks requiring FluentProvider context.
 * Separated to ensure FluentProvider wraps all hook usage.
 */
function AppInner() {
  const { toasterId } = useToast();

  return (
    <ToastProvider toasterId={toasterId}>
      <AuthProvider>
        <OrgContextProvider>
          <ErrorBoundary>
            <RouterProvider router={router} />
          </ErrorBoundary>
        </OrgContextProvider>
      </AuthProvider>
    </ToastProvider>
  );
}

/**
 * Root app component.
 * Provider order: FluentProvider (theming) → QueryClientProvider (data) → AppInner.
 */
export function App() {
  const { theme } = useThemePreference();

  return (
    <FluentProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <AppInner />
      </QueryClientProvider>
    </FluentProvider>
  );
}
