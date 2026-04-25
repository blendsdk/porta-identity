/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { userEvent } from '@testing-library/user-event';
import { FluentProvider, webLightTheme } from '@fluentui/react-components';

/* ------------------------------------------------------------------ */
/*  Mocks                                                              */
/* ------------------------------------------------------------------ */

vi.mock('react-router', () => ({
  useNavigate: () => vi.fn(),
  Link: ({ children, to }: { children: React.ReactNode; to: string }) => (
    <a href={to}>{children}</a>
  ),
}));

const mockExportMutate = vi.fn().mockResolvedValue(new Blob(['[]'], { type: 'application/json' }));
const mockImportMutate = vi.fn().mockResolvedValue({
  success: true,
  imported: 5,
  errors: [],
});

vi.mock('../../../src/client/api/import-export', () => ({
  useExportData: vi.fn(() => ({
    mutateAsync: mockExportMutate,
    mutate: mockExportMutate,
    isPending: false,
    isIdle: true,
    data: undefined,
  })),
  useImportData: vi.fn(() => ({
    mutateAsync: mockImportMutate,
    mutate: mockImportMutate,
    isPending: false,
    isIdle: true,
    data: undefined,
  })),
}));

vi.mock('../../../src/client/hooks/useToast', () => ({
  useToast: vi.fn(() => ({
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
    info: vi.fn(),
  })),
}));

import { ExportPage } from '../../../src/client/pages/import-export/ExportPage';
import { ImportPage } from '../../../src/client/pages/import-export/ImportPage';

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function renderWithProvider(ui: React.ReactElement) {
  return render(<FluentProvider theme={webLightTheme}>{ui}</FluentProvider>);
}

/* ------------------------------------------------------------------ */
/*  ExportPage Tests                                                   */
/* ------------------------------------------------------------------ */

describe('ExportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:mock-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should render the export title', () => {
    renderWithProvider(<ExportPage />);
    expect(screen.getByText('Export Data')).toBeDefined();
  });

  it('should render entity type checkboxes', () => {
    renderWithProvider(<ExportPage />);
    expect(screen.getByText(/organizations/i)).toBeDefined();
    expect(screen.getByText(/applications/i)).toBeDefined();
    expect(screen.getByText(/clients/i)).toBeDefined();
    expect(screen.getByText(/users/i)).toBeDefined();
  });

  it('should render select all toggle', () => {
    renderWithProvider(<ExportPage />);
    expect(screen.getByText(/select all/i) || screen.getByText(/all/i)).toBeDefined();
  });

  it('should render export action button', () => {
    renderWithProvider(<ExportPage />);
    // There should be at least one button in the page
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('should render checkboxes that can be toggled', async () => {
    const user = userEvent.setup();
    renderWithProvider(<ExportPage />);

    const orgCheckbox = screen.getByText(/organizations/i);
    await user.click(orgCheckbox);
    // Should not crash after clicking
    expect(screen.getByText(/organizations/i)).toBeDefined();
  });

  it('should render roles and permissions checkboxes', () => {
    renderWithProvider(<ExportPage />);
    expect(screen.getByText(/roles/i)).toBeDefined();
    expect(screen.getByText(/permissions/i)).toBeDefined();
  });
});

/* ------------------------------------------------------------------ */
/*  ImportPage Tests                                                   */
/* ------------------------------------------------------------------ */

describe('ImportPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render the import title', () => {
    renderWithProvider(<ImportPage />);
    expect(screen.getByText(/Import/i)).toBeDefined();
  });

  it('should render file upload area', () => {
    renderWithProvider(<ImportPage />);
    expect(
      screen.getByText(/drop/i) ||
        screen.getByText(/upload/i) ||
        screen.getByText(/browse/i) ||
        screen.getByText(/choose/i) ||
        screen.getByText(/select.*file/i),
    ).toBeDefined();
  });

  it('should render action buttons', () => {
    renderWithProvider(<ImportPage />);
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  });

  it('should render Import Data title', () => {
    renderWithProvider(<ImportPage />);
    expect(screen.getByText('Import Data')).toBeDefined();
  });

  it('should show instructions text', () => {
    renderWithProvider(<ImportPage />);
    expect(screen.getByText(/json/i)).toBeDefined();
  });
});
