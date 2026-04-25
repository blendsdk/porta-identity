/**
 * Branding editor component.
 * Provides a comprehensive UI for managing organization branding:
 * - Logo upload (accepts PNG/SVG/JPEG, max 512KB)
 * - Favicon upload (accepts ICO/PNG/SVG, max 64KB)
 * - Primary color selection via ColorPicker
 * - Company name override
 * - Custom CSS editor (textarea)
 * - Live preview panel showing how branding will appear
 *
 * Used in the OrganizationDetail branding tab.
 */

import { useState, useCallback, useRef, type ChangeEvent } from 'react';
import {
  makeStyles,
  tokens,
  Card,
  Text,
  Input,
  Label,
  Textarea,
  Button,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import {
  ImageRegular,
  ArrowUploadRegular,
  DeleteRegular,
} from '@fluentui/react-icons';
import { ColorPicker } from './ColorPicker';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  columns: {
    display: 'grid',
    gridTemplateColumns: '1fr 1fr',
    gap: tokens.spacingHorizontalXL,
    '@media (max-width: 768px)': {
      gridTemplateColumns: '1fr',
    },
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  sectionTitle: {
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
    paddingBottom: tokens.spacingVerticalXS,
  },
  uploadArea: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalM,
    border: `1px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    minHeight: '80px',
  },
  uploadPreview: {
    width: '64px',
    height: '64px',
    objectFit: 'contain',
    borderRadius: tokens.borderRadiusMedium,
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  uploadActions: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  uploadHint: {
    color: tokens.colorNeutralForeground3,
  },
  cssTextarea: {
    fontFamily: 'monospace',
    minHeight: '120px',
  },
  /** Live preview panel */
  preview: {
    padding: tokens.spacingHorizontalL,
    border: `1px solid ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    minHeight: '200px',
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
  },
  previewHeader: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    paddingBottom: tokens.spacingVerticalS,
    borderBottom: `2px solid`,
  },
  previewLogo: {
    width: '40px',
    height: '40px',
    objectFit: 'contain',
  },
  previewPlaceholder: {
    width: '40px',
    height: '40px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    color: tokens.colorNeutralForeground3,
  },
  previewButton: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderRadius: tokens.borderRadiusMedium,
    border: 'none',
    color: '#ffffff',
    fontWeight: tokens.fontWeightSemibold,
    cursor: 'default',
  },
  /** Hidden file input for upload trigger */
  hiddenInput: {
    display: 'none',
  },
});

/** Branding data managed by this component */
export interface BrandingData {
  /** Logo image as a data URL (base64) or existing URL, null if not set */
  logoUrl: string | null;
  /** Favicon image as a data URL (base64) or existing URL, null if not set */
  faviconUrl: string | null;
  /** Primary brand color in hex format */
  primaryColor: string | null;
  /** Company name override */
  companyName: string | null;
  /** Custom CSS string */
  customCss: string | null;
}

/** Props for the BrandingEditor component */
export interface BrandingEditorProps {
  /** Current branding data */
  value: BrandingData;
  /** Callback when any branding field changes */
  onChange: (data: BrandingData) => void;
  /** Whether the editor is disabled (read-only) */
  disabled?: boolean;
}

/** Max file sizes for uploads */
const MAX_LOGO_SIZE = 512 * 1024; // 512KB
const MAX_FAVICON_SIZE = 64 * 1024; // 64KB

/** Accepted file types */
const LOGO_ACCEPT = 'image/png,image/svg+xml,image/jpeg';
const FAVICON_ACCEPT = 'image/x-icon,image/png,image/svg+xml';

/**
 * Comprehensive branding editor for organization customization.
 * Manages logo/favicon uploads, color, company name, and custom CSS
 * with a side-by-side live preview.
 */
