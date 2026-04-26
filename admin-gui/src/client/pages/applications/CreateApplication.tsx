/**
 * Create application page.
 * Full-page form for creating a new application with:
 * - Name (required, auto-generates slug)
 * - Slug (optional override)
 * - Organization (required dropdown)
 * - Description (optional textarea)
 * - Client-side validation
 * - Success → navigate to new application detail page
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
  Textarea,
  MessageBar,
  MessageBarBody,
} from '@fluentui/react-components';
import { ArrowLeftRegular, SaveRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useCreateApplication } from '../../api/applications';
import { useOrganizations } from '../../api/organizations';
import type { CreateApplicationRequest } from '../../types';

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

/**
 * Generate a URL-safe slug from a name string.
 * Converts to lowercase, replaces non-alphanumeric characters with hyphens,
 * trims leading/trailing hyphens, and limits length to 63 characters.
 */
function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 63);
}

/**
 * Create application form with organization selector, validation,
 * and auto-slug generation from the application name.
 */
export function CreateApplication() {
  const styles = useStyles();
  const navigate = useNavigate();
  const createApp = useCreateApplication();

  // Fetch active organizations for the dropdown
  const { data: orgsData } = useOrganizations({
    limit: 100,
    status: 'active',
    sortBy: 'name',
    sortOrder: 'asc',
  });
  const organizations = orgsData?.data ?? [];

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugManual, setSlugManual] = useState(false);
  const [organizationId, setOrganizationId] = useState('');
  const [description, setDescription] = useState('');
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
    if (!organizationId) {
      newErrors.organizationId = 'Organization is required';
    }

    setErrors(newErrors);
    if (Object.keys(newErrors).length > 0) return;

    // Build request
    const request: CreateApplicationRequest = {
      name: name.trim(),
      slug: slug || undefined,
      organizationId,
      description: description.trim() || undefined,
    };

    try {
      const created = await createApp.mutateAsync(request);
      navigate(`/applications/${created.id}`);
    } catch {
      // API errors are handled by React Query — mutation.error will be set
    }
  }, [name, slug, organizationId, description, createApp, navigate]);

  return (
    <div className={styles.root}>
      {/* Page header */}
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate('/applications')}
          aria-label="Back to applications"
        />
        <Text size={600} weight="semibold">
          Create Application
        </Text>
      </div>

      {/* API error */}
      {createApp.isError && (
        <MessageBar intent="error">
          <MessageBarBody>
            {(createApp.error as Error)?.message ?? 'Failed to create application'}
          </MessageBarBody>
        </MessageBar>
      )}

      {/* Form */}
      <Card className={styles.form}>
        {/* Organization */}
        <div className={styles.field}>
          <Label required weight="semibold">
            Organization
          </Label>
          <Dropdown
            placeholder="Select an organization"
            value={organizations.find((o) => o.id === organizationId)?.name ?? ''}
            onOptionSelect={(_ev, data) => setOrganizationId(data.optionValue ?? '')}
          >
            {organizations.map((org) => (
              <Option key={org.id} value={org.id}>
                {org.name}
              </Option>
            ))}
          </Dropdown>
          {errors.organizationId && (
            <Text size={200} className={styles.error}>
              {errors.organizationId}
            </Text>
          )}
        </div>

        {/* Name */}
        <div className={styles.field}>
          <Label required weight="semibold">
            Application Name
          </Label>
          <Input
            value={name}
            onChange={handleNameChange}
            placeholder="e.g. Customer Portal"
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
            URL-safe identifier used in API paths and RBAC scoping
          </Text>
        </div>

        {/* Description */}
        <div className={styles.field}>
          <Label weight="semibold">Description</Label>
          <Textarea
            value={description}
            onChange={(_ev, data) => setDescription(data.value)}
            placeholder="Brief description of the application (optional)"
            rows={3}
            resize="vertical"
          />
        </div>

        {/* Submit */}
        <div className={styles.actions}>
          <Button appearance="secondary" onClick={() => navigate('/applications')}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            icon={<SaveRegular />}
            onClick={handleSubmit}
            disabled={createApp.isPending}
          >
            {createApp.isPending ? 'Creating...' : 'Create Application'}
          </Button>
        </div>
      </Card>
    </div>
  );
}
