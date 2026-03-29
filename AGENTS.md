# AGENTS.md instructions for @ic-reactor

## Skills

A skill is a set of local instructions to follow that is stored in a `SKILL.md` file. Skills live in the `skill-packages/` directory. Below is the list of skills that can be used in this repository.

### Available skills

- `ic-reactor-hooks`: Create, refactor, and document Reactor hook integrations for this repo, including `createActorHooks`, query/mutation factories, `useActorMethod`, and generated hooks. Use when implementing or explaining hook usage inside React components versus imperative usage outside React. (file: `skill-packages/ic-reactor-hooks/SKILL.md`)

### How to use skills

- Discovery: Skill bodies live on disk at `skill-packages/<skill-name>/SKILL.md`. Agent-specific metadata is in `skill-packages/<skill-name>/agents/`.
- Trigger rules: If the user names a skill (with `$SkillName` or plain text) OR the task clearly matches a skill's description, use that skill for the turn.
- Missing/blocked: If a named skill is missing or the path can't be read, say so briefly and continue with the best fallback.
- Progressive disclosure:
  1. Open the skill `SKILL.md` and read only enough to follow the workflow.
  2. Load only the specific referenced files needed for the current request.
  3. Prefer bundled scripts/assets/references over recreating content.
- Coordination:
  1. Use the minimal set of skills that covers the task.
  2. State which skill(s) you're using and why (one short line).
- Context hygiene: Keep context small, avoid deep reference chasing, and load only relevant variant files.
- Safety and fallback: If a skill can't be applied cleanly, state the issue and continue with the next-best approach.

### Cross-agent compatibility

These skills are designed to work across multiple AI agent platforms. Each skill includes agent-specific metadata in `agents/`:

| Agent Platform     | Metadata File         | Project Discovery File              |
| ------------------ | --------------------- | ----------------------------------- |
| OpenAI Codex       | `agents/openai.yaml`  | `AGENTS.md` (this file)             |
| Claude / Anthropic | `agents/claude.yaml`  | `CLAUDE.md`                         |
| GitHub Copilot     | `agents/copilot.yaml` | `.github/copilot-instructions.md`   |
| Cursor             | —                     | `.cursorrules`                      |
