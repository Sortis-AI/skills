# Inference backends for Use Pod hosts

The `usepod-agent` doesn't run models itself — it dispatches jobs to one or more local inference backends (or BYOK upstreams). This file documents the supported backends, the hardware paths for each, and which one to pick first.

## Backend matrix

| Backend         | NVIDIA CUDA | AMD ROCm | Apple Silicon | CPU-only | Notes                                      |
|-----------------|:-----------:|:--------:|:-------------:|:--------:|--------------------------------------------|
| **vLLM**        | ★ best       | ✓        | —             | —        | Highest throughput; production default.    |
| **Ollama**      | ✓           | ✓        | ★ best         | ✓        | Easiest setup; best macOS/Apple path.      |
| **llama.cpp**   | ✓           | ✓        | ✓             | ✓        | Lowest-spec / CPU / smallest VRAM.         |
| **LM Studio**   | ✓           | ✓        | ✓             | ✓        | GUI-friendly; good for desktop operators.  |
| **MLX-serve**   | —           | —        | ★ best         | —        | Apple Silicon's native runtime.            |
| **BYOK upstreams** | n/a       | n/a      | n/a           | n/a      | OpenRouter, Venice, Together, Groq, Morpheus — no GPU required. |

Pick the first column that matches the host's hardware:

- **Datacenter NVIDIA (A100, H100, B200):** vLLM is the right answer. Higher batching, tensor-parallel multi-GPU, paged KV cache. The performance gap over Ollama is large at production load.
- **Consumer NVIDIA (RTX 4090, 5090):** vLLM if running a single big model on a single GPU. Ollama if running multiple smaller models with switching.
- **AMD (MI300X, MI250):** vLLM with ROCm. The ROCm wheels lag CUDA's by a few weeks per release; check vLLM's compatibility notes for the current version. Ollama also works on ROCm and is easier to set up if vLLM gives you trouble.
- **Apple Silicon (M-series Mac):** Ollama (built on llama.cpp's Metal backend) or MLX-served models if you want the absolute lowest latency. CPU memory bandwidth is the bottleneck, not raw compute, so model selection matters more than backend choice. The 64-128 GB unified memory configurations can run 70B-class models comfortably.
- **CPU-only (no GPU at all):** llama.cpp with quantized models (Q4_K_M is the sweet spot). Useful for serving small models or covering off-peak demand. Will not be price-competitive with GPU operators on most models.

## Per-backend setup

### vLLM

Install via pip into a CUDA-enabled environment:

```bash
pip install vllm
python -m vllm.entrypoints.openai.api_server \
    --model meta-llama/Llama-3.1-70B-Instruct \
    --port 8000 \
    --tensor-parallel-size 2
```

`agent.toml`:

```toml
[[backends]]
kind = "vllm"
url  = "http://127.0.0.1:8000"
```

The agent's vLLM backend posts to `/v1/chat/completions` and `/v1/completions` (OpenAI-compatible). Make sure the server is running before starting the agent; the agent checks reachability on connect and refuses to serve traffic for an unreachable backend.

**Multiple GPUs:** run one `vllm.entrypoints.openai.api_server` instance per GPU group on different ports, then declare one `[[backends]]` block per port. Or use vLLM's tensor-parallel mode to span a single model across multiple GPUs.

**AMD ROCm:** install vLLM's ROCm wheel (see vLLM's `docs/source/getting_started/amd-installation.rst`). All other agent config is identical.

### Ollama

The friendliest first-time setup. Auto-detects CUDA, ROCm, or Metal; downloads model weights on demand.

```bash
# Install (Linux)
curl -fsSL https://ollama.com/install.sh | sh

# Or on macOS:
brew install ollama

# Start the server (systemd unit ships with the installer on Linux)
ollama serve

# Pull a model
ollama pull llama3.1:70b
ollama pull qwen2.5:32b
```

`agent.toml`:

```toml
[[backends]]
kind   = "ollama"
url    = "http://127.0.0.1:11434"
models = ["llama3.1:70b", "qwen2.5:32b"]
```

