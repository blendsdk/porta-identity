/**
 * Authentication context and hook.
 * Fetches session info from /auth/me on mount and provides
 * auth state to the entire application.
 */

import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';
import type { SessionInfo, AdminUser } from '../../shared/types';
import { setCsrfToken as setApiCsrfToken } from '../api/client';

interface AuthContextValue {
  /** Whether the auth state is still loading */
  loading: boolean;
  /** Whether the user is authenticated */
  authenticated: boolean;
  /** The authenticated user (null if not authenticated) */
  user: AdminUser | null;
  /** CSRF token for API requests */
  csrfToken: string | null;
  /** Environment info from the server */
  environment: string;
  /** Redirect to login */
  login: () => void;
  /** Post to logout endpoint */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Auth provider component.
 * Fetches session info from /auth/me on mount and provides
 * auth state to the entire application.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<SessionInfo | null>(null);
  const [csrfToken, setCsrfToken] = useState<string | null>(null);

  useEffect(() => {
    fetch('/auth/me')
      .then((res) => res.json())
      .then((data: SessionInfo & { csrfToken?: string }) => {
        setSession(data);
        if (data.csrfToken) {
          setCsrfToken(data.csrfToken);
          setApiCsrfToken(data.csrfToken);
        }
      })
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  const login = () => {
    window.location.href = '/auth/login';
  };

  const logout = () => {
    // Use a form submission for POST /auth/logout
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = '/auth/logout';
    document.body.appendChild(form);
    form.submit();
  };

  const value: AuthContextValue = {
    loading,
    authenticated: session?.authenticated ?? false,
    user: session?.user ?? null,
    csrfToken,
    environment: session?.environment?.environment ?? 'development',
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook to access auth state. Must be used within AuthProvider. */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
