---
name: host-onboard
description: This skill should be used when the user asks to "set up a use pod host", "run a use pod gpu host", "start a use pod node", "become a use pod provider", "rent out my gpu on use pod", "mine usdc with my gpu", "use pod operator setup", "operate use pod", "pair my host", "install the use pod agent", "join the use pod marketplace as a provider", "earn usdc serving inference", "host inference on use pod", or otherwise wants to install the `usepod-agent` on a GPU box, pair it with the marketplace, and start serving inference for USDC. For wiring a Use Pod API key into an inference client (the demand side), use the client-onboard skill instead. Drives the full operator flow: preflight checks → install agent → pair with dashboard → post the $50 USDC bond → run under systemd → set up health monitoring → handle upgrades and uninstalls.
version: 0.1.0
---

# Use Pod Host Onboarding

## Overview

Use Pod's supply side is run by independent operators who connect a GPU host to the marketplace coordinator and serve inference requests for USDC. The operator side is the harder side — installing software, configuring a backend, posting a bond, dealing with health and upgrades — so this skill walks the operator (or an agent acting for them) through every step in order, with troubleshooting for the predictable failure modes.

The host runs the `usepod-agent` binary, a single Rust executable that maintains an outbound WebSocket to the Use Pod coordinator. The agent dispatches inference jobs to one or more local backends (vLLM, llama.cpp, LM Studio, Ollama) or BYOK upstreams (OpenRouter, Venice, Together, Groq, Morpheus). No inbound port is needed — the operator does not need to expose anything through their NAT or firewall.

Always run the full flow in order. Steps 1-2 (preflight + install) are local. Steps 3-5 (enroll, pair, bond) require the operator's dashboard and a Solana wallet. Step 6 (run as a service) is the long-lived state. Steps 7-9 cover the ongoing concerns: health, upgrades, teardown.

## Workflow

### Step 1 — Preflight checks

Before installing anything, verify the host has the prerequisites:

```bash
./scripts/preflight.sh
```

