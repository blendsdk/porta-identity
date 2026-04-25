/**
 * Create user page.
 * Simple form for creating a new user within an organization.
 *
 * The form collects:
 * - Organization (required — users are org-scoped)
 * - Email address (required, validated)
 * - Given name + family name (optional)
 * - Account setup method:
 *   - "Set password now" → password + confirmation fields
 *   - "Send magic link" → user receives an email to set up their account
 *
 * On successful creation, navigates to the new user's detail page.
 * For invitations with roles/claims/message, use the Invite User wizard instead.
 */

import { useState, useCallback, useMemo } from 'react';
import {
  makeStyles,
  tokens,
  Text,
  Button,
  Input,
  Card,
  Dropdown,
  Option,
  Radio,
  RadioGroup,
  MessageBar,
  MessageBarBody,
  Field,
  Spinner,
} from '@fluentui/react-components';
import { ArrowLeftRegular } from '@fluentui/react-icons';
import { useNavigate } from 'react-router';
import { useCreateUser } from '../../api/users';
import { useOrganizations } from '../../api/organizations';
import type { Organization, CreateUserRequest } from '../../types';

/** Maximum orgs to load in the org dropdown */
const MAX_ORGS = 100;

/** Email validation pattern */
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Minimum password length per NIST SP 800-63B */
const MIN_PASSWORD_LENGTH = 8;

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    padding: tokens.spacingVerticalL,
    maxWidth: '640px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
  },
  title: {
    fontSize: tokens.fontSizeBase500,
    fontWeight: tokens.fontWeightSemibold,
  },
  form: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
  },
  nameRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
  },
  nameField: {
    flex: 1,
  },
  passwordSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    paddingLeft: tokens.spacingHorizontalL,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    justifyContent: 'flex-end',
    paddingTop: tokens.spacingVerticalM,
  },
});

/** Account setup method — set password directly or send magic link */
type SetupMethod = 'password' | 'magic_link';

/** Form field values */
interface FormState {
  orgId: string;
  email: string;
  givenName: string;
  familyName: string;
  setupMethod: SetupMethod;
  password: string;
  confirmPassword: string;
}

/** Per-field validation errors */
interface FormErrors {
  orgId?: string;
  email?: string;
  password?: string;
  confirmPassword?: string;
}

/** Initial form state */
const INITIAL_FORM: FormState = {
  orgId: '',
  email: '',
  givenName: '',
  familyName: '',
  setupMethod: 'password',
  password: '',
  confirmPassword: '',
};

/**
 * Create user page component.
 * Renders a form for creating a user in a selected organization.
 * Supports two setup methods: direct password or magic link email.
 */
