/**
 * Navigation configuration for the admin GUI sidebar.
 * Defines all navigation items, their routes, icons, and role-based visibility.
 * The sidebar component filters these items based on the current user's roles.
 */

import {
  HomeRegular,
  HomeFilled,
  BuildingRegular,
  BuildingFilled,
  AppsRegular,
  AppsFilled,
  KeyRegular,
  KeyFilled,
  PeopleRegular,
  PeopleFilled,
  ShieldRegular,
  ShieldFilled,
  TagRegular,
  TagFilled,
  DesktopRegular,
  DesktopFilled,
  ClipboardRegular,
  ClipboardFilled,
  SettingsRegular,
  SettingsFilled,
  CertificateRegular,
  CertificateFilled,
  ArrowImportRegular,
  ArrowImportFilled,
} from '@fluentui/react-icons';

import type { NavItem } from '../types';

/**
 * All navigation items for the admin GUI sidebar.
 * Items are displayed in this order; role-based filtering removes
 * items the current user is not authorized to see.
 *
 * The `porta-admin` role grants access to all items.
 * Future granular roles can restrict visibility per item.
 */
export const NAV_ITEMS: NavItem[] = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    path: '/',
    icon: HomeRegular,
    iconFilled: HomeFilled,
  },
  {
    key: 'organizations',
    label: 'Organizations',
    path: '/organizations',
    icon: BuildingRegular,
    iconFilled: BuildingFilled,
  },
  {
    key: 'applications',
    label: 'Applications',
    path: '/applications',
    icon: AppsRegular,
    iconFilled: AppsFilled,
  },
  {
    key: 'clients',
    label: 'Clients',
    path: '/clients',
    icon: KeyRegular,
    iconFilled: KeyFilled,
  },
  {
    key: 'users',
    label: 'Users',
    path: '/users',
    icon: PeopleRegular,
    iconFilled: PeopleFilled,
  },
  {
    key: 'roles-permissions',
    label: 'Roles & Permissions',
    path: '/roles',
    icon: ShieldRegular,
    iconFilled: ShieldFilled,
    children: [
      {
        key: 'roles',
        label: 'Roles',
        path: '/roles',
        icon: ShieldRegular,
        iconFilled: ShieldFilled,
      },
      {
        key: 'permissions',
        label: 'Permissions',
        path: '/permissions',
        icon: ShieldRegular,
        iconFilled: ShieldFilled,
      },
    ],
  },
  {
    key: 'custom-claims',
    label: 'Custom Claims',
    path: '/claims',
    icon: TagRegular,
    iconFilled: TagFilled,
  },
  {
    key: 'sessions',
    label: 'Sessions',
    path: '/sessions',
    icon: DesktopRegular,
    iconFilled: DesktopFilled,
  },
  {
    key: 'audit',
    label: 'Audit Log',
    path: '/audit',
    icon: ClipboardRegular,
    iconFilled: ClipboardFilled,
  },
  {
    key: 'config',
    label: 'Configuration',
    path: '/config',
    icon: SettingsRegular,
    iconFilled: SettingsFilled,
  },
  {
    key: 'keys',
    label: 'Signing Keys',
    path: '/keys',
    icon: CertificateRegular,
    iconFilled: CertificateFilled,
  },
  {
    key: 'import-export',
    label: 'Import / Export',
    path: '/import-export',
    icon: ArrowImportRegular,
    iconFilled: ArrowImportFilled,
  },
];

/**
 * The super-admin role that grants access to all navigation items.
 * Users with this role see the complete sidebar.
 */
export const SUPER_ADMIN_ROLE = 'porta-admin';
