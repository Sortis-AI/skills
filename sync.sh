#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SKILLS_DIR="$SCRIPT_DIR/skills"
PLUGINS_DIR="$SCRIPT_DIR/plugins"

sources=(
  "$SCRIPT_DIR/../agent-messenger/skills/agent-messenger"
  "$SCRIPT_DIR/../agent-x/skills/agent-x"
)

for src in "${sources[@]}"; do
  name="$(basename "$src")"
  if [ ! -d "$src" ]; then
    echo "SKIP: $src not found" >&2
    continue
  fi

  # Copy to skills/ (vercel-labs/skills CLI)
  rm -rf "$SKILLS_DIR/$name"
  cp -r "$src" "$SKILLS_DIR/$name"

  # Copy to plugins/<name>/skills/<name>/ (Claude Code marketplace)
  rm -rf "$PLUGINS_DIR/$name/skills/$name"
  mkdir -p "$PLUGINS_DIR/$name/skills"
  cp -r "$src" "$PLUGINS_DIR/$name/skills/$name"

  echo "Copied $name"
done
