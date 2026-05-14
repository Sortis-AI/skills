# Per-harness connection snippets

Each block below is the complete wiring for one inference client. Substitute `<TOKEN>` with the user's `api_token` from registration. The API key value (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, etc.) can be any non-empty string — `UsePod` works — because the path-segment token is the real credential.

Every block ends with a one-line verification command. Tell the user to run it after wiring; a successful streaming response confirms the integration.

---

## Claude Code

Anthropic-compatible. Set the base URL via environment variable; the API key value is ignored on the server side but must be non-empty for the SDK to send the header.

```bash
export ANTHROPIC_API_KEY="UsePod"
export ANTHROPIC_BASE_URL="https://api.usepod.ai/proxy/<TOKEN>"
claude
```

Or one-shot:

```bash
ANTHROPIC_BASE_URL=https://api.usepod.ai/proxy/<TOKEN> ANTHROPIC_API_KEY=UsePod claude
```

**Verify:** in a Claude Code session, ask "what model are you?" — a normal reply confirms the proxy is live. Or from the shell:

```bash
curl -s https://api.usepod.ai/proxy/<TOKEN>/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{"model":"claude-haiku-4-5-20251001","max_tokens":32,"messages":[{"role":"user","content":"ping"}]}'
```

---

## Cursor

OpenAI-compatible via Cursor's settings panel:

1. **Cursor → Settings → Models**
2. Find **OpenAI API Key** → set to any non-empty value (e.g., `UsePod`)
3. Click **Override OpenAI Base URL** → enter `https://api.usepod.ai/proxy/<TOKEN>/v1`
4. Click **Verify** — Cursor pings the base URL.

Cursor stores these per-workspace. To switch tokens for a different project, repeat in that workspace.

**Verify:** open Cursor's chat panel and send a message; a normal reply confirms the wire-up.

---

## OpenAI Python SDK

OpenAI-compatible. Works with any code that uses the `openai` package.

```python
from openai import OpenAI

client = OpenAI(
    api_key="UsePod",
    base_url="https://api.usepod.ai/proxy/<TOKEN>/v1",
)

resp = client.chat.completions.create(
    model="gpt-4o-mini",
    messages=[{"role": "user", "content": "ping"}],
)
print(resp.choices[0].message.content)
```

Or via env vars (works with any tool that reads them):

```bash
export OPENAI_API_KEY="UsePod"
export OPENAI_BASE_URL="https://api.usepod.ai/proxy/<TOKEN>/v1"
```

**Verify:** run the snippet above; print a non-empty `content`.

---

## OpenAI Node SDK

```typescript
import OpenAI from "openai";

const client = new OpenAI({
  apiKey: "UsePod",
  baseURL: "https://api.usepod.ai/proxy/<TOKEN>/v1",
});

const resp = await client.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "ping" }],
});
console.log(resp.choices[0].message.content);
```

Env-var form is identical to the Python SDK.

**Verify:** run the snippet; print a non-empty `content`.

---

## Anthropic Python SDK

```python
import anthropic

client = anthropic.Anthropic(
    api_key="UsePod",
    base_url="https://api.usepod.ai/proxy/<TOKEN>",
)

msg = client.messages.create(
    model="claude-haiku-4-5-20251001",
    max_tokens=32,
    messages=[{"role": "user", "content": "ping"}],
)
print(msg.content[0].text)
```

**Verify:** run the snippet; print a non-empty `text`.

---

## Anthropic Node SDK

```typescript
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic({
  apiKey: "UsePod",
  baseURL: "https://api.usepod.ai/proxy/<TOKEN>",
});

const msg = await client.messages.create({
  model: "claude-haiku-4-5-20251001",
  max_tokens: 32,
  messages: [{ role: "user", content: "ping" }],
});
console.log(msg.content[0].type === "text" ? msg.content[0].text : "");
```

**Verify:** run the snippet; print a non-empty `text`.

---

## LangChain (Python)

LangChain's `ChatOpenAI` and `ChatAnthropic` accept the same base-URL/API-key fields the underlying SDKs do.

OpenAI-style:

```python
from langchain_openai import ChatOpenAI

llm = ChatOpenAI(
    model="gpt-4o-mini",
    openai_api_key="UsePod",
    openai_api_base="https://api.usepod.ai/proxy/<TOKEN>/v1",
)
print(llm.invoke("ping").content)
```

Anthropic-style:

```python
from langchain_anthropic import ChatAnthropic

llm = ChatAnthropic(
    model="claude-haiku-4-5-20251001",
    anthropic_api_key="UsePod",
    anthropic_api_url="https://api.usepod.ai/proxy/<TOKEN>",
)
print(llm.invoke("ping").content)
```

**Verify:** run the snippet; print non-empty content.

---

## LangChain (JS)

```typescript
import { ChatOpenAI } from "@langchain/openai";

const llm = new ChatOpenAI({
  modelName: "gpt-4o-mini",
  openAIApiKey: "UsePod",
  configuration: { baseURL: "https://api.usepod.ai/proxy/<TOKEN>/v1" },
});
const reply = await llm.invoke("ping");
console.log(reply.content);
```

