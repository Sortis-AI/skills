# Host-side API & `agent.toml` reference

## Authenticated host endpoints

All routes below are mounted under `https://api.usepod.ai` and (except `/v1/host/enroll` and the pair `issue` / `poll` pair) require an `Authorization: Bearer <host_token>` header. The `host_token` is returned at enrollment and looks like `pod_host_<40 alnum chars>`.

### POST /v1/host/enroll

Mint a new host_token. No auth required.

```http
POST /v1/host/enroll HTTP/1.1
Host: api.usepod.ai
Content-Type: application/json

{
  "display_name": "my-rtx-4090",
  "wallet":       "<solana wallet address>",
  "contact_email": "ops@example.com"
}
```

Response:

```json
{
  "host_token": "pod_host_…",
  "provider_id": "<uuid>",
  "enrollment_code": "POD-ENROLL-XXXXXXXX",
  "bond": {
    "deposit_code": "POD-BOND-XXXXXXXX",
    "amount_usdc": 50,
    "destination": "<solana ops wallet>"
  }
}
```

Store the `host_token` securely — it is the only credential the agent uses for the lifetime of the host, and there is no recovery flow if it leaks. The dashboard's web flow at `/host/pair` wraps this same endpoint server-side.

### POST /v1/host/pair/issue · /v1/host/pair/poll · /v1/host/pair/claim

The dashboard pair flow. The dashboard calls `pair/issue` to get a `pair_code`, polls `pair/poll` to detect when the operator's agent has connected, then the agent calls `pair/claim` (using its `host_token`) with the activated model list to register pricing.

Operators never need to call these directly — the dashboard UI at `/host/pair` orchestrates them.

### GET /v1/host/balance

```http
GET /v1/host/balance HTTP/1.1
Authorization: Bearer pod_host_…
```

Response (microunits):

```json
{ "usdc_balance": 12500000, "withdrawable_usdc_balance": 12500000 }
```

### GET /v1/host/transactions

Paginated history of credits (jobs served) and debits (withdrawals). Useful for reconciliation.

### POST /v1/host/withdraw

```http
POST /v1/host/withdraw
Authorization: Bearer pod_host_…
Content-Type: application/json

{ "amount_usdc": 25.00, "destination": "<solana wallet>" }
```

Limits at v2.0: $5 minimum, $10,000 daily cap, manual approval queue for amounts >$1,000 during the first 30 days post-enrollment.

### PATCH /v1/host/models

Adjust per-model pricing or enable/disable a model. Mirrors the host dashboard's model editor.

## WebSocket: `wss://api.usepod.ai/provider/connect`

The agent maintains one long-lived WebSocket to the coordinator. Authentication uses the `host_token` as a `Sec-WebSocket-Protocol` header value or as `?token=<host_token>` (depending on agent version — both are accepted).

Message flow:

1. **Client → Server**: `hello` with public key + agent version + advertised model list.
2. **Server → Client**: `welcome` with provider_id and any pending config.
3. **Server → Client**: `job` messages with the inference request payload.
4. **Client → Server**: streamed `chunk` messages relayed back to the user.
5. Heartbeat ping/pong every 30 s; the server throttles after 3 consecutive misses.

The full protocol is in `plan/V2_AGENT_SPEC.md`. Operators never construct these messages by hand.

## `agent.toml` schema

```toml
# Operator identity. The display_name is shown in the dashboard's network UI;
# wallet receives the operator's earnings via withdraw.
[operator]
display_name  = "my-rtx-4090"
wallet        = "<solana wallet>"
contact_email = "ops@example.com"          # optional

# Coordinator endpoint + the enrollment_code returned by the pair flow.
[coordinator]
url             = "wss://api.usepod.ai/provider/connect"
enrollment_code = "POD-ENROLL-XXXXXXXX"     # optional once paired

# Identity keypair location. Created on first run if missing.
[identity]
key_path = "~/.usepod-agent/identity.key"   # default

# One [[backends]] block per local backend or BYOK upstream. Repeat for
# multiple GPUs (one process per port).
[[backends]]
kind   = "ollama"                          # vllm | llamacpp | lmstudio | ollama
                                            # | openrouter | venice
url    = "http://127.0.0.1:11434"
models = ["llama3.1:70b", "qwen2.5:32b"]   # optional; otherwise auto-detect

# BYOK example:
[[backends]]
kind        = "openrouter"
api_key_env = "OPENROUTER_API_KEY"          # read at startup; not stored
markup      = 0.10                          # 10% over upstream price
models      = ["anthropic/claude-3-haiku"]

# Default pricing in USDC microunits per 1M tokens. Overridable per model.
[pricing]
default_input_per_1m  = 300000              # $0.30
default_output_per_1m = 600000              # $0.60

[pricing.models."llama3.1:70b"]
input_per_1m  = 400000
output_per_1m = 800000

# Optional concurrency / rate limits.
[limits]
max_concurrent        = 8                  # default 8
max_tokens_per_minute = 2_000_000          # optional, no cap by default

# Observability.
[observability]
prometheus_addr = "127.0.0.1:9090"          # default; bind 0.0.0.0:9090 for
                                            # cross-host scraping
log_level       = "info"                    # error|warn|info|debug|trace
```

**Validation rules** (from `provider-agent/src/config.rs`):

- `coordinator.url` must be `wss://` in production. `ws://` requires `--allow-insecure` at the CLI.
- At least one `[[backends]]` block must be present.
- `kind` must be one of the supported strings.
- `wallet` must look like a Solana base58 address; the agent does not on-chain-verify it, the coordinator does at first withdraw.

Run `usepod-agent validate` to confirm the config parses and backends are reachable, without opening the coordinator WebSocket.

## Environment variables

| Variable                  | Purpose                                                     |
| ------------------------- | ----------------------------------------------------------- |
| `USEPOD_AGENT_CONFIG`     | Path to `agent.toml` (alternative to `--config`)            |
| `USEPOD_ENROLLMENT_CODE`  | Override `coordinator.enrollment_code` without editing TOML |
| `RUST_LOG`                | Override `observability.log_level` per run                  |
| Per-backend `api_key_env` | The env var names declared in `[[backends]].api_key_env`    |
