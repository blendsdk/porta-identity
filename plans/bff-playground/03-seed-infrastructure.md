# Seed & Infrastructure: BFF + M2M Playground

> **Document**: 03-seed-infrastructure.md
> **Parent**: [Index](00-index.md)

## Overview

Updates to the seed script and infrastructure scripts to support the BFF playground. This includes creating two new OIDC clients (BFF confidential + M2M service), generating a config file for the BFF, and updating startup/stop scripts.

## Seed Script Changes (`scripts/playground-seed.ts`)

### New Clients (Phase D additions)

#### BFF Confidential Client

Created in the `no2fa` org (same as existing confidential client) with one client per org for multi-org scenarios.

```typescript
// BFF clients — one per org for multi-org scenario support
const bffClients: Record<string, { orgId: string; clientId: string; secret: string }> = {};

for (const [orgKey, org] of Object.entries(organizations)) {
  const bffClient = await createClient(pool, {
    organizationId: org.id,
    applicationId: app.id,
    name: `BFF Playground (${org.name})`,
    clientType: 'confidential',
    applicationType: 'web',
    grantTypes: ['authorization_code', 'refresh_token'],
    redirectUris: ['http://localhost:4001/auth/callback'],
    postLogoutRedirectUris: ['http://localhost:4001'],
    tokenEndpointAuthMethod: 'client_secret_post',
  });
  const { clientSecret } = await generateSecret(bffClient.id);
  bffClients[orgKey] = {
    orgId: org.id,
    clientId: bffClient.clientId,
    secret: clientSecret,
  };
}
```

**Key differences from existing confidential client:**
- Redirect URI: `http://localhost:4001/auth/callback` (BFF, not Porta)
- Post-logout redirect: `http://localhost:4001`
- Auth method: `client_secret_post` (explicit, simpler than basic for debugging)
- One per org (enables multi-org scenario switching)
- Grant types: `authorization_code` + `refresh_token`

#### M2M Service Client

Single client, `no2fa` org, `client_credentials` only.

```typescript
const m2mClient = await createClient(pool, {
  organizationId: organizations.no2fa.id,
  applicationId: app.id,
  name: 'M2M Service Client',
  clientType: 'confidential',
  applicationType: 'web',
  grantTypes: ['client_credentials'],
  redirectUris: [],  // No redirects for M2M
  tokenEndpointAuthMethod: 'client_secret_post',
});
const { clientSecret: m2mSecret } = await generateSecret(m2mClient.id);
```

### BFF Config Generation (Phase H addition)

Generate `playground-bff/config.generated.json`:

```typescript
const bffConfig = {
  portaUrl: 'http://localhost:3000',
  bffUrl: 'http://localhost:4001',
  mailhogUrl: 'http://localhost:8025',
  redis: {
    host: 'localhost',
    port: 6379,
  },
  organizations: Object.fromEntries(
    Object.entries(organizations).map(([key, org]) => [
      key,
      {
        id: org.id,
        slug: org.slug,
        name: org.name,
        clientId: bffClients[key].clientId,
        clientSecret: bffClients[key].secret,
        twoFactorPolicy: org.twoFactorPolicy,
      },
    ])
  ),
  m2m: {
    clientId: m2mClient.clientId,
    clientSecret: m2mSecret,
    orgSlug: organizations.no2fa.slug,
  },
  users: { /* same user map as SPA config */ },
  scenarios: { /* same scenario map as SPA config */ },
};

const bffConfigPath = path.resolve(
  import.meta.dirname ?? '.', '..', 'playground-bff', 'config.generated.json'
);
await fs.writeFile(bffConfigPath, JSON.stringify(bffConfig, null, 2));
```

### Seed Summary Update (Phase I)

Add BFF + M2M client info to the console output:

```
BFF Playground:
  URL:           http://localhost:4001
  Clients:       5 (one per org)
  Auth Method:   client_secret_post

M2M Client:
  Client ID:     [m2m-client-id]
  Auth Method:   client_secret_post
  Grant:         client_credentials
```

## Infrastructure Script Changes

### `scripts/run-playground.sh`

Add BFF startup after SPA startup:

```bash
# Start BFF playground (port 4001)
echo "Starting BFF playground on port 4001..."
cd playground-bff
yarn install --frozen-lockfile 2>/dev/null || yarn install
npx tsx src/server.ts &
BFF_PID=$!
cd ..
echo "BFF playground PID: $BFF_PID"

# Wait for BFF to be ready
for i in $(seq 1 30); do
  if curl -s http://localhost:4001/health > /dev/null 2>&1; then
    echo "BFF playground ready on http://localhost:4001"
    break
  fi
  sleep 1
done
```

### `scripts/run-playground-stop.sh`

Add BFF process killing:

```bash
# Kill BFF playground
echo "Stopping BFF playground..."
lsof -ti:4001 | xargs kill -9 2>/dev/null || true
```

### `.gitignore`

Add:

```
playground-bff/config.generated.json
playground-bff/node_modules/
```

## Error Handling

| Error Case | Handling Strategy |
| --- | --- |
| BFF client creation fails | Seed script logs error and continues (SPA playground still works) |
| M2M client creation fails | Seed script logs error and continues |
| Config file write fails | Seed script throws (BFF can't start without config) |
| Port 4001 already in use | Startup script warns and continues |
| BFF dependencies not installed | Startup script runs `yarn install` first |

## Testing Requirements

- Manual: Run seed script, verify BFF config file is generated with correct client IDs/secrets
- Manual: Run startup script, verify BFF server starts on 4001
- Manual: Run stop script, verify BFF process is killed
