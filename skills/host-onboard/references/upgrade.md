# Upgrading `usepod-agent`

The agent versions independently from the coordinator. Backwards compatibility is maintained across at least one minor version, so a v0.1 agent talks to a v0.2 coordinator and vice versa. Don't put off upgrades — security fixes and protocol enhancements ship via this channel.

## The boring, safe upgrade

```bash
# 1. Snapshot the current binary so rollback is one cp away.
sudo cp /usr/local/bin/usepod-agent /usr/local/bin/usepod-agent.prev

# 2. Stop the service.
sudo systemctl stop usepod-agent

# 3. Install the new version. Omit USEPOD_VERSION to take the latest.
USEPOD_VERSION=v0.2.0 curl -fsSL https://usepod.ai/install.sh | sh

# 4. Validate the config against the new agent (new required fields, deprecations).
sudo -u usepod usepod-agent --config /etc/usepod-agent/agent.toml validate

# 5. Start and watch for clean reconnect.
sudo systemctl start usepod-agent
journalctl -u usepod-agent -f
```

Wait for the `welcome` message in the journal and at least one job served before walking away. Total downtime ~10-30 s.

## If the upgrade exits non-zero

The installer is non-zero if:
- Download fails (bad version pin, network)
- SHA-256 verification fails (compromised mirror, partial download)
- Install dir is unwritable (privilege regression)

In all three cases, **the existing binary is untouched** — the installer writes to a temp file and only swaps at the last step. So a failed installer just means the upgrade didn't happen; you're back to where you started. Re-run after fixing the cause (pin a version that exists, check the network, verify `/usr/local/bin` perms).

If the installer succeeded but `usepod-agent validate` or `systemctl start` fails:

```bash
# 1. Roll back the binary.
sudo cp /usr/local/bin/usepod-agent.prev /usr/local/bin/usepod-agent

# 2. Restart.
sudo systemctl start usepod-agent

# 3. Confirm.
sudo systemctl status usepod-agent
journalctl -u usepod-agent -n 50
```

Then file an issue at `github.com/Sortis-AI/usepod/issues` with:
- The version you tried to upgrade to.
- The `usepod-agent validate` output (often shows the breaking config change).
- The first 100 journal lines from the failed start attempt.

## When the upgrade looks healthy but earnings drop

Two signals to watch for the first hour after a major version bump:

- **Reputation score on `https://usepod.ai/host`** — a protocol change can briefly drop benchmark-canary agreement until the agent retunes. Should recover within an hour.
- **`usepod_agent_dispatch_failures_total`** — if this counter jumps, the new agent is mis-routing jobs to the backend. Check for backend-config drift (vLLM API version, Ollama model-name canonicalization, etc.) and roll back if symptoms persist after 15 minutes.

A non-trivial rep dip > 1 hour after upgrade is rollback territory.

## Config migrations

New required fields, renamed sections, and deprecated keys are documented in each release's notes (`https://github.com/Sortis-AI/usepod/releases`). The pattern is:

- A deprecated key warns for one minor version, then is removed in the next.
- A new required key is gated behind `usepod-agent validate` — a previously-valid config that's now missing a field fails validation, and the agent refuses to start.

If `validate` complains about a new required field, edit `agent.toml` per the release notes and re-run. If it complains about a deprecated field, the agent will accept the config but log a warning; plan to migrate before the next upgrade.

## Canary upgrades for fleets

Operators running >5 hosts should upgrade one host first, watch it for an hour, then roll the rest:

```bash
# Pin the rest of the fleet to the current version while you test.
USEPOD_VERSION=v0.1.1 curl -fsSL https://usepod.ai/install.sh | sh   # no-op if already there

# Upgrade the canary.
ssh host-01 'USEPOD_VERSION=v0.2.0 curl -fsSL https://usepod.ai/install.sh | sh && sudo systemctl restart usepod-agent'

# Watch host-01's reputation + dispatch_failures for 1 hour.

# Then roll the rest.
for h in host-{02..20}; do
  ssh $h 'USEPOD_VERSION=v0.2.0 curl -fsSL https://usepod.ai/install.sh | sh && sudo systemctl restart usepod-agent'
done
```

Don't roll all hosts at once. A coordinator-side protocol regression that the canary catches is a 1-host-down incident; a fleet-wide regression is a multi-hour earnings hit.

## Auto-update (v2.x roadmap)

The whitepaper's v2.x scope mentions an auto-update channel (signed releases, opt-in). Until that ships, upgrades are operator-driven via the curl-installer above. Subscribe to the GitHub releases page to get notified.

## Don't

- Don't run `curl ... | sh` as root in a place where the install dir is also where the working agent lives. The installer doesn't need root for the download; only the final install step. The included install script handles this correctly via `sudo` only for the install-step.
- Don't upgrade by replacing the binary while the service is running. The currently-running process keeps using the inode of the old file, but a restart picks up the new one and `usepod-agent validate` can lie about a config that needs a newer agent. Always stop, install, validate, start.
- Don't skip `validate`. A failed start in production after a successful "looks like it installed" is the worst class of upgrade incident — most are catchable by a pre-flight `validate`.
