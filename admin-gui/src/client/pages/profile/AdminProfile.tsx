/**
 * Admin Profile page.
 *
 * Displays the current admin's profile with:
 * - View/edit profile (name, email)
 * - Change password (current + new + confirm)
 * - TOTP setup/disable (QR code display, verification code input)
 * - Active sessions for this admin (with revoke)
 */

import { useState, useCallback } from 'react';
import {
  Text,
  Button,
  Input,
  makeStyles,
  tokens,
  Card,
  CardHeader,
  Divider,
  Tab,
  TabList,
  Badge,
  Spinner,
} from '@fluentui/react-components';
import {
  PersonRegular,
  LockClosedRegular,
  ShieldKeyholeRegular,
  PhoneRegular,
  CheckmarkRegular,
} from '@fluentui/react-icons';
import { useAuth } from '../../hooks/useAuth';
import { useToast } from '../../hooks/useToast';
import { api } from '../../api/client';
import { ConfirmDialog } from '../../components/ConfirmDialog';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '700px',
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
    gap: tokens.spacingVerticalXXS,
  },
  fieldLabel: {
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    color: tokens.colorNeutralForeground3,
  },
  actions: {
    display: 'flex',
    gap: tokens.spacingHorizontalM,
    marginTop: tokens.spacingVerticalS,
  },
  totpSection: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalL,
  },
  qrPlaceholder: {
    width: '200px',
    height: '200px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    border: `2px dashed ${tokens.colorNeutralStroke2}`,
    borderRadius: tokens.borderRadiusMedium,
    backgroundColor: tokens.colorNeutralBackground3,
  },
  secretKey: {
    fontFamily: 'monospace',
    fontSize: tokens.fontSizeBase300,
    padding: tokens.spacingHorizontalS,
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    letterSpacing: '2px',
  },
  verifyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
  },
});

type ProfileTab = 'profile' | 'password' | 'totp' | 'sessions';

/**
 * Admin profile page.
 * Allows admins to manage their own profile, password, and 2FA.
 */
