# Use Pod API reference (onboarding subset)

This file documents the endpoints the onboarding skill uses directly. The full API surface is broader; see `services/api/src/main.rs` in the Use Pod repo for the complete route list.

Default base URL: `https://api.usepod.ai`. Override with the `USEPOD_API` environment variable for self-hosted deployments.

## POST /v1/register

Mint a new API token. No authentication required. Rate-limited to 10 requests per minute per client IP.

**Request:**

```http
POST /v1/register HTTP/1.1
Host: api.usepod.ai
Accept: application/json
```

No body required.

**Response (200 OK):**

```json
{
  "api_token": "550e8400-e29b-41d4-a716-446655440000",
  "deposit_code": "ABCD1234",
  "status": "pending_deposit",
  "instructions": {
    "contract_address": "<Solana address for USDC deposits>",
    "dashboard_url": "https://usepod.ai/dashboard/550e8400-e29b-41d4-a716-446655440000"
  }
}
```

Field semantics:

- `api_token` — UUID. Use this in the `<TOKEN>` path segment of every subsequent request: `/proxy/{api_token}/...`.
- `deposit_code` — short opaque string. Include it in the Solana transaction memo so the on-chain watcher credits the right token.
- `status` — `"pending_deposit"` until the first deposit lands, then `"active"`.
- `instructions.contract_address` — the Solana address USDC should be sent to.
- `instructions.dashboard_url` — pre-tokenized dashboard URL the user can open to see a QR code, the contract address, the deposit code, and live balance updates.

**Errors:**

- `429 Too Many Requests` — IP rate-limited. Wait 60 seconds and retry.

## GET /proxy/{token}/balance

Read the current balance and activation status for a token. No auth header — the token in the path is the credential.

**Request:**

```http
GET /proxy/<api_token>/balance HTTP/1.1
Host: api.usepod.ai
Accept: application/json
```

**Response (200 OK):**

```json
{
  "api_token": "550e8400-e29b-41d4-a716-446655440000",
  "usdc_balance": 5000000,
  "credit_balance": 0,
  "deposit_code": "ABCD1234",
  "is_active": true
}
```

Field semantics:

- `usdc_balance` — integer microunits. Divide by 1,000,000 for USDC dollars. `5000000` = `$5.00`.
- `credit_balance` — always `0` in v2.0 (Level5-compat field; the balance accounting lives on `usdc_balance`).
- `is_active` — `true` once the first deposit has landed; the token can now serve inference.
- `deposit_code` — same opaque string returned at registration; useful if the user lost it.

The polling loop in `scripts/wait-for-funding.sh` watches `usdc_balance > 0` rather than `is_active` because the active flag flips slightly after the deposit reaches the database, and polling on balance gives a more responsive UX.

**Errors:**

- `404 Not Found` — token not registered. Verify the token from the registration response.

## Inference surfaces

Once funded, the token authorizes requests to either of two surfaces. Both stream, both support tool use and vision, and both accept the same `Authorization` patterns the upstream SDKs already produce.

**OpenAI-compatible:** `https://api.usepod.ai/proxy/<TOKEN>/v1`

Drop in as `OPENAI_BASE_URL` (Python SDK), `baseURL` (Node SDK), `apiBase` (Continue.dev), or wherever the harness accepts a base-URL override. The `OPENAI_API_KEY` can be any non-empty string — `UsePod` works — because the path-segment token is the real credential.

Endpoints under `/v1`:
- `POST /v1/chat/completions`
- `POST /v1/completions`
- `GET /v1/models`

**Anthropic-compatible:** `https://api.usepod.ai/proxy/<TOKEN>`

Drop in as `ANTHROPIC_BASE_URL` (Claude Code, Anthropic SDK). The `ANTHROPIC_API_KEY` can be any non-empty string — `UsePod` works.

Endpoints:
- `POST /v1/messages`

## Optional pricing headers

Add either or both to any inference request to cap per-token cost:

```
X-Pod-Max-Price-Input: 400000      # max 0.40 USDC per 1M input tokens
X-Pod-Max-Price-Output: 600000     # max 0.60 USDC per 1M output tokens
```

Values are USDC microunits per 1M tokens.

If no marketplace provider meets the ceiling, the request falls through to the centralized router. If the centralized price also exceeds the ceiling, the server returns:

```http
HTTP/1.1 402 Payment Required
Content-Type: application/json

{
  "error": {
    "type": "no_provider_at_price",
    "message": "No provider available at your price ceiling.",
    "details": {
      "suggested_min_input_per_1m": 500000,
      "suggested_min_output_per_1m": 800000
    }
  }
}
```

The client can then retry with a higher ceiling, route to a cheaper model, or surface the price to the user.
