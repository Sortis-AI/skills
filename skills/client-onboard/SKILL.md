---
name: client-onboard
description: This skill should be used when the user asks to "onboard to use pod", "set up use pod", "register a use pod account", "fund my use pod account", "deposit usdc into use pod", "get a use pod api key", "connect use pod to claude / cursor / openai / langchain / langgraph / cline / aider / continue / hermes", or otherwise needs to register a Use Pod API token, fund it with USDC, and wire it into an inference client (the demand side). For setting up a GPU host that earns by serving inference, use the host-onboard skill instead. Provides the full client-side onboarding flow: register → display funding instructions → poll for funding → emit a per-harness connection snippet.
version: 0.1.0
---

# Use Pod Client Onboarding

## Overview

Use Pod is an OpenAI- and Anthropic-compatible inference marketplace settled in USDC on Solana. An end user gets onto Use Pod in four steps: register an API token, fund the token with USDC, pick the inference client they actually use, and copy the matching connection snippet.

Drive this skill from start to finish whenever a user wants to start using Use Pod. Do not skip the funding-monitor step — the API token returned by registration is inactive until at least one USDC unit lands in its balance, and inference requests against an unfunded token will fail with HTTP 402.

The Use Pod API is **OpenAI-compatible at `/proxy/{token}/v1/...`** and **Anthropic-compatible at `/proxy/{token}/...`**. Every popular agent harness slots into one of those two surfaces by changing a base URL.

## Workflow

Execute these four steps in order. Two scripts in `scripts/` handle the network side; one reference file in `references/` holds the per-harness snippets to emit at the end.

### Step 1 — Register the token

Call `POST https://api.usepod.ai/v1/register` (no auth, no body) to mint a new API token. The response includes the token, a unique deposit code that ties on-chain USDC transfers to this token, the on-chain contract address, and a one-click dashboard URL preloaded with the token.

Use the bundled script:

```bash
./scripts/register.sh
```

It prints four lines: `api_token`, `deposit_code`, `dashboard_url`, `contract_address`. Capture all four. The `api_token` is a UUID — surface its first eight characters when referring to it later in conversation so the user can match it against the dashboard.

If `register.sh` fails, fall back to a direct call and parse the JSON:

```bash
curl -sf -X POST https://api.usepod.ai/v1/register | python3 -m json.tool
```

### Step 2 — Direct the user to the funding dashboard

Show the user the `dashboard_url` from Step 1 (typically `https://usepod.ai/dashboard/<uuid>`). The page displays:
- The deposit address (Solana, USDC mint) as a QR code and copyable string
- The unique deposit code that scopes the on-chain transfer to this token
- A live balance counter

State the funding options plainly:
- **Solana wallet**: send USDC (Solana SPL token) to the deposit address with the deposit code in the transaction memo. Settles in seconds.
- **Stripe / card**: the dashboard offers a card flow that mints USDC behind the scenes.

