/**
 * 404 Not Found page.
 */

import { Text, Button, makeStyles, tokens } from '@fluentui/react-components';
import { useNavigate } from 'react-router';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    gap: tokens.spacingVerticalL,
  },
});

export function NotFound() {
  const styles = useStyles();
  const navigate = useNavigate();

  return (
    <div className={styles.root}>
      <Text as="h1" size={900} weight="bold">
        404
      </Text>
      <Text size={400}>Page not found.</Text>
      <Button appearance="primary" onClick={() => navigate('/')}>
        Go to Dashboard
      </Button>
    </div>
  );
}
