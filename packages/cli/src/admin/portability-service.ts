/** Thin SDK operation adapter for terminal portability controllers. */

import type {
  ExportManifestRequest,
  ExportManifestResponse,
  ExportsDomain,
  ImportsDomain,
  PortabilityApplyResult,
  PortabilityManifest,
  PortabilityPreviewResult,
} from '@portaidentity/sdk';

import type { AdminPortabilityImportMode } from './portability-state.js';

/** UI-neutral portability calls owned by an authenticated administration session. */
export interface AdminPortabilityOperations {
  /** Exports one manifest without choosing or writing a local file. */
  readonly exportManifest: (
    request: ExportManifestRequest,
    signal?: AbortSignal,
  ) => Promise<ExportManifestResponse>;
  /** Builds one mutation-free import preview. */
  readonly preview: (
    manifest: PortabilityManifest,
    signal?: AbortSignal,
  ) => Promise<PortabilityPreviewResult>;
  /** Applies a previously previewed manifest exactly once. */
  readonly apply: (
    manifest: PortabilityManifest,
    mode: AdminPortabilityImportMode,
    signal?: AbortSignal,
  ) => Promise<PortabilityApplyResult>;
}

/** Throws the platform AbortError when local operation ownership has ended. */
function rejectReleasedOwnership(signal: AbortSignal | undefined): void {
  signal?.throwIfAborted();
}

/**
 * Creates direct portability operations over the existing SDK domains.
 *
 * The signal controls only whether this UI still owns a result. The SDK request may already have
 * reached Porta, so aborting locally never claims that a server-side apply was cancelled.
 *
 * @param exportsDomain - Returns the SDK manifest export operation for the verified session.
 * @param importsDomain - Returns the SDK preview and apply operations for the verified session.
 * @returns Three direct, non-retrying operations for the Admin UI controller.
 * @example
 * ```ts
 * const operations = createAdminPortabilityOperations(
 *   () => client.exports,
 *   () => client.imports,
 * );
 * ```
 */
export function createAdminPortabilityOperations(
  exportsDomain: () => Pick<ExportsDomain, 'manifest'>,
  importsDomain: () => Pick<ImportsDomain, 'preview' | 'apply'>,
): AdminPortabilityOperations {
  return {
    async exportManifest(request, signal) {
      rejectReleasedOwnership(signal);
      const response = await exportsDomain().manifest(request);
      rejectReleasedOwnership(signal);
      return response;
    },
    async preview(manifest, signal) {
      rejectReleasedOwnership(signal);
      const result = await importsDomain().preview(manifest);
      rejectReleasedOwnership(signal);
      if (result.mode !== 'dry-run') {
        throw new TypeError('Portability preview returned an unexpected result mode.');
      }
      return result;
    },
    async apply(manifest, mode, signal) {
      rejectReleasedOwnership(signal);
      const result = await importsDomain().apply(manifest, mode);
      rejectReleasedOwnership(signal);
      if (result.mode === 'dry-run') {
        throw new TypeError('Portability apply returned an unexpected result mode.');
      }
      return result;
    },
  };
}
