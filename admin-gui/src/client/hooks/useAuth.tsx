/**
 * Authentication context and hook.
 *
 * Provides authentication state to the entire application via React Context.
 * On mount, `AuthProvider` fetches session info from the BFF's `GET /auth/me`
 * endpoint, which returns the authenticated user, CSRF token, and environment.
 *
 * ## Architecture
 *
 * The BFF (Backend-for-Frontend) handles the OIDC auth code flow and stores
 * sessions server-side in Redis. The SPA never touches tokens directly —
 * it only knows "am I logged in?" and "who am I?" via this hook.
 *
 * ## CSRF integration
 *
 * When `/auth/me` returns a `csrfToken`, the provider automatically calls
 * `setCsrfToken()` on the API client module, so all subsequent state-changing
 * API requests (`POST`, `PUT`, `PATCH`, `DELETE`) include the `X-CSRF-Token`
 * header. No manual CSRF handling is needed by consuming components.
 *
 * ## Login / Logout
 *
 * - `login()` — Redirects the browser to `/auth/login` (BFF initiates OIDC flow)
 * - `logout()` — Submits a hidden `<form>` to `POST /auth/logout` (clears server session)
 *
 * @example
 * ```tsx
 * import { AuthProvider, useAuth } from '../hooks/useAuth';
 *
 * // 1. Wrap your app in AuthProvider (done in App.tsx)
 * <AuthProvider>
 *   <MyApp />
 * </AuthProvider>
 *
 * // 2. Consume auth state in any child component
 * function UserGreeting() {
 *   const { loading, authenticated, user, logout } = useAuth();
 *
 *   if (loading) return <Spinner />;
 *   if (!authenticated) return <Button onClick={() => useAuth().login()}>Sign In</Button>;
 *
 *   return (
 *     <div>
 *       Welcome, {user!.name}
 *       <Button onClick={logout}>Sign Out</Button>
 *     </div>
 *   );
 * }
 * ```
 *
 * @module useAuth
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

/**
 * Shape of the auth context value returned by {@link useAuth}.
 *
 * All properties are reactive — when the auth state changes (e.g. after
 * a session fetch completes), consuming components re-render automatically.
 */
interface AuthContextValue {
  /** `true` while the initial `/auth/me` fetch is in flight */
  loading: boolean;
  /** `true` if the user has a valid server-side session */
  authenticated: boolean;
  /** The authenticated admin user, or `null` if not logged in */
  user: AdminUser | null;
  /** CSRF token for state-changing requests (auto-synced to the API client) */
  csrfToken: string | null;
  /** Server environment string (e.g. `"development"`, `"production"`) */
  environment: string;
  /** Redirect the browser to the BFF login endpoint (`/auth/login`) */
  login: () => void;
  /** Submit a POST to the BFF logout endpoint (`/auth/logout`) — clears server session */
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

/**
 * Hook to access authentication state.
 *
 * @returns The current {@link AuthContextValue} with user info, CSRF token, and login/logout methods
 * @throws {Error} If called outside an `AuthProvider`
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
