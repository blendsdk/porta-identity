/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { StatusBadge, type EntityStatus } from '../../src/client/components/StatusBadge';

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

describe('StatusBadge', () => {
  const statuses: EntityStatus[] = [
    'active', 'suspended', 'archived', 'invited', 'pending',
    'locked', 'disabled', 'revoked', 'expired',
  ];

  it.each(statuses)('should render %s with capitalized label', (status) => {
    renderWithProvider(<StatusBadge status={status} />);
    const expected = status.charAt(0).toUpperCase() + status.slice(1);
    expect(screen.getByText(expected)).toBeDefined();
  });

  it('should fall back to raw status text for unknown status', () => {
    renderWithProvider(<StatusBadge status="custom-status" />);
    expect(screen.getByText('custom-status')).toBeDefined();
  });

  it('should accept custom size prop', () => {
    const { container } = renderWithProvider(<StatusBadge status="active" size="small" />);
    expect(container.firstChild).toBeDefined();
  });
});
