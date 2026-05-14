#!/usr/bin/env bash
# Register a new Use Pod API token.
#
# POSTs to /v1/register and prints four fields: api_token, deposit_code,
# dashboard_url, contract_address. Each on its own `key: value` line so the
# caller can grep or parse line-by-line.
#
# Override the API base for self-hosted deployments:
#   USEPOD_API=https://api.example.com ./register.sh
#
# Requirements: curl, jq.

set -euo pipefail

command -v curl >/dev/null || { echo "error: curl is required" >&2; exit 1; }
command -v jq   >/dev/null || { echo "error: jq is required (install with apt/brew/choco)" >&2; exit 1; }

API_BASE="${USEPOD_API:-https://api.usepod.ai}"

response=$(curl --silent --show-error --fail-with-body \
  -X POST "$API_BASE/v1/register" \
  -H 'Accept: application/json') || {
    echo "error: POST $API_BASE/v1/register failed" >&2
    [[ -n "${response:-}" ]] && echo "$response" >&2
    exit 1
}

printf '%s' "$response" | jq -r '
  "api_token: \(.api_token)",
  "deposit_code: \(.deposit_code)",
  "dashboard_url: \(.instructions.dashboard_url)",
  "contract_address: \(.instructions.contract_address)"
'
