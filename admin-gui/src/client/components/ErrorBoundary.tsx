/**
 * Error boundary component.
 * Catches unhandled React rendering errors and displays a fallback UI
 * with a retry button. Prevents the entire app from crashing.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';
import { makeStyles, tokens, Text, Title3, Button } from '@fluentui/react-components';
import { ErrorCircleRegular } from '@fluentui/react-icons';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingVerticalXXL,
    textAlign: 'center',
    minHeight: '300px',
  },
  icon: {
    fontSize: '48px',
    color: tokens.colorPaletteRedForeground1,
  },
  message: {
    color: tokens.colorNeutralForeground3,
    maxWidth: '500px',
  },
});

/** Fallback UI when an error is caught */
function ErrorFallback({ onRetry }: { onRetry: () => void }) {
  // Griffel hooks can only be used inside function components
  const styles = useStyles();

  return (
    <div className={styles.root}>
      <span className={styles.icon}>
        <ErrorCircleRegular />
      </span>
      <Title3>Something went wrong</Title3>
      <Text className={styles.message}>
        An unexpected error occurred. Please try again or refresh the page.
      </Text>
      <Button appearance="primary" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

/** Props for the ErrorBoundary component */
export interface ErrorBoundaryProps {
  /** Child components to wrap */
  children: ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
}

/** State for the ErrorBoundary component */
interface ErrorBoundaryState {
  hasError: boolean;
}

/**
 * React error boundary that catches rendering errors in its subtree.
 * Shows a friendly fallback UI with a retry button.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // Log to console in development — production logging would go to a service
    console.error('ErrorBoundary caught an error:', error, info.componentStack);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <ErrorFallback onRetry={this.handleRetry} />;
    }
    return this.props.children;
  }
}
