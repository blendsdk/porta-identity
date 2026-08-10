/** Complete contract for one root assurance command. */
export interface AssuranceCommandContract {
  /** Accepted selector syntax shown to callers. */
  selectorGrammar: string;
  /** Bounded execution timeout. */
  timeout: string;
  /** Run-relative directory for sanitized artifacts. */
  artifactSubdirectory: string;
  /** Preconditions checked before command work begins. */
  prerequisites: readonly string[];
  /** Interrupt and termination handling contract. */
  signalContract: string;
  /** Owned-resource cleanup and recovery contract. */
  cleanupContract: string;
  /** Ordered child commands for aggregate commands. */
  composition?: readonly string[];
}

/** Version of the machine-readable command contract. */
export const commandContractVersion: number;

/** Root alias definitions keyed by their package-script name. */
export const commandContracts: Readonly<Record<string, AssuranceCommandContract>>;

/** Stable process outcome names keyed by exit code. */
export const exitTaxonomy: Readonly<Record<number, string>>;

/** Highest-to-lowest failure precedence when outcomes overlap. */
export const exitPrecedence: readonly number[];
