---
name: suntropy-cli
description: "@enerlence/suntropy-cli — agent-first CLI for the Suntropy solar platform. Use when creating solar studies, managing inventory, calculating production, or automating solar energy workflows via command line."
---

# @enerlence/suntropy-cli

Agent-first CLI for the Suntropy solar platform. JSON output by default, optimized for programmatic manipulation by AI agents.

These skills are distributed from [`enerlence/suntropy-cli-skills`](https://github.com/enerlence/suntropy-cli-skills) and give AI coding agents (Claude Code, OpenCode, Codex, etc.) knowledge of the CLI commands and workflows to automate solar energy operations.

## Installation

Install the CLI itself:

```bash
npm install -g @enerlence/suntropy-cli
```

Drop these skill files into the target agent's skills directory:

```bash
# Claude Code (project-level, recommended)
cp -r skills .claude/skills/suntropy-cli

# Claude Code (user-level, available in all projects)
cp -r skills ~/.claude/skills/suntropy-cli

# Other agents (.agents/, .opencode/, .github/, .codex/)
cp -r skills .agents/skills/suntropy-cli
```

## Authentication

```bash
suntropy auth set-key --key <jwt-api-key>
suntropy auth status
```

## Workflows

This skill includes detailed guides for the main workflows:

- [[solar-study]] — Create or edit a complete solar study using the study builder. Covers tariff, consumption, equipment, production, SolarResultCalculator results, economics, comments, and saving to backend. **Also covers querying an existing study's economic/energy KPIs** (annual/monthly savings, excesses, coverage) in a single command — read its "Consulta rapida de un estudio existente" section before answering a tagged comment or email that asks for a study figure, instead of exploring the JSON by hand.
- [[inventory-create]] — Create inventory items: solar panels, inverters, batteries, EV chargers, heat pumps, custom assets, and manufacturers.
- [[inventory-create-kit]] — Create and assemble solar kits, EV charger kits, and heat pump kits with components and custom assets.
- [[config-tenant]] — Configure the client tenant: theme (branding/logo) via security service, and SolarForm + SolarForm Advanced (the 10 admin-panel sections) via solar service.

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

> **Geocoding:** if you only have a postal address, resolve it to `lat`/`lng` first with `suntropy geocode resolve` (see the Geocode section) and set the study `mapCenter` — [[solar-study]] covers this as its first data step.

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

### PPA (`suntropy ppa`) — since 0.5.0

PPA (Power Purchase Agreement) analysis: read PPA templates and run PPA simulations on a study.

```bash
# Read-only PPA templates (client-scoped)
suntropy ppa templates list [--fields _id,name,mode,ppaPrice,useInSolarForm]
suntropy ppa templates get <ppaTemplateId>

# Run PPA simulations on a study (read-only; does NOT persist)
suntropy ppa calculate --study <studyId> [--template <ppaTemplateId>] [--raw] [--save-file <file>]
suntropy ppa calculate --data <json|->            # full SolarStudy via flag/stdin
```

- `--study <id>` downloads the study (`/solar-study/findById/:id`); `--data <json>|-` passes a full SolarStudy.
- `--template <ppaTemplateId>` runs against that single template; without it the backend uses the client templates flagged `useInSolarForm`.
- Response is the study with `economicResults.ppaAnalysis` populated — `simulationResults[].profitabilityResults` holds `irr` and `paybackYears`. PowerCurves are summarized unless `--raw`.
- Backed by `POST /solar-study/calculate-ppa-on-study` (solar service).

### Shareables (`suntropy shareables`) — since 0.5.0

Create shareable links for studies (sharing service, exposed under `/templates`). The backend fills `uid`, `url`, `clientUID` and `idShareable` from the token.

```bash
suntropy shareables create --element-id <studyId> \
  [--element-type solarStudy|colectiveSolarStudy|veChargerStudy|heatpumpStudy|billing] \
  [--shareable-type TEMPLATE|CONTRACT] [--privacy PUBLIC|PRIVATE] \
  [--template-id <id>] [--name <n>] [--password <pwd>] \
  [--expiration-date <date>] [--activation-date <date>] \
  [--email-list "a@x.com;b@y.com"] [--reply-to <e>] \
  [--custom-layout] [--read-only] [--link-params "k=v&k2=v2"] [--data '<json>'|-]
```

- Defaults: `--element-type solarStudy`, `--shareable-type TEMPLATE`, `--privacy PUBLIC`. `--password` forces `PRIVATE`.
- `--link-params` appends query params to the generated link; `--data` merges extra `ShareableDto` fields last.
- Response includes the public `url` and `uid`. Backed by `POST /shareable` (sharing service).

### Geocode (`suntropy geocode`) — since 0.6.0

Resolve an address into coordinates and vice versa. Proxies the Google Geocoding API server-side through the solar public API — no API key on the client, and every call is logged as a `PublicApiCall`.

```bash
# Address -> coordinates (best match by default; --all returns every candidate)
suntropy geocode resolve --address "Calle Mayor 1, Madrid" [--country es] [--all]

# Coordinates -> address (reverse geocoding)
suntropy geocode reverse --lat 40.4168 --lng -3.7038 [--all]
```

- `resolve` returns the best match `{ formattedAddress, lat, lng, locationType, placeId, types, addressComponents }`. With `--all` it returns the full candidate array; with no match it returns `{ found: false }`.
- `--country <iso>` biases results to a country (e.g. `es`, `pt`, `it`); quote addresses that contain spaces/commas.
- Typical use: geocode the client address to obtain `lat`/`lng`, then set the study `mapCenter` before building surfaces — see [[solar-study]].
- Backed by `GET /api/geocode` and `GET /api/reverse-geocode` (solar service). Requires the Geocoding API enabled in GCP on the server key.

### Notifications (`suntropy notifications`) — since 0.11.6

Send an in-app (and email) notification to a user. Use it to proactively tell a user that a task is finished: a **direct execution** (Alexandria task modal) or an **email**-triggered run leaves no study comment, so — unlike a comment-tag mention — no notification is generated automatically and the user won't know the work is done unless they go looking.

```bash
# Notify a user as Alexandria that a task is done (signs it as Alexandria)
suntropy notifications send --to-user <userUID> --as-alexandria \
  --message "He terminado el estudio de la Nave Industrial. Revisa los resultados."

# Link it to the study so the notification is click-through, and ping as a mention
suntropy notifications send --to-user <userUID> --as-alexandria --mention \
  --title "Estudio listo" --message "Resultados calculados." --study <solarStudyId>
```

- `--to-user <userUID>` (required): recipient. `--message <text>` (required, Markdown): body.
- `--as-alexandria`: signs the notification as Alexandria (name + avatar in the app) instead of the acting user — **always pass it when notifying on Alexandria's behalf**, otherwise it looks like the user notified themselves.
- `--mention`: send as `new_mention` (a ping, gated by the user's mention setting) instead of `new_comment` (an update).
- `--study <solarStudyId>`: makes the notification click through to that study (must be the 24-hex `solarStudyId`, not a UUID — see [[solar-study]]).
- `--severity info|warning|urgent` (default `info`); `--title <text>`; `--link <url>` (email CTA); `--from-user <userUID>` (overrides the sender).
- Backed by `POST /notifications` (notifications service). The recipient's client must have notifications enabled and the type not disabled in its config.

### Configuration (`suntropy config`) — since 0.4.0

Tenant configuration (theme, SolarForm, SolarForm Advanced). See [[config-tenant]] for the full guide and field-by-field effect documentation.

```bash
# Branding & theme (security service; POST requires admin role)
suntropy config theme get --client-uid <uid>
suntropy config theme set --primary "#0066ff" --logo-url <url> [--set k=v] [--from-file theme.json]
suntropy config theme edit --client-uid <uid>

# SolarForm basic (solar service)
suntropy config solarform get [--with-parameters]
suntropy config solarform create --url <slug> [flags | --set | --from-file]
suntropy config solarform update <id> [flags | --set | --from-file]
suntropy config solarform edit

# SolarForm Advanced — whole payload
suntropy config solarform advanced get
suntropy config solarform advanced update [--set k=v] [--from-file advanced.json]
suntropy config solarform advanced delete
suntropy config solarform advanced init-default --client-uid <uid> [--email <e>] [--url <u>]

# SolarForm Advanced — per-section (each: get | set | edit)
suntropy config solarform advanced general      ...   # branding, language, tracking, base aesthetics
suntropy config solarform advanced cover        ...   # hero / first screen
suntropy config solarform advanced surfaces     ...   # map polygon step
suntropy config solarform advanced consumer     ...   # residential/commercial/community
suntropy config solarform advanced inclination  ...   # flat / inclined / very inclined roof
suntropy config solarform advanced orientation  ...   # azimuth
suntropy config solarform advanced panels       ...   # default panel + kit categories
suntropy config solarform advanced consumption  ...   # kWh vs spending input mode
suntropy config solarform advanced results      ...   # results screen + contact form + engine hooks
suntropy config solarform advanced custom-fields ...  # extra lead fields (plugin-gated)
```

**Merge semantics:** each section's `set` and `edit` GET the current Advanced config, merge the section's subset, then PUT the whole document. You never need to send the full DTO to change a single field. Run `suntropy config solarform advanced <section> set --help` to see every field with a one-line description of what it actually changes in the widget.

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
