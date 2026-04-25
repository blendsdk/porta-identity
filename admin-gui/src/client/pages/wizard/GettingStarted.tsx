/**
 * Getting Started wizard page.
 *
 * Checklist-style page guiding admins through initial setup:
 * 1. Create first organization
 * 2. Create first application
 * 3. Register first client
 * 4. Invite first user
 * 5. Configure branding
 *
 * Progress tracked in localStorage, can be dismissed permanently.
 */

import { useState, useCallback, useEffect } from 'react';
import {
  Text,
  Button,
  makeStyles,
  tokens,
  Card,
  Badge,
  Checkbox,
} from '@fluentui/react-components';
import {
  RocketRegular,
  BuildingRegular,
  AppsRegular,
  KeyRegular,
  PersonAddRegular,
  PaintBrushRegular,
  CheckmarkCircleRegular,
  DismissRegular,
} from '@fluentui/react-icons';
import { useNavigate } from 'react-router';

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
    maxWidth: '700px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  progress: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalS,
    marginBottom: tokens.spacingVerticalM,
  },
  progressBar: {
    flex: 1,
    height: '8px',
    backgroundColor: tokens.colorNeutralBackground3,
    borderRadius: '4px',
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: tokens.colorBrandBackground,
    borderRadius: '4px',
    transition: 'width 0.3s ease',
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalM,
    padding: tokens.spacingHorizontalM,
    borderRadius: tokens.borderRadiusMedium,
    cursor: 'pointer',
    '&:hover': {
      backgroundColor: tokens.colorNeutralBackground1Hover,
    },
  },
  stepComplete: {
    opacity: 0.6,
  },
  stepIcon: {
    fontSize: '24px',
    flexShrink: 0,
  },
  stepContent: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXXS,
  },
  completeCard: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXL,
  },
});

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const STORAGE_KEY = 'porta-getting-started';
const DISMISSED_KEY = 'porta-getting-started-dismissed';

interface WizardStep {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  path: string;
}

const STEPS: WizardStep[] = [
  {
    id: 'create-org',
    title: 'Create your first organization',
    description: 'Organizations are tenants in Porta. Create one to get started.',
    icon: <BuildingRegular />,
    path: '/organizations/new',
  },
  {
    id: 'create-app',
    title: 'Create an application',
    description: 'Applications define scopes, roles, and permissions for your clients.',
    icon: <AppsRegular />,
    path: '/applications/new',
  },
  {
    id: 'register-client',
    title: 'Register a client',
    description: 'Clients are OIDC applications that authenticate via Porta.',
    icon: <KeyRegular />,
    path: '/clients/new',
  },
  {
    id: 'invite-user',
    title: 'Invite your first user',
    description: 'Invite a team member or test user to your organization.',
    icon: <PersonAddRegular />,
    path: '/users/invite',
  },
  {
    id: 'configure-branding',
    title: 'Configure branding',
    description: 'Customize the login page with your logo and colors.',
    icon: <PaintBrushRegular />,
    path: '/organizations',
  },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Read completed steps from localStorage */
function readProgress(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

/** Save completed steps to localStorage */
function saveProgress(completed: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  } catch {
    // Graceful degradation
  }
}

/** Check if wizard was permanently dismissed */
function isDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISSED_KEY) === 'true';
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Getting Started wizard page.
 * Tracks step completion in localStorage and links to relevant pages.
 */
export function GettingStarted() {
  const styles = useStyles();
  const navigate = useNavigate();

  const [completed, setCompleted] = useState<Set<string>>(readProgress);
  const [dismissed, setDismissed] = useState(isDismissed);

  const completedCount = completed.size;
  const totalSteps = STEPS.length;
  const allDone = completedCount === totalSteps;

  /** Toggle a step's completion state */
  const toggleStep = useCallback((stepId: string) => {
    setCompleted((prev) => {
      const next = new Set(prev);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      saveProgress(next);
      return next;
    });
  }, []);

  /** Dismiss the wizard permanently */
  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISSED_KEY, 'true');
    } catch {
      // Graceful degradation
    }
    setDismissed(true);
  }, []);

  if (dismissed) {
    return (
      <div className={styles.root}>
        <Text as="h1" size={800} weight="bold">
          Getting Started
        </Text>
        <Card className={styles.completeCard}>
          <CheckmarkCircleRegular style={{ fontSize: 48, color: tokens.colorPaletteGreenForeground1 }} />
          <Text size={500}>Wizard dismissed.</Text>
          <Button
            appearance="outline"
            onClick={() => {
              try { localStorage.removeItem(DISMISSED_KEY); } catch { /* noop */ }
              setDismissed(false);
            }}
          >
            Show Again
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <div>
          <Text as="h1" size={800} weight="bold">
            <RocketRegular /> Getting Started
          </Text>
        </div>
        <Button
          appearance="subtle"
          icon={<DismissRegular />}
          onClick={handleDismiss}
        >
          Dismiss
        </Button>
      </div>

      {/* Progress bar */}
      <div className={styles.progress}>
        <Text size={200}>
          {completedCount} / {totalSteps}
        </Text>
        <div className={styles.progressBar}>
          <div
            className={styles.progressFill}
            style={{ width: `${(completedCount / totalSteps) * 100}%` }}
          />
        </div>
      </div>

      {allDone && (
        <Card className={styles.completeCard}>
          <CheckmarkCircleRegular style={{ fontSize: 48, color: tokens.colorPaletteGreenForeground1 }} />
          <Text size={500} weight="semibold">
            All set! 🎉
          </Text>
          <Text>You&apos;ve completed all the getting started steps.</Text>
        </Card>
      )}

      {/* Step list */}
      <Card>
        {STEPS.map((step) => {
          const done = completed.has(step.id);
          return (
            <div
              key={step.id}
              className={`${styles.step} ${done ? styles.stepComplete : ''}`}
            >
              <Checkbox
                checked={done}
                onChange={() => toggleStep(step.id)}
              />
              <span className={styles.stepIcon}>{step.icon}</span>
              <div className={styles.stepContent}>
                <Text
                  size={400}
                  weight="semibold"
                  strikethrough={done}
                >
                  {step.title}
                </Text>
                <Text size={200}>{step.description}</Text>
              </div>
              {!done && (
                <Button
                  appearance="outline"
                  size="small"
                  onClick={() => navigate(step.path)}
                >
                  Go →
                </Button>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}
