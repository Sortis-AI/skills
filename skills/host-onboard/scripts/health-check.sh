#!/usr/bin/env bash
# One-screen liveness check for a Use Pod host. Cron this every 5 minutes
# from a different machine; page if it exits non-zero twice in a row.
#
# Usage:
#   ./health-check.sh                          # local metrics only
#   ./health-check.sh --host-token <pod_host_…> # also pulls remote balance
#
# Exit codes:
#   0 = healthy
#   1 = local agent unreachable or WS down
#   2 = backend(s) unhealthy
#   3 = remote API check failed (network or auth)
#
# Requirements: curl, jq, awk.

set -u

PROM="${USEPOD_PROM_ADDR:-http://127.0.0.1:9090/metrics}"
API_BASE="${USEPOD_API:-https://api.usepod.ai}"
HOST_TOKEN=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host-token) HOST_TOKEN="$2"; shift 2 ;;
        --prom)       PROM="$2"; shift 2 ;;
        -h|--help)
            sed -n '2,15p' "$0" >&2
            exit 0
            ;;
        *) echo "unknown arg: $1" >&2; exit 1 ;;
    esac
done

for cmd in curl jq awk; do
    command -v "$cmd" >/dev/null || { echo "error: $cmd required" >&2; exit 1; }
done

echo "=== Use Pod host health ==="
echo "metrics: $PROM"
echo "api:     $API_BASE"
echo

# ---- Local metrics -------------------------------------------------------

metrics=$(curl -sf --max-time 5 "$PROM" 2>/dev/null) || {
    echo "AGENT: UNREACHABLE — the agent isn't responding on $PROM"
    echo "  - is the service running? (systemctl status usepod-agent)"
    echo "  - is prometheus_addr in agent.toml pointing where you expect?"
    exit 1
}

extract() {
    # extract <metric_name>
    printf '%s\n' "$metrics" | awk -v m="$1" '
        $0 ~ "^"m"(\\{|[[:space:]])" {
            for (i=NF; i>0; i--) if ($i ~ /^[0-9.eE+-]+$/) { print $i; exit }
        }'
}

ws_connected=$(extract usepod_agent_ws_connected)
ws_reconnects=$(extract usepod_agent_ws_reconnects_total)
jobs_total=$(extract usepod_agent_jobs_total)
dispatch_fail=$(extract usepod_agent_dispatch_failures_total)
backend_ok=$(extract usepod_agent_backend_ok)
mem=$(extract process_resident_memory_bytes)

echo "WS connected:        ${ws_connected:-?}"
echo "WS reconnects total: ${ws_reconnects:-?}"
echo "Jobs total:          ${jobs_total:-?}"
echo "Dispatch failures:   ${dispatch_fail:-?}"
echo "Backend OK:          ${backend_ok:-?}"
if [[ -n "${mem:-}" ]]; then
    mem_mb=$(awk -v b="$mem" 'BEGIN{printf "%.0f", b/1024/1024}')
    echo "Agent memory:        ${mem_mb} MB"
fi
echo

status=0

if [[ "${ws_connected:-0}" != "1" ]]; then
    echo "STATUS: WS DOWN — the agent is not connected to the coordinator"
    echo "  journalctl -u usepod-agent -n 50"
    status=1
fi

if [[ -n "${backend_ok:-}" ]] && [[ "$backend_ok" != "1" ]]; then
    echo "STATUS: BACKEND UNHEALTHY — at least one declared backend isn't responding"
    echo "  test it directly: curl http://127.0.0.1:<port>/v1/models"
    [[ $status -lt 2 ]] && status=2
fi

# ---- Remote balance (optional) ------------------------------------------

if [[ -n "$HOST_TOKEN" ]]; then
    bal=$(curl -sf --max-time 5 -H "Authorization: Bearer $HOST_TOKEN" \
              "$API_BASE/v1/host/balance" 2>/dev/null) || {
        echo "REMOTE: API call failed (network or invalid host_token)"
        status=3
    }
    if [[ -n "${bal:-}" ]]; then
        usdc_micro=$(printf '%s' "$bal" | jq -r 'try .usdc_balance catch 0')
        if [[ "$usdc_micro" =~ ^[0-9]+$ ]]; then
            usdc=$(awk -v u="$usdc_micro" 'BEGIN{printf "%.6f", u/1000000}')
            echo "Remote USDC balance: \$${usdc}"
        fi
    fi
fi

echo
if (( status == 0 )); then
    echo "STATUS: OK"
fi
exit $status
