# Host health monitoring

A host that's silently degraded loses traffic to the reputation throttle long before any human notices. Set up monitoring at install time, not after the first earnings dip.

## Three sources of truth

1. **Local Prometheus metrics** — `http://127.0.0.1:9090/metrics` on the agent. Cheapest signal, no auth.
2. **systemd / launchd / docker status** — is the process up at all.
3. **Coordinator-side dashboard** — `https://usepod.ai/host` shows the canonical reputation score, recent job count, throttle state. Authoritative but lags by ~30 s.

Wire all three. Local metrics catch hangs and slow paths; the supervisor catches crashes; the dashboard catches anything the agent missed reporting.

## Metrics worth alerting on

The agent exposes (names approximate; verify with `curl 127.0.0.1:9090/metrics | grep usepod`):

| Metric                                 | Type      | Alert threshold                              |
|----------------------------------------|-----------|----------------------------------------------|
| `usepod_agent_ws_connected`            | gauge     | `< 1` for > 60 s                             |
| `usepod_agent_ws_reconnects_total`     | counter   | `> 5 per 5 min`                              |
| `usepod_agent_jobs_total`              | counter   | rate over 5 min drops to 0 during peak hours |
| `usepod_agent_job_duration_seconds`    | histogram | p95 > 30 s for streaming, > 5 s pre-stream   |
| `usepod_agent_backend_ok`              | gauge     | `< 1` for any backend for > 30 s             |
| `usepod_agent_dispatch_failures_total` | counter   | `> 5%` of jobs over 5 min                    |
| `process_resident_memory_bytes`        | gauge     | > 2× baseline (memory leak indicator)        |

The reputation score itself is not exposed locally — it lives on the coordinator and is computed from completion success rate, p50 latency, benchmark canary agreement, and tenure. Watch the dashboard's host page for it, or alert on the symptoms above which feed into it.

## Log patterns to alert on

Tail with `journalctl -u usepod-agent -f` (Linux) or `tail -F ~/.usepod-agent/agent.log` (mac/Windows). Patterns:

| Pattern                                          | Severity | Meaning                                                    |
|--------------------------------------------------|----------|------------------------------------------------------------|
| `ws disconnect`                                  | warn     | One disconnect is fine; >1/min indicates a network problem |
| `backend timeout`                                | warn     | The model isn't responding; check backend health           |
| `dispatch failed`                                | error    | Job couldn't be routed; reputation will dip                |
| `coordinator: throttled (reputation \d+)`        | error    | Reputation crossed the throttle threshold                  |
| `identity key: permission denied`                | crit     | Service user can't read the keypair; agent will not start  |
| `unauthorized: host token invalid`               | crit     | `host_token` was revoked or rotated; rerun pair flow       |
| `tls handshake failed`                           | warn     | Often a corporate proxy or cert pinning issue              |
| `panic`                                          | crit     | Bug; capture the journal and file an issue                 |

Grep recipe to surface anything noteworthy in the last hour:

```bash
journalctl -u usepod-agent --since '1h ago' \
  | grep -iE 'error|warn|panic|disconnect|throttle|unauthorized|timeout' \
  | head -40
```

## Recommended alert thresholds

For an operator with one or two hosts, the threshold floor is "did the agent stop earning?" Quick wins:

- **Alert if `usepod_agent_ws_connected == 0` for more than 2 minutes.** This is the canary — every other signal is downstream of it.
- **Alert if there were zero `usepod_agent_jobs_total` increments in the last 15 minutes during typical-load hours.** Use the operator's observed traffic curve as the baseline; if a host normally runs 50 jobs/min and goes silent at noon, page.
- **Alert if the dashboard's reputation score drops below 0.6.** Below ~0.5 the host is auto-excluded from routing.

Pair these with a low-effort heartbeat: cron the `scripts/health-check.sh` script every 5 minutes from a different machine and page if it exits non-zero twice in a row.

## Dashboard signals

At `https://usepod.ai/host`, the operator's dashboard shows:

- Current rank in the network UI (relative to other operators on the same model).
- Jobs served per hour, broken down by model.
- Top-earning models for this host.
- Pending withdrawals.
- Recent reputation score with its components (success rate, latency, benchmark agreement).
- Throttle state with a human-readable reason.

When earnings drop unexpectedly, this is the first place to look. The dashboard's "throttle reason" string is usually enough to fix the underlying issue without digging into logs.

## On-call escalation

When a critical alert fires:

1. `systemctl status usepod-agent` — is the process up?
2. `curl -sI http://127.0.0.1:9090/metrics` — is the agent responsive?
3. Tail the journal — what's the most recent error?
4. Check the backend independently (vLLM/Ollama/etc.) — is THE INFERENCE ENGINE reachable from the agent's user?
5. Check `https://usepod.ai/host` for any coordinator-side throttle or maintenance notice.
6. If everything looks healthy locally but the dashboard shows zero recent jobs, the issue is upstream — check `https://usepod.ai/network` or `usepod.ai/transparency` for any coordinator-wide incident.

If the local agent looks broken (panics, identity errors, persistent reconnects despite a working network), the fastest recovery is usually: stop the unit, run `usepod-agent validate` to confirm config integrity, and `usepod-agent enroll` to confirm identity, then restart. Last resort: re-pair the host via the dashboard (preserves earnings, swaps the keypair).
