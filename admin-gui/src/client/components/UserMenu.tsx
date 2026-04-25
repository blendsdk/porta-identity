/**
 * User menu dropdown.
 * Shows the current user's avatar and name, with a dropdown menu
 * containing profile link, theme toggle, and sign out action.
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
  MenuDivider,
  Avatar,
} from '@fluentui/react-components';
import {
  PersonRegular,
  WeatherMoonRegular,
  WeatherSunnyRegular,
  SignOutRegular,
} from '@fluentui/react-icons';

import { useAuth } from '../hooks/useAuth';
import { useThemePreference } from '../hooks/useTheme';

const useStyles = makeStyles({
  trigger: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  emailItem: {
    cursor: 'default',
  },
});

/**
 * User menu with avatar, profile info, theme toggle, and sign out.
 */
export function UserMenu() {
  const styles = useStyles();
  const { user, logout } = useAuth();
  const { mode, toggleTheme } = useThemePreference();

  const displayName = user?.name || 'User';
  const displayEmail = user?.email || '';

  return (
    <Menu>
      <MenuTrigger disableButtonEnhancement>
        <Button appearance="subtle" aria-label="User menu" data-testid="user-menu-trigger">
          <span className={styles.trigger}>
            <Avatar
              name={displayName}
              size={24}
              icon={<PersonRegular />}
            />
            <Text size={300}>{displayName}</Text>
          </span>
        </Button>
      </MenuTrigger>
      <MenuPopover>
        <MenuList>
          {/* User email (non-interactive) */}
          <MenuItem className={styles.emailItem} disabled>
            <Text size={200}>{displayEmail}</Text>
          </MenuItem>
          <MenuDivider />
          {/* Theme toggle */}
          <MenuItem
            icon={
              mode === 'light' ? <WeatherMoonRegular /> : <WeatherSunnyRegular />
            }
            onClick={toggleTheme}
          >
            {mode === 'light' ? 'Dark theme' : 'Light theme'}
          </MenuItem>
          <MenuDivider />
          {/* Sign out */}
          <MenuItem icon={<SignOutRegular />} onClick={logout} data-testid="user-menu-signout">
            Sign out
          </MenuItem>
        </MenuList>
      </MenuPopover>
    </Menu>
  );
}
