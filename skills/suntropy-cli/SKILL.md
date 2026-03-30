---
name: suntropy-cli
description: "@enerlence/suntropy-cli — agent-first CLI for the Suntropy solar platform. Use when creating solar studies, managing inventory, calculating production, or automating solar energy workflows via command line."
---

# @enerlence/suntropy-cli

Agent-first CLI for the Suntropy solar platform. JSON output by default, optimized for programmatic manipulation by AI agents.

## Installation

```bash
npm install -g @enerlence/suntropy-cli
```

## Authentication

```bash
suntropy auth set-key --key <jwt-api-key>
suntropy auth status
```

## Workflows

This skill includes detailed guides for the main workflows:

- [[solar-study]] — Create or edit a complete solar study using the study builder. Covers tariff, consumption, equipment, production, SolarResultCalculator results, economics, comments, and saving to backend.
- [[inventory-create]] — Create inventory items: solar panels, inverters, batteries, EV chargers, heat pumps, custom assets, and manufacturers.
- [[inventory-create-kit]] — Create and assemble solar kits, EV charger kits, and heat pump kits with components and custom assets.

## Global Options

| Option | Default | Description |
|--------|---------|-------------|
| `--format json\|human\|csv` | `json` | Output format |
| `--fields f1,f2,...` | all | Select specific fields |
| `--server <url>` | config | Override API server URL |
| `--token <jwt>` | config | Override auth token |
| `--profile <name>` | default | Config profile |
| `--verbose` | false | Show HTTP details on stderr |
| `--save <file>` | - | Save output to file |

## Commands Reference

### Studies (`suntropy studies`)

Progressive exploration and full study lifecycle.

```bash
# Explore
suntropy studies list [--limit 20] [--state <state>] [--client-name <name>]
suntropy studies metadata <id> [--by-study-id]
suntropy studies get <studyId> [--expand surfaces,results,economics,batteries,consumption,equipment,client,location|all]
suntropy studies curves <studyId> <consumption|production|net-consumption|excesses> [--stats|--monthly|--daily|--raw|--total]

# Calculate
suntropy studies calculate-production --lat <n> --lon <n> --power <w> [--angle 30] [--azimuth 180] [--losses 14]
suntropy studies optimize-surfaces --lat <n> --lon <n>
```

**Study Builder** — see [[solar-study]] for the full workflow:

```bash
suntropy studies init [--file <path>] [--name <name>] [--market es]
suntropy studies pull <studyId> [--file <path>]
suntropy studies set tariff --tariff-id <n> [--zone-id 1]
suntropy studies set prices --energy-p1 <n> --energy-p2 <n> ...
suntropy studies set client --name <n> --email <e>
suntropy studies set consumption --annual <kWh> --pattern <name>
suntropy studies set kit --kit-id <n>
suntropy studies add surface --lat <n> --lon <n> --angle 30 --azimuth 180 --power <w>
suntropy studies calculate production --all-surfaces
suntropy studies calculate-results
suntropy studies set economics --margin <n> --total-cost <n>
suntropy studies validate
suntropy studies save
suntropy studies add-comment --content "<text>"
suntropy studies comment <studyId> --content "<text>"
```

**Auto-validation:** Every command returns completion status with 6 steps: clientDetails, consumption, surfacesSelector, production, results, economicBalance.

### Inventory (`suntropy inventory`)

See [[inventory-create]] and [[inventory-create-kit]] for detailed guides.

```bash
suntropy inventory <type> list [--limit 20] [--active-only]
suntropy inventory <type> get <id>
suntropy inventory <type> create --data '<json>'
suntropy inventory <type> update <id> --data '<json>'
suntropy inventory <type> delete <id>
```

Types: `panels`, `inverters`, `batteries`, `chargers`, `heatpumps`, `custom-assets`, `custom-asset-types`, `custom-fields`, `kits`, `charger-kits`, `heatpump-kits`, `manufacturers`

### Curves (`suntropy curves`)

Pipe-friendly PowerCurve operations (8760 hourly values/year).

```bash
suntropy curves stats --input <file>
suntropy curves total --input <file>
suntropy curves multiply <factor> --input <file>
suntropy curves aggregate --a <file> --b <file>
suntropy curves subtract --a <file> --b <file>
suntropy curves filter-positive --input <file>
suntropy curves filter-negative --input <file>
suntropy curves by-period --input <file> --periods <file>
suntropy curves filter-dates --start <date> --end <date> --input <file>
```

All commands accept `--input -` for stdin and `--save <file>`. Pipe-chainable.

### Consumption (`suntropy consumption`)

```bash
suntropy consumption estimate --annual <kWh> --pattern <name> [--tariff 3.0TD] [--market es]
suntropy consumption periods --tariff-id <n> --zone-id <n> [--save <file>]
suntropy consumption ree-profiles --start <date> --end <date> --tariff <code>
```

Patterns: Balance, Nightly, Morning, Afternoon, Domestic, Commercial

### Solar Form (`suntropy solarform`)

```bash
suntropy solarform simple --region <r> --sub-region <sr> --consumption <kWh> [--pattern <p>] [--save]
suntropy solarform calculate --data '<json>' [--save]
suntropy solarform config
```

## Common Tariff IDs (Spain)

| ID | Name | Periods | Use |
|----|------|---------|-----|
| 13 | 2.0TD | 3 | Residential |
| 14 | 3.0TD | 6 | Commercial/Industrial |
| 15 | 6.1TD | 6 | Large consumers |

Zone IDs: 1=Peninsula, 2=Canarias, 3=Baleares

## Configuration

Config: `~/.suntropy/config.json`. Supports multiple profiles.

Production: `https://api.enerlence.com` (path routing: /solar, /security, /profiles, /periods, /templates)
Local: `http://localhost` (port routing: solar=8086, security=8080, profiles=8085, periods=8084, templates=8090)
