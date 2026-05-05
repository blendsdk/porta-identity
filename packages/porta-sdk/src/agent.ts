/**
 * @porta/sdk/agent — AI Agent entrypoint.
 *
 * Provides tool definitions and executor for AI agent integration.
 * Placeholder — full implementation in Phase 7.
 *
 * @module @porta/sdk/agent
 */

import type { PortaClient } from './client.js';

// ---------------------------------------------------------------------------
// Tool Definition Types
// ---------------------------------------------------------------------------

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object';
  description: string;
  required: boolean;
  enum?: string[];
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: ToolParameter[];
  returns: string;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
}

// ---------------------------------------------------------------------------
// Placeholder exports
// ---------------------------------------------------------------------------

/**
 * Returns tool definitions for all Porta SDK operations.
 * AI agents can use these to understand available tools.
 */
export function getToolDefinitions(): ToolDefinition[] {
  // Phase 7 will populate this with all domain method definitions
  return [];
}

/**
 * Executes a tool by name with the given arguments against a PortaClient.
 */
export async function executeTool(
  client: PortaClient,
  toolName: string,
  args: Record<string, unknown>,
): Promise<ToolResult> {
  void client;
  void args;
  return {
    success: false,
    error: `Unknown tool: ${toolName}. Agent layer not yet implemented.`,
  };
}
