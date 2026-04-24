/**
 * Sidebar navigation stub.
 * Minimal navigation for RD-22 skeleton — full implementation in RD-23.
 */

import { makeStyles, tokens, Text } from '@fluentui/react-components';
import {
  HomeRegular,
  OrganizationRegular,
  PeopleRegular,
  AppGenericRegular,
  KeyRegular,
  SettingsRegular,
} from '@fluentui/react-icons';
import { useNavigate, useLocation } from 'react-router';

const useStyles = makeStyles({
  root: {
    width: '240px',
    minWidth: '240px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRight: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    flexDirection: 'column',
    paddingTop: tokens.spacingVerticalM,
    paddingBottom: tokens.spacingVerticalM,
  },
  nav: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
  },
  navItem: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalS,
    paddingBottom: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalM,
    paddingRight: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    color: tokens.colorNeutralForeground2,
    border: 'none',
    backgroundColor: 'transparent',
    width: '100%',
    textAlign: 'left',
    fontSize: tokens.fontSizeBase300,
    lineHeight: tokens.lineHeightBase300,
    ':hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  navItemActive: {
    backgroundColor: tokens.colorNeutralBackground1Selected,
    color: tokens.colorNeutralForeground1,
    fontWeight: tokens.fontWeightSemibold,
  },
  section: {
    paddingTop: tokens.spacingVerticalL,
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalXS,
  },
});

interface NavEntry {
  path: string;
  label: string;
  icon: React.ReactElement;
}

const navItems: NavEntry[] = [
  { path: '/', label: 'Dashboard', icon: <HomeRegular /> },
  {
    path: '/organizations',
    label: 'Organizations',
    icon: <OrganizationRegular />,
  },
  { path: '/users', label: 'Users', icon: <PeopleRegular /> },
  { path: '/applications', label: 'Applications', icon: <AppGenericRegular /> },
  { path: '/clients', label: 'Clients', icon: <KeyRegular /> },
  { path: '/settings', label: 'Settings', icon: <SettingsRegular /> },
];

export function Sidebar() {
  const styles = useStyles();
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <aside className={styles.root}>
      <div className={styles.section}>
        <Text size={200} weight="semibold">
          Navigation
        </Text>
      </div>
      <nav className={styles.nav}>
        {navItems.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);

          return (
            <button
              key={item.path}
              type="button"
              className={`${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
              onClick={() => navigate(item.path)}
            >
              {item.icon}
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
