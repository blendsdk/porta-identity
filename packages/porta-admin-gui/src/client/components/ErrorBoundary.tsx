/**
 * Error boundary component.
 *
 * Catches unhandled React rendering errors anywhere in its subtree and
 * displays a friendly fallback UI with a retry button, preventing the
 * entire app from crashing due to a single component error.
 *
 * ## Why this is a class component
 *
 * React's error boundary API is **only available through class component
 * lifecycle methods** — specifically `getDerivedStateFromError()` and
 * `componentDidCatch()`. There is no hook equivalent (`useErrorBoundary`
 * does not exist in React). This is the only class component in the
 * admin GUI codebase and **must remain a class**. Do not refactor to a
 * function component.
 *
 * To keep the class surface minimal, the actual fallback **UI** is rendered
 * by the `ErrorFallback` function component (which can use hooks like
 * `useStyles()`), while the class only handles the error-catching lifecycle.
 *
 * **When to use:** Wrap any subtree where an unhandled rendering error
 * should not crash the entire app. Typically placed at the app root and
 * optionally around high-risk sections (e.g. third-party integrations).
 *
 * **Provider requirement:** The default fallback UI requires `FluentProvider`
 * in the tree above the boundary. If you pass a custom `fallback` prop,
 * that constraint does not apply.
 *
 * @example
 * ```tsx
 * import { ErrorBoundary } from '../components/ErrorBoundary';
 *
 * // Basic usage — wraps children, shows default retry UI on error
 * <ErrorBoundary>
 *   <DashboardPage />
 * </ErrorBoundary>
 *
 * // Custom fallback UI
 * <ErrorBoundary fallback={<div>Something broke. Please refresh.</div>}>
 *   <SettingsPage />
 * </ErrorBoundary>
 * ```
 *
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 * @module ErrorBoundary
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
 *
 * **This must be a class component** — React only exposes error boundary
 * lifecycle methods (`getDerivedStateFromError`, `componentDidCatch`) on
 * class components. There is no hook equivalent in React.
 *
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
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
