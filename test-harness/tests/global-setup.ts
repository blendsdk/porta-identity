/**
 * Playwright global setup — runs once before the test suite.
 * Flushes Redis rate limit keys to ensure clean state.
 */
import { execSync } from 'child_process';

export default async function globalSetup(): Promise<void> {
  try {
    // Flush all Redis rate limit keys to avoid accumulated limits from previous runs
    execSync(
      'docker exec test-harness-redis-1 redis-cli --no-auth-warning EVAL "local keys = redis.call(\'KEYS\', \'ratelimit:*\'); for i, k in ipairs(keys) do redis.call(\'DEL\', k) end; return #keys" 0',
      { stdio: 'pipe', timeout: 5000 },
    );
    console.log('[global-setup] Rate limit keys flushed');
  } catch {
    // If Redis isn't available or the command fails, continue anyway
    console.warn('[global-setup] Could not flush rate limit keys (non-fatal)');
  }

  try {
    // Also clear MailHog to start with a clean inbox
    await fetch('http://localhost:8025/api/v1/messages', { method: 'DELETE' });
    console.log('[global-setup] MailHog cleared');
  } catch {
    console.warn('[global-setup] Could not clear MailHog (non-fatal)');
  }
}
