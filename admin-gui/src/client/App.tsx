/**
 * Root application component.
 * Sets up FluentUI theming, React Query, auth context, and routing.
 */

import { FluentProvider } from '@fluentui/react-components';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route } from 'react-router';
import { AuthProvider } from './hooks/useAuth';
import { useThemePreference } from './hooks/useTheme';
import { RequireAuth } from './components/RequireAuth';
import { AppShell } from './components/AppShell';
import { Dashboard } from './pages/Dashboard';
import { Login } from './pages/Login';
import { NotFound } from './pages/NotFound';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000, // 30 seconds
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

export function App() {
  const { theme } = useThemePreference();

  return (
    <FluentProvider theme={theme}>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <BrowserRouter>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route element={<RequireAuth />}>
                <Route element={<AppShell />}>
                  <Route path="/" element={<Dashboard />} />
                  {/* Stub routes — full pages added in RD-23 */}
                  <Route path="*" element={<NotFound />} />
                </Route>
              </Route>
            </Routes>
          </BrowserRouter>
        </AuthProvider>
      </QueryClientProvider>
    </FluentProvider>
  );
}
