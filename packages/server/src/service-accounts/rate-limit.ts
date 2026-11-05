import { checkRateLimitStrict } from '../auth/rate-limiter.js';

/** One budget per internal client, unchanged across targets, tokens and policy generations. */
export function buildServiceAccountInvitationRateLimitKey(clientId: string): string {
  return `ratelimit:service-account-invitation:${clientId}`;
}

/** Consume the existing strict Redis counter; callers preserve exhaustion versus outage responses. */
export async function limitServiceAccountInvitation(clientId: string) {
  return checkRateLimitStrict(buildServiceAccountInvitationRateLimitKey(clientId), {
    max: 30, windowSeconds: 3600,
  });
}