export function BrandingEditor({
  value,
  onChange,
  disabled = false,
}: BrandingEditorProps) {
  const styles = useStyles();
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Refs for hidden file inputs
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);

  /** Update a single field in the branding data */
  const updateField = useCallback(
    <K extends keyof BrandingData>(field: K, fieldValue: BrandingData[K]) => {
      onChange({ ...value, [field]: fieldValue });
    },
    [value, onChange],
  );

  /**
   * Handle file upload for logo or favicon.
   * Reads the file as a data URL and validates size limits.
   */
  const handleFileUpload = useCallback(
    (
      event: ChangeEvent<HTMLInputElement>,
      field: 'logoUrl' | 'faviconUrl',
      maxSize: number,
    ) => {
      setUploadError(null);
      const file = event.target.files?.[0];
      if (!file) return;

      // Validate file size
      if (file.size > maxSize) {
        const maxKB = Math.round(maxSize / 1024);
        setUploadError(`File too large. Maximum size is ${maxKB}KB.`);
        return;
      }

      // Read file as data URL for preview and storage
      const reader = new FileReader();
      reader.onload = () => {
        updateField(field, reader.result as string);
      };
      reader.readAsDataURL(file);

      // Reset the input so the same file can be re-selected
      event.target.value = '';
    },
    [updateField],
  );

  // Derive preview color — fall back to a neutral brand color
  const previewColor = value.primaryColor || tokens.colorBrandBackground;

  return (
    <div className={styles.root}>
      {/* Upload error message */}
      {uploadError && (
        <MessageBar intent="error">
          <MessageBarBody>{uploadError}</MessageBarBody>
        </MessageBar>
      )}

      <div className={styles.columns}>
        {/* Left column: form fields */}
        <div className={styles.section}>
          <Text size={400} weight="semibold" className={styles.sectionTitle}>
            Branding Settings
          </Text>

          {/* Logo upload */}
          <Label weight="semibold">Logo</Label>
          <div className={styles.uploadArea}>
            {value.logoUrl ? (
              <img
                src={value.logoUrl}
                alt="Organization logo"
                className={styles.uploadPreview}
              />
            ) : (
              <div className={styles.previewPlaceholder}>
                <ImageRegular fontSize={24} />
              </div>
            )}
            <div className={styles.uploadActions}>
              <Button
                appearance="secondary"
                icon={<ArrowUploadRegular />}
                size="small"
                onClick={() => logoInputRef.current?.click()}
                disabled={disabled}
              >
                Upload Logo
              </Button>
              {value.logoUrl && !disabled && (
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  size="small"
                  onClick={() => updateField('logoUrl', null)}
                >
                  Remove
                </Button>
              )}
              <Text size={100} className={styles.uploadHint}>
                PNG, SVG, or JPEG. Max 512KB.
              </Text>
            </div>
            <input
              ref={logoInputRef}
              type="file"
              accept={LOGO_ACCEPT}
              className={styles.hiddenInput}
              onChange={(e) => handleFileUpload(e, 'logoUrl', MAX_LOGO_SIZE)}
            />
          </div>

          {/* Favicon upload */}
          <Label weight="semibold">Favicon</Label>
          <div className={styles.uploadArea}>
            {value.faviconUrl ? (
              <img
                src={value.faviconUrl}
                alt="Organization favicon"
                className={styles.uploadPreview}
                style={{ width: '32px', height: '32px' }}
              />
            ) : (
              <div className={styles.previewPlaceholder} style={{ width: '32px', height: '32px' }}>
                <ImageRegular fontSize={16} />
              </div>
            )}
            <div className={styles.uploadActions}>
              <Button
                appearance="secondary"
                icon={<ArrowUploadRegular />}
                size="small"
                onClick={() => faviconInputRef.current?.click()}
                disabled={disabled}
              >
                Upload Favicon
              </Button>
              {value.faviconUrl && !disabled && (
                <Button
                  appearance="subtle"
                  icon={<DeleteRegular />}
                  size="small"
                  onClick={() => updateField('faviconUrl', null)}
                >
                  Remove
                </Button>
              )}
              <Text size={100} className={styles.uploadHint}>
                ICO, PNG, or SVG. Max 64KB.
              </Text>
            </div>
            <input
              ref={faviconInputRef}
              type="file"
              accept={FAVICON_ACCEPT}
              className={styles.hiddenInput}
              onChange={(e) => handleFileUpload(e, 'faviconUrl', MAX_FAVICON_SIZE)}
            />
          </div>

          {/* Primary color */}
          <ColorPicker
            label="Primary Color"
            value={value.primaryColor}
            onChange={(color) => updateField('primaryColor', color)}
            disabled={disabled}
          />

          {/* Company name */}
          <div>
            <Label weight="semibold">Company Name</Label>
            <Input
              value={value.companyName ?? ''}
              onChange={(_ev, data) =>
                updateField('companyName', data.value || null)
              }
              placeholder="Company name (shown in login page)"
              disabled={disabled}
            />
          </div>

          {/* Custom CSS */}
          <div>
            <Label weight="semibold">Custom CSS</Label>
            <Textarea
              className={styles.cssTextarea}
              value={value.customCss ?? ''}
              onChange={(_ev, data) =>
                updateField('customCss', data.value || null)
              }
              placeholder="/* Custom CSS for the login page */&#10;.login-container { }&#10;.login-button { }"
              disabled={disabled}
              resize="vertical"
            />
            <Text size={100} className={styles.uploadHint}>
              CSS is applied to the login/interaction pages only.
            </Text>
          </div>
        </div>

        {/* Right column: live preview */}
        <div className={styles.section}>
          <Text size={400} weight="semibold" className={styles.sectionTitle}>
            Preview
          </Text>
          <Card className={styles.preview}>
            {/* Simulated login page header */}
            <div
              className={styles.previewHeader}
              style={{ borderBottomColor: previewColor }}
            >
              {value.logoUrl ? (
                <img
                  src={value.logoUrl}
                  alt="Preview logo"
                  className={styles.previewLogo}
                />
              ) : (
                <div className={styles.previewPlaceholder}>
                  <ImageRegular fontSize={20} />
                </div>
              )}
              <Text size={400} weight="semibold">
                {value.companyName || 'Your Company'}
              </Text>
            </div>

            {/* Simulated login form elements */}
            <Text size={300}>Sign in to your account</Text>
            <Input placeholder="Email address" disabled />
            <div
              className={styles.previewButton}
              style={{ backgroundColor: previewColor }}
            >
              Sign In
            </div>
          </Card>

          <Text size={200} className={styles.uploadHint}>
            This is an approximate preview. Actual rendering may vary
            depending on the template and custom CSS.
          </Text>
        </div>
      </div>
    </div>
  );
}
