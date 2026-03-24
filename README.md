# Meta Ads MCP Server

A Cloudflare Workers MCP server for Meta Ads account setup, campaign management, ad sets, creatives, audiences, reporting, and batch workflows.

This repo is built on `xmcp` and exposes a Streamable HTTP MCP endpoint plus browser-facing Meta OAuth routes.

## Open Source / Self-Hosted

This repository is intended to be deployed in your own Cloudflare account with your own Meta app credentials.

It does not ship with:

- a hosted control plane
- a shared Meta app
- a built-in end-user dashboard
- a JWT issuer for your users and workspaces

You bring:

- your Cloudflare Worker deployment
- your Meta developer app
- your JWT issuer or auth provider
- your own UI or backend that initiates the OAuth flow

## What It Does

- Runs as a Cloudflare Worker
- Uses direct Meta Graph API `fetch` calls instead of the Meta SDK
- Stores Meta user connections per workspace in D1
- Stores short-lived OAuth state in KV
- Encrypts stored Meta access tokens
- Protects MCP requests with your app-issued JWTs

## Endpoints

- `GET /health`
- `POST /mcp`
- `GET /oauth/meta/start`
- `GET /oauth/meta/callback`

## Auth Model

This server is multi-tenant. Every MCP request must include a bearer JWT issued by your app.

If you are open-sourcing this project, the important implication is that consumers must wire it into their own auth system. The server does not know how to identify a user or workspace without that JWT.

Required JWT claims:

- `sub` or `userId`
- `workspaceId`
- optional `roles`

Example payload:

```json
{
  "sub": "user_123",
  "workspaceId": "workspace_abc",
  "roles": ["admin"]
}
```

Why `/oauth/meta/start` is not a generic public link:

- the server must know which workspace the Meta account should be attached to
- that workspace context comes from the JWT
- without it, the server cannot safely bind the resulting Meta token

## Tool Surface

Implemented tool families:

- Account and setup
- Campaign management
- Ad set management
- Creative and ads
- Audience and targeting
- Reporting and insights
- Batch helpers

The server currently registers 39 tools.

## Project Layout

- `src/tools` tool definitions grouped by domain
- `src/lib` auth, storage, OAuth, runtime, and Meta client helpers
- `src/services` domain-specific Meta service logic
- `src/middleware.ts` OAuth routing and MCP JWT auth
- `cloudflare-entry.mjs` Worker wrapper entry for Cloudflare-specific route interception
- `schema.sql` D1 schema
- `test` unit and contract-style tests

## Local Development

Install dependencies:

```bash
pnpm install
```

Run local dev:

```bash
pnpm dev
```

Useful scripts:

```bash
pnpm build
pnpm test
pnpm deploy
```

## Cloudflare Bindings

Required bindings:

- D1 database bound as `META_DB`
- KV namespace bound as `META_OAUTH_STATE`

Required secrets:

- `JWT_SECRET` or `JWT_JWKS_URL`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_TOKEN_ENCRYPTION_KEY`

Optional configuration:

- `JWT_ISSUER`
- `JWT_AUDIENCE`
- `META_REDIRECT_URI`
- `META_GRAPH_VERSION`
- `META_OAUTH_SCOPES`
- `META_OAUTH_ALLOWED_RETURN_ORIGINS`

Defaults:

- `META_GRAPH_VERSION=v25.0`
- `META_OAUTH_SCOPES=ads_management,business_management`

## Meta App Setup

In your Meta app:

1. Add the Marketing API product.
2. Add a Website platform.
3. Set the Website platform URL to your Worker origin.
4. Set `App Domains` to your Worker domain.
5. Set the callback URL to:

```text
https://<your-worker-host>/oauth/meta/callback
```

If your app uses `Facebook Login` or `Facebook Login for Business`, also add that exact callback URL to the product-specific redirect URI settings.

For a Worker deployed on `workers.dev`, these fields usually need to match the Worker host exactly.

## Database

Apply the D1 schema:

```bash
pnpm wrangler d1 execute META_DB --remote --file schema.sql -y
```

Tables:

- `meta_connections`
- `meta_ad_accounts_cache`

## Deployment

Deploy the Worker:

```bash
pnpm deploy
```

After deploy:

1. note the public Worker URL
2. set `META_REDIRECT_URI` to `https://<your-worker-host>/oauth/meta/callback`
3. update the same callback in the Meta app settings

If you plan to use a separate frontend or dashboard on another origin, allow that origin for post-OAuth browser redirects:

```text
META_OAUTH_ALLOWED_RETURN_ORIGINS=https://your-ui.example.com,http://localhost:3000
```

Use your real frontend origin in production.

## Manual Test Flow

### 1. Generate a short-lived JWT

Use the same JWT secret your app uses for the Worker.

```bash
export JWT_SECRET="YOUR_JWT_SECRET"

TOKEN=$(node --input-type=module <<'NODE'
import { SignJWT } from 'jose';

const secret = new TextEncoder().encode(process.env.JWT_SECRET);
const token = await new SignJWT({ workspaceId: 'workspace_test', roles: ['admin'] })
  .setProtectedHeader({ alg: 'HS256' })
  .setSubject('user_test')
  .setIssuedAt()
  .setExpirationTime('10m')
  .sign(secret);

console.log(token);
NODE
)
```

### 2. Start Meta OAuth

```bash
curl -i \
  -H "Authorization: Bearer $TOKEN" \
  "https://<your-worker-host>/oauth/meta/start?workspace_id=workspace_test"
```

Copy the `Location` header into your browser and complete the Meta login flow.

Expected success page:

```text
Meta account connected.
```

### 3. Initialize MCP

```bash
curl -s https://<your-worker-host>/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":"init-1","method":"initialize","params":{"protocolVersion":"2025-03-26","capabilities":{},"clientInfo":{"name":"manual-test","version":"1.0.0"}}}'
```

### 4. List Tools

```bash
curl -s https://<your-worker-host>/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":"tools-1","method":"tools/list","params":{}}'
```

### 5. Call a Real Tool

After OAuth succeeds, this should return the accessible ad accounts for that workspace:

```bash
curl -s https://<your-worker-host>/mcp \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -d '{"jsonrpc":"2.0","id":"call-1","method":"tools/call","params":{"name":"get_ad_accounts","arguments":{}}}'
```

If you get a connect/reconnect error, the OAuth flow and the MCP call used different `workspaceId` values.

## Notes

- Cloudflare `workers.dev` domains can require extra care in Meta app settings.
- The Worker entrypoint explicitly intercepts OAuth routes before delegating to the generated XMCP Worker.
- The Cloudflare Worker build path is not identical to local `xmcp dev`, so always verify the deployed routes after OAuth-related changes.

## References

- [XMCP](https://xmcp.dev/docs)
- [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- [Meta Marketing API Authorization](https://developers.facebook.com/docs/marketing-api/overview/authorization/)
