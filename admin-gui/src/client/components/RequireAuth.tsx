/**
 * Route guard that requires authentication.
 * Shows loading spinner while checking auth, redirects to /login if not authenticated.
 */

import { Navigate, Outlet } from 'react-router';
import { Spinner, makeStyles } from '@fluentui/react-components';
import { useAuth } from '../hooks/useAuth';

const useStyles = makeStyles({
  loading: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
});

export function RequireAuth() {
  const { loading, authenticated } = useAuth();
  const styles = useStyles();

  if (loading) {
    return (
      <div className={styles.loading}>
        <Spinner label="Loading..." size="large" />
      </div>
    );
  }

  if (!authenticated) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
