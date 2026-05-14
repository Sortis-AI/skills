#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/skills"

sources=(
  "$SCRIPT_DIR/../agent-messenger/skills/agent-messenger"
  "$SCRIPT_DIR/../agent-x/skills/agent-x"
  "$SCRIPT_DIR/../level5/skills/level5"
  "$SCRIPT_DIR/../agent-wallet/skills/agent-wallet"
  "$SCRIPT_DIR/../agent-dns/skills/agent-dns"
  "$SCRIPT_DIR/../usepod-agent/.claude/skills/usepod-agent-setup"
  "$SCRIPT_DIR/../usepod/plugins/usepod/skills/client-onboard"
  "$SCRIPT_DIR/../usepod/plugins/usepod/skills/host-onboard"
)

# Plugin metadata keyed by skill name: "version|description"
declare -A plugin_meta=(
  [agent-messenger]="0.3.3|E2E encrypted agent-to-agent messaging over Nostr using NIP-17 gift wrapping."
  [agent-x]="0.5.4|Interact with X (Twitter) from the command line — post tweets, search, manage bookmarks, view timelines, and more."
  [level5]="1.7.7|Budget Management for AI Agents — USDC billing gateway on Solana."
  [agent-wallet]="0.1.0|Solana wallet CLI with automatic HTTP 402 payment handling via the MPP protocol."
  [agent-dns]="0.2.1|MPP-enabled agent-first DNS management and domain registration API. Pay-per-request via Solana USDC."
  [usepod-agent-setup]="0.1.0|Install, configure, and run usepod-agent — the Use Pod marketplace provider agent — to earn USDC by serving inference jobs from a local vLLM, llama.cpp, LM Studio, or Ollama backend."
  [client-onboard]="0.1.0|Onboard to Use Pod as an inference client — register an API token, fund it with USDC on Solana, and wire it into Claude, Cursor, OpenAI SDK, LangChain, and other agent harnesses."
  [host-onboard]="0.1.0|Onboard a GPU host to the Use Pod marketplace — install the usepod-agent, pair with the coordinator, post the USDC bond, and run as a systemd service to earn USDC serving inference."
)

for src in "${sources[@]}"; do
  name="$(basename "$src")"
  if [ ! -d "$src" ]; then
    echo "SKIP: $src not found" >&2
    continue
  fi

  rm -rf "$SKILLS_DIR/$name"
  cp -r "$src" "$SKILLS_DIR/$name"

  # Generate .claude-plugin/plugin.json (Claude Code marketplace)
  IFS='|' read -r version description <<< "${plugin_meta[$name]}"
  mkdir -p "$SKILLS_DIR/$name/.claude-plugin"
  cat > "$SKILLS_DIR/$name/.claude-plugin/plugin.json" <<EOF
{
  "name": "$name",
  "version": "$version",
  "description": "$description",
  "author": {
    "name": "Sortis AI",
    "url": "https://cli.city"
  },
  "homepage": "https://github.com/Sortis-AI/$name",
  "repository": "https://github.com/Sortis-AI/$name"
}
EOF

  echo "Synced $name"
done
