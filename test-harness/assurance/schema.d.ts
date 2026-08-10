/** Minimal parser boundary shared by the assurance specification tests and runtime schemas. */
export interface AssuranceSchema {
  /** Parses and validates one unknown input value. */
  parse(input: unknown): unknown;
}

/** Validates assurance claim records. */
export const claimSchema: AssuranceSchema;

/** Validates assurance result records. */
export const resultSchema: AssuranceSchema;

/** Validates named assurance gaps. */
export const gapSchema: AssuranceSchema;

/** Validates curated-fault definitions. */
export const faultSchema: AssuranceSchema;

/** Validates complete actor, action, resource, trust, logging, and recovery profiles. */
export const sliceProfileSchema: AssuranceSchema;
