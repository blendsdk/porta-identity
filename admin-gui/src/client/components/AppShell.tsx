/**
 * Application shell layout.
 * Provides the persistent sidebar, top bar, environment banner,
 * and breadcrumb navigation. Page content is rendered via
 * React Router's <Outlet />.
 */

import { Outlet } from 'react-router';
import { makeStyles, tokens } from '@fluentui/react-components';
import { Sidebar } from './Sidebar';
import { TopBar } from './TopBar';
import { EnvironmentBanner } from './EnvironmentBanner';
import { Breadcrumbs } from './Breadcrumbs';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
  },
  body: {
    display: 'flex',
    flex: 1,
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    overflow: 'auto',
    padding: tokens.spacingHorizontalXL,
    backgroundColor: tokens.colorNeutralBackground2,
  },
});

/**
 * Main application shell.
 * Layout: EnvironmentBanner → TopBar → [Sidebar | Content].
 * Content area includes breadcrumbs above the page outlet.
 */
export function AppShell() {
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <EnvironmentBanner />
      <TopBar />
      <div className={styles.body}>
        <Sidebar />
        <main className={styles.content}>
          <Breadcrumbs />
          <Outlet />
        </main>
      </div>
    </div>
  );
}
