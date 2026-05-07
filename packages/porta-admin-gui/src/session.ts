/**
 * In-memory session store for the standalone Admin GUI BFF.
 *
 * Sessions are stored in a Map keyed by session ID. A periodic sweep timer
 * runs every 5 minutes to delete expired sessions (prevents memory leaks
 * from abandoned sessions).
 *
 * Sessions are lost on BFF restart — acceptable for an occasional-use admin tool.
 *
 * @module session
 */

import { randomBytes } from 'node:crypto';

/** Session data stored in memory for each authenticated user. */
export interface SessionData {
  /** Unique session identifier. */
  id: string;
  /** OIDC access token (JWT). */
  accessToken: string;
  /** OIDC refresh token for token rotation. */
  refreshToken: string;
  /** OIDC ID token (used for logout `id_token_hint`). */
  idToken: string;
  /** Unix timestamp (ms) when the access token expires. */
  tokenExpiresAt: number;
  /** User identity claims from the ID token. */
  user: { sub: string; name: string; email: string };
  /** Unix timestamp (ms) when this session was created. */
  createdAt: number;
  /** Temporary: PKCE code verifier stored during auth flow. */
  pkceCodeVerifier?: string;
  /** Temporary: OIDC state parameter stored during auth flow. */
  state?: string;
}

/** Session max age in milliseconds (1 hour). */
const SESSION_MAX_AGE_MS = 60 * 60 * 1000;

/** Cleanup sweep interval in milliseconds (5 minutes). */
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/**
 * In-memory session store backed by a Map.
 * Provides create/get/delete operations and a periodic cleanup timer.
 */
export class SessionStore {
  /** Internal session storage keyed by session ID. */
  protected readonly sessions = new Map<string, SessionData>();

  /** Reference to the periodic cleanup timer (cleared on shutdown). */
  protected cleanupTimer: ReturnType<typeof setInterval> | null = null;

  /**
   * Generate a cryptographically random session ID.
   * Uses 32 bytes (256 bits) of entropy encoded as hex.
   */
  generateId(): string {
    return randomBytes(32).toString('hex');
  }

  /**
   * Create a new session with the given data.
   * Returns the session ID for cookie storage.
   *
   * @param data - Partial session data (id and createdAt are set automatically).
   * @returns The generated session ID.
   */
  create(data: Omit<SessionData, 'id' | 'createdAt'>): string {
    const id = this.generateId();
    const session: SessionData = {
      ...data,
      id,
      createdAt: Date.now(),
    };
    this.sessions.set(id, session);
    return id;
  }

  /**
   * Retrieve a session by ID.
   * Returns undefined if the session does not exist or has expired.
   *
   * @param id - Session ID from the cookie.
   */
  get(id: string): SessionData | undefined {
    const session = this.sessions.get(id);
    if (!session) return undefined;

    // Check expiry — delete stale sessions on access
    if (Date.now() - session.createdAt > SESSION_MAX_AGE_MS) {
      this.sessions.delete(id);
      return undefined;
    }

    return session;
  }

  /**
   * Delete a session by ID (used during logout).
   *
   * @param id - Session ID to remove.
   */
  delete(id: string): void {
    this.sessions.delete(id);
  }

  /** Return the number of active sessions. */
  get size(): number {
    return this.sessions.size;
  }

  /**
   * Start the periodic cleanup timer.
   * Sweeps the session map every 5 minutes and removes expired entries.
   * The timer is unref'd so it doesn't prevent Node.js from exiting.
   */
  startCleanup(): void {
    if (this.cleanupTimer) return; // Already running

    this.cleanupTimer = setInterval(() => {
      this.sweep();
    }, CLEANUP_INTERVAL_MS);

    // Unref the timer so it doesn't keep the process alive
    this.cleanupTimer.unref();
  }

  /**
   * Stop the periodic cleanup timer.
   * Called during graceful shutdown.
   */
  stopCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Sweep expired sessions from the store.
   * Called by the periodic timer and exposed for testing.
   */
  sweep(): number {
    const now = Date.now();
    let removed = 0;

    for (const [id, session] of this.sessions) {
      if (now - session.createdAt > SESSION_MAX_AGE_MS) {
        this.sessions.delete(id);
        removed++;
      }
    }

    return removed;
  }

  /**
   * Clear all sessions (used during shutdown).
   */
  clear(): void {
    this.sessions.clear();
  }
}