If `models` is omitted, the agent calls `GET /api/tags` and advertises every model Ollama has pulled.

### llama.cpp

For CPU-heavy or very-low-VRAM setups. Build with the right backend flag (`-DGGML_CUDA=ON`, `-DGGML_METAL=ON`, `-DGGML_HIPBLAS=ON`).

```bash
# Build
cmake -B build -DGGML_CUDA=ON
cmake --build build --config Release -j

# Serve
./build/bin/llama-server -m models/llama-3.1-70b-q4_k_m.gguf --port 8080
```

`agent.toml`:

```toml
[[backends]]
kind = "llamacpp"
url  = "http://127.0.0.1:8080"
```

### LM Studio

GUI-friendly. Useful for operators who'd rather click "Load model" than edit a config. Enable LM Studio's local server (Settings → Local Server → Enable) and point the agent at it:

```toml
[[backends]]
kind = "lmstudio"
url  = "http://127.0.0.1:1234"
```

LM Studio exposes an OpenAI-compatible surface — the agent's vLLM and LM Studio backends share most code, with minor differences in model-list parsing.

### MLX (Apple Silicon)

For operators on M-series Macs who want the absolute lowest latency, serve via `mlx_lm.server`:

```bash
pip install mlx-lm
python -m mlx_lm.server --model mlx-community/Llama-3.1-70B-Instruct-4bit --port 8080
```

`agent.toml` (use the `llamacpp` kind — same OpenAI-compat shape):

```toml
[[backends]]
kind = "llamacpp"
url  = "http://127.0.0.1:8080"
```

MLX models live on Hugging Face under `mlx-community/*`. The 4-bit quantizations are the right tradeoff for unified-memory Macs.

### BYOK upstreams

For operators with paid OpenRouter, Venice, Together, Groq, or Morpheus accounts who want to resell at a small markup. No local hardware required.

```toml
[[backends]]
kind        = "openrouter"
api_key_env = "OPENROUTER_API_KEY"
markup      = 0.10                          # 10% over upstream
models      = ["anthropic/claude-3-haiku", "openai/gpt-4o-mini"]
```

The agent reads `OPENROUTER_API_KEY` from the environment at startup. Don't paste the key into the TOML file; keep it in a `.env` consumed by systemd's `EnvironmentFile=` or a secret manager.

## Common gotchas

**Backend says "ready" but the first job times out.** Many backends lazily load the first model on the first request, and the first inference call can take 30-90 seconds while weights load into VRAM. Pre-warm by sending a one-token completion before exposing the host to traffic.

**Mixed precision (fp16 vs bf16) mismatch.** vLLM on Hopper GPUs (H100/H200) prefers bf16; on Ampere (A100, RTX 40) it can use either. Misconfigured precision shows as 2-3× slower throughput, not as an error. Profile the first few jobs.

**Ollama auto-eviction.** Ollama unloads models that have been idle for `OLLAMA_KEEP_ALIVE` seconds (default 5 minutes). If the host is bursty, the first request after a quiet stretch eats the load latency again. Set `OLLAMA_KEEP_ALIVE=24h` in the Ollama env if you want models pinned.

**Apple Silicon thermal throttling.** Sustained inference on a Mac mini/Studio with default cooling can drop throughput by 20-30% after ~20 minutes. Monitor `pmset -g thermlog` or `sudo powermetrics --samplers smc` if you're seeing degraded reputation scores correlated with backend slowness.

## Verifying a backend before going live

```bash
# OpenAI-compatible backends (vLLM, llama.cpp, LM Studio, Ollama via OpenAI shim):
curl -s http://127.0.0.1:<PORT>/v1/chat/completions \
  -H 'Content-Type: application/json' \
  -d '{"model":"<MODEL_ID>","messages":[{"role":"user","content":"ping"}],"max_tokens":4}'

# Ollama native API:
curl -s http://127.0.0.1:11434/api/generate \
  -d '{"model":"<MODEL_ID>","prompt":"ping","stream":false}'
```

A non-empty completion in under 5 seconds = ready. If the backend returns 503 or 4xx, fix it before running `usepod-agent`.
