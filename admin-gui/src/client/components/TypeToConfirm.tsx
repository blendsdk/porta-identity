/**
 * Type-to-confirm component.
 * Requires the user to type a specific value (e.g., entity name) before
 * a destructive action can proceed. Used inside ConfirmDialog.
 */

import { useState, useCallback, useEffect } from 'react';
import { makeStyles, tokens, Text, Input } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  prompt: {
    color: tokens.colorNeutralForeground2,
  },
  confirmValue: {
    fontWeight: tokens.fontWeightSemibold,
  },
});

/** Props for the TypeToConfirm component */
export interface TypeToConfirmProps {
  /** The exact value the user must type to confirm */
  confirmValue: string;
  /** Callback when the confirmation state changes */
  onConfirmedChange: (confirmed: boolean) => void;
  /** Prompt text (default: "Type {confirmValue} to confirm") */
  prompt?: string;
}

/**
 * Input that validates the typed text matches the required confirmation value.
 * Calls `onConfirmedChange(true)` when the input matches exactly.
 */
export function TypeToConfirm({
  confirmValue,
  onConfirmedChange,
  prompt,
}: TypeToConfirmProps) {
  const styles = useStyles();
  const [value, setValue] = useState('');

  const handleChange = useCallback(
    (_e: unknown, data: { value: string }) => {
      setValue(data.value);
    },
    [],
  );

  // Report confirmation state changes
  useEffect(() => {
    onConfirmedChange(value === confirmValue);
  }, [value, confirmValue, onConfirmedChange]);

  const displayPrompt = prompt ?? `Type "${confirmValue}" to confirm:`;

  return (
    <div className={styles.root}>
      <Text className={styles.prompt}>
        {displayPrompt}
      </Text>
      <Input
        value={value}
        onChange={handleChange}
        placeholder={confirmValue}
        autoFocus
      />
    </div>
  );
}
