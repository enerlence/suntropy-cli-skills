# suntropy-cli-skills

Agent skills for [`@enerlence/suntropy-cli`](https://www.npmjs.com/package/@enerlence/suntropy-cli) — the Suntropy solar platform CLI.

These skills give AI coding agents (Claude Code, OpenCode, Codex, etc.) knowledge of the CLI commands and workflows to automate solar energy operations.

## Structure

```
skills/
└── suntropy-cli/
    ├── SKILL.md                  # CLI reference + links to workflows
    ├── solar-study.md            # End-to-end solar study creation
    ├── inventory-create.md       # Create panels, inverters, batteries, etc.
    ├── inventory-create-kit.md   # Kit assembly with components
    └── config-tenant.md          # Tenant theme + SolarForm / Advanced configuration
```

## Installation

### Claude Code

```bash
# Project-level (recommended)
cp -r skills/* .claude/skills/

# User-level (available in all projects)
cp -r skills/* ~/.claude/skills/
```

### Other agents

```bash
# .agents/, .opencode/, .github/, .codex/
cp -r skills/* .agents/skills/
```

## Prerequisites

```bash
npm install -g @enerlence/suntropy-cli
suntropy auth set-key --key <your-jwt-api-key>
```
