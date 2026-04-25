/**
 * Login method selector component.
 * Allows configuring which authentication methods are available,
 * with support for two modes:
 *
 * 1. **Organization mode** — Directly selects default login methods
 *    (no inherit option, always explicit)
 * 2. **Client mode** — Adds an "inherit from organization" option
 *    with override capability (null = inherit, array = override)
 *
 * Used in OrganizationDetail settings tab and ClientDetail login methods tab.
 */

import { useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Checkbox,
  Label,
  RadioGroup,
  Radio,
  Text,
} from '@fluentui/react-components';
import type { LoginMethod } from '../types';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  methodList: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
    paddingLeft: tokens.spacingHorizontalM,
  },
  hint: {
    color: tokens.colorNeutralForeground3,
    paddingLeft: tokens.spacingHorizontalM,
  },
  inheritNote: {
    color: tokens.colorNeutralForeground3,
    fontStyle: 'italic',
  },
});

/** All available login methods in Porta */
const ALL_METHODS: { value: LoginMethod; label: string; description: string }[] = [
  {
    value: 'password',
    label: 'Password',
    description: 'Traditional email + password login',
  },
  {
    value: 'magic_link',
    label: 'Magic Link',
    description: 'Passwordless login via email link',
  },
];

/** Props for the LoginMethodSelector component */
export interface LoginMethodSelectorProps {
  /**
   * Current selected methods.
   * - `null` in client mode means "inherit from organization"
   * - An array specifies the explicit override
   */
  value: LoginMethod[] | null;
  /** Callback when the selection changes */
  onChange: (methods: LoginMethod[] | null) => void;
  /**
   * Selector mode:
   * - `"org"` — no inherit option, always explicit
   * - `"client"` — includes inherit/override radio buttons
   */
  mode: 'org' | 'client';
  /** Methods inherited from the organization (shown when mode="client" and value=null) */
  inheritedMethods?: LoginMethod[];
  /** Whether the selector is disabled */
  disabled?: boolean;
}

/**
 * Login method configuration selector.
 * Supports organization-level defaults and client-level overrides
 * with an inherit/override toggle.
 */
export function LoginMethodSelector({
  value,
  onChange,
  mode,
  inheritedMethods = [],
  disabled = false,
}: LoginMethodSelectorProps) {
  const styles = useStyles();

  // In client mode: null = inherit, array = override
  const isInheriting = mode === 'client' && value === null;
  const effectiveMethods = isInheriting ? inheritedMethods : (value ?? []);

  /** Toggle a single login method on/off */
  const handleMethodToggle = useCallback(
    (method: LoginMethod, checked: boolean) => {
      const current = value ?? [];
      const updated = checked
        ? [...current, method]
        : current.filter((m) => m !== method);
      onChange(updated);
    },
    [value, onChange],
  );

  /** Switch between inherit and override mode (client mode only) */
  const handleModeChange = useCallback(
    (_ev: unknown, data: { value: string }) => {
      if (data.value === 'inherit') {
        // Switch to inherit — clear explicit override
        onChange(null);
      } else {
        // Switch to override — start with inherited methods as defaults
        onChange([...inheritedMethods]);
      }
    },
    [onChange, inheritedMethods],
  );

  return (
    <div className={styles.root}>
      <Label weight="semibold">
        {mode === 'org' ? 'Default Login Methods' : 'Login Methods'}
      </Label>

      {/* Client mode: inherit/override toggle */}
      {mode === 'client' && (
        <RadioGroup
          value={isInheriting ? 'inherit' : 'override'}
          onChange={handleModeChange}
          disabled={disabled}
        >
          <Radio value="inherit" label="Inherit from organization" />
          <Radio value="override" label="Override for this client" />
        </RadioGroup>
      )}

      {/* When inheriting, show effective methods as read-only info */}
      {isInheriting && (
        <div className={styles.methodList}>
          <Text size={200} className={styles.inheritNote}>
            Using organization defaults:{' '}
            {inheritedMethods.length > 0
              ? inheritedMethods
                  .map((m) => ALL_METHODS.find((am) => am.value === m)?.label ?? m)
                  .join(', ')
              : 'None configured'}
          </Text>
        </div>
      )}

      {/* When not inheriting, show checkboxes for each method */}
      {!isInheriting && (
        <div className={styles.methodList}>
          {ALL_METHODS.map((method) => (
            <Checkbox
              key={method.value}
              label={method.label}
              checked={effectiveMethods.includes(method.value)}
              onChange={(_ev, data) =>
                handleMethodToggle(method.value, data.checked === true)
              }
              disabled={disabled}
            />
          ))}
          <Text size={200} className={styles.hint}>
            At least one method should be enabled for users to log in.
          </Text>
        </div>
      )}
    </div>
  );
}
