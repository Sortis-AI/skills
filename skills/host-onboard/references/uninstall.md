# Uninstalling and teardown

A clean teardown gets the operator's bond back and leaves no residue on the host. There are two paths: **graceful retirement** (bond returns after the 90-day cooldown) and **immediate uninstall** (bond may be slashed if active jobs are dropped).

## Graceful retirement (recommended)

1. **Open `https://usepod.ai/host` and click "Retire host".** This calls `POST /v1/host/retire` server-side, marks the host as `retiring` in the registry, and stops dispatching new jobs to it. In-flight jobs are allowed to complete.

2. **Wait for the dashboard to show "Retired".** Usually under a minute — it waits for any streaming jobs to finish.

3. **Stop the systemd unit.** The agent will close the WebSocket cleanly.

   ```bash
   sudo systemctl stop usepod-agent
   sudo systemctl disable usepod-agent
   ```

4. **Withdraw remaining earnings.** From the dashboard, "Withdraw all". Or via API:

   ```bash
   curl -X POST https://api.usepod.ai/v1/host/withdraw \
     -H "Authorization: Bearer $HOST_TOKEN" \
     -d "{\"amount_usdc\": <balance>, \"destination\": \"$WALLET\"}"
   ```

   Subject to the v2.0 limits ($5 min, $10K daily cap, manual approval >$1K within first 30 days post-enrollment).

5. **Mark the cooldown start date on a calendar.** The $50 USDC bond auto-returns to the operator's wallet 90 days after retirement, assuming no fraud signals fired against the host in that window. The cooldown is mandatory — it gives the canary system time to flag any retroactive issues.

6. **Remove the agent files.** See §"File inventory" below.

The 90-day cooldown is the only thing that can't be shortened. Everything else is operator-paced.

## Immediate uninstall (bond may be slashed)

If the operator doesn't want to wait 90 days and is willing to forfeit the bond, the teardown is just:

```bash
sudo systemctl stop usepod-agent
sudo systemctl disable usepod-agent
# Then remove files per "File inventory" below.
```

The host will appear `offline` on the network UI and is excluded from routing immediately. The bond is held for 90 days regardless — if no fraud signals fire, it returns; if any fire, it's seized. Tearing down without retiring means there's no graceful close-of-streaming-jobs window, which is one of the signals the reputation system flags.

**Don't pick this path unless the host has near-zero recent traffic or the operator is OK losing $50.**

## File inventory

Files and directories created by the installer + agent. Remove in this order:

```bash
# 1. The binary
sudo rm -f /usr/local/bin/usepod-agent
sudo rm -f /usr/local/bin/usepod-agent.prev   # if you kept a rollback copy

# 2. The systemd unit + drop-ins
sudo rm -f /etc/systemd/system/usepod-agent.service
sudo rm -rf /etc/systemd/system/usepod-agent.service.d   # any drop-ins
sudo systemctl daemon-reload

# 3. The config + env file
sudo rm -rf /etc/usepod-agent

# 4. The state directory (HOLDS THE IDENTITY KEY — see below)
sudo rm -rf /var/lib/usepod-agent

# 5. The service user
sudo userdel usepod
sudo groupdel usepod 2>/dev/null || true

# 6. Any logs the operator wrote outside journald
sudo rm -f /var/log/usepod-agent*.log
```

On macOS / Windows, the equivalents:

| Path                                             | Platform  |
|--------------------------------------------------|-----------|
| `/usr/local/bin/usepod-agent`                    | Linux/mac |
| `%ProgramFiles%\usepod\usepod-agent.exe`         | Windows   |
| `~/.usepod-agent/identity.key`                   | per-user  |
| `~/.usepod-agent/agent.toml`                     | per-user  |
| `~/Library/LaunchAgents/ai.usepod.agent.plist`   | macOS     |
| Windows service registered via NSSM / sc.exe     | Windows   |

## ⚠️ The identity keypair

`/var/lib/usepod-agent/identity.key` (or `~/.usepod-agent/identity.key`) is the host's Ed25519 private key. It uniquely identifies this host to the coordinator. Three rules:

1. **Don't share it.** Anyone with the key can impersonate the host, claim its reputation, and (until rotation) collect its earnings.
2. **Don't re-use it across hosts.** Two agents presenting the same key fail to authenticate and both get blocked.
3. **Keep it if you might bring the host back online.** The reputation, the pairing, and the bond are all anchored to the keypair. Lose the key and the operator effectively has a new (zero-rep) host even after re-pair.

If the operator is permanently retiring the host, delete the key after the bond returns. If they might bring it back, copy `identity.key` to encrypted offline storage first.

## Verification

After teardown:

```bash
# No binary
which usepod-agent          # should return nothing

# No service
systemctl list-unit-files | grep usepod    # should return nothing

# No process
pgrep -lf usepod-agent      # should return nothing

# No files
ls /etc/usepod-agent /var/lib/usepod-agent 2>&1   # should be "no such file"
```

If all four return clean, the host is fully torn down on the local side. The coordinator-side state (provider record, transaction history, bond escrow) stays until the cooldown elapses and the bond is released.

## Bond return

The bond auto-returns to the operator's wallet on day 91 of cooldown. The return shows up on-chain as a USDC transfer from the Use Pod ops wallet. Check `https://usepod.ai/host` for the status — it transitions through `retiring` → `retired` → `cooldown` → `bond_returned`.

If the bond doesn't return on schedule:
- Verify the wallet address on the dashboard matches the wallet the operator controls. Bond-return goes to the wallet that was set at retirement time, not at enrollment.
- Confirm no fraud signals fired during the cooldown (the dashboard shows a flag).
- File an issue at `github.com/Sortis-AI/usepod/issues` with the host's provider_id and the retirement date.

Most cases resolve from the dashboard alone.
