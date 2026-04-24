/**
 * Top bar stub with user menu and theme toggle.
 * Minimal implementation for RD-22 skeleton — full implementation in RD-23.
 */

import {
  makeStyles,
  tokens,
  Text,
  Button,
  Menu,
  MenuTrigger,
  MenuPopover,
  MenuList,
  MenuItem,
  Avatar,
} from '@fluentui/react-components';
import {
  WeatherMoonRegular,
  WeatherSunnyRegular,
  SignOutRegular,
  PersonRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../hooks/useAuth';
import { useThemePreference } from '../hooks/useTheme';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: '48px',
    paddingLeft: tokens.spacingHorizontalL,
    paddingRight: tokens.spacingHorizontalL,
    backgroundColor: tokens.colorNeutralBackground1,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  userButton: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
});

export function TopBar() {
  const styles = useStyles();
  const { user, logout } = useAuth();
  const { mode, toggleTheme } = useThemePreference();

  return (
    <header className={styles.root}>
      <div className={styles.brand}>
        <Text size={500} weight="bold">
          Porta Admin
        </Text>
      </div>
      <div className={styles.actions}>
        <Button
          appearance="subtle"
          icon={mode === 'light' ? <WeatherMoonRegular /> : <WeatherSunnyRegular />}
          onClick={toggleTheme}
          aria-label={`Switch to ${mode === 'light' ? 'dark' : 'light'} theme`}
        />
        <Menu>
          <MenuTrigger disableButtonEnhancement>
            <Button appearance="subtle" aria-label="User menu">
              <span className={styles.userButton}>
                <Avatar
                  name={user?.name || 'User'}
                  size={24}
                  icon={<PersonRegular />}
                />
                <Text size={300}>{user?.name || 'User'}</Text>
              </span>
            </Button>
          </MenuTrigger>
          <MenuPopover>
            <MenuList>
              <MenuItem disabled>
                <Text size={200}>{user?.email || ''}</Text>
              </MenuItem>
              <MenuItem icon={<SignOutRegular />} onClick={logout}>
                Sign out
              </MenuItem>
            </MenuList>
          </MenuPopover>
        </Menu>
      </div>
    </header>
  );
}
