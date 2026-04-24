/**
 * Stub page placeholder.
 * Used for routes that are defined in the router but not yet implemented.
 * Displays the page title and a "coming soon" message.
 * Will be replaced by actual entity pages in sub-plans 2 and 3.
 */

import { makeStyles, tokens, Text, Title3 } from '@fluentui/react-components';
import { Outlet } from 'react-router';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '300px',
    gap: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground3,
  },
});

/** Props for the StubPage component */
export interface StubPageProps {
  /** Page title displayed in the placeholder */
  title: string;
}

/**
 * Placeholder page for routes awaiting implementation.
 * Also renders child routes via Outlet to support nested layouts.
 */
export function StubPage({ title }: StubPageProps) {
  const styles = useStyles();

  return (
    <>
      <div className={styles.root}>
        <Title3>{title}</Title3>
        <Text>This page will be implemented in a future update.</Text>
      </div>
      <Outlet />
    </>
  );
}
