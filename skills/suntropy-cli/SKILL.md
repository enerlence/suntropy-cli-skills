---
name: suntropy-cli
description: "@enerlence/suntropy-cli reference — agent-first CLI for the Suntropy solar platform. Use when executing Suntropy API operations from the command line, building solar studies, managing inventory, or automating solar energy workflows."
---

# @enerlence/suntropy-cli

Agent-first CLI for the Suntropy solar platform. JSON output by default, optimized for programmatic manipulation.

## Installation

```bash
npm install -g @enerlence/suntropy-cli
# or
npx @enerlence/suntropy-cli <command>
```

## Authentication

```bash
# API key (preferred for agents)
suntropy auth set-key --key <jwt-api-key>

# Email/password login
suntropy auth login --email user@co.com --password pass

# Check status
suntropy auth status
```

## Global Options

All commands accept these options:

| Option | Default | Description |
|--------|---------|-------------|
| `--format json\|human\|csv` | `json` | Output format |
| `--fields f1,f2,...` | all | Select specific fields |
| `--server <url>` | config | Override API server URL |
| `--token <jwt>` | config | Override auth token |
| `--profile <name>` | default | Config profile |
| `--verbose` | false | Show HTTP details on stderr |
| `--save <file>` | - | Save output to file |

## Commands Overview

### Studies (`suntropy studies`)

Progressive exploration and full study lifecycle.

**Explore existing studies:**
```bash
suntropy studies list [--limit 20] [--offset 0] [--state <state>] [--client-name <name>]
suntropy studies metadata <id> [--by-study-id]
suntropy studies get <studyId> [--expand surfaces,results,economics,batteries,consumption,equipment,client,location|all]
suntropy studies curves <studyId> <consumption|production|net-consumption|excesses> [--stats|--monthly|--daily|--raw|--total]
```

**Calculate:**
```bash
suntropy studies calculate-production --lat <n> --lon <n> --power <w> [--angle 30] [--azimuth 180] [--losses 14]
suntropy studies optimize-surfaces --lat <n> --lon <n>
```

**Study Builder (create/edit):**
```bash
# Lifecycle
suntropy studies init [--file <path>] [--name <name>] [--market es]
suntropy studies pull <studyId> [--file <path>]
suntropy studies validate [--file <path>]
suntropy studies save [--file <path>] [--state-id <n>] [--save-as-new]

# Configure
suntropy studies set tariff --tariff-id <n> [--zone-id 1] [--market es]
suntropy studies set prices --energy '{"p1":N,...}' | --energy-p1 <n> ... [--power '{"p1":N,...}'] [--contracted '{"p1":N,...}']
suntropy studies set client [--name <n>] [--email <e>] [--phone <p>] [--cups <c>] [--address <a>] [--city <c>] [--region <r>]
suntropy studies set consumption --annual <kWh> --pattern <name> | --by-period <json> | --monthly <json> | --from-file <path>
suntropy studies set kit --kit-id <n>
suntropy studies set panel --panel-id <n> [--panels-count <n>]
suntropy studies set inverter --inverter-id <ids>
suntropy studies set economics [--margin <n>] [--total-cost <n>] [--lifetime <n>] [--excesses-mode <mode>] [--excesses-selling-price <n>]
suntropy studies set phase --phase single_phase|three_phase
suntropy studies set batteries [--enable|--disable] [--battery-id <n>] [--count <n>]
suntropy studies set custom-assets --asset <id:qty> [--asset <id:qty>...]
suntropy studies set data --data '<json>'

# Surfaces
suntropy studies add surface --lat <n> --lon <n> [--angle 30] [--azimuth 180] [--power <w>] [--panels-count <n>]
suntropy studies remove surface --index <n>

# Calculate
suntropy studies calculate production [--surface-index <n>|--all-surfaces]
suntropy studies calculate-results

# Comments
suntropy studies add-comment --content "<text>"
suntropy studies comment <studyId> --content "<text>"
```

**Auto-validation:** Every set/add/calculate returns step completion:
```json
{
  "stepsProgress": { "clientDetails": true, "consumption": true, "surfacesSelector": true, "production": true, "results": false, "economicBalance": false },
  "completionPercentage": 67,
  "missing": { "results": "Results not calculated (use: studies calculate results)" }
}
```

**6-step validation (replicates frontend):**
1. `clientDetails` — atrTariff + energyPrices (N periods) + geographicalZone
2. `consumption` — consumption.days.length > 0
3. `surfacesSelector` — surfaces.length > 0
4. `production` — surface with production curve + equipment (panel or kit)
5. `results` — results !== undefined
6. `economicBalance` — margen + totalCost + results

**Cascade resets:** changing consumption or surfaces invalidates production, results, economicBalance.

### Inventory (`suntropy inventory`)

CRUD for all equipment types. Same pattern for all resources.

```bash
suntropy inventory <type> list [--limit 20] [--offset 0] [--active-only]
suntropy inventory <type> get <id>
suntropy inventory <type> create --data '<json>'
suntropy inventory <type> update <id> --data '<json>'
suntropy inventory <type> delete <id>
```

**Resource types:** `panels`, `inverters`, `batteries`, `chargers`, `heatpumps`, `custom-assets`, `custom-asset-types`, `custom-fields`, `kits`, `charger-kits`, `heatpump-kits`, `manufacturers`

**Kit assembly:**
```bash
suntropy inventory kits assemble --name "Kit 5kW" --panel <id> --inverter <id> --panels-count 12 --peak-power 5.4 --price 3500 [--custom-asset <id>:<qty>]
```

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
suntropy curves sort --input <file>
suntropy curves filter-dates --start <date> --end <date> --input <file>
suntropy curves to-serie --input <file>
suntropy curves by-period --input <file> --periods <file>
```

All curve commands accept `--input -` for stdin and `--save <file>` for output. Pipe-chainable.

### Consumption (`suntropy consumption`)

```bash
suntropy consumption estimate --annual <kWh> --pattern <name> [--tariff 3.0TD] [--market es]
suntropy consumption ree-profiles --start <date> --end <date> --tariff <code>
suntropy consumption periods --tariff-id <n> --zone-id <n> [--save <file>]
suntropy consumption from-file --eredes-zip <path>
```

Patterns: Balance, Nightly, Morning, Afternoon, Domestic, Commercial

### Solar Form (`suntropy solarform`)

Quick study creation via simplified API.

```bash
suntropy solarform simple --region <r> --sub-region <sr> --consumption <kWh> [--pattern <p>] [--kit-id <id>] [--save]
suntropy solarform calculate --data '<json>' [--save]
suntropy solarform config
```

### Config (`suntropy config`)

```bash
suntropy config set <key> <value>
suntropy config get <key>
suntropy config list
suntropy config create-profile <name>
suntropy config use <name>
```

## Configuration

Config stored in `~/.suntropy/config.json`. Supports multiple profiles.

Production: `https://api.enerlence.com` (path-based routing: /solar, /security, /profiles, /periods, /templates)
Local: `http://localhost` (port-based: solar=8086, security=8080, profiles=8085, periods=8084, templates=8090)

## Common Tariff IDs (Spain)

| ID | Name | Periods | Use |
|----|------|---------|-----|
| 13 | 2.0TD | 3 | Residential |
| 14 | 3.0TD | 6 | Commercial/Industrial |
| 15 | 6.1TD | 6 | Large consumers |

Zone IDs: 1=Peninsula, 2=Canarias, 3=Baleares
