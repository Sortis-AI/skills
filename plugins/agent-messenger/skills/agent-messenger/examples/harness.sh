#!/usr/bin/env bash
# End-to-end agent harness setup and launch.
#
# Usage: ./harness.sh [identity-name]
#   identity-name defaults to "default"
#
# Prerequisites:
#   - am, am-ingest, am-agent installed (cargo install agent-messenger)
#   - Agent CLI configured in $XDG_CONFIG_HOME/am/am-agent.toml
#   - At least one relay configured (am relay add wss://relay.damus.io)

set -euo pipefail

IDENTITY="${1:-default}"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/am"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/am"
DB_PATH="$DATA_DIR/messages.db"

echo "=== Agent Harness Setup ===" >&2
echo "Identity: $IDENTITY" >&2
echo "Database: $DB_PATH" >&2
echo "Config:   $CONFIG_DIR/am-agent.toml" >&2

# Verify identity exists
if ! am identity show --name "$IDENTITY" >/dev/null 2>&1; then
  echo "Error: identity '$IDENTITY' does not exist. Run: am identity generate --name $IDENTITY" >&2
  exit 1
fi

# Verify relays configured
RELAY_COUNT=$(am relay list | jq 'length')
if [ "$RELAY_COUNT" -eq 0 ]; then
  echo "Error: no relays configured. Run: am relay add wss://relay.damus.io" >&2
  exit 1
fi
echo "Relays: $RELAY_COUNT configured" >&2

# Verify agent config exists
if [ ! -f "$CONFIG_DIR/am-agent.toml" ]; then
  echo "Error: $CONFIG_DIR/am-agent.toml not found." >&2
  echo "Create it with at minimum:" >&2
  echo '  [agent]' >&2
  echo '  command = "llm"' >&2
  echo '  stdin = true' >&2
  exit 1
fi

NPUB=$(am identity show --name "$IDENTITY" | jq -r '.npub')
echo "" >&2
echo "=== Launching ===" >&2
echo "Agent npub: $NPUB" >&2
echo "Starting am-ingest in background..." >&2

# Start ingest daemon in background
am-ingest --identity "$IDENTITY" --db "$DB_PATH" &
INGEST_PID=$!
echo "am-ingest PID: $INGEST_PID" >&2

# Trap to clean up on exit
cleanup() {
  echo "" >&2
  echo "Shutting down..." >&2
  kill "$INGEST_PID" 2>/dev/null || true
  wait "$INGEST_PID" 2>/dev/null || true
  echo "Done." >&2
}
trap cleanup EXIT INT TERM

echo "Starting am-agent..." >&2
echo "" >&2

# Run agent orchestrator in foreground
am-agent --db "$DB_PATH" --config "$CONFIG_DIR/am-agent.toml"
