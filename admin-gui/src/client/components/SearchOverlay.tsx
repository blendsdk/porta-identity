/**
 * Search overlay component.
 * Full-screen overlay with search input and grouped results.
 * Opens via Cmd+K shortcut from the TopBar.
 */

import { useState, useCallback } from 'react';
import {
  makeStyles,
  tokens,
  Input,
  Text,
  Title3,
} from '@fluentui/react-components';
import { SearchRegular, DismissRegular } from '@fluentui/react-icons';
import { useKeyboardShortcut } from '../hooks/useKeyboardShortcut';

const useStyles = makeStyles({
  backdrop: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
    display: 'flex',
    justifyContent: 'center',
    paddingTop: '120px',
    zIndex: 1000,
  },
  panel: {
    width: '560px',
    maxHeight: '480px',
    backgroundColor: tokens.colorNeutralBackground1,
    borderRadius: tokens.borderRadiusXLarge,
    boxShadow: tokens.shadow64,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  searchBox: {
    padding: tokens.spacingHorizontalL,
    borderBottom: `1px solid ${tokens.colorNeutralStroke2}`,
  },
  results: {
    flex: 1,
    overflowY: 'auto',
    padding: tokens.spacingHorizontalM,
  },
  empty: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: tokens.spacingVerticalXXL,
    gap: tokens.spacingVerticalS,
    color: tokens.colorNeutralForeground3,
  },
  footer: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalL}`,
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`,
    display: 'flex',
    justifyContent: 'space-between',
    color: tokens.colorNeutralForeground3,
  },
});

/** Props for the SearchOverlay component */
export interface SearchOverlayProps {
  /** Whether the overlay is open */
  open: boolean;
  /** Callback to close the overlay */
  onDismiss: () => void;
}

/**
 * Global search overlay.
 * Provides a search input with grouped results (organizations, users, etc.).
 * Results will be connected to the API in a future phase.
 */
export function SearchOverlay({ open, onDismiss }: SearchOverlayProps) {
  const styles = useStyles();
  const [query, setQuery] = useState('');

  // Close on Escape
  useKeyboardShortcut('escape', onDismiss, { enabled: open });

  /** Handle backdrop click to close */
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onDismiss();
      }
    },
    [onDismiss],
  );

  if (!open) return null;

  return (
    <div className={styles.backdrop} onClick={handleBackdropClick}>
      <div className={styles.panel} role="dialog" aria-label="Search">
        {/* Search input */}
        <div className={styles.searchBox}>
          <Input
            contentBefore={<SearchRegular />}
            contentAfter={
              <button
                type="button"
                onClick={onDismiss}
                style={{ border: 'none', background: 'none', cursor: 'pointer', display: 'flex' }}
                aria-label="Close search"
              >
                <DismissRegular />
              </button>
            }
            placeholder="Search organizations, users, clients..."
            value={query}
            onChange={(_e, data) => setQuery(data.value)}
            autoFocus
            size="large"
          />
        </div>

        {/* Results area — placeholder for now */}
        <div className={styles.results}>
          {query.trim() === '' ? (
            <div className={styles.empty}>
              <Title3>Search Porta</Title3>
              <Text>Type to search across all entities</Text>
            </div>
          ) : (
            <div className={styles.empty}>
              <Text>Search results will be available after API hooks are connected.</Text>
            </div>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className={styles.footer}>
          <Text size={100}>↵ to select</Text>
          <Text size={100}>esc to close</Text>
        </div>
      </div>
    </div>
  );
}