export function CreateUser() {
  const navigate = useNavigate();
  const styles = useStyles();

  // --- Data fetching ---
  const { data: orgsData } = useOrganizations({ limit: MAX_ORGS });
  const organizations = useMemo(
    () => orgsData?.data ?? [],
    [orgsData],
  );

  const createUser = useCreateUser();

  // --- Form state ---
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitError, setSubmitError] = useState('');

  /**
   * Update a single form field and clear its validation error.
   * Also clears any previous submit error.
   */
  const updateField = useCallback(
    <K extends keyof FormState>(field: K, value: FormState[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
      setErrors((prev) => ({ ...prev, [field]: undefined }));
      setSubmitError('');
    },
    [],
  );

  /**
   * Validate all form fields.
   * Returns true if the form is valid, false otherwise.
   * Sets field-level error messages for invalid fields.
   */
  const validate = useCallback((): boolean => {
    const errs: FormErrors = {};

    if (!form.orgId) {
      errs.orgId = 'Organization is required';
    }

    if (!form.email.trim()) {
      errs.email = 'Email is required';
    } else if (!EMAIL_REGEX.test(form.email.trim())) {
      errs.email = 'Invalid email address';
    }

    if (form.setupMethod === 'password') {
      if (!form.password) {
        errs.password = 'Password is required';
      } else if (form.password.length < MIN_PASSWORD_LENGTH) {
        errs.password = `Password must be at least ${MIN_PASSWORD_LENGTH} characters`;
      }
      if (form.password !== form.confirmPassword) {
        errs.confirmPassword = 'Passwords do not match';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  }, [form]);

  /**
   * Submit the form to create a new user.
   * On success, navigates to the user detail page.
   */
  const handleSubmit = useCallback(async () => {
    if (!validate()) return;

    // Build the create payload matching CreateUserRequest
    const data: CreateUserRequest & { sendMagicLink?: boolean } = {
      email: form.email.trim(),
      organizationId: form.orgId,
      givenName: form.givenName.trim() || undefined,
      familyName: form.familyName.trim() || undefined,
    };

    if (form.setupMethod === 'password') {
      data.password = form.password;
    } else {
      // Signal to the backend to send a magic link after creation
      data.sendMagicLink = true;
    }

    try {
      const user = await createUser.mutateAsync({
        orgId: form.orgId,
        data,
      });
      navigate(`/users/${user.id}`);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to create user';
      setSubmitError(message);
    }
  }, [form, validate, createUser, navigate]);

  /** Display label for the currently selected organization */
  const selectedOrgLabel = useMemo(() => {
    const org = organizations.find((o: Organization) => o.id === form.orgId);
    return org?.name;
  }, [organizations, form.orgId]);

  return (
    <div className={styles.root}>
      {/* Header with back button */}
      <div className={styles.header}>
        <Button
          appearance="subtle"
          icon={<ArrowLeftRegular />}
          onClick={() => navigate('/users')}
          aria-label="Back to users"
        />
        <Text className={styles.title}>Create User</Text>
      </div>

      {/* Form card */}
      <Card className={styles.form}>
        {/* Submit error banner */}
        {submitError && (
          <MessageBar intent="error" data-testid="submit-error">
            <MessageBarBody>{submitError}</MessageBarBody>
          </MessageBar>
        )}

        {/* Organization selector */}
        <Field
          label="Organization"
          required
          validationMessage={errors.orgId}
          validationState={errors.orgId ? 'error' : undefined}
        >
          <Dropdown
            placeholder="Select organization…"
            value={selectedOrgLabel ?? ''}
            onOptionSelect={(_e, d) =>
              updateField('orgId', d.optionValue ?? '')
            }
            data-testid="org-select"
          >
            {organizations.map((org: Organization) => (
              <Option key={org.id} value={org.id}>
                {org.name}
              </Option>
            ))}
          </Dropdown>
        </Field>

        {/* Email */}
        <Field
          label="Email"
          required
          validationMessage={errors.email}
          validationState={errors.email ? 'error' : undefined}
        >
          <Input
            type="email"
            value={form.email}
            onChange={(_e, d) => updateField('email', d.value)}
            placeholder="user@example.com"
            data-testid="email-input"
          />
        </Field>

        {/* Name fields (optional) */}
        <div className={styles.nameRow}>
          <div className={styles.nameField}>
            <Field label="Given name">
              <Input
                value={form.givenName}
                onChange={(_e, d) => updateField('givenName', d.value)}
                placeholder="First name"
                data-testid="given-name-input"
              />
            </Field>
          </div>
          <div className={styles.nameField}>
            <Field label="Family name">
              <Input
                value={form.familyName}
                onChange={(_e, d) => updateField('familyName', d.value)}
                placeholder="Last name"
                data-testid="family-name-input"
              />
            </Field>
          </div>
        </div>

        {/* Setup method toggle */}
        <Field label="Account setup method">
          <RadioGroup
            value={form.setupMethod}
            onChange={(_e, d) =>
              updateField('setupMethod', d.value as SetupMethod)
            }
            data-testid="setup-method"
          >
            <Radio value="password" label="Set password now" />
            <Radio value="magic_link" label="Send magic link email" />
          </RadioGroup>
        </Field>

        {/* Password fields — only shown when setup method is "password" */}
        {form.setupMethod === 'password' && (
          <div className={styles.passwordSection}>
            <Field
              label="Password"
              required
              validationMessage={errors.password}
              validationState={errors.password ? 'error' : undefined}
            >
              <Input
                type="password"
                value={form.password}
                onChange={(_e, d) => updateField('password', d.value)}
                placeholder="Minimum 8 characters"
                data-testid="password-input"
              />
            </Field>
            <Field
              label="Confirm password"
              required
              validationMessage={errors.confirmPassword}
              validationState={errors.confirmPassword ? 'error' : undefined}
            >
              <Input
                type="password"
                value={form.confirmPassword}
                onChange={(_e, d) => updateField('confirmPassword', d.value)}
                placeholder="Re-enter password"
                data-testid="confirm-password-input"
              />
            </Field>
          </div>
        )}

        {/* Magic link info message */}
        {form.setupMethod === 'magic_link' && (
          <MessageBar intent="info" data-testid="magic-link-info">
            <MessageBarBody>
              A magic link will be sent to the user&apos;s email address. They
              can use it to set up their account and choose a password.
            </MessageBarBody>
          </MessageBar>
        )}

        {/* Form actions */}
        <div className={styles.actions}>
          <Button appearance="secondary" onClick={() => navigate('/users')}>
            Cancel
          </Button>
          <Button
            appearance="primary"
            onClick={handleSubmit}
            disabled={createUser.isPending}
            data-testid="submit-btn"
          >
            {createUser.isPending ? (
              <>
                <Spinner size="tiny" /> Creating…
              </>
            ) : (
              'Create User'
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
