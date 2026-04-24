/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';
import { StatsCard } from '../../src/client/components/StatsCard';

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

describe('StatsCard', () => {
  it('should render title and value', () => {
    renderWithProvider(<StatsCard title="Total Users" value={142} />);
    expect(screen.getByText('Total Users')).toBeDefined();
    expect(screen.getByText('142')).toBeDefined();
  });

  it('should render string value', () => {
    renderWithProvider(<StatsCard title="Status" value="Active" />);
    expect(screen.getByText('Active')).toBeDefined();
  });

  it('should render positive trend', () => {
    renderWithProvider(<StatsCard title="Users" value={100} trend={12} />);
    expect(screen.getByText(/12%/)).toBeDefined();
  });

  it('should render negative trend', () => {
    renderWithProvider(<StatsCard title="Users" value={100} trend={-5} />);
    expect(screen.getByText(/5%/)).toBeDefined();
  });

  it('should render trend label', () => {
    renderWithProvider(<StatsCard title="Users" value={100} trend={8} trendLabel="vs last month" />);
    expect(screen.getByText(/vs last month/)).toBeDefined();
  });
});
