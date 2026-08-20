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