A $5 deposit is the recommended starting amount — enough for thousands of small inference calls without overcommitting. Make clear that the funds are spendable on inference only; there is no monthly subscription and unused balance can be withdrawn (when withdrawal is enabled for the user's flow).

Do not invent a deposit address. The address came from `register.sh` (`contract_address` field) and may differ between environments. Always use the value returned by `/v1/register`.

### Step 3 — Monitor for funding

Run the polling script:

```bash
./scripts/wait-for-funding.sh <api_token>
```

It calls `GET https://api.usepod.ai/proxy/<token>/balance` every 5 seconds, prints `Pending…` lines to stderr, and exits 0 with a `Funded: $X.XX USDC` line on stdout the moment `usdc_balance > 0`. Default timeout is 30 minutes; override with `--interval <seconds>` and `--timeout <seconds>` if needed.

Stay present in the conversation while the script polls. Give the user a one-line status update every minute or so ("Still waiting for the deposit to land — Solana settlement is usually under a minute") and avoid spamming faster than that. On timeout, surface the error clearly and offer to retry, troubleshoot (wrong address, wrong memo, wrong network), or switch to the Stripe flow on the dashboard.

The balance is reported in **USDC microunits** — the on-chain USDC mint uses 6 decimals, so 1 USDC = 1,000,000 microunits. The script already converts to dollars in the human-readable line; preserve that conversion in any output to the user.

### Step 4 — Ask which harness, then emit the snippet

Once funded, ask the user **which inference client they're using**. Do not guess. Offer the common options explicitly:

> "Funded — your token is `{token_prefix}…`. Which client are you wiring this into? Common choices: Claude Code, Cursor, the OpenAI Python or Node SDK, the Anthropic SDK, LangChain / LangGraph, Continue.dev, Cline, Aider, Hermes, or a direct curl."

When the user answers, look up the matching block in `references/harness-snippets.md` and emit it verbatim, with `<TOKEN>` substituted by the actual `api_token`. Each block in that reference file is self-contained: env vars to export, an SDK snippet, and any harness-specific quirks (Cursor's settings panel path, Continue's `config.json` shape, Aider's `--openai-api-base`, etc.).

If the user names a harness not in the reference, decide which surface it speaks (OpenAI or Anthropic) by inspecting its docs or by asking the user, then emit the closest matching block adapted to that surface. The two base URLs to choose from:

- OpenAI-compatible: `https://api.usepod.ai/proxy/<TOKEN>/v1`
- Anthropic-compatible: `https://api.usepod.ai/proxy/<TOKEN>`

Each block in `references/harness-snippets.md` already includes a verification step (a one-line curl, a single SDK call, or a dashboard ping) at the bottom. Surface that verification line as the agent's closing message rather than fabricating a second one.

## Optional price ceilings

After Step 4, mention that the user can constrain per-request pricing via two headers:

```
X-Pod-Max-Price-Input: 400000      # 0.40 USDC per 1M input tokens
X-Pod-Max-Price-Output: 600000     # 0.60 USDC per 1M output tokens
```

If the marketplace cannot match a provider at or below the ceiling, the request returns HTTP 402 with a structured body indicating the lowest available price. The user's client can then retry with a higher ceiling, route to a cheaper model, or surface the price to the user.

Do not enable these by default. Mention them only if the user asks about cost control or sees their first call surprise them.

## Edge cases

**Registration rate limit.** `/v1/register` is rate-limited to 10 requests per minute per client IP. If the user is behind a shared NAT and gets a 429, wait 60 seconds and retry — or switch to a different network briefly.

**Dashboard URL points at a non-default deployment.** Self-hosted Use Pod deployments override `DASHBOARD_BASE_URL`. Always use the `dashboard_url` returned by `/v1/register` rather than hardcoding `usepod.ai`.

**User already has a token.** If the user mentions an existing `api_token`, skip Step 1 and call `GET /proxy/<token>/balance` first. That response carries an `is_active` boolean; if it is `true` and `usdc_balance > 0`, go straight to Step 4. If inactive or empty, proceed with Steps 2-3. (Note: `status: "pending_deposit"` appears only on `/v1/register`; the balance endpoint uses `is_active` instead.)

**Multiple harnesses.** A user may want to wire the same token into more than one tool. Emit snippets for each — they can all share the same token.

## Additional resources

### Reference files

For the full endpoint contracts and the per-harness snippets, consult:

- **`references/api.md`** — Exact request/response shapes for `POST /v1/register`, `GET /proxy/{token}/balance`, and the inference surfaces. Use when constructing direct API calls or debugging unexpected responses.
- **`references/harness-snippets.md`** — Copy-paste blocks for Claude Code, Cursor, OpenAI Python/Node SDKs, Anthropic Python/Node SDKs, LangChain (Python/JS), LangGraph, Continue.dev, Cline, Aider, Hermes, and raw curl. One block per harness with env vars, SDK code, and a verification command.

### Scripts

- **`scripts/register.sh`** — `POST /v1/register`, parse the JSON, print four fields (`api_token`, `deposit_code`, `dashboard_url`, `contract_address`). Honors `USEPOD_API` to override the base URL for self-hosted deployments.
- **`scripts/wait-for-funding.sh`** — Poll `GET /proxy/{token}/balance` until `usdc_balance > 0` or the timeout expires. Prints `Pending…` to stderr during the wait and `Funded: $X.XX USDC` to stdout on success. Flags: `--interval <s>` (default 5), `--timeout <s>` (default 1800). Honors `USEPOD_API`.

Both scripts require `curl` and `python3`. No other dependencies.
