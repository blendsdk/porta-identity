/**
 * Match only the real Admin invitation POST, including the router's case/trailing-slash aliases.
 * This predicate is shared by parsing, authentication and transaction ownership so aliases cannot
 * select a different budget or accidentally bypass the outer audit transaction.
 */
export function isAdminInvitationRequest(method: string, path: string): boolean {
  return method === 'POST' && /^\/api\/admin\/organizations\/[^/]+\/users\/invite\/?$/i.test(path);
}
