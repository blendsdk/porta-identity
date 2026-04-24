/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { AuditTimeline, type TimelineEntry } from '../../src/client/components/AuditTimeline';

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

const entries: TimelineEntry[] = [
  { id: '1', action: 'Organization created', actor: 'admin@test.com', timestamp: '2024-01-15 10:30' },
  { id: '2', action: 'User invited', actor: 'admin@test.com', timestamp: '2024-01-15 11:00', details: 'user@example.com' },
];

describe('AuditTimeline', () => {
  it('should render entries with action, actor, and timestamp', () => {
    renderWithProvider(<AuditTimeline entries={entries} />);
    expect(screen.getByText('Organization created')).toBeDefined();
    expect(screen.getByText(/admin@test.com · 2024-01-15 10:30/)).toBeDefined();
  });

  it('should show details when provided', () => {
    renderWithProvider(<AuditTimeline entries={entries} />);
    expect(screen.getByText('user@example.com')).toBeDefined();
  });

  it('should show default empty message when no entries', () => {
    renderWithProvider(<AuditTimeline entries={[]} />);
    expect(screen.getByText('No history available')).toBeDefined();
  });

  it('should show custom empty message', () => {
    renderWithProvider(<AuditTimeline entries={[]} emptyMessage="Nothing here" />);
    expect(screen.getByText('Nothing here')).toBeDefined();
  });
});