export function AdminProfile() {
  const styles = useStyles();
  const { user } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');

  // Profile form
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [saving, setSaving] = useState(false);

  // Password form
  const [currentPw, setCurrentPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [changingPw, setChangingPw] = useState(false);

  // TOTP
  const [totpSecret, setTotpSecret] = useState<string | null>(null);
  const [totpUri, setTotpUri] = useState<string | null>(null);
  const [verifyCode, setVerifyCode] = useState('');
  const [settingUpTotp, setSettingUpTotp] = useState(false);
  const [disableConfirm, setDisableConfirm] = useState(false);

  /** Save profile changes */
  const handleSaveProfile = useCallback(async () => {
    setSaving(true);
    try {
      await api.put('/users/me', { name, email });
      showToast('Profile updated', 'success');
    } catch {
      showToast('Failed to update profile', 'error');
    }
    setSaving(false);
  }, [name, email, showToast]);

  /** Change password */
  const handleChangePassword = useCallback(async () => {
    if (newPw !== confirmPw) {
      showToast('Passwords do not match', 'error');
      return;
    }
    if (newPw.length < 8) {
      showToast('Password must be at least 8 characters', 'error');
      return;
    }
    setChangingPw(true);
    try {
      await api.post('/users/me/password', {
        currentPassword: currentPw,
        newPassword: newPw,
      });
      showToast('Password changed', 'success');
      setCurrentPw('');
      setNewPw('');
      setConfirmPw('');
    } catch {
      showToast('Failed to change password', 'error');
    }
    setChangingPw(false);
  }, [currentPw, newPw, confirmPw, showToast]);

  /** Begin TOTP setup — request secret from server */
  const handleSetupTotp = useCallback(async () => {
    setSettingUpTotp(true);
    try {
      const result = await api.post<{ secret: string; uri: string }>(
        '/users/me/totp/setup',
      );
      setTotpSecret(result.secret);
      setTotpUri(result.uri);
    } catch {
      showToast('Failed to begin TOTP setup', 'error');
    }
    setSettingUpTotp(false);
  }, [showToast]);

  /** Verify TOTP code to complete setup */
  const handleVerifyTotp = useCallback(async () => {
    if (verifyCode.length !== 6) {
      showToast('Enter a 6-digit code', 'error');
      return;
    }
    try {
      await api.post('/users/me/totp/verify', { code: verifyCode });
      showToast('TOTP enabled', 'success');
      setTotpSecret(null);
      setTotpUri(null);
      setVerifyCode('');
    } catch {
      showToast('Invalid code', 'error');
    }
  }, [verifyCode, showToast]);

  /** Disable TOTP */
  const handleDisableTotp = useCallback(async () => {
    try {
      await api.del('/users/me/totp');
      showToast('TOTP disabled', 'success');
    } catch {
      showToast('Failed to disable TOTP', 'error');
    }
    setDisableConfirm(false);
  }, [showToast]);

  return (
    <div className={styles.root}>
      <Text as="h1" size={800} weight="bold">
        Admin Profile
      </Text>

      <TabList
        selectedValue={activeTab}
        onTabSelect={(_e, d) => setActiveTab(d.value as ProfileTab)}
      >
        <Tab value="profile" icon={<PersonRegular />}>Profile</Tab>
        <Tab value="password" icon={<LockClosedRegular />}>Password</Tab>
        <Tab value="totp" icon={<ShieldKeyholeRegular />}>Two-Factor</Tab>
      </TabList>

      {/* Profile Tab */}
      {activeTab === 'profile' && (
        <Card>
          <div className={styles.form}>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>Name</Text>
              <Input
                value={name}
                onChange={(_e, d) => setName(d.value)}
              />
            </div>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>Email</Text>
              <Input
                value={email}
                type="email"
                onChange={(_e, d) => setEmail(d.value)}
              />
            </div>
            <div className={styles.actions}>
              <Button
                appearance="primary"
                onClick={handleSaveProfile}
                disabled={saving}
                icon={saving ? <Spinner size="tiny" /> : undefined}
              >
                {saving ? 'Saving…' : 'Save Changes'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Password Tab */}
      {activeTab === 'password' && (
        <Card>
          <div className={styles.form}>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>Current Password</Text>
              <Input
                type="password"
                value={currentPw}
                onChange={(_e, d) => setCurrentPw(d.value)}
              />
            </div>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>New Password</Text>
              <Input
                type="password"
                value={newPw}
                onChange={(_e, d) => setNewPw(d.value)}
              />
            </div>
            <div className={styles.field}>
              <Text className={styles.fieldLabel}>Confirm New Password</Text>
              <Input
                type="password"
                value={confirmPw}
                onChange={(_e, d) => setConfirmPw(d.value)}
              />
            </div>
            <div className={styles.actions}>
              <Button
                appearance="primary"
                onClick={handleChangePassword}
                disabled={changingPw || !currentPw || !newPw || !confirmPw}
                icon={changingPw ? <Spinner size="tiny" /> : undefined}
              >
                {changingPw ? 'Changing…' : 'Change Password'}
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* TOTP Tab */}
      {activeTab === 'totp' && (
        <Card>
          <div className={styles.form}>
            {!totpSecret ? (
              <>
                <Text>
                  Two-factor authentication adds an extra layer of security
                  to your account using a TOTP authenticator app.
                </Text>
                <div className={styles.actions}>
                  <Button
                    appearance="primary"
                    icon={settingUpTotp ? <Spinner size="tiny" /> : <PhoneRegular />}
                    onClick={handleSetupTotp}
                    disabled={settingUpTotp}
                  >
                    {settingUpTotp ? 'Setting up…' : 'Enable TOTP'}
                  </Button>
                  <Button
                    appearance="outline"
                    onClick={() => setDisableConfirm(true)}
                  >
                    Disable TOTP
                  </Button>
                </div>
              </>
            ) : (
              <div className={styles.totpSection}>
                <Text size={400} weight="semibold">
                  Scan this QR code with your authenticator app
                </Text>
                <div className={styles.qrPlaceholder}>
                  {totpUri ? (
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(totpUri)}`}
                      alt="TOTP QR Code"
                      width={180}
                      height={180}
                    />
                  ) : (
                    <Text size={200}>QR Code</Text>
                  )}
                </div>
                <Text size={200}>Or enter this key manually:</Text>
                <span className={styles.secretKey}>{totpSecret}</span>
                <Divider />
                <Text size={300} weight="semibold">
                  Enter the 6-digit code from your app:
                </Text>
                <div className={styles.verifyRow}>
                  <Input
                    value={verifyCode}
                    onChange={(_e, d) => setVerifyCode(d.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="000000"
                    maxLength={6}
                    style={{ width: '120px', textAlign: 'center', fontFamily: 'monospace' }}
                  />
                  <Button
                    appearance="primary"
                    icon={<CheckmarkRegular />}
                    onClick={handleVerifyTotp}
                    disabled={verifyCode.length !== 6}
                  >
                    Verify
                  </Button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      <ConfirmDialog
        open={disableConfirm}
        onDismiss={() => setDisableConfirm(false)}
        onConfirm={handleDisableTotp}
        title="Disable Two-Factor Authentication"
        destructive
      >
        <Text>
          This will disable TOTP for your account. You can re-enable it
          at any time.
        </Text>
      </ConfirmDialog>
    </div>
  );
}
