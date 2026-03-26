# suntropy-cli-skills

Agent skills for [`@enerlence/suntropy-cli`](https://www.npmjs.com/package/@enerlence/suntropy-cli) — the Suntropy solar platform CLI.

These skills give AI coding agents (Claude Code, OpenCode, Codex, etc.) knowledge of the CLI commands and workflows to automate solar energy operations.

## Available Skills

| Skill | Description |
|-------|-------------|
| **suntropy-cli** | Complete CLI command reference — all commands, options, and usage patterns |
| **solar-study** | End-to-end solar study creation workflow with the study builder |
| **inventory-create** | Create inventory items: panels, inverters, batteries, chargers, heat pumps, custom assets |
| **inventory-create-kit** | Create and assemble solar kits, EV charger kits, and heat pump kits |

## Installation

### Claude Code

Copy the skills directory into your project or user skills folder:

```bash
# Project-level (recommended)
cp -r skills/* .claude/skills/

# User-level (available in all projects)
cp -r skills/* ~/.claude/skills/
```

Or clone directly:

```bash
git clone https://github.com/enerlence/suntropy-cli-skills.git
cp -r suntropy-cli-skills/skills/* .claude/skills/
```

### Other agents (.agents/, .opencode/, .github/, .codex/)

Same structure — copy into the agent's skills directory:

```bash
cp -r skills/* .agents/skills/
```

## Prerequisites

Install the CLI:

```bash
npm install -g @enerlence/suntropy-cli
```

Authenticate:

```bash
suntropy auth set-key --key <your-jwt-api-key>
```

## Structure

```
skills/
├── suntropy-cli/
│   └── SKILL.md          # CLI command reference
├── solar-study/
│   └── SKILL.md          # Solar study creation workflow
├── inventory-create/
│   └── SKILL.md          # Inventory item creation
└── inventory-create-kit/
    └── SKILL.md          # Kit creation and assembly
```

Each skill follows the standard `SKILL.md` format with `name` and `description` frontmatter.
