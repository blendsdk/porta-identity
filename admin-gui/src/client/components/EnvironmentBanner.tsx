/**
 * Environment indicator banner.
 * Always visible, cannot be dismissed.
 * Color-coded to prevent accidental changes in production.
 */

import { makeStyles, mergeClasses, Text } from '@fluentui/react-components';
import { useAuth } from '../hooks/useAuth';

const useStyles = makeStyles({
  banner: {
    textAlign: 'center',
    paddingTop: '4px',
    paddingBottom: '4px',
    fontWeight: 'bold',
  },
  production: {
    backgroundColor: '#d13438',
    color: 'white',
  },
  staging: {
    backgroundColor: '#f7c811',
    color: '#323130',
  },
  development: {
    backgroundColor: '#107c10',
    color: 'white',
  },
});

const labels: Record<string, string> = {
  production: '🔴 PRODUCTION',
  staging: '🟡 STAGING',
  development: '🟢 DEVELOPMENT',
};

export function EnvironmentBanner() {
  const { environment } = useAuth();
  const styles = useStyles();
  const envClass =
    (styles as Record<string, string>)[environment] || styles.development;

  return (
    <div className={mergeClasses(styles.banner, envClass)}>
      <Text size={200} weight="bold">
        {labels[environment] || `🔵 ${environment.toUpperCase()}`}
      </Text>
    </div>
  );
}
