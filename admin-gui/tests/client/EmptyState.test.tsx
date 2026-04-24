/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { EmptyState } from '../../src/client/components/EmptyState';

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

describe('EmptyState', () => {
  it('should render title', () => {
    renderWithProvider(<EmptyState title="No items" />);
    expect(screen.getByText('No items')).toBeDefined();
  });

  it('should render description when provided', () => {
    renderWithProvider(<EmptyState title="No items" description="Try creating one" />);
    expect(screen.getByText('Try creating one')).toBeDefined();
  });

  it('should not render description when not provided', () => {
    renderWithProvider(<EmptyState title="No items" />);
    expect(screen.queryByText('Try creating one')).toBeNull();
  });

  it('should render action button when actionLabel and onAction provided', () => {
    const onAction = vi.fn();
    renderWithProvider(
      <EmptyState title="No items" actionLabel="Create" onAction={onAction} />,
    );
    expect(screen.getByText('Create')).toBeDefined();
  });

  it('should call onAction when button clicked', async () => {
    const user = userEvent.setup();
    const onAction = vi.fn();
    renderWithProvider(
      <EmptyState title="No items" actionLabel="Create" onAction={onAction} />,
    );
    await user.click(screen.getByText('Create'));
    expect(onAction).toHaveBeenCalledOnce();
  });

  it('should not render action button when no onAction', () => {
    renderWithProvider(<EmptyState title="No items" actionLabel="Create" />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
