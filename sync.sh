#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DEST="$SCRIPT_DIR/skills"

rm -rf "$DEST"
mkdir -p "$DEST"

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
  cp -r "$src" "$DEST/$name"
  echo "Copied $name"
done
