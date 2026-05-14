#!/usr/bin/env bash
# Poll a Use Pod token's balance until usdc_balance > 0, then print the
# funded amount. Designed for the onboarding skill — the agent runs this
# in the foreground while waiting for the user to send USDC.
#
# Usage:
#   ./wait-for-funding.sh <api_token> [--interval <seconds>] [--timeout <seconds>]
#
# Defaults: poll every 5 s, give up after 1800 s (30 min).
# Override the API base for self-hosted deployments via USEPOD_API.
#
# stdout (on success): single line "Funded: $X.XX USDC (N microunits)"
# stderr (during wait): "Pending: $0.00 USDC, Ns elapsed"
# exit 0 = funded, 1 = bad args / curl error, 2 = timeout.
#
# Requirements: curl, jq.

set -euo pipefail

usage() {
  cat <<EOF >&2
usage: $0 <api_token> [--interval <seconds>] [--timeout <seconds>]
EOF
  exit 1
}

command -v curl >/dev/null || { echo "error: curl is required" >&2; exit 1; }
command -v jq   >/dev/null || { echo "error: jq is required (install with apt/brew/choco)" >&2; exit 1; }

[[ $# -ge 1 ]] || usage

TOKEN="$1"; shift
INTERVAL=5
TIMEOUT=1800

while [[ $# -gt 0 ]]; do
  case "$1" in
    --interval) INTERVAL="$2"; shift 2 ;;
    --timeout)  TIMEOUT="$2";  shift 2 ;;
    -h|--help)  usage ;;
    *) echo "error: unknown arg '$1'" >&2; usage ;;
  esac
done

uuid_re='^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
[[ "$TOKEN" =~ $uuid_re ]] || { echo "error: '$TOKEN' is not a valid UUID" >&2; exit 1; }
[[ "$INTERVAL" =~ ^[0-9]+$ ]] || { echo "error: --interval must be an integer" >&2; exit 1; }
[[ "$TIMEOUT"  =~ ^[0-9]+$ ]] || { echo "error: --timeout must be an integer" >&2; exit 1; }

API_BASE="${USEPOD_API:-https://api.usepod.ai}"
URL="$API_BASE/proxy/$TOKEN/balance"

start=$(date +%s)

while :; do
  body=$(curl --silent --show-error --max-time 10 "$URL" 2>/dev/null || echo '{}')
  balance=$(printf '%s' "$body" | jq -r 'try (.usdc_balance | tostring) catch "0"' 2>/dev/null || echo 0)

  if [[ "$balance" =~ ^[0-9]+$ ]] && (( balance > 0 )); then
    usdc=$(jq -nr --argjson b "$balance" '$b / 1000000 | tostring')
    echo "Funded: \$${usdc} USDC (${balance} microunits)"
    exit 0
  fi

  now=$(date +%s)
  elapsed=$((now - start))
  if (( elapsed >= TIMEOUT )); then
    echo "Timeout: no funding detected after ${TIMEOUT}s. Check the dashboard or retry." >&2
    exit 2
  fi

  echo "Pending: \$0.00 USDC, ${elapsed}s elapsed" >&2
  sleep "$INTERVAL"
done
