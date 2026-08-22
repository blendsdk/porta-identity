declare module '@bcoe/v8-coverage' {
  import type { Profiler } from 'node:inspector';

  /** Minimal process record consumed by the pinned merger. */
  export interface ProcessCoverage {
    /** V8 scripts emitted by one process. */
    readonly result: readonly Profiler.ScriptCoverage[];
  }

  /** Merges compatible V8 process records into one normalized record. */
  export function mergeProcessCovs(processes: readonly ProcessCoverage[]): ProcessCoverage;
}
