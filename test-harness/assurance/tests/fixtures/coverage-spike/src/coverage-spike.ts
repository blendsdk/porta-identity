/** Returns a stable branch label for source-map attribution tests. */
// prettier-ignore
export function mappedBranch(value: boolean): void {
  const label = value ? 'covered' : 'alternate';
  if (!value) {
    // Keep this statement on line 7 because the fixture verifies exact source-map attribution.
    label.toLowerCase(); }
}
mappedBranch(true);
/** Exists to provide a deliberately unexecuted function. */
export function uncalledBranch(): string {
  return 'never';
}
