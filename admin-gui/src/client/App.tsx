/**
 * Root application component — Placeholder version.
 *
 * Sets up the full React provider tree and renders a placeholder
 * "Under Development" page. The full admin dashboard SPA is under
 * active development; this file will evolve into the real app shell.
 *
 * ## Provider tree (outermost → innermost)
 *
 * ```
 * FluentProvider (theming — light/dark via useThemePreference)
 *   └─ AuthProvider (session fetch from /auth/me, CSRF sync)
 *        └─ ToastProvider (FluentUI Toaster instance)
 *             └─ ErrorBoundary (catches rendering errors)
 *                  └─ PlaceholderPage (current content)
 * ```
 *
 * When building the real dashboard, replace `<PlaceholderPage />` with
 * a router and page components. The provider order above must be
 * preserved — each layer depends on the one above it.
 *
 * **Important:** `useThemePreference()` and `useToast()` are called in
 * `App()` itself (outside providers) because they only need React hooks,
 * not context from AuthProvider or ToastProvider.
 *
 * @module App
 */

import {
  FluentProvider,
  Title1,
  Title3,
  Body1,
  Button,
  Card,
  CardHeader,
  Divider,
  Badge,
  Spinner,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import {
  ShieldKeyhole24Regular,
  PersonCircle24Regular,
  SignOut24Regular,
  Settings24Regular,
  WeatherMoon24Regular,
  WeatherSunny24Regular,
} from '@fluentui/react-icons';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { useThemePreference } from './hooks/useTheme';
import { useToast } from './hooks/useToast';
import { ToastProvider } from './components/ToastProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

const useStyles = makeStyles({
  container: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100vh',
    padding: tokens.spacingVerticalXXL,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  card: {
    maxWidth: '520px',
    width: '100%',
    padding: tokens.spacingVerticalXL,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    marginBottom: tokens.spacingVerticalL,
  },
  icon: {
    fontSize: '48px',
    color: tokens.colorBrandForeground1,
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  userInfo: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground2,
    borderRadius: tokens.borderRadiusMedium,
  },
  userRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalM,
  },
  footer: {
    marginTop: tokens.spacingVerticalXL,
    textAlign: 'center' as const,
    color: tokens.colorNeutralForeground3,
  },
});

/**
 * Placeholder page content.
 * Shows auth status and "Under Development" message.
 */
function PlaceholderPage() {
  const styles = useStyles();
  const { loading, authenticated, user, login, logout } = useAuth();
  const { mode, toggleTheme } = useThemePreference();

  if (loading) {
    return (
      <div className={styles.container}>
        <Spinner size="large" label="Loading..." />
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <Card className={styles.card}>
        <CardHeader
          image={<ShieldKeyhole24Regular className={styles.icon} />}
          header={<Title1>Porta Admin</Title1>}
          description="Identity Provider Administration"
        />

        <Divider />

        <div className={styles.content}>
          <Title3>
            <Settings24Regular /> Admin Dashboard
          </Title3>

          <Badge appearance="outline" color="informative" size="large">
            Under Development
          </Badge>

          <Body1>
            The web-based administration dashboard is currently under
            development. Use the <strong>Porta CLI</strong> (
            <code>porta</code> command) for full administration capabilities
            including organization, application, client, and user management.
          </Body1>

          {authenticated && user ? (
            <div className={styles.userInfo}>
              <div className={styles.userRow}>
                <PersonCircle24Regular />
                <Body1>
                  <strong>{user.name}</strong>
                </Body1>
              </div>
              <Body1>{user.email}</Body1>
              {user.roles.length > 0 && (
                <div className={styles.userRow}>
                  {user.roles.map((role) => (
                    <Badge key={role} appearance="filled" color="brand" size="small">
                      {role}
                    </Badge>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <Body1>You are not currently signed in.</Body1>
          )}
        </div>

        <div className={styles.actions}>
          {authenticated ? (
            <Button
              appearance="secondary"
              icon={<SignOut24Regular />}
              onClick={logout}
            >
              Sign Out
            </Button>
          ) : (
            <Button
              appearance="primary"
              icon={<PersonCircle24Regular />}
              onClick={login}
            >
              Sign In
            </Button>
          )}
          <Button
            appearance="subtle"
            icon={
              mode === 'dark' ? (
                <WeatherSunny24Regular />
              ) : (
                <WeatherMoon24Regular />
              )
            }
            onClick={toggleTheme}
          >
            {mode === 'dark' ? 'Light Mode' : 'Dark Mode'}
          </Button>
        </div>
      </Card>

      <div className={styles.footer}>
        <Body1>
          Porta Identity Provider — Admin GUI v1.0.0 (Preview)
        </Body1>
      </div>
    </div>
  );
}

/**
 * Root app component — assembles the provider tree.
 *
 * Provider order is significant and must not be reordered:
 * 1. `FluentProvider` — theming (all FluentUI components need this)
 * 2. `AuthProvider` — fetches session, sets CSRF token on API client
 * 3. `ToastProvider` — renders the Toaster instance for notifications
 * 4. `ErrorBoundary` — catches rendering errors in the page subtree
 */
export function App() {
  const { theme } = useThemePreference();
  const { toasterId } = useToast();

  return (
    <FluentProvider theme={theme}>
      <AuthProvider>
        <ToastProvider toasterId={toasterId}>
          <ErrorBoundary>
            <PlaceholderPage />
          </ErrorBoundary>
        </ToastProvider>
      </AuthProvider>
    </FluentProvider>
  );
}