Anthropic equivalent uses `ChatAnthropic` from `@langchain/anthropic` with `clientOptions: { baseURL: "https://api.usepod.ai/proxy/<TOKEN>" }`.

**Verify:** run the snippet; print non-empty `content`.

---

## LangGraph

LangGraph builds on LangChain's chat-model abstractions. Use the LangChain snippets above to construct the LLM, then pass that LLM into your `StateGraph` node. No LangGraph-specific configuration is needed for Use Pod.

```python
from langchain_openai import ChatOpenAI
from langgraph.graph import StateGraph, END

llm = ChatOpenAI(
    model="gpt-4o-mini",
    openai_api_key="UsePod",
    openai_api_base="https://api.usepod.ai/proxy/<TOKEN>/v1",
)

# ...build graph nodes that call llm.invoke(...) as usual
```

**Verify:** run a single-node graph that calls `llm.invoke("ping")`; the state should hold non-empty content.

---

## Continue.dev

Edit `~/.continue/config.json` (or the workspace-scoped config). Add a model entry:

```json
{
  "models": [
    {
      "title": "Use Pod (gpt-4o-mini)",
      "provider": "openai",
      "model": "gpt-4o-mini",
      "apiKey": "UsePod",
      "apiBase": "https://api.usepod.ai/proxy/<TOKEN>/v1"
    }
  ]
}
```

For an Anthropic-compatible entry, set `"provider": "anthropic"` and `"apiBase": "https://api.usepod.ai/proxy/<TOKEN>"`.

**Verify:** in the VS Code Continue panel, select the new model from the picker and send a message.

---

## Cline

OpenAI-compatible. In Cline's settings:

1. **API Provider:** OpenAI Compatible
2. **Base URL:** `https://api.usepod.ai/proxy/<TOKEN>/v1`
3. **API Key:** `UsePod`
4. **Model ID:** `gpt-4o-mini` (or any model the user prefers)

**Verify:** trigger a Cline task; the model should respond normally.

---

## Aider

```bash
export OPENAI_API_KEY="UsePod"
export OPENAI_API_BASE="https://api.usepod.ai/proxy/<TOKEN>/v1"
aider --model gpt-4o-mini
```

Or via the `--openai-api-base` flag without env vars:

```bash
aider \
  --openai-api-key UsePod \
  --openai-api-base https://api.usepod.ai/proxy/<TOKEN>/v1 \
  --model gpt-4o-mini
```

**Verify:** start Aider, watch the model name line confirm `gpt-4o-mini`, send a one-line prompt.

---

## Hermes

Hermes (the agentic harness) reads OpenAI-style environment variables. Configure:

```bash
export OPENAI_API_KEY="UsePod"
export OPENAI_BASE_URL="https://api.usepod.ai/proxy/<TOKEN>/v1"
```

Then launch Hermes as usual. If Hermes is configured to use Anthropic models, set:

```bash
export ANTHROPIC_API_KEY="UsePod"
export ANTHROPIC_BASE_URL="https://api.usepod.ai/proxy/<TOKEN>"
```

**Verify:** run a short Hermes task; the response should stream normally.

---

## Codex CLI (OpenAI)

```bash
export OPENAI_API_KEY="UsePod"
export OPENAI_BASE_URL="https://api.usepod.ai/proxy/<TOKEN>/v1"
codex
```

**Verify:** send a brief prompt in the Codex CLI; the reply should stream.

---

## Raw curl

Use this for the user who wants to verify connectivity without installing anything else.

OpenAI-style:

```bash
curl -s https://api.usepod.ai/proxy/<TOKEN>/v1/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer UsePod" \
  -d '{
    "model": "gpt-4o-mini",
    "messages": [{"role":"user","content":"ping"}],
    "stream": false
  }'
```

Anthropic-style:

```bash
curl -s https://api.usepod.ai/proxy/<TOKEN>/v1/messages \
  -H "Content-Type: application/json" \
  -H "anthropic-version: 2023-06-01" \
  -d '{
    "model": "claude-haiku-4-5-20251001",
    "max_tokens": 32,
    "messages": [{"role":"user","content":"ping"}]
  }'
```

**Verify:** the JSON response should contain a non-empty `choices[0].message.content` (OpenAI) or `content[0].text` (Anthropic).

---

## Handling unknown harnesses

If the user names a tool not on this list:

1. Look up its docs and check whether it accepts an **OpenAI-compatible base URL override** or an **Anthropic-compatible base URL override**.
2. Pick the matching surface:
   - OpenAI-compat → `https://api.usepod.ai/proxy/<TOKEN>/v1`
   - Anthropic-compat → `https://api.usepod.ai/proxy/<TOKEN>`
3. Set the API key field to any non-empty string (`UsePod`).
4. Adapt the closest block above to that harness's config style.

If the harness offers neither override, it cannot use Use Pod directly — surface that fact to the user and suggest one of the supported harnesses, or recommend running the curl examples to validate the token is at least live.
