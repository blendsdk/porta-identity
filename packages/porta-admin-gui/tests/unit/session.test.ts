/**
 * Unit tests for the in-memory session store.
 *
 * Tests: create, get, delete, expiry, cleanup timer, concurrent sessions.
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { SessionStore } from '../../src/session.js';

/** Helper to create valid session data (minus id and createdAt). */
function makeSessionData() {
  return {
    accessToken: 'access-token-123',
    refreshToken: 'refresh-token-456',
    idToken: 'id-token-789',
    tokenExpiresAt: Date.now() + 3600_000,
    user: { sub: 'user-1', name: 'Test User', email: 'test@example.com' },
  };
}

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore();
    vi.useFakeTimers();
  });

  afterEach(() => {
    store.stopCleanup();
    vi.useRealTimers();
  });

  // ---------- generateId ----------

  describe('generateId', () => {
    it('generates a 64-character hex string (32 bytes)', () => {
      const id = store.generateId();
      expect(id).toMatch(/^[0-9a-f]{64}$/);
    });

    it('generates unique IDs', () => {
      const ids = new Set(Array.from({ length: 100 }, () => store.generateId()));
      expect(ids.size).toBe(100);
    });
  });

  // ---------- create ----------

  describe('create', () => {
    it('returns a session ID string', () => {
      const id = store.create(makeSessionData());
      expect(typeof id).toBe('string');
      expect(id.length).toBe(64);
    });

    it('increments store size', () => {
      expect(store.size).toBe(0);
      store.create(makeSessionData());
      expect(store.size).toBe(1);
      store.create(makeSessionData());
      expect(store.size).toBe(2);
    });

    it('sets createdAt automatically', () => {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'));
      const id = store.create(makeSessionData());
      const session = store.get(id);
      expect(session?.createdAt).toBe(new Date('2026-01-01T00:00:00Z').getTime());
    });
  });

  // ---------- get ----------

  describe('get', () => {
    it('retrieves an existing session', () => {
      const data = makeSessionData();
      const id = store.create(data);
      const session = store.get(id);
      expect(session).toBeDefined();
      expect(session?.accessToken).toBe(data.accessToken);
      expect(session?.user.email).toBe(data.user.email);
    });

    it('returns undefined for non-existent session', () => {
      expect(store.get('nonexistent')).toBeUndefined();
    });

    it('returns undefined for expired session', () => {
      const id = store.create(makeSessionData());

      // Advance time past the 1-hour max age
      vi.advanceTimersByTime(61 * 60 * 1000);

      expect(store.get(id)).toBeUndefined();
    });

    it('deletes expired session on access', () => {
      const id = store.create(makeSessionData());
      expect(store.size).toBe(1);

      vi.advanceTimersByTime(61 * 60 * 1000);
      store.get(id); // Triggers lazy deletion

      expect(store.size).toBe(0);
    });

    it('returns session within max age', () => {
      const id = store.create(makeSessionData());

      // Advance just under 1 hour
      vi.advanceTimersByTime(59 * 60 * 1000);

      expect(store.get(id)).toBeDefined();
    });
  });

  // ---------- delete ----------

  describe('delete', () => {
    it('removes a session', () => {
      const id = store.create(makeSessionData());
      expect(store.size).toBe(1);

      store.delete(id);
      expect(store.size).toBe(0);
      expect(store.get(id)).toBeUndefined();
    });

    it('is safe to delete a non-existent session', () => {
      expect(() => store.delete('nonexistent')).not.toThrow();
    });
  });

  // ---------- sweep ----------

  describe('sweep', () => {
    it('removes expired sessions', () => {
      store.create(makeSessionData());
      store.create(makeSessionData());

      // Advance time past expiry
      vi.advanceTimersByTime(61 * 60 * 1000);

      const removed = store.sweep();
      expect(removed).toBe(2);
      expect(store.size).toBe(0);
    });

    it('keeps non-expired sessions', () => {
      store.create(makeSessionData());

      vi.advanceTimersByTime(30 * 60 * 1000); // 30 minutes — not expired

      const removed = store.sweep();
      expect(removed).toBe(0);
      expect(store.size).toBe(1);
    });

    it('handles mixed expired and active sessions', () => {
      store.create(makeSessionData()); // Created at t=0

      vi.advanceTimersByTime(50 * 60 * 1000); // t=50min
      store.create(makeSessionData()); // Created at t=50min

      vi.advanceTimersByTime(15 * 60 * 1000); // t=65min — first expired, second active

      const removed = store.sweep();
      expect(removed).toBe(1);
      expect(store.size).toBe(1);
    });
  });

  // ---------- cleanup timer ----------

  describe('cleanup timer', () => {
    it('runs sweep periodically', () => {
      store.create(makeSessionData());
      store.startCleanup();

      // Advance past session expiry + one cleanup interval
      vi.advanceTimersByTime(65 * 60 * 1000); // Session expires at 60min

      // Advance to next cleanup sweep (5min intervals)
      vi.advanceTimersByTime(5 * 60 * 1000);

      expect(store.size).toBe(0);
    });

    it('does not start multiple timers', () => {
      store.startCleanup();
      store.startCleanup(); // Should be idempotent
      store.stopCleanup(); // One stop should be enough
    });
  });

  // ---------- clear ----------

  describe('clear', () => {
    it('removes all sessions', () => {
      store.create(makeSessionData());
      store.create(makeSessionData());
      store.create(makeSessionData());
      expect(store.size).toBe(3);

      store.clear();
      expect(store.size).toBe(0);
    });
  });

  // ---------- PKCE/state fields ----------

  describe('temporary auth fields', () => {
    it('stores and retrieves pkceCodeVerifier', () => {
      const id = store.create({
        ...makeSessionData(),
        pkceCodeVerifier: 'verifier-abc',
        state: 'state-xyz',
      });

      const session = store.get(id);
      expect(session?.pkceCodeVerifier).toBe('verifier-abc');
      expect(session?.state).toBe('state-xyz');
    });
  });
});
