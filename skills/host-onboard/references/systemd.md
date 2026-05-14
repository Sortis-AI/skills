# Running `usepod-agent` as a managed service

The agent's `usepod-agent` command (no subcommand) is the long-lived run loop. There is no `--daemon` flag — the bare process IS the daemon. A supervisor's job is to start it at boot, restart it on crash, and route its logs somewhere durable.

## Linux + systemd (recommended)

The canonical unit ships in the release tarball at `provider-agent/install/usepod-agent.service`. Pasted here verbatim from `provider-agent/v0.1.1` for reference; always prefer the file shipped with the release matching your installed binary.

```ini
[Unit]
Description=Use Pod Provider Agent
Documentation=https://usepod.ai/docs/agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=usepod
Group=usepod
WorkingDirectory=/var/lib/usepod-agent
ExecStart=/usr/local/bin/usepod-agent
Restart=always
RestartSec=5

# --- Hardening --------------------------------------------------------------
# Conservative defaults; relax if your backend or identity path requires it.
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
PrivateTmp=true
ReadWritePaths=/var/lib/usepod-agent
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true

[Install]
WantedBy=multi-user.target
```

### One-time setup

```bash
# 1. Service user + state dir (the identity key lives here)
sudo useradd --system --home /var/lib/usepod-agent --shell /usr/sbin/nologin usepod
sudo install -d -o usepod -g usepod -m 0750 /var/lib/usepod-agent

# 2. Drop the agent.toml in /etc (readable by the service user only)
sudo install -d -o root  -g usepod -m 0750 /etc/usepod-agent
sudo install -o root -g usepod -m 0640 agent.toml /etc/usepod-agent/agent.toml

# 3. Tell the agent where its config lives
sudo tee /etc/usepod-agent/usepod-agent.env <<'EOF'
USEPOD_AGENT_CONFIG=/etc/usepod-agent/agent.toml
EOF

# 4. Install the unit (add EnvironmentFile + identity path overrides if needed)
sudo cp usepod-agent.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now usepod-agent
```

If the agent reads any environment variables (e.g. `OPENROUTER_API_KEY` for a BYOK backend), add an `EnvironmentFile=` directive pointing at a root-readable env file with mode 0600.

### When to relax the hardening flags

The default unit is intentionally strict. If the agent needs to:

- **Read identity from `~/.usepod-agent/identity.key`** (the default), keep `key_path` in `agent.toml` set to `/var/lib/usepod-agent/identity.key` instead — that path is already in `ReadWritePaths=`.
- **Reach a backend on a Unix socket** (some Ollama deployments), add `ReadWritePaths=/run/ollama` (or wherever the socket lives).
- **Use a custom Prometheus bind** that needs a privileged port (<1024), add `CAP_NET_BIND_SERVICE` to `AmbientCapabilities=` rather than running as root.

Do not blanket-remove the hardening. Each flag prevents a specific class of compromise; relax the minimum needed for each operator's setup.

### Operations

```bash
sudo systemctl status usepod-agent           # one-screen status
journalctl -u usepod-agent -f                # follow logs
journalctl -u usepod-agent --since '1h ago'  # last hour
sudo systemctl restart usepod-agent          # graceful restart
sudo systemctl reload-or-restart usepod-agent
```

`Restart=always` + `RestartSec=5` means a crash recovers within 5 seconds and earnings resume. If the unit goes into `failed` state (5 restarts in 10s, the systemd default), it stays down until manual intervention — that's intentional, to keep a broken host from thrashing the coordinator.

## Docker / OCI

The release ships `usepod/provider-agent:<version>` images (also `:latest`). Useful when the operator already runs everything containerized.

```bash
docker volume create usepod-agent

docker run -d --name usepod-agent \
    --restart=always \
    -v usepod-agent:/var/lib/usepod-agent \
    -v $PWD/agent.toml:/etc/usepod-agent/agent.toml:ro \
    -p 127.0.0.1:9090:9090 \
    usepod/provider-agent:latest \
    --config /etc/usepod-agent/agent.toml
```

The volume persists the identity keypair across container replacements — without it, every container restart looks like a new host to the coordinator. Bind the Prometheus port to `127.0.0.1:9090` unless monitoring is on a trusted internal network.

For GPU access, add the appropriate runtime flags:

```bash
# NVIDIA
docker run --gpus=all ...

# AMD ROCm
docker run --device=/dev/kfd --device=/dev/dri ...
```

The agent itself doesn't need GPU access — the GPU is used by the backend (vLLM, Ollama, etc.) running in a separate container or on the host.

## macOS / launchd

For a desktop Mac running as a Use Pod host, install a launchd plist at `~/Library/LaunchAgents/ai.usepod.agent.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>           <string>ai.usepod.agent</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/local/bin/usepod-agent</string>
    <string>--config</string>
    <string>/Users/USER/.usepod-agent/agent.toml</string>
  </array>
  <key>RunAtLoad</key>       <true/>
  <key>KeepAlive</key>       <true/>
  <key>StandardOutPath</key> <string>/Users/USER/.usepod-agent/agent.log</string>
  <key>StandardErrorPath</key> <string>/Users/USER/.usepod-agent/agent.log</string>
</dict>
</plist>
```

Load it:

```bash
launchctl load -w ~/Library/LaunchAgents/ai.usepod.agent.plist
```

## Windows / NSSM (or service-runner of choice)

Wrap the `.exe` with [NSSM](https://nssm.cc/) or `sc.exe create` for a managed Windows service. The same considerations apply: bind Prometheus to localhost, persist the identity key in a per-user state directory, and use the service-manager's auto-restart facility.

## Anti-patterns

- `nohup usepod-agent &` in a login shell. Loses the process on logout, on reboot, and on terminal close.
- `screen` or `tmux` sessions as primary deployment. Same problem, slightly more fragile.
- Running as `root`. The unit's `User=usepod` is there for a reason — a compromised agent should not own the box.
- `Restart=on-failure` instead of `Restart=always`. Some legitimate exits (e.g., a clean WS close from the server during a coordinator restart) are not "failures" but the agent should still come back up.

The shipped systemd unit gets all of this right out of the box. Use it.
