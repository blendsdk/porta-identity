/**
 * Dashboard stub page.
 * Full implementation in RD-23.
 */

import { Text, makeStyles, tokens } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
});

export function Dashboard() {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <Text as="h1" size={800} weight="bold">
        Dashboard
      </Text>
      <Text size={400}>Admin dashboard — coming in RD-23.</Text>
    </div>
  );
}
