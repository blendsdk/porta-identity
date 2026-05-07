/**
 * Authentication hook for the standalone Admin GUI SPA.
 *
 * Forked from admin-gui/src/client/hooks/useAuth.tsx and adapted:
 * - No CSRF token management (standalone BFF uses SameSite=Strict)
 * - Calls `GET /auth/me` for session info
 * - Logout via `GET /auth/logout` (BFF handles OIDC RP-Initiated Logout)
 * - 401 from /auth/me → redirect to /auth/login
 *
 * @module hooks/useAuth
 */

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from 'react';

/** User identity from the BFF session. */
export interface AuthUser {
  sub: string;
  name: string;
  email: string;
}

/** Auth context value provided to consumers. */
export interface AuthContextValue {
  /** Whether the auth check is still in progress. */
  loading: boolean;
  /** Whether the user is authenticated. */
  authenticated: boolean;
  /** User identity (undefined if not authenticated). */
  user: AuthUser | undefined;
  /** Porta server URL (from BFF). */
  server: string | undefined;
  /** GUI version (from BFF). */
  version: string | undefined;
  /** Trigger logout — redirects to BFF logout endpoint. */
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

/**
 * Hook to access the auth context.
 * Must be used within an `<AuthProvider>`.
 */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}

/** Props for the AuthProvider component. */
interface AuthProviderProps {
  children: ReactNode;
}

/**
 * AuthProvider — wraps the app and provides auth state.
 *
 * On mount, fetches `GET /auth/me` from the BFF. If authenticated,
 * sets user info. If 401, redirects to `/auth/login`.
 */
export function AuthProvider({ children }: AuthProviderProps): ReactNode {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);
  const [user, setUser] = useState<AuthUser | undefined>();
  const [server, setServer] = useState<string | undefined>();
  const [version, setVersion] = useState<string | undefined>();

  useEffect(() => {
    let cancelled = false;

    async function checkAuth(): Promise<void> {
      try {
        const res = await fetch('/auth/me', { credentials: 'same-origin' });

        if (cancelled) return;

        if (res.status === 401) {
          // Not authenticated — redirect to login
          window.location.href = '/auth/login';
          return;
        }

        if (res.ok) {
          const data = (await res.json()) as {
            authenticated: boolean;
            user: AuthUser;
            server: string;
            version: string;
          };

          if (!cancelled) {
            setAuthenticated(data.authenticated);
            setUser(data.user);
            setServer(data.server);
            setVersion(data.version);
            setLoading(false);
          }
        } else {
          // Unexpected error — still show the app, unauthenticated
          if (!cancelled) {
            setLoading(false);
          }
        }
      } catch {
        // Network error — redirect to login
        if (!cancelled) {
          window.location.href = '/auth/login';
        }
      }
    }

    checkAuth();

    return () => {
      cancelled = true;
    };
  }, []);

  const logout = useCallback(() => {
    // Redirect to BFF logout endpoint — handles OIDC logout chain
    window.location.href = '/auth/logout';
  }, []);

  const value: AuthContextValue = {
    loading,
    authenticated,
    user,
    server,
    version,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
