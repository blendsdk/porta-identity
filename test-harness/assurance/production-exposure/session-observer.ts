/** Returns only active session identities created after the pre-login observation. */
export function createdSessionIds(
  before: ReadonlySet<string>,
  after: ReadonlySet<string>,
): readonly string[] {
  return Object.freeze([...after].filter((identity) => !before.has(identity)).sort());
}

/** Requires one correlated record, its public removal, and rejection of cookie replay. */
export function logoutInvalidatedCreatedSession(
  created: readonly string[],
  afterLogout: ReadonlySet<string>,
  cookieReuseRejected: boolean,
): boolean {
  return (
    created.length === 1 &&
    created.every((identity) => !afterLogout.has(identity)) &&
    cookieReuseRejected
  );
}
