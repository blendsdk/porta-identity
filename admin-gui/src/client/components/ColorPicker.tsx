/**
 * Simple color picker component.
 * Combines a hex color text input with an HTML5 native color picker
 * and a visual preview swatch. Used primarily by the BrandingEditor
 * for selecting organization branding colors.
 */

import { useCallback } from 'react';
import { makeStyles, tokens, Input, Label, Text } from '@fluentui/react-components';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
  /** Native color input styled as a small clickable swatch */
  nativeInput: {
    width: '36px',
    height: '36px',
    padding: '2px',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    backgroundColor: 'transparent',
  },
  hexInput: {
    width: '120px',
  },
  preview: {
    width: '36px',
    height: '36px',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
  },
  clearButton: {
    cursor: 'pointer',
    color: tokens.colorNeutralForeground3,
    fontSize: tokens.fontSizeBase200,
    '&:hover': {
      color: tokens.colorNeutralForeground1,
    },
  },
});

/** Validates whether a string is a valid hex color (#RGB or #RRGGBB) */
function isValidHexColor(value: string): boolean {
  return /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6})$/.test(value);
}

/** Props for the ColorPicker component */
export interface ColorPickerProps {
  /** Label displayed above the picker */
  label: string;
  /** Current hex color value (e.g., "#FF5733") or null if unset */
  value: string | null;
  /** Called when the color changes */
  onChange: (color: string | null) => void;
  /** Whether the picker is disabled */
  disabled?: boolean;
  /** Placeholder text for the hex input */
  placeholder?: string;
}

/**
 * Hex color picker with native browser color input and text input.
 * Supports clearing the color (setting to null) for optional fields.
 */
export function ColorPicker({
  label,
  value,
  onChange,
  disabled = false,
  placeholder = '#000000',
}: ColorPickerProps) {
  const styles = useStyles();

  /** Handle changes from the native HTML5 color picker */
  const handleNativeChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      onChange(e.target.value);
    },
    [onChange],
  );

  /** Handle changes from the hex text input */
  const handleHexInput = useCallback(
    (_ev: unknown, data: { value: string }) => {
      const hex = data.value.trim();
      // Allow typing in progress — update immediately so the input is responsive
      if (hex === '' || hex === '#') {
        onChange(null);
      } else {
        // Always store the value; validation is visual, not blocking
        onChange(hex.startsWith('#') ? hex : `#${hex}`);
      }
    },
    [onChange],
  );

  /** Clear the color value */
  const handleClear = useCallback(() => {
    onChange(null);
  }, [onChange]);

  const displayValue = value ?? '';
  const isValid = !displayValue || isValidHexColor(displayValue);

  return (
    <div className={styles.root}>
      <Label>{label}</Label>
      <div className={styles.row}>
        {/* Native browser color picker */}
        <input
          type="color"
          className={styles.nativeInput}
          value={displayValue || '#000000'}
          onChange={handleNativeChange}
          disabled={disabled}
          aria-label={`${label} color picker`}
        />

        {/* Hex text input */}
        <Input
          className={styles.hexInput}
          value={displayValue}
          onChange={handleHexInput}
          placeholder={placeholder}
          disabled={disabled}
          aria-label={`${label} hex value`}
          contentAfter={
            !isValid ? (
              <Text size={100} style={{ color: tokens.colorPaletteRedForeground1 }}>
                Invalid
              </Text>
            ) : undefined
          }
        />

        {/* Preview swatch (shows actual color or transparent) */}
        {displayValue && isValid && (
          <div
            className={styles.preview}
            style={{ backgroundColor: displayValue }}
            aria-label={`Preview: ${displayValue}`}
          />
        )}

        {/* Clear button when a value is set */}
        {displayValue && !disabled && (
          <Text
            size={200}
            className={styles.clearButton}
            onClick={handleClear}
            role="button"
            tabIndex={0}
            aria-label="Clear color"
          >
            Clear
          </Text>
        )}
      </div>
    </div>
  );
}
