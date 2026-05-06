# SDK AI Agent Guide

The `@portaidentity/sdk/agent` entrypoint enables AI agents (LLMs with function-calling) to manage Porta infrastructure through structured tool definitions. This is designed for MCP servers, OpenAI function-calling, LangChain tools, and similar agent frameworks.

## Overview

The agent layer provides:

1. **Tool Definitions** — Structured descriptions of all SDK operations, compatible with LLM function-calling schemas
2. **Tool Executor** — A dispatcher that maps tool names to SDK method calls with parameter validation

```
┌──────────────┐     ┌──────────────┐     ┌──────────────┐
│  AI Agent    │────▶│  SDK Agent   │────▶│  SDK Client   │
│  (LLM)       │     │  Layer       │     │  (transport)   │
└──────────────┘     └──────────────┘     └──────────────┘
  function call      executeTool()       domain.method()
```

## Quick Start

```typescript
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createClientCredentialsAuth } from '@portaidentity/sdk/node';
import { getToolDefinitions, executeTool } from '@portaidentity/sdk/agent';

// 1. Create an authenticated client
const porta = createPortaClient({
  transport: createNodeTransport({
    baseUrl: 'https://porta.local:3443/api/admin',
    auth: createClientCredentialsAuth({
      tokenEndpoint: 'https://porta.local:3443/super-admin/oidc/token',
      clientId: process.env.PORTA_CLIENT_ID!,
      clientSecret: process.env.PORTA_CLIENT_SECRET!,
    }),
  }),
});

// 2. Get tool definitions for the AI model
const tools = getToolDefinitions();
// → 47 tool definitions with name, description, parameters, returns

// 3. Execute a tool from AI agent output
const result = await executeTool(porta, 'organizations.list', { pageSize: 10 });
```

## Tool Definitions

Each tool definition includes:

| Field | Type | Description |
|---|---|---|
| `name` | `string` | Unique tool name (e.g., `organizations.create`) |
| `description` | `string` | Human-readable description for the LLM |
| `parameters` | `ToolParameter[]` | Input parameters with types and descriptions |
| `returns` | `string` | Description of the return value |
| `sideEffects` | `boolean` | Whether the tool modifies state |
| `prerequisites` | `string[]` | What must exist before calling this tool |
| `relatedTools` | `string[]` | Tools commonly used together |

### Example Tool Definition

```typescript
{
  name: 'organizations.create',
  description: 'Create a new organization (tenant) in Porta',
  parameters: [
    { name: 'name', type: 'string', required: true, description: 'Organization display name' },
    { name: 'slug', type: 'string', required: false, description: 'URL-safe identifier (auto-generated if omitted)' },
    { name: 'defaultLocale', type: 'string', required: false, description: 'Default locale (e.g., "en")' },
  ],
  returns: 'Organization object with id, name, slug, status, timestamps',
  sideEffects: true,
  prerequisites: ['Authenticated as porta-admin'],
  relatedTools: ['applications.create', 'organizations.list'],
}
```

### Listing All Tools

```typescript
const tools = getToolDefinitions();
console.log(`Available tools: ${tools.length}`);

// Group by domain
const domains = new Set(tools.map(t => t.name.split('.')[0]));
console.log('Domains:', [...domains]);
// → organizations, applications, clients, users, roles, permissions, ...
```

## Executing Tools

The `executeTool()` function dispatches a tool call to the correct SDK domain method:

```typescript
import { executeTool } from '@portaidentity/sdk/agent';

// The AI agent says: "call organizations.create with { name: 'Acme Corp' }"
const result = await executeTool(porta, 'organizations.create', {
  name: 'Acme Corp',
  slug: 'acme',
});

// result is the Organization object returned by porta.organizations.create()
```

### Error Handling

```typescript
try {
  const result = await executeTool(porta, toolName, toolArgs);
  return { success: true, data: result };
} catch (err) {
  if (err instanceof PortaValidationError) {
    return { success: false, error: 'Validation failed', details: err.details };
  }
  if (err instanceof PortaNotFoundError) {
    return { success: false, error: 'Not found', message: err.message };
  }
  return { success: false, error: err.message };
}
```

