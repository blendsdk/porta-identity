/** Immutable state and closed user intents for the terminal portability workspace. */

import type {
  ExportManifestRequest,
  PortabilityApplyResult,
  PortabilityCategory,
  PortabilityEntityType,
  PortabilityPreviewResult,
  PortabilityResultError,
  PortabilityScope,
} from '@portaidentity/sdk';

/** Existing-record policies offered by the import tab after a successful preview. */
export type AdminPortabilityImportMode = 'keep-existing' | 'update-existing';

/** Application selection retained by the export tab. */
export type AdminPortabilityApplicationSelection =
  { readonly kind: 'all' } | { readonly kind: 'selected'; readonly slugs: readonly string[] };

/** Complete explicit export selection shown to the operator. */
export interface AdminPortabilityExportSelection {
  /** Selected organization or complete-environment scope, when available. */
  readonly scope?: PortabilityScope;
  /** Manifest sections selected for export. */
  readonly categories: readonly PortabilityCategory[];
  /** All eligible applications or an explicit slug collection. */
  readonly applications: AdminPortabilityApplicationSelection;
}

/** Safe local-file details shown by the import tab. */
export interface AdminPortabilityImportSelection {
  /** Final filename component displayed in the selectable read-only field. */
  readonly filename: string;
  /** Existing-record policy selected for a later apply. */
  readonly mode: AdminPortabilityImportMode;
}

/** Fixed operator feedback that cannot expose local paths or remote error details. */
export type AdminPortabilityFeedback =
  | 'Could not read the manifest file.'
  | 'The manifest file is too large.'
  | 'The selected file is not a valid manifest.'
  | 'Could not save the export file.'
  | 'Export is unavailable.'
  | 'Preview is unavailable.'
  | 'Apply is unavailable.';

/** Portability operations that may temporarily disable their owning controls. */
export type AdminPortabilityPendingOperation = 'choose-manifest' | 'export' | 'preview' | 'apply';

/** An applied result with one-time credentials removed before reusable view state. */
export type AdminPortabilityAppliedResult = Omit<PortabilityApplyResult, 'credentials'>;

/** Complete immutable state rendered by the portability workspace. */
export type AdminPortabilityWorkspaceState =
  | { readonly kind: 'closed' }
  | {
      readonly kind: 'ready';
      /** Current explicit export choices. */
      readonly exportSelection: AdminPortabilityExportSelection;
      /** Chosen import file and mode, when a valid local manifest is loaded. */
      readonly importSelection?: AdminPortabilityImportSelection;
      /** Most recent successful or rejected preview. */
      readonly preview?: PortabilityPreviewResult;
      /** Most recent committed counts without plaintext credentials. */
      readonly applied?: AdminPortabilityAppliedResult;
      /** Current locally owned asynchronous operation. */
      readonly pending?: AdminPortabilityPendingOperation;
      /** Fixed safe feedback for the most recent local or remote failure. */
      readonly feedback?: AdminPortabilityFeedback;
      /** Ordered rejected-record errors focused by the import result surface. */
      readonly errors?: readonly PortabilityResultError[];
      /** First dependency group that should receive focus after rejection. */
      readonly focusedEntity?: PortabilityEntityType;
    };

/** Closed set of actions emitted by the view and handled by its controller. */
export type AdminPortabilityIntent =
  | { readonly kind: 'set-export-scope'; readonly scope: PortabilityScope }
  | {
      readonly kind: 'set-export-category';
      readonly category: PortabilityCategory;
      readonly selected: boolean;
    }
  | { readonly kind: 'set-all-applications'; readonly selected: boolean }
  | { readonly kind: 'set-application'; readonly slug: string; readonly selected: boolean }
  | { readonly kind: 'export'; readonly request: ExportManifestRequest }
  | { readonly kind: 'choose-manifest' }
  | { readonly kind: 'set-import-mode'; readonly mode: AdminPortabilityImportMode }
  | { readonly kind: 'preview'; readonly mode?: AdminPortabilityImportMode }
  | { readonly kind: 'apply'; readonly mode?: AdminPortabilityImportMode }
  | { readonly kind: 'close' };
