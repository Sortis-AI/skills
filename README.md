# Sortis AI Agent Skills

Agent skills for AI coding agents, by [Sortis AI](https://sortis.dev).

Compatible with the [vercel-labs/skills](https://github.com/vercel-labs/skills) CLI (40+ agents including Claude Code, Cursor, Codex, OpenCode, and more) and the [Claude Code plugin marketplace](https://code.claude.com/docs/en/plugin-marketplaces).

## Install

### Via skills CLI (any supported agent)

```bash
npx skills add sortis-dev/skills
```

### Via Claude Code plugin marketplace

```bash
claude plugin add sortis-dev/skills
```

## Skills

| Skill | Description | Tool |
|-------|-------------|------|
| [agent-messenger](skills/agent-messenger/SKILL.md) | E2E encrypted agent-to-agent messaging over Nostr using NIP-17 gift wrapping. Send DMs, group messages, manage identities, and run autonomous agent harnesses. | [agent-messenger](https://github.com/sortis-dev/agent-messenger) |
| [agent-x](skills/agent-x/SKILL.md) | Interact with X (Twitter) from the command line — post tweets, search, manage bookmarks, view timelines, and automate social media workflows. | [agent-x](https://github.com/sortis-dev/agent-x) |
