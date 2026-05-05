/**
 * System configuration types for the Porta SDK.
 *
 * @module types/config
 */

export interface ConfigEntry {
  key: string;
  value: string;
  description: string | null;
  updatedAt: string;
}

export interface SetConfigInput {
  value: string;
}