## MCP Server Integration

To build an MCP server that exposes Porta tools:

```typescript
import { McpServer } from '@anthropic-ai/mcp-sdk';
import { createPortaClient } from '@portaidentity/sdk';
import { createNodeTransport, createClientCredentialsAuth } from '@portaidentity/sdk/node';
import { getToolDefinitions, executeTool } from '@portaidentity/sdk/agent';

const porta = createPortaClient({
  transport: createNodeTransport({
    baseUrl: process.env.PORTA_API_URL!,
    auth: createClientCredentialsAuth({
      tokenEndpoint: process.env.PORTA_TOKEN_ENDPOINT!,
      clientId: process.env.PORTA_CLIENT_ID!,
      clientSecret: process.env.PORTA_CLIENT_SECRET!,
    }),
  }),
});

const server = new McpServer({ name: 'porta-admin', version: '1.0.0' });

// Register all Porta tools
for (const tool of getToolDefinitions()) {
  server.tool(
    tool.name,
    tool.description,
    Object.fromEntries(tool.parameters.map(p => [p.name, { type: p.type, description: p.description }])),
    async (args) => {
      const result = await executeTool(porta, tool.name, args);
      return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
    },
  );
}

await server.start();
```

## OpenAI Function-Calling Integration

```typescript
import { getToolDefinitions, executeTool } from '@portaidentity/sdk/agent';

// Convert to OpenAI function-calling format
const openAiTools = getToolDefinitions().map(tool => ({
  type: 'function' as const,
  function: {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: Object.fromEntries(
        tool.parameters.map(p => [p.name, {
          type: p.type,
          description: p.description,
        }])
      ),
      required: tool.parameters.filter(p => p.required).map(p => p.name),
    },
  },
}));

// Use with OpenAI API
const response = await openai.chat.completions.create({
  model: 'gpt-4',
  messages: [{ role: 'user', content: 'List all organizations' }],
  tools: openAiTools,
});

// Execute tool calls from the response
for (const toolCall of response.choices[0].message.tool_calls ?? []) {
  const args = JSON.parse(toolCall.function.arguments);
  const result = await executeTool(porta, toolCall.function.name, args);
  console.log(`${toolCall.function.name}:`, result);
}
```

## Available Tool Domains

| Domain | Tools | Description |
|---|---|---|
| `organizations` | 10 | Org CRUD, status lifecycle, destroy |
| `applications` | 8 | App CRUD, modules |
| `clients` | 8 | Client CRUD, secrets |
| `users` | 12 | User CRUD, invite, password, status |
| `roles` | 5 | Application roles, permission mapping |
| `permissions` | 3 | Application permissions |
| `userRoles` | 3 | User-role assignments |
| `customClaims` | 4 | Claim definitions |
| `userClaims` | 3 | User claim values |
| `config` | 3 | System configuration |
| `keys` | 3 | Signing key management |
| `audit` | 1 | Audit log |
| `stats` | 1 | Dashboard statistics |
| `sessions` | 3 | Session management |
| `bulk` | 1 | Bulk status operations |
| `branding` | 4 | Org branding & assets |
| `exports` | 1 | Data export |
| `twoFactor` | 3 | 2FA admin management |
| `imports` | 1 | Declarative provisioning |

## Security Considerations

- The agent operates with the **same permissions** as the SDK client's authentication. Use a dedicated service account with minimal required permissions.
- **Side-effect awareness**: Tools with `sideEffects: true` modify state. AI agents should confirm destructive actions (e.g., `organizations.destroy`) with the user.
- **Rate limiting**: The Porta API enforces rate limits. Agent loops that make many rapid requests may be throttled.
- **No credential exposure**: Never pass credentials through tool parameters. Authentication is handled by the transport layer.

## See Also

- [SDK Overview](/guide/sdk) — Installation, quick start, full API reference
- [SDK Node.js Usage](/guide/sdk-node) — Server-side setup with auth providers
- [SDK Browser Usage](/guide/sdk-browser) — Browser/SPA integration
