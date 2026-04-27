/**
 * Copy to clipboard hook.
 *
 * Provides a `copy(text)` function and reactive feedback state (`copied`, `error`).
 * After a successful copy, `copied` is `true` for a configurable duration
 * (default 2 seconds), then automatically resets. This enables "copy → show
 * checkmark → revert" UI patterns without manual timeout management.
 *
 * Uses the Clipboard API (`navigator.clipboard.writeText`). If the browser
 * blocks clipboard access, the `error` field contains the failure message.
 *
 * @example
 * ```tsx
 * import { useCopyToClipboard } from '../hooks/useCopyToClipboard';
 *
 * function SecretDisplay({ secret }: { secret: string }) {
 *   const { copy, copied, error } = useCopyToClipboard(3000); // 3s feedback
 *
 *   return (
 *     <div>
 *       <code>{secret}</code>
 *       <button onClick={() => copy(secret)}>
 *         {copied ? '✓ Copied' : 'Copy'}
 *       </button>
 *       {error && <span style={{ color: 'red' }}>{error}</span>}
 *     </div>
 *   );
 * }
 * ```
 *
 * @see {@link CopyButton} — a ready-made FluentUI button that wraps this hook
 * @module useCopyToClipboard
 */

import { useState, useCallback, useRef } from 'react';

/** Return type of the useCopyToClipboard hook */
export interface CopyToClipboardResult {
  /** Copy text to the clipboard */
  copy: (text: string) => Promise<void>;
  /** Whether the last copy was successful (resets after timeout) */
  copied: boolean;
  /** Error message if the last copy failed */
  error: string | null;
}

/**
 * Hook that provides clipboard copy functionality with feedback state.
 * The `copied` flag resets to `false` after the specified timeout.
 *
 * @param resetMs - Milliseconds before `copied` resets to false (default: 2000)
 * @returns Copy function and state
 */
export function useCopyToClipboard(resetMs = 2000): CopyToClipboardResult {
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const copy = useCallback(
    async (text: string) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      try {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setError(null);

        // Reset after timeout
        timeoutRef.current = setTimeout(() => {
          setCopied(false);
        }, resetMs);
      } catch (err) {
        setCopied(false);
        setError(err instanceof Error ? err.message : 'Failed to copy');
      }
    },
    [resetMs],
  );

  return { copy, copied, error };
}
