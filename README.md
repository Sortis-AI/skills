# Sortis AI Agent Skills

Agent skills for AI coding agents, by [Sortis AI](https://cli.city).

Compatible with the [vercel-labs/skills](https://github.com/vercel-labs/skills) CLI (40+ agents including Claude Code, Cursor, Codex, OpenCode, and more) and the [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces).

## Install

### Via skills CLI (any supported agent)

```bash
npx skills add Sortis-AI/skills
```

To install all skills to all detected agents at once:

```bash
npx skills add Sortis-AI/skills --all
```

### Via Claude Code plugin marketplace

From the terminal:

```bash
claude plugin marketplace add Sortis-AI/skills
claude plugin install agent-messenger
claude plugin install agent-x
claude plugin install level5
```

From within a Claude Code session:

```
/plugin marketplace add Sortis-AI/skills
/plugin install agent-messenger@sortis-ai-skills
/plugin install agent-x@sortis-ai-skills
/plugin install level5@sortis-ai-skills
```

Or run `/plugin` to open the interactive plugin manager, navigate to the **Discover** tab, and install from there.

## Skills

| Skill | Description | Tool |
|-------|-------------|------|
| [agent-messenger](skills/agent-messenger/SKILL.md) | E2E encrypted agent-to-agent messaging over Nostr using NIP-17 gift wrapping. Send DMs, group messages, manage identities, and run autonomous agent harnesses. | [agent-messenger](https://github.com/Sortis-AI/agent-messenger) |
| [agent-x](skills/agent-x/SKILL.md) | Interact with X (Twitter) from the command line — post tweets, search, manage bookmarks, view timelines, and automate social media workflows. | [agent-x](https://github.com/Sortis-AI/agent-x) |
| [level5](skills/level5/SKILL.md) | Budget Management for AI Agents — USDC billing gateway. Deposit USDC on Solana; pay for LLM compute per token. | [level5](https://github.com/Sortis-AI/level5) |
