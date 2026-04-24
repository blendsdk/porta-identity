/**
 * Login page.
 * Immediately redirects to the BFF /auth/login endpoint which starts the OIDC flow.
 */

import { useEffect } from 'react';
import { Spinner, makeStyles } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100vh',
  },
});

export function Login() {
  const styles = useStyles();

  useEffect(() => {
    window.location.href = '/auth/login';
  }, []);

  return (
    <div className={styles.root}>
      <Spinner label="Redirecting to login..." size="large" />
    </div>
  );
}
