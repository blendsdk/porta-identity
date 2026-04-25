/**
 * Create organization page.
 * Full-page form for creating a new organization with:
 * - Name (required, auto-generates slug)
 * - Slug (optional override)
 * - Default locale
 * - Default login methods
 * - Zod client-side validation
 * - Success → navigate to new org detail page
 */

import { useState, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Label,
  Card,
  Dropdown,
  Option,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { ArrowLeftRegular, SaveRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useCreateOrganization } from '../../api/organizations';
import { LoginMethodSelector } from '../../components/LoginMethodSelector';
import type { LoginMethod, CreateOrganizationRequest } from '../../types';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '640px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalL,
  },
  field: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: tokens.spacingHorizontalS,
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  error: {
    color: tokens.colorPaletteRedForeground1,
  },
});

/** Available locale options */
const LOCALE_OPTIONS = [
  { value: 'en', label: 'English (en)' },
  { value: 'nl', label: 'Dutch (nl)' },
  { value: 'de', label: 'German (de)' },
  { value: 'fr', label: 'French (fr)' },
];

/** Simple slug generation from name */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * Create organization form with validation and auto-slug generation.
 */
export function CreateOrganization() {
  const styles = useStyles();
  const navigate = useNavigate();
  const createOrg = useCreateOrganization();

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [locale, setLocale] = useState('en');
  const [loginMethods, setLoginMethods] = useState<LoginMethod[]>(['password', 'magic_link']);
  const [errors, setErrors] = useState<Record<string, string>>({});

  /** Auto-generate slug from name unless manually overridden */
  const handleNameChange = useCallback(
    (_ev: unknown, data: { value: string }) => {
      setName(data.value);
      if (!slugManual) {
        setSlug(generateSlug(data.value));
      }
    },
    [slugManual],
  );

  /** Handle manual slug changes */
  const handleSlugChange = useCallback((_ev: unknown, data: { value: string }) => {
    setSlug(data.value);
    setSlugManual(true);
  }, []);

  /** Validate and submit the form */
  const handleSubmit = useCallback(async () => {
    // Client-side validation
    const newErrors: Record<string, string> = {};
    if (!name.trim()) {
      newErrors.name = 'Name is required';
    } else if (name.trim().length < 2) {
      newErrors.name = 'Name must be at least 2 characters';
    }
    if (slug && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug)) {
      newErrors.slug = 'Slug must be lowercase alphanumeric with hyphens';
    }
    if (loginMethods.length === 0) {
      newErrors.loginMethods = 'At least one login method is required';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    // Build request
    const request: CreateOrganizationRequest = {
      name: name.trim(),
      slug: slug || undefined,
      defaultLocale: locale,
      defaultLoginMethods: loginMethods,
    };

    try {
      const created = await createOrg.mutateAsync(request);
      navigate(`/organizations/${created.id}`);
    } catch {
      // API errors are handled by React Query — mutation.error will be set
    }
  }, [name, slug, locale, loginMethods, createOrg, navigate]);

  return (
    <div className={styles.root}>
      {/* Page header */}
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate('/organizations')}
          aria-label="Back to organizations"
        />
        <Text size={600} weight="semibold">
          Create Organization
        </Text>
      </div>

      {/* API error */}
      {createOrg.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            {(createOrg.error as Error)?.message ?? 'Failed to create organization'}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Form */}
      <Card className={styles.form}>
        {/* Name */}
        <div className={styles.field}>
          <Label required weight="semibold">
            Organization Name
          </Label>
          <Input
            value={name}
            onChange={handleNameChange}
            placeholder="e.g. Acme Corporation"
            aria-required
          />
          {errors.name && (
            <Text size={200} className={styles.error}>
              {errors.name}
            </Text>
          )}
        </div>

        {/* Slug */}
        <div className={styles.field}>
          <Label weight="semibold">Slug</Label>
          <Input
            value={slug}
            onChange={handleSlugChange}
            placeholder="auto-generated from name"
            style={{ fontFamily: 'monospace' }}
          />
          {errors.slug && (
            <Text size={200} className={styles.error}>
              {errors.slug}
            </Text>
          )}
          <Text size={100} style={{ color: tokens.colorNeutralForeground3 }}>
            Used in OIDC URLs: /{slug || 'your-slug'}/.well-known/openid-configuration
          </Text>
        </div>

        {/* Default Locale */}
        <div className={styles.field}>
          <Label weight="semibold">Default Locale</Label>
          <Dropdown
            value={LOCALE_OPTIONS.find((o) => o.value === locale)?.label ?? 'English (en)'}
            onOptionSelect={(_ev, data) => setLocale(data.optionValue ?? 'en')}
          >
            {LOCALE_OPTIONS.map((opt) => (
              <Option key={opt.value} value={opt.value}>
                {opt.label}
              </Option>
            ))}
          </Dropdown>
        </div>

        {/* Login Methods */}
        <LoginMethodSelector
          value={loginMethods}
          onChange={(methods) => setLoginMethods(methods ?? ['password'])}
          mode="org"
        />
        {errors.loginMethods && (
          <Text size={200} className={styles.error}>
            {errors.loginMethods}
          </Text>
        )}

        {/* Submit */}
        <div className={styles.actions}>
          <Button appearance="secondary" onClick={() => navigate('/organizations')}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            onClick={handleSubmit}
            disabled={createOrg.isPending}
          >
            {createOrg.isPending ? 'Creating...' : 'Create Organization'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
