#!/usr/bin/env bash
# Preflight check for a Use Pod host. Run before `curl … install.sh | sh`.
#
# Prints one line per check ("ok: …" or "fail: …"). Exits 0 if everything
# passes, 1 if any check fails. Each failure includes the exact next step.
#
# Skipped checks (e.g., no GPU on this box) are reported as "skip: …" and do
# not count as failures — a CPU-only host or BYOK-only host is a valid setup.
#
# Requirements: bash, curl.

set -u
status=0
ok()   { printf 'ok:   %s\n' "$1"; }
fail() { printf 'fail: %s\n' "$1" >&2; status=1; }
skip() { printf 'skip: %s\n' "$1"; }

# ---- 1. GPU driver -------------------------------------------------------

gpu_seen=0

if command -v nvidia-smi >/dev/null 2>&1; then
    if nvidia-smi -L >/dev/null 2>&1; then
        ok "NVIDIA driver present ($(nvidia-smi --query-gpu=name --format=csv,noheader | paste -sd, -))"
        gpu_seen=1
    else
        fail "nvidia-smi installed but no GPUs detected; check driver/permissions"
    fi
fi

if command -v rocminfo >/dev/null 2>&1; then
    if rocminfo 2>/dev/null | grep -q "GPU agent"; then
        ok "AMD ROCm driver present"
        gpu_seen=1
    else
        fail "rocminfo installed but no GPU agent detected; reinstall ROCm or check kfd"
    fi
fi

if [[ "$(uname -s)" == "Darwin" ]]; then
    if system_profiler SPDisplaysDataType 2>/dev/null | grep -q "Apple "; then
        ok "Apple Silicon GPU present"
        gpu_seen=1
    fi
fi

if (( gpu_seen == 0 )); then
    skip "no GPU driver detected — CPU-only host or BYOK-only host is fine, but throughput will be low for big models"
fi

# ---- 2. Inference backend (at least one) ---------------------------------

backend_seen=0

check_backend() {
    local label="$1" url="$2"
    if curl -sf --max-time 2 "$url" >/dev/null 2>&1; then
        ok "$label reachable at $url"
        backend_seen=1
    fi
}

check_backend "Ollama"    "http://127.0.0.1:11434/api/version"
check_backend "vLLM"      "http://127.0.0.1:8000/v1/models"
check_backend "llama.cpp" "http://127.0.0.1:8080/v1/models"
check_backend "LM Studio" "http://127.0.0.1:1234/v1/models"

if (( backend_seen == 0 )); then
    skip "no local inference backend reachable on standard ports — set one up (Ollama is easiest) or configure BYOK upstreams in agent.toml"
fi

# ---- 3. Coordinator reachability -----------------------------------------

if curl -sf --max-time 5 https://api.usepod.ai/health >/dev/null; then
    ok "outbound HTTPS to api.usepod.ai works"
else
    fail "cannot reach https://api.usepod.ai/health — check egress firewall / proxy"
fi

# Probe WebSocket reachability via an HTTP HEAD on the WS endpoint. Servers
# return 4xx for a non-WS HEAD; we just want "the TCP+TLS handshake worked".
ws_probe=$(curl -sI --max-time 5 -o /dev/null -w '%{http_code}' \
  https://api.usepod.ai/provider/connect 2>/dev/null || echo 000)
if [[ "$ws_probe" =~ ^[0-9]{3}$ ]] && [[ "$ws_probe" != "000" ]]; then
    ok "WebSocket endpoint TLS handshake works (HTTP code: $ws_probe)"
else
    fail "WebSocket endpoint api.usepod.ai/provider/connect unreachable"
fi

# ---- 4. Disk space -------------------------------------------------------

# Need ~100 MB for the agent + state. Models live in the backend's dir.
free_mb=$(df -m /usr/local/bin 2>/dev/null | awk 'NR==2{print $4}')
if [[ -n "${free_mb:-}" ]] && (( free_mb > 200 )); then
    ok "/usr/local has ${free_mb} MB free (need >200 MB)"
else
    fail "/usr/local has only ${free_mb:-unknown} MB free; need >200 MB for agent + state"
fi

# ---- 5. Tools the agent / supervisor need --------------------------------

for cmd in curl; do
    if command -v "$cmd" >/dev/null 2>&1; then
        ok "$cmd available"
    else
        fail "$cmd is required"
    fi
done

if [[ "$(uname -s)" == "Linux" ]]; then
    if command -v systemctl >/dev/null 2>&1; then
        ok "systemd present (recommended supervisor)"
    else
        skip "no systemd — use docker, launchd, or another supervisor instead"
    fi
fi

# ---- Summary -------------------------------------------------------------

echo
if (( status == 0 )); then
    echo "preflight: all checks passed — ready to install"
else
    echo "preflight: $status group(s) failed — fix the 'fail:' lines above before installing" >&2
fi
exit $status
