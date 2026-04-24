/**
 * Wizard stepper component.
 * Multi-step form wizard with step indicators, back/next navigation,
 * and completion state tracking.
 */

import { makeStyles, tokens, Text, Button, mergeClasses } from '@fluentui/react-components';
import { CheckmarkRegular } from '@fluentui/react-icons';
import type { ReactNode } from 'react';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalL,
  },
  steps: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  step: {
    display: 'flex',
    alignItems: 'center',
    gap: tokens.spacingHorizontalXS,
  },
  stepCircle: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    fontSize: tokens.fontSizeBase200,
    fontWeight: tokens.fontWeightSemibold,
    flexShrink: 0,
  },
  stepCircleActive: {
    backgroundColor: tokens.colorBrandBackground,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepCircleCompleted: {
    backgroundColor: tokens.colorPaletteGreenBackground3,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  stepCircleInactive: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  stepLabel: {
    whiteSpace: 'nowrap',
  },
  connector: {
    flex: 1,
    height: '2px',
    backgroundColor: tokens.colorNeutralStroke2,
    minWidth: '20px',
  },
  connectorCompleted: {
    backgroundColor: tokens.colorPaletteGreenBackground3,
  },
  content: {
    minHeight: '200px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'space-between',
    paddingTop: tokens.spacingVerticalM,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
  },
});

/** Step definition */
export interface WizardStep {
  /** Unique step key */
  key: string;
  /** Step label shown in the indicator */
  label: string;
  /** Step content (rendered when active) */
  content: ReactNode;
  /** Whether this step is valid/complete (enables "Next") */
  isValid?: boolean;
}

/** Props for the WizardStepper component */
export interface WizardStepperProps {
  /** Step definitions */
  steps: WizardStep[];
  /** Current active step index (0-based) */
  activeStep: number;
  /** Callback when step changes */
  onStepChange: (step: number) => void;
  /** Callback when the wizard is completed (last step "Next") */
  onComplete?: () => void;
  /** Label for the final step button (default: "Complete") */
  completeLabel?: string;
}

/**
 * Multi-step wizard with progress indicators and navigation.
 */
export function WizardStepper({
  steps,
  activeStep,
  onStepChange,
  onComplete,
  completeLabel = 'Complete',
}: WizardStepperProps) {
  const styles = useStyles();

  const isLastStep = activeStep >= steps.length - 1;
  const currentStep = steps[activeStep];
  const canProceed = currentStep?.isValid !== false;

  return (
    <div className={styles.root}>
      {/* Step indicators */}
      <div className={styles.steps}>
        {steps.map((step, index) => {
          const isActive = index === activeStep;
          const isCompleted = index < activeStep;

          return (
            <span key={step.key} className={styles.step} style={{ display: 'contents' }}>
              {index > 0 && (
                <div
                  className={mergeClasses(
                    styles.connector,
                    isCompleted && styles.connectorCompleted,
                  )}
                />
              )}
              <span
                className={mergeClasses(
                  styles.stepCircle,
                  isActive && styles.stepCircleActive,
                  isCompleted && styles.stepCircleCompleted,
                  !isActive && !isCompleted && styles.stepCircleInactive,
                )}
              >
                {isCompleted ? <CheckmarkRegular /> : index + 1}
              </span>
              <Text
                size={200}
                weight={isActive ? 'semibold' : 'regular'}
                className={styles.stepLabel}
              >
                {step.label}
              </Text>
            </span>
          );
        })}
      </div>

      {/* Step content */}
      <div className={styles.content}>
        {currentStep?.content}
      </div>

      {/* Navigation buttons */}
      <div className={styles.actions}>
        <Button
          appearance="secondary"
          disabled={activeStep === 0}
          onClick={() => onStepChange(activeStep - 1)}
        >
          Back
        </Button>
        {isLastStep ? (
          <Button
            appearance="primary"
            disabled={!canProceed}
            onClick={onComplete}
          >
            {completeLabel}
          </Button>
        ) : (
          <Button
            appearance="primary"
            disabled={!canProceed}
            onClick={() => onStepChange(activeStep + 1)}
          >
            Next
          </Button>
        )}
      </div>
    </div>
  );
}
