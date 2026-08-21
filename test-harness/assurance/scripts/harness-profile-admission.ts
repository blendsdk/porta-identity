/**
 * Reports whether a harness invocation must execute the production-only security blocks.
 *
 * The dispatcher validates both values before calling this helper. Keeping this decision in a
 * small pure function makes it possible to prove that an operational browser run cannot be
 * mistaken for production-security evidence.
 *
 * @param project - Validated Playwright project name.
 * @param profile - Validated assurance runtime profile.
 * @returns `true` only for the production-security security project.
 */
export function shouldRunProductionSecurityBlocks(project: string, profile: string): boolean {
  return project === 'security' && profile === 'production-security';
}

/**
 * Reports whether later independent security blocks may run after production-exposure collection.
 *
 * Product failures are retained as non-successful evidence but are safe to continue past. An
 * incomplete result is safe only after the caller independently validates the exact registered
 * observer gap. Every other nonzero result remains terminal.
 *
 * @param exitCode - Stable assurance exit returned by the production-exposure collector.
 * @param knownIncompleteAdmitted - Whether the exact evidence-bound observer gap was admitted.
 * @returns `true` when continuing cannot hide an unexpected collector failure.
 */
export function shouldContinueAfterProductionExposure(
  exitCode: number,
  knownIncompleteAdmitted: boolean,
): boolean {
  return exitCode === 0 || exitCode === 20 || (exitCode === 40 && knownIncompleteAdmitted);
}