The script checks:
- GPU driver presence and version (NVIDIA via `nvidia-smi`, AMD via `rocminfo`, Apple via `system_profiler SPDisplaysDataType`)
- At least one supported inference backend is installed and reachable (vLLM, Ollama, llama.cpp, LM Studio) OR BYOK keys are configured
- Outbound HTTPS to `api.usepod.ai:443` and WebSocket reachability
- Free disk space for the agent binary plus model weights
- A Solana wallet address ready to receive earnings (informational — the agent's config holds it)

If a check fails, the script exits non-zero with a one-line cause. Resolve each failure before continuing. The agent will start without a backend, but it cannot serve traffic until at least one is reachable.

For non-NVIDIA hardware, see `references/inference-backends.md` — the most common path on AMD is vLLM with ROCm, on Apple Silicon is Ollama or MLX-served models, and CPU-only hosts can run small models via llama.cpp.

### Step 2 — Install the agent

Install on Linux or macOS:

```bash
curl -fsSL https://usepod.ai/install.sh | sh
```

On Windows:

```powershell
irm https://usepod.ai/install.ps1 | iex
```

The installer detects the platform, downloads the latest signed binary from GitHub releases, verifies its SHA-256, and installs to `/usr/local/bin/usepod-agent` (Linux/macOS) or `%ProgramFiles%\usepod\usepod-agent.exe` (Windows).

Pin a specific version:

```bash
USEPOD_VERSION=v0.1.1 curl -fsSL https://usepod.ai/install.sh | sh
```

Confirm:

```bash
usepod-agent version
```

### Step 3 — Author `agent.toml`

The agent reads its config from `agent.toml` (default search path: `./agent.toml`, `~/.usepod-agent/agent.toml`, `/etc/usepod-agent/agent.toml`). See `references/api.md` §`agent.toml` for the full schema. The minimum:

```toml
[operator]
display_name = "your-name"
wallet       = "<your Solana wallet>"

[coordinator]
url = "wss://api.usepod.ai/provider/connect"

[[backends]]
kind = "ollama"
url  = "http://127.0.0.1:11434"

[pricing]
default_input_per_1m  = 300000     # $0.30 / 1M input tokens
default_output_per_1m = 600000     # $0.60 / 1M output tokens
```

Validate the file without networking:

```bash
usepod-agent validate
```

A failure here is always a config-syntax or backend-reachability issue; fix it before continuing.

### Step 4 — Enroll and pair

Print the agent's identity:

```bash
usepod-agent enroll
```

This prints the host's Ed25519 public key, the provider_id (empty if not yet paired), and any enrollment_code already in the config. Generate a pair code at the dashboard:

1. Open `https://usepod.ai/host/pair` in a browser.
2. The dashboard generates a `pair_code` and shows the operator's public key fingerprint to verify against the line printed by `usepod-agent enroll`. Fingerprints must match.
3. Paste the pair code into `agent.toml` under `coordinator.enrollment_code`, or pass it via `USEPOD_ENROLLMENT_CODE` env var. Re-run `usepod-agent validate` to confirm.

### Step 5 — Post the $50 USDC bond (needs SOL for gas)

The dashboard shows a deposit address and the operator's deposit code. The operator sends **$50 USDC** to that address, with the deposit code in the transaction memo.

**SOL for gas:** the bond send is a Solana token transfer. The operator's wallet needs **roughly 0.005 SOL** to cover Solana transaction fees, possibly more if the destination token account hasn't been initialized (rent-exempt minimum ≈ 0.002 SOL per associated token account). If the wallet is empty of SOL, fund it with a small amount first — `0.01 SOL` is more than enough headroom.

The `pair_claim` API call itself (which the agent makes after the bond is detected on-chain) is a coordinator RPC and uses no SOL. The SOL requirement is purely for the on-chain bond transfer.

The dashboard polls for the deposit and flips the host to `active` once the bond confirms (typically <1 minute).

### Step 6 — Run as a managed service

The canonical way to run a Use Pod host is the `usepod-agent` process itself as a long-lived daemon under a system supervisor. The agent has no `--daemon` flag — the bare `usepod-agent` (with no subcommand) IS the long-running run loop. Wrap it in systemd, launchd, or a container runtime.

**Linux + systemd (recommended):** see `references/systemd.md` for the canonical unit file (`provider-agent/install/usepod-agent.service` in the release tarball), the service-user setup, and the state directory layout. After dropping the unit in place:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now usepod-agent
sudo systemctl status usepod-agent
journalctl -u usepod-agent -f
```

**Docker / OCI:** the release ships `usepod/provider-agent:<version>` images. See `references/systemd.md` §Docker for a one-line `docker run` invocation with persistent identity volume.

**macOS / launchd, Windows / NSSM:** the agent runs the same way; only the supervisor differs. The agent's job is to keep an outbound WS open and dispatch jobs; the supervisor's job is to restart it on crash and bring it back after reboot.

Do not run `usepod-agent` under `nohup` or in a tmux pane as the primary deployment. Without a supervisor, a process crash or reboot silently takes the host offline and the operator's earnings drop to zero until they notice.

### Step 7 — Health monitoring

The agent exposes a Prometheus-format metrics endpoint on `127.0.0.1:9090/metrics` by default (configurable via `observability.prometheus_addr` in `agent.toml`). For an operator-friendly liveness probe:

```bash
./scripts/health-check.sh
```

This prints the agent's last-seen WebSocket state, jobs-per-minute over the past 5 minutes, the wallet's remote USDC earnings, and the local backend's reachability. Run it ad-hoc, from a cron, or wire it into the operator's existing monitoring stack.

See `references/health.md` for the metrics dictionary, the log patterns worth alerting on (`error: ws disconnect`, `backend timeout`, `dispatch failed`), and recommended alert thresholds.

### Step 8 — Upgrades

To upgrade the agent in place:

```bash
sudo systemctl stop usepod-agent
USEPOD_VERSION=v0.2.0 curl -fsSL https://usepod.ai/install.sh | sh
usepod-agent validate              # config may have new required fields
sudo systemctl start usepod-agent
sudo systemctl status usepod-agent
```

**If the upgrade exits non-zero or the service won't start:** keep a backup before each upgrade (`sudo cp /usr/local/bin/usepod-agent /usr/local/bin/usepod-agent.prev` before the curl pipe), and roll back by copying `.prev` over the live binary and restarting. See `references/upgrade.md` for the full procedure: when the installer's own failures are recoverable without rollback, config-migration handling for new required fields, and the canary-upgrade pattern for fleets of agents.

### Step 9 — Uninstall and teardown

To take a host offline cleanly and recover the bond, see `references/uninstall.md`. Summary:

1. Click "Retire host" on the dashboard at `https://usepod.ai/host`. The agent has no retire subcommand — retirement is dashboard-driven so the coordinator can confirm in-flight jobs drain before the host is removed from routing.
2. Stop and disable the systemd unit (or supervisor equivalent).
3. Wait for the 90-day cooldown to elapse, then the bond returns to the operator's wallet automatically.
4. Remove the binary, config, identity key, and state directory.

The 90-day cooldown is mandatory — it gives the canary system time to flag any retroactive fraud signals. Operators who try to bypass it by deleting the agent without retiring lose the bond.

## Edge cases

**Wallet has no SOL.** The bond send fails with "Account not found" or "Transaction simulation failed: insufficient lamports". Send 0.01 SOL to the wallet first (any exchange, faucet, or another wallet), then retry the USDC transfer.

**Backend reachable but model not loaded.** vLLM/Ollama report 200 OK on `/v1/models` but return 503 on actual inference. The agent's reputation will throttle the host within minutes. Run `usepod-agent validate` then exercise each declared model with a one-token completion before going live.

**WebSocket reconnect storm.** If the agent logs `ws disconnect` more than once per minute, suspect a flaky network, a corporate proxy, or a `--allow-insecure ws://` config pointing at a stale coordinator URL. Production URL is always `wss://api.usepod.ai/provider/connect`.

**Multiple GPUs.** Declare one `[[backends]]` block per GPU process (e.g., one `kind = "vllm"` block per port). The agent fan-outs requests across all of them with the configured `max_concurrent` limits.

## Additional resources

### Reference files

For details consult:

- **`references/api.md`** — Host-side endpoints (`POST /v1/host/enroll`, `/v1/host/pair/claim`, `GET /v1/host/balance`, `POST /v1/host/withdraw`), the full `agent.toml` schema, and the WebSocket job protocol summary.
- **`references/inference-backends.md`** — Per-backend setup notes for vLLM (NVIDIA CUDA + AMD ROCm), Ollama (cross-platform, easiest for first-time operators), llama.cpp / LM Studio (CPU-friendly), MLX for Apple Silicon, and BYOK upstreams.
- **`references/systemd.md`** — The canonical `usepod-agent.service` unit, the service-user setup, the hardening flags and when to relax them, plus the Docker and launchd alternatives.
- **`references/health.md`** — Prometheus metrics dictionary, log patterns to alert on, recommended thresholds, the dashboard's host-health view.
- **`references/upgrade.md`** — Full upgrade procedure with binary-rollback, config-migration handling, and the canary-upgrade pattern for fleets of agents.
- **`references/uninstall.md`** — Graceful retirement flow, bond return timing, and the file/directory inventory to remove.

### Scripts

- **`scripts/preflight.sh`** — Run before installing. Checks GPU drivers (NVIDIA / AMD ROCm / Apple Silicon), at least one inference backend, outbound HTTPS + WSS to the coordinator, free disk, and the wallet address. Exit 0 = ready to install.
- **`scripts/health-check.sh`** — Run anytime after install. Queries the agent's local metrics endpoint and the coordinator's host balance endpoint. Prints a one-screen status: WS state, recent jobs, earnings, backend reachability. Exit 0 = healthy.

Both scripts require `curl` and `jq`. The health script also wants `awk`.
