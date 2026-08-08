/**
 * System configuration types for the Porta SDK.
 *
 * Matches the server config route response shape exactly.
 * Server returns valueType and isSensitive from the system_config table.
 *
 * @module types/config
 */

export interface ConfigEntry {
  /** Configuration key (e.g., "ttl.access_token") */
  key: string;
  /** Configuration value (masked with '***' for sensitive entries) */
  value: string;
  /** Value type (e.g., "number", "string", "boolean") */
  valueType: string;
  /** Human-readable description */
  description: string | null;
  /** Whether the value is sensitive (masked in GET responses) */
  isSensitive: boolean;
  /** Last update timestamp (ISO 8601) */
  updatedAt: string;
}

export interface SetConfigInput {
  value: string;
}
