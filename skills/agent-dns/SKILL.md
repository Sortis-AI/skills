# agent-dns

## Name
agent-dns

## Description
MPP-enabled agent-first DNS management and domain registration API. Pay-per-request via Solana USDC.

## Version
0.2.1

## Base URL
```
https://agent-dns.org
```

## Overview
Unified DNS management API with pluggable provider backends and async domain registration. Supports zone and record management (CRUD), domain availability checking, domain suggestions, and domain registration with operation polling.

Three DNS providers are available — Route53, Cloudflare, and Google Cloud DNS. Select per-request via `?provider=route53`, `?provider=cloudflare`, or `?provider=google` query parameter (or `X-DNS-Provider` header). When omitted, the first registered provider is used.

All request bodies must use `Content-Type: application/json`.

## Payment Model
- Protocol: MPP (HTTP 402 Payment Required)
- Currency: USDC on Solana
- Billing: Per-request, no accounts or subscriptions
- No authentication required

### Payment Flow

All paid endpoints return `402 Payment Required` with an MPP challenge. Use a client that handles the 402 → pay → retry loop automatically.

#### agent-wallet (recommended)

[`agent-wallet`](https://github.com/Sortis-AI/agent-wallet) (`aw`) is a single-binary CLI that handles MPP payments transparently. It parses 402 challenges, pays on-chain, and retries — no manual protocol work needed.

**Install:**
```bash
# Install Rust (if not already installed):
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
source ~/.cargo/env

# Install agent-wallet:
cargo install agent-wallet
```

**Setup:**
```bash
# Generate a new keypair (or use an existing one):
aw wallet new --keypair ~/.config/solana/aw.json

# Fund it with SOL (for tx fees) and USDC (for payments)

# Configure:
export AW_KEYPAIR=~/.config/solana/aw.json
export AW_RPC_URL=https://api.mainnet-beta.solana.com
```

**Usage:**
```bash
# List zones
aw GET https://agent-dns.org/zones

# Create a zone
aw POST https://agent-dns.org/zones '{"name":"example.com"}'

# Check domain availability
aw GET https://agent-dns.org/domains/check/example.com

# Register a domain with a spending cap
aw --max-cost 15 POST https://agent-dns.org/domains/register '{"domain":"example.com","contact":{...}}'

# Check wallet balance
aw balance
```

**Key features:**
- `--max-cost N` — abort (exit 2) if the 402 challenge exceeds N USDC. Prevents overspending.
- `--dry-run` — show what would be paid without sending a transaction.
- `--json` — machine-readable payment receipts on stderr.
- **stdout** is always the HTTP response body only — safe to pipe to `jq`.
- **Exit codes:** 0=success, 1=HTTP/payment error, 2=budget exceeded, 3=insufficient funds, 4=config error.

#### mppx (Node.js)

The [`mppx`](https://www.npmjs.com/package/mppx) client library handles the full 402 flow programmatically:

```javascript
import { Challenge, Credential } from 'mppx';

const res = await fetch('https://agent-dns.org/zones');
if (res.status !== 402) throw new Error('Expected 402');

const challenge = Challenge.fromResponse(res);

const signature = await sendUsdcPayment({
  recipient: challenge.request.recipient,
  amount: BigInt(challenge.request.amount),
  memo: challenge.id,
});

const credential = Credential.serialize({
  challenge,
  payload: { type: 'signature', signature },
});

const paid = await fetch('https://agent-dns.org/zones', {
  headers: { 'Authorization': credential },
});
const { zones } = await paid.json();
```

#### Common Mistakes

| Mistake | Result | Fix |
|---------|--------|-----|
| `Authorization: solana <signature>` | 402 repeated | Use `Payment <base64url-credential>`, not a bare signature |
| `Authorization: Bearer <signature>` | 402 repeated | The scheme is `Payment`, not `Bearer` |
| Sending only the signature without the challenge | 402 repeated | The credential must contain the full challenge object from the 402 header |
| Reusing a challenge from a previous 402 | 402 repeated | Each 402 has a unique `id` — pay against the fresh challenge |
| Waiting too long between payment and retry | 402 repeated | Challenges expire in 5 minutes — pay and retry immediately |
| Sending a transaction not yet confirmed | 402 repeated | Wait for on-chain confirmation before retrying |
| Paying to a hardcoded recipient address | 402 repeated | Always use the `recipient` from the current challenge — it may vary |

#### 402 Protocol Reference

The `WWW-Authenticate` header uses the `Payment` scheme:
```
WWW-Authenticate: Payment id="<hmac-id>", realm="agent-dns.org", method="solana", intent="charge", request="<base64url-json>"
```

The `request` field is a base64url-encoded JSON object:
```json
{
  "amount": "1000",
  "currency": "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  "recipient": "<recipient-pubkey>",
  "methodDetails": {
    "network": "mainnet-beta",
    "decimals": 6,
    "recentBlockhash": "<blockhash>",
    "tokenProgram": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
  }
}
```

- `amount` is in base units (USDC has 6 decimals — `"1000"` = $0.001 USDC)
- `currency` is the SPL token mint address (USDC mainnet: `EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v`) — pass it directly to `spl-token transfer`
- Each 402 response has a unique `id` — you must pay against the specific challenge you received

After payment, retry with `Authorization: Payment <base64url-encoded-credential>` where the credential is:
```json
{
  "challenge": { "id": "...", "realm": "...", "method": "...", "intent": "...", "request": "..." },
  "payload": { "type": "signature", "signature": "<base58-solana-tx-signature>" }
}
```

The `challenge` object must be the exact challenge from **this specific 402 response**. The server validates the `id` cryptographically. Successful paid responses include a `Payment-Receipt` header.

**Provider selection on retry:** Use the same `?provider` or `X-DNS-Provider` value as the original request.

Free discovery endpoints (`GET /health`, `GET /pricing`, `GET /capabilities`, `GET /openapi.json`, `GET /SKILL.md`) do not require payment.

## Record Format
Records follow RRset semantics: identity is (name, type) pair. Values use RFC wire-format strings:
- MX: `"10 mail.example.com"`
- SRV: `"10 60 5060 sip.example.com"`
- CAA: `"0 issue \"letsencrypt.org\""`
- A/AAAA/NS/PTR/CNAME/TXT: standard wire format

Structured data (MX priority, SRV weight/port) available optionally via the `data` field — see `RecordData` type below.

### Validation Constraints
- **TTL**: integer, 0 to 604800 (1 week). Must be non-negative and finite. Cloudflare enforces a minimum of 60.
- **values**: array of strings, must not be empty.
- **Batch limit**: max 100 records per batch upsert.
- **Suggestion limit**: 1 to 50 (default: 5).

## Provider Selection
Multiple DNS providers can be active simultaneously. Select which to use per-request:
- Query parameter: `?provider=route53`
- Header: `X-DNS-Provider: cloudflare`
- Default: first registered provider

If a requested provider is not configured, the server returns `502 Bad Gateway`. Provider names are case-sensitive and lowercase-only — an invalid name (e.g. `Route53`) returns `400 Bad Request`.

### Provider Capabilities

| Capability | Route53 | Cloudflare | Google Cloud DNS |
|---|---|---|---|
| Zone creation | Yes | Yes | Yes |
| Batch upsert | Yes (atomic) | Yes (sequential) | Yes (atomic) |
| Min TTL | 0 | 60 | 0 |
| Domain registration | Yes | No | No |
| Extensions | `alias` | `proxied`, `comment` | `visibility` |
| Supported types | A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, SOA, PTR | A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, PTR | A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, SOA, PTR |

### Provider Extensions

**Route53 `alias`** (in `extensions` field of a DnsRecord):
```json
{
  "extensions": {
    "alias": {
      "dnsName": "d1234.cloudfront.net",
      "hostedZoneId": "Z2FDTNDATAQYW2",
      "evaluateTargetHealth": false
    }
  }
}
```

**Cloudflare `proxied`** (in `extensions` field of a DnsRecord):
```json
{
  "extensions": {
    "proxied": true
  }
}
```

**Cloudflare `comment`** (in `extensions` field of a DnsRecord — optional human-readable note):
```json
{
  "extensions": {
    "comment": "Primary web server"
  }
}
```

**Google Cloud DNS `visibility`** (in `extensions` field of CreateZone options):
```json
{
  "visibility": "private"
}
```

## Discovery Endpoints (Free)

### GET /health
Server health check. Returns 503 with `"status": "degraded"` if the payment system failed to initialize.
- Response: `{ status: "ok" | "degraded", timestamp: string, version: string }` (timestamp is ISO 8601, version is semver)
- No payment required

### GET /pricing
Current pricing schedule, available payment methods, and free endpoints.
- No payment required
- Response:
```json
{
  "currency": "USDC",
  "paymentProtocol": "MPP",
  "paymentMethods": ["solana"],
  "operations": {
    "dns": {
      "read": { "description": "List/get zones or records", "priceUsdc": 0.001, "endpoints": ["GET /zones", "..."] },
      "write": { "description": "Update or delete records and zones", "priceUsdc": 0.01, "endpoints": ["DELETE /zones/:zoneId", "..."] },
      "zoneCreation": { "description": "Create a zone (includes 1yr hosting)", "priceUsdc": { "route53": 7.40, "google": 3.26, "cloudflare": 0.01 }, "endpoints": ["POST /zones"] }
    },
    "domains": {
      "check": { "description": "Check domain availability or get suggestions", "priceUsdc": 0.005, "endpoints": ["..."] },
      "prices": { "description": "Get TLD pricing", "priceUsdc": 0.001, "endpoints": ["..."] },
      "register": { "description": "Register a domain (async)", "priceUsdc": "Route53 cost × 1.15 + $0.50", "endpoints": ["POST /domains/register"] },
      "operations": { "description": "Poll registration status", "priceUsdc": 0.001, "endpoints": ["..."] }
    }
  },
  "free": ["GET /health", "GET /pricing", "GET /openapi.json", "GET /SKILL.md", "GET /capabilities"]
}
```

### GET /openapi.json
OpenAPI 3.0 specification.
- No payment required

### GET /capabilities
Configured DNS provider capabilities.
- Response:
  ```json
  {
    "providers": { "dns": ["route53", "cloudflare"], "registrar": ["route53"] },
    "capabilities": {
      "supportsZoneCreation": true,
      "supportsBatch": true,
      "supportedRecordTypes": ["A", "AAAA", "CNAME", "MX", "TXT", "NS", "SRV", "CAA", "SOA", "PTR"],
      "minTtl": 0,
      "extensions": ["alias"]
    }
  }
  ```
  `capabilities` reflects the default provider. May be `null` if no provider is configured.
- No payment required

### GET /SKILL.md
This document.
- No payment required

## Zones Endpoints

### GET /zones
List all zones.
- Price: $0.001 USDC
- Response: `{ zones: Zone[] }`
- Example: `aw GET https://agent-dns.org/zones`

### POST /zones
Create a new zone. Price includes 1 year of provider zone hosting.
- Price: Route53 $7.40, Google $3.26, Cloudflare $0.01 (provider hosting × 1.15 + $0.50 service fee; Cloudflare hosting is free)
- Body: `{ name: string, visibility?: "public" | "private", extensions?: Record<string, unknown> }`
  - `visibility` defaults to `"public"` when omitted
  - `extensions` is provider-specific (e.g. Google Cloud DNS `visibility` — see Provider Extensions)
- Response: `Zone` (201 Created)
- Example: `aw POST https://agent-dns.org/zones '{"name":"example.com"}'`

### GET /zones/:zoneId
Get zone metadata (does not include records — use `GET /zones/:zoneId/records`).
- Price: $0.001 USDC
- Response: `Zone`

### DELETE /zones/:zoneId
Delete a zone.
- Price: $0.01 USDC
- Response: `{ success: true }`

## Records Endpoints

### GET /zones/:zoneId/records
List records in zone, optionally filtered.
- Price: $0.001 USDC
- Query params:
  - `type` -- filter by record type (A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, SOA, PTR)
  - `name` -- filter by record name
- Response: `{ records: DnsRecord[] }`

### GET /zones/:zoneId/records/:name/:type
Get a specific RRset by (name, type).
- Price: $0.001 USDC
- Response: `DnsRecord` or 404 if not found

### PUT /zones/:zoneId/records/:name/:type
Upsert (create or update) an RRset. Replaces all values for the (name, type) pair — partial updates are not supported. The `name` and `type` are taken from the URL path.
- Price: $0.01 USDC
- Body:
  ```json
  {
    "ttl": 3600,
    "values": ["192.0.2.1", "192.0.2.2"]
  }
  ```
  Optional fields: `data` (RecordData), `extensions` (provider-specific — see Provider Extensions)
- Response: `DnsRecord`
- Example: `aw PUT https://agent-dns.org/zones/{zoneId}/records/www.example.com/A '{"ttl":300,"values":["1.2.3.4"]}'`

### PUT /zones/:zoneId/records/batch
Batch upsert up to 100 records.
- Price: $0.01 USDC per record (e.g., 10 records = $0.10)
- Body: `{ records: DnsRecord[] }`
- Max: 100 records per batch
- Response: `{ records: DnsRecord[] }`

### DELETE /zones/:zoneId/records/:name/:type
Delete an RRset.
- Price: $0.01 USDC
- Response: `{ success: true }`

## Domains Endpoints

Domain registration automatically routes to the cheapest configured registrar (Route53, Google Cloud Domains, GoDaddy). The system queries all registrars in parallel and picks the lowest price. The `?provider` selector and `X-DNS-Provider` header are ignored for domain endpoints. If no registrar provider is configured, the server returns `502 Bad Gateway`.

### GET /domains/check/:domain
Check if a domain is available for registration. Queries all configured registrars and returns the cheapest available option.
- Price: $0.005 USDC
- Response: `{ domain, available: boolean, premium: boolean, price?: { amount, currency }, registrar: string }`
- The `registrar` field indicates which registrar offered the best price.
- Example: `aw GET https://agent-dns.org/domains/check/example.com`

### GET /domains/suggest/:query
Get domain suggestions based on a search query. The search term is in the URL path (e.g. `/domains/suggest/myapp`), not a query parameter. Merges suggestions from all configured registrars, deduplicated by domain name (cheapest wins).
- Price: $0.005 USDC
- Query params:
  - `limit` -- max suggestions to return (1-50, default: 5)
- Response: `{ suggestions: DomainAvailability[] }`
- Each suggestion includes a `registrar` field.

### GET /domains/prices/:tld
Get registration pricing for a TLD (e.g., "com", "io", "ai"). Returns the cheapest price across all configured registrars, with a `compared` array showing all prices.
- Price: $0.001 USDC
- Response: `TldPricing & { registrar: string, compared: { registrar, amount, currency }[] }`

### POST /domains/register
Register a domain via the cheapest registrar for its TLD.
- Price: Dynamic based on TLD cost × 1.15 + $0.50 service fee
- Body:
  ```json
  {
    "domain": "example.com",
    "contact": {
      "firstName": "John",
      "lastName": "Doe",
      "organization": "optional",
      "email": "john@example.com",
      "phone": "+1.2065551234",
      "addressLine1": "123 Main St",
      "addressLine2": "optional",
      "city": "Seattle",
      "state": "optional",
      "countryCode": "US",
      "zipCode": "98101"
    },
    "years": 1
  }
  ```
  - `phone`: E.164 with dot separator (e.g., `"+1.2065551234"`)
  - `countryCode`: ISO 3166-1 alpha-2 (e.g., `"US"`, `"GB"`)
  - `years`: must be `1` (only 1-year registrations are supported)
- Response: `DomainOperation` with `registrar` field (202 Accepted)
- The `operationId` is prefixed with the registrar name (e.g., `route53:op-abc123`, `godaddy:example.com`). Use as-is when polling.
- **Defaults (non-configurable):** Auto-renewal is enabled. WHOIS privacy protection is enabled for all contacts. These cannot be overridden via this API.

### GET /domains/operations/:id
Poll domain registration operation status. The `:id` must be the full prefixed operation ID returned by POST /domains/register.
- Price: $0.001 USDC
- Response: `DomainOperation`
- Statuses: SUBMITTED, IN_PROGRESS, SUCCESSFUL, FAILED, ERROR

## Supported Record Types
A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, SOA, PTR

## Core Types

### Zone
```typescript
{
  id: string;                    // Provider-specific ID
  name: string;                  // FQDN without trailing dot
  nameServers: string[];         // Authoritative nameservers, no trailing dots
  recordCount?: number;
  status?: string;
  extensions?: Record<string, unknown>;
}
```

### DnsRecord
```typescript
{
  name: string;                  // FQDN without trailing dot
  type: RecordType;              // A, AAAA, CNAME, MX, TXT, NS, SRV, CAA, SOA, PTR
  ttl: number;                   // Seconds (0-604800)
  values: string[];              // RFC wire-format values (must not be empty)
  data?: RecordData;             // Optional structured MX/SRV/CAA data
  extensions?: Record<string, unknown>;
}
```

### RecordData
Optional structured representation for complex record types. Accepted on both reads and writes. On reads, the server populates it from wire-format values. On writes, `data` is optional — prefer `values` (wire format) for portability; use `data` when you need structured access to priority/weight/port fields. Discriminated on `kind`:
```typescript
// MX record
{ kind: "mx", priority: number, exchange: string }

// SRV record
{ kind: "srv", priority: number, weight: number, port: number, target: string }

// CAA record
{ kind: "caa", flags: number, tag: string, value: string }
```

### DomainAvailability
```typescript
{
  domain: string;
  available: boolean;
  premium: boolean;
  price?: { amount: number; currency: string };
}
```

### TldPricing
```typescript
{
  tld: string;
  registration: { amount: number; currency: string };
  renewal: { amount: number; currency: string };
  transfer: { amount: number; currency: string };
}
```

### DomainOperation
```typescript
{
  operationId: string;
  domain: string;
  type: "REGISTER" | "TRANSFER" | "RENEW";  // Only REGISTER is initiated via this API; TRANSFER/RENEW may appear when polling operations started externally
  status: "SUBMITTED" | "IN_PROGRESS" | "SUCCESSFUL" | "FAILED" | "ERROR";
  submittedAt: string;           // ISO 8601
  message?: string;
}
```

## Error Responses
All errors use RFC 7807 Problem Details format with `Content-Type: application/problem+json`.

Example:
```json
{
  "type": "urn:agent-dns:error:not-found",
  "title": "Not Found",
  "status": 404,
  "detail": "Zone not found: Z1234ABCD"
}
```

Error types:

| Status | Type URN | Meaning |
|--------|----------|---------|
| 400 | `urn:agent-dns:error:bad-request` | Validation failure (invalid TTL, missing fields, bad record type) |
| 402 | `urn:agent-dns:error:payment-required` | MPP payment challenge — see Payment Flow above |
| 404 | `urn:agent-dns:error:not-found` | Zone or record not found |
| 409 | `urn:agent-dns:error:conflict` | Resource already exists — reserved for future use; not currently emitted |
| 429 | `urn:agent-dns:error:rate-limited` | Rate limited. Response body may include `retryAfter` (number, seconds). When absent, use exponential backoff starting at 1s. |
| 500 | `urn:agent-dns:error:internal` | Unexpected server error |
| 502 | `urn:agent-dns:error:provider-error` | Underlying DNS provider failure |
| 503 | `urn:agent-dns:error:payment-unavailable` | Payment system temporarily unavailable |

## Implementation Notes
- RRset identity: (name, type). Upsert replaces all values for that RRset.
- TTL enforcement: adapters enforce provider minimums (Cloudflare: 60s).
- Domain names: normalized to FQDN, no trailing dots.
- Wire format: RFC standard (e.g., MX values include priority).
- Pagination: none. All list endpoints (`GET /zones`, `GET /zones/:zoneId/records`) return complete results in a single response.
- Batch operations: up to 100 records per batch, priced per record. Route53 and Google use atomic changes; Cloudflare applies sequentially.
- Domain registration: async; operation ID returned immediately; poll for status. Only 1-year registrations are supported. Routes to cheapest configured registrar automatically.
- Rate limiting: per-provider token bucket with adaptive backoff. Google Cloud DNS also enforces a 10,000 operations/day periodic quota.
