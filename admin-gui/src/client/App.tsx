/**
 * Root application component.
 * Sets up FluentUI theming, React Query, auth context, and routing.
 * Uses createBrowserRouter for data-aware routing with breadcrumb support.
 */

import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { AuthProvider } from './hooks/useAuth';
import { useThemePreference } from './hooks/useTheme';
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
 * Root app component.
 * Provider order: FluentProvider (theming) → QueryClientProvider (data) →
 * AuthProvider (session) → RouterProvider (routing with data router).
 */
export function App() {
  const { theme } = useThemePreference();

  return (
    <FluentProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </FluentProvider>
  );
}
