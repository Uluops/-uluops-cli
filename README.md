**[UluOps](https://uluops.ai)** · Operating Intelligence as Infrastructure

---

# @uluops/cli

[![npm version](https://img.shields.io/npm/v/@uluops/cli.svg)](https://www.npmjs.com/package/@uluops/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

Unified CLI for UluOps — validation tracking and registry management from a single command. Wraps both the [ops-sdk](https://www.npmjs.com/package/@uluops/ops-sdk) and [registry-sdk](https://www.npmjs.com/package/@uluops/registry-sdk) into an ergonomic terminal interface.

See the [changelog](./CHANGELOG.md) for release history. The npm badge above tracks the published version.

## Quick Start

```bash
# Install
npm install -g @uluops/cli

# Authenticate
export ULUOPS_API_KEY=ulr_your-api-key-here

# Create a project and save a validation run
ulu projects create my-project
ulu runs save --file results.json
# → Run #1 saved for my-project (3 agents, 12 recommendations)

# Browse issues
ulu issues list my-project --status open --priority critical

# Check analytics
ulu analytics burndown --project my-project --days 30

# Run a validator agent (requires ANTHROPIC_API_KEY; parent options like
# --project come BEFORE the subcommand)
export ANTHROPIC_API_KEY=sk-ant-your-key-here
ulu exec --project my-project agent code-validator -t ./src --model sonnet
# → code-validator: PASS (score 92) — results tracked under my-project
```

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Authentication](#authentication)
- [Configuration](#configuration) — Config files & environment
- [Global Options](#global-options)
- [Command Reference](#command-reference)
  - [Auth](#auth) — Authentication & credential management
  - [Projects](#projects) (`ulu p`) — Project lifecycle management
  - [Runs](#runs) (`ulu r`) — Validation run management
  - [Issues](#issues) (`ulu i`) — Issue tracking & management
  - [Analytics](#analytics) (`ulu a`) — Validation analytics & metrics
  - [Taxonomy](#taxonomy) — Failure taxonomy schema

  - [Definitions](#definitions) (`ulu def`) — Definition management
  - [Versions](#versions) — Definition version history
  - [Deps](#deps) — Dependency graphs
  - [Forks](#forks) — Definition forking
  - [Languages](#languages) (`ulu lang`) — Definition language schemas
  - [Models](#models) — AI model catalog
  - [Exec](#exec) (`ulu x`) — Execute agents, commands, workflows, and pipelines
  - [Executions](#executions) — Execution tracking
  - [Translation](#translation) — Definition translation & upgrades
  - [Completion](#completion) — Shell completion scripts
- [Output Modes](#output-modes)
- [Environment Variables](#environment-variables)
- [Error Handling](#error-handling)
- [Troubleshooting](#troubleshooting)
- [Related Packages](#related-packages)
- [License](#license)

## Features

- **Unified interface**: Single `ulu` command covers both the validation tracker (ops) and definition registry APIs
- **Command aliases**: `ulu p` (projects), `ulu r` (runs), `ulu i` (issues), `ulu a` (analytics), `ulu x` (exec), `ulu def` (definitions)
- **Flexible authentication**: API key, session token, or email/password — same credential chain as the SDKs
- **Machine-friendly output**: `--json` flag on every command for scripting and CI/CD integration
- **Shell completion**: Tab completion for bash, zsh, and fish
- **Contextual error hints**: Actionable suggestions on auth failures, 404s, rate limits, and network errors — usage and examples shown on every error
- **Spinner feedback**: Progress indicators for long operations (suppress with `-q`)

## Installation

```bash
# npm (global)
npm install -g @uluops/cli

# npx (no install)
npx @uluops/cli --help

# From source (monorepo)
cd packages/-uluops-cli
npm run build
node dist/cli.js --help
```

**Requirements:**
- Node.js 18.0.0 or higher

## Authentication

The CLI supports three authentication methods, resolved in priority order:

### 1. API Key (Recommended)

```bash
# Via flag
ulu projects list --api-key ulr_your-key

# Via environment variable (preferred)
export ULUOPS_API_KEY=ulr_your-api-key-here
ulu projects list
```

### 2. Session Token (Login)

```bash
ulu auth login
# Prompts for email and password, stores session in ~/.uluops/credentials.json

ulu auth whoami
# Shows current authenticated user
```

### 3. Email/Password (Environment)

```bash
export ULUOPS_EMAIL=user@example.com
export ULUOPS_PASSWORD=your-password
ulu projects list
```

### Credential Priority Chain

The CLI resolves credentials in this order:

1. `--api-key` flag
2. `ULUOPS_API_KEY` environment variable
3. `ULUOPS_EMAIL` + `ULUOPS_PASSWORD` environment variables
4. Session token stored by `ulu auth login`
5. Profile credentials in `~/.uluops/credentials.json`
6. Local `.env` file in the current directory

## Configuration

| File | Purpose |
|------|---------|
| `~/.uluops/credentials.json` | Credentials per profile (API keys, session tokens) |
| `./.env` | Project-level environment overrides |

## Global Options

Every command accepts these flags:

```text
--api-key <key>      Override API key (env: ULUOPS_API_KEY)
--profile <name>     Config profile to use (default: 'default')
--timeout <ms>       Request timeout in milliseconds (default: 30000 for ops/registry, 600000 for exec)
--json               Output raw JSON for scripting
--json-envelope      Wrap --json output in the versioned stability envelope (same as ULU_JSON_SCHEMA=1)
--debug              Enable debug output
-q, --quiet          Suppress spinners and non-essential output
-V, --version        Show CLI version
-h, --help           Show help for any command
```

## Command Reference

### Auth

Authentication and credential management.

```bash
ulu auth login                    # Login with email/password
ulu auth logout                   # Revoke all sessions
ulu auth whoami                   # Show current user
ulu auth register                 # Register new account
ulu auth forgot-password          # Request password reset email
ulu auth reset-password           # Reset password with token
ulu auth change-password          # Change current password
ulu auth profile                  # View user profile
ulu auth update-profile           # Update profile (display name, bio, avatar)
ulu auth sessions list            # List active sessions
ulu auth sessions revoke <id>     # Revoke a session
ulu auth api-keys list            # List API keys
ulu auth api-keys create          # Create new API key (--name, --expires <ISO date>)
ulu auth api-keys revoke <id>     # Revoke an API key
```

**Examples:**

```bash
# Register and create an API key
ulu auth register --email user@example.com --password mypassword
ulu auth api-keys create --name "CI Pipeline"
ulu auth api-keys create --name "CI Pipeline" --expires 2026-12-31  # optional expiry
# Save this key: ulr_abc123... (shown once)

# Login interactively
ulu auth login --email user@example.com --password mypassword

# Check who you are
ulu auth whoami
```

---

### Projects

Project lifecycle management. Alias: `p`.

```bash
ulu projects list                 # List all projects
ulu projects get <name>           # Get project details
ulu projects create <name>        # Create new project
ulu projects delete <name>        # Soft delete (--force for hard delete)
ulu projects restore <name>       # Restore soft-deleted project
ulu projects summary <name>       # Project summary with issue counts
ulu projects trends <name>        # Issue trends over time
ulu projects rename <name>        # Rename project (--new-name required)
ulu projects bulk-update-issues <name>   # Batch update issue statuses
ulu projects merge-issues <name>         # Merge duplicate issues
```

**Examples:**

```bash
# Create a project and check its summary
ulu projects create my-app
ulu projects summary my-app

# View trends for the last 90 days
ulu projects trends my-app --days 90

# Rename a project
ulu projects rename old-name --new-name new-name

# Soft delete and restore (delete prompts for confirmation; pass -y to skip)
ulu projects delete my-app -y
ulu projects restore my-app
```

---

### Runs

Validation run management — save, compare, and archive pipeline results. Alias: `r`.

```bash
ulu runs list <project>           # List runs (--workflow, --limit)
ulu runs get <runId>              # Get run by UUID
ulu runs latest <project>         # Get latest run (--workflow)
ulu runs details <project>        # Detailed run with agents/recommendations (-n for a specific run number)
ulu runs save                     # Save run from JSON (--file or --stdin; -p/-w override input fields)
ulu runs validate                 # Dry run — preview against the live tracker (requires auth; -p/-w override)
ulu runs diff <project>           # Compare two runs (--base, --compare)
ulu runs archive <project>        # Archive old runs (--before-run, --before-date, --keep-last, --reason)
ulu runs update <project>         # Update run metadata (--number, --score, --passed, --file)
ulu runs delete <runId>           # Delete a run
```

**Examples:**

```bash
# Save a validation run from a JSON file
ulu runs save --file validation-results.json

# Save from stdin (pipe from another tool)
cat results.json | ulu runs save --stdin

# Override the project or workflow type in the JSON without editing the file (handy in CI)
ulu runs save --file results.json -p override-project -w post-implementation

# Dry run to preview what would happen
ulu runs validate --file results.json

# Compare run 1 vs run 5
ulu runs diff my-project --base 1 --compare 5

# Get latest run details
ulu runs latest my-project --workflow post-implementation

# Archive all but the last 10 runs
ulu runs archive my-project --keep-last 10

# Update token counts on a run after the fact
ulu runs update my-project --number 5 --file token-update.json

# Set the gates-passed flag on a run after the fact
ulu runs update my-project --number 5 --passed true
```

> **Note:** `runs update --score` is rejected on finalized runs ("Cannot rewrite averageScore"). Use the `--file` form to patch per-agent fields. Each agent entry in the file must include `name` and `decision` (any other fields like `tokens` are merged into the existing record).

### Run Input Format

The JSON file for `ulu runs save` follows this structure:

```json
{
  "project": "my-project",
  "workflow_type": "post-implementation",
  "agents": [
    {
      "name": "code-validator",
      "score": 85,
      "decision": "PASS",
      "model": "sonnet",
      "tokens": { "input_tokens": 1000, "output_tokens": 500 }
    }
  ],
  "recommendations": [
    {
      "agent": "code-validator",
      "title": "Missing error handling",
      "priority": "suggested",
      "severity": "medium",
      "file_path": "src/api/client.ts",
      "line_number": 42
    }
  ],
  "summary": {
    "average_score": 85,
    "all_gates_passed": true
  }
}
```

---

### Issues

Issue tracking and management. Alias: `i`.

```bash
ulu issues list <project>         # List issues with filters
ulu issues get <id>               # Get issue (--full for occurrences/notes)
ulu issues search                 # Search across projects (--query, --projects to scope)
ulu issues create                 # Create user-submitted issue (--failure-code, --domain link to taxonomy)
ulu issues update <id>            # Update status (--status, --reason)
ulu issues close <id>             # Mark as completed (--reason)
ulu issues edit <id>              # Edit metadata (--title, --severity, etc.)
ulu issues add-note <id>          # Add note (--message, --type)
ulu issues history <id>                          # Show timeline by UUID
ulu issues history <fingerprint> --project <slug> # Resolve fingerprint then show timeline
ulu issues history --project <slug>              # Picker: list recent issues (--limit), then drill in
ulu issues undo <id>              # Undo last status change
ulu issues restore <id>           # Restore soft-deleted issue
ulu issues bulk-update            # Bulk update statuses (--ids, --status)
ulu issues by-fingerprint <fp> --project <name>        # Get issue by SHA-256 fingerprint
ulu issues update-by-fingerprint <fp> --project <name> # Update by fingerprint
```

**Examples:**

```bash
# List open critical issues
ulu issues list my-project --status open --priority critical

# Search across all projects (or scope to specific ones with --projects)
ulu issues search --query "authentication" --status open
ulu issues search --query "timeout" --projects my-app,my-api

# Create an issue manually. Pass --failure-code and --domain to link it into
# the failure taxonomy — without them the issue is excluded from domain/code analytics.
ulu issues create --project my-project \
  --title "SQL injection in login" \
  --priority critical \
  --severity critical \
  --type security \
  --failure-code SEM-VAL/H \
  --domain SEM \
  --file-path src/auth/login.ts \
  --line 45

# Close an issue with a reason
ulu issues close abc123 --reason "Fixed in PR #42"

# Add a resolution note
ulu issues add-note abc123 --message "Root cause: race condition" --type resolution

# Undo an accidental status change
ulu issues undo abc123

# Bulk close multiple issues
ulu issues bulk-update --ids id1,id2,id3 --status completed --reason "Batch fix"

# Browse recent issues then drill into one (picker mode, v0.13.0)
ulu issues history --project my-project          # list recent issues
ulu issues history a1b2c3d4 --project my-project # then drill in by fingerprint
```

> **v0.13.0 breaking change (`--json`):** `ulu issues history --json` now emits the
> `IssueHistoryEnvelope` shape `{ issueId, events, totalEvents, truncated }` instead of
> a flat `StatusHistory[]` array. Scripts doing `result[0]` or `Array.isArray(result)`
> must migrate to `result.events[0]`. The `events[]` array contains discriminated entries
> with `type: 'occurrence' | 'status' | 'note'` — narrow on `type` before accessing
> event-specific fields. See [CHANGELOG](./CHANGELOG.md#0130---2026-06-08) for the full
> migration story.

**Filter options for `issues list`:**

| Flag | Values |
|------|--------|
| `--status` | `open`, `completed`, `deferred`, `wontfix`, `all` |
| `--priority` | `critical`, `suggested`, `backlog`, `all` |
| `--severity` | `critical`, `high`, `medium`, `low`, `info` |
| `--agent` | Any agent name (e.g., `code-validator`) |
| `--domain` | `STR`, `SEM`, `PRA`, `EPI` |
| `--include-resolved` | Include resolved (completed/wontfix/deferred) issues in results |
| `--limit` | Max results (default: 50) |

---

### Analytics

Validation analytics and trend metrics. Alias: `a`.

```bash
ulu analytics agents              # Agent performance (avg score, pass rate)
ulu analytics reliability         # Agent reliability (false positive rate)
ulu analytics hotspots            # Files with most issues
ulu analytics burndown            # Taxonomy burndown time series
ulu analytics velocity            # Rate of change per failure mode
ulu analytics discovery           # New vs recurring issues timeline
ulu analytics matrix              # Agent-taxonomy coverage matrix (--min-issues to threshold)
ulu analytics resolution          # Issue resolution rates by project (cross-project; no --project flag)
ulu analytics taxonomy            # Taxonomy distribution
ulu analytics full-taxonomy       # Full taxonomy analytics breakdown
ulu analytics trends              # Trend summary metrics
```

**Examples:**

```bash
# Which agents are most effective?
ulu analytics agents --project my-project --days 30

# Which files keep generating issues?
ulu analytics hotspots --project my-project --limit 10

# Are we closing issues faster than opening them?
ulu analytics burndown --project my-project --days 90 --granularity weekly

# Which failure modes are growing fastest?
ulu analytics velocity --project my-project --threshold 50

# New issues vs recurring — is validation finding new problems?
ulu analytics discovery --project my-project --group-by week

# Coverage gaps — which domains lack agent coverage?
ulu analytics matrix --project my-project
ulu analytics matrix --project my-project --min-issues 3  # only failure modes seen 3+ times

# Reliability — which agents have high false positive rates?
ulu analytics reliability --days 90
```

---

### Taxonomy

Inspect the failure taxonomy schema.

```bash
ulu taxonomy get                  # Display domains, severity codes, statuses
```

Displays the four failure domains (STR, SEM, PRA, EPI), their failure modes, severity levels, and priority tiers.

---

### Definitions

Workflow definition management (registry API). Alias: `def`.

```bash
ulu definitions list              # List definitions (--type, --status, --search, --domain, --visibility, --limit, --offset)
ulu definitions get <type> <name> [version]   # Get definition (--yaml, --rendered, --target, --render-profile, --include-runtime, -o)
ulu definitions create <type> <name>          # Create draft (--file)
ulu definitions update <type> <name> <ver>    # Update draft (--file, --display-name, --description, --visibility); --change-type major|minor|patch creates a new version from a published one
ulu definitions publish <type> <name> <ver>   # Publish definition
ulu definitions deprecate <type> <name> <ver> # Deprecate (--reason, --successor)
ulu definitions validate [type]               # Validate YAML (--file, type auto-detected)
ulu definitions render [type]                 # Render YAML preview (--file, --render-profile core|uluops-full, type auto-detected)
ulu definitions delete <type> <name> <ver>    # Delete draft (--yes)
```

**Definition types:** `agent`, `command`, `workflow`, `pipeline`

**Examples:**

```bash
# List all published agents
ulu definitions list --type agent --status published

# Get a definition (YAML output, latest version)
ulu def get agent code-validator --yaml

# Get a specific version
ulu def get agent code-validator 1.10.2 --yaml

# Get rendered markdown for a published definition
ulu def get agent code-validator --rendered

# Render for a specific harness (claude-code, opencode, codex, gemini-cli)
ulu def get agent code-validator --rendered --target opencode

# Write rendered output to file instead of stdout
ulu def get agent code-validator --rendered -o ./code-validator.md

# Validate and render a local YAML file (type auto-detected from filename)
ulu def validate --file my-agent.agent.yaml
ulu def render --file my-agent.agent.yaml

# Render with the full UluOps profile (platform preamble) instead of the lean core profile
ulu def render --file my-agent.agent.yaml --render-profile uluops-full

# Create, validate, and publish a new agent
ulu def validate agent --file my-agent.yaml
ulu def create agent my-agent --file my-agent.yaml
ulu def publish agent my-agent 1.0.0

# Deprecate an old version
ulu def deprecate agent old-agent 1.0.0 \
  --reason "Replaced by new-agent" \
  --successor new-agent@2.0.0
```

---

### Versions

Definition version history and comparison.

```bash
ulu versions list <type> <name>                  # List version history
ulu versions diff <type> <name> <from> <to>      # Compare two versions
```

---

### Deps

Dependency graph inspection.

```bash
ulu deps get <type> <name> <version>         # Show dependency graph (--max-depth, --tree)
ulu deps dependents <type> <name> <version>  # Show reverse dependencies
```

**Examples:**

```bash
# Flat indented dependency list (default; each line tagged with its depth)
ulu deps get workflow ship 1.0.0

# Recursive tree view with [context] edge labels (v0.13.0)
ulu deps get workflow ship 1.0.0 --tree

# Limit traversal depth
ulu deps get workflow ship 1.0.0 --max-depth 2

# Reverse lookup with ← context attribution
ulu deps dependents agent code-validator 1.0.0
```

> **v0.13.0 changes:** `deps get` output format changed (no longer prints `Edges: N`
> or cycle warnings — the registry never tracked those). The new `--tree` flag renders
> the recursive `DependencyNode` graph with `[context]` labels per edge (e.g.,
> `[invokes.agent]`, `[stage "Final Checks"]`). `deps dependents` now shows
> `← context` arrows so operators can see how each consumer references the target.

---

### Forks

Definition forking and lineage.

```bash
ulu forks list <type> <name> <version>       # List forks
ulu forks create <type> <name> <version>     # Fork definition (--fork-name, --visibility, --display-name, --description)
ulu forks check <type> <name> <version>      # Check if forkable
ulu forks lineage <type> <name> <version>    # Show fork ancestry chain
```

---

### Languages

Definition language schemas. Alias: `lang`.

```bash
ulu lang                          # List all languages with versions
ulu lang adl                      # Get ADL metadata
ulu lang adl --json               # Full output with JSON Schema content
ulu lang adl -o adl-schema.json   # Write JSON Schema to file
```

---

### Models

AI model catalog.

```bash
ulu models list                   # List models (--provider, --tier, --capability)
ulu models get <provider> <id>    # Get model details
ulu models providers              # List providers
ulu models aliases                # List model aliases
ulu models resolve <alias>        # Resolve alias to concrete model
```

---

### Exec

Execute agents, commands, workflows, and pipelines. Alias: `x`.

```bash
# Auto-detect definition type and execute
ulu exec run <name> <target>

# Execute an agent
ulu exec agent code-validator -t ./src --model sonnet

# Execute multiple agents in parallel (default concurrency: 5)
ulu exec agent code-validator security-analyst test-architect -t ./src

# Execute a saved command configuration
ulu exec command my-command ./src

# Execute a multi-phase workflow
ulu exec workflow post-implementation ./

# Execute a multi-stage pipeline
ulu exec --project my-project pipeline foundations ./

# List available definitions
ulu exec list                          # All definitions
ulu exec list --type agent             # Filter by type (agent, command, workflow, pipeline)
ulu exec list --domain security        # Filter by domain

# Inspect a definition's metadata
ulu exec describe code-validator
ulu exec describe socrates-explorer --type agent       # Disambiguate when name exists across types
ulu exec describe code-validator@1.2.0                  # Inspect a specific version (@version suffix)
ulu exec describe code-validator -v 1.2.0               # Same — explicit -v flag
ulu exec describe code-validator --def-version 1.2.0    # Same — long form is --def-version (the global -V/--version shadows a plain --version)
ulu exec describe                                       # No name → list all definitions
ulu exec describe --type pipeline                       # No name + --type → filter the list
```

**Parent options** (apply to all subcommands):

| Option | Description |
|--------|-------------|
| `--local-definitions <dir>` | Local YAML definitions directory |
| `--project <name>` | Project name for result tracking |
| `--no-tracking` | Disable validation service submission |
| `--no-safety-warnings` | Suppress risk warnings and runtime advisories |

> **Parent options must come BEFORE the subcommand.** They belong to `ulu exec`,
> not the subcommand — `ulu exec --project foo agent code-validator ./src`, not
> `ulu exec agent code-validator ./src --project foo`. Placed after the
> subcommand they were previously *silently ignored*; the CLI now detects this
> and errors with the correct order.
>
> **Tracking requires a named project.** When tracking is on and no project is
> resolved (`--project` or `ULUOPS_PROJECT`), the CLI shows the project name the
> run would be tracked under and asks you to confirm it — rather than silently
> inventing one from the target directory. In a non-interactive context (CI,
> piped stdin) it **fails closed** (exit 1) instead of prompting; pass
> `--project <name>`, set `ULUOPS_PROJECT`, or `--no-tracking`.

**Shared options** (all `exec` subcommands):

| Option | Description |
|--------|-------------|
| `-p, --prompt <text>` | Operator directive or context for the agent |
| `-m, --model <model>` | Model override (alias, tier, or provider:modelId) |

**Agent-specific options** (`exec agent` only):

| Option | Description |
|--------|-------------|
| `-t, --target <path>` | **Required.** Target directory to analyze |
| `--max-tokens <n>` | Maximum response tokens |
| `--max-steps <n>` | Maximum tool loop iterations (default: 50) |
| `--temperature <n>` | Generation temperature 0-1 (default: 0) |
| `--exec-timeout <ms>` | Execution timeout in milliseconds |
| `-c, --concurrency <n>` | Max concurrent agents for parallel execution (default: 5) |
| `--threshold-pass <n>` | Pass threshold score (agents) |
| `--threshold-warn <n>` | Warning threshold score (agents) |
| `--hash <sha256:...>` | **Optional.** Pin the expected YAML hash (from a trusted channel). Verifies the resolved definition source + config before executing; refuses on mismatch (**exit 4**). |
| `--prompt-hash <sha256:...>` | **Optional.** Pin the expected rendered-prompt hash. Pair with `--hash` for full agent executed-prompt integrity. Both pins are opt-in — omitting them runs unverified as before. Refuses on mismatch (**exit 4**). |
| `--report [path]` | Write a human-readable, publication-quality report to file (single agent only). With no path, defaults to `./<agent>-report-<YYYYMMDDTHHmmss>.md` in cwd. Injects a report-mode directive into the agent's prompt and disables structured-output enforcement so the model can emit prose. **Mutually exclusive with tracker submission** (implies `--no-tracking`): the schema-validated path the tracker depends on is no longer guaranteed under report mode. Run without `--report` for tracker submission. |
| `-o, --output <path>` | Explicit output path for `--report` (overrides the `--report` argument and the default) |
| `--features-list <path>` | Write structured features/recommendations to file (single agent only) |

> **Run completeness.** Agent output shows a `Completeness:` badge next to the
> decision when a run did not fully finish its work — `PARTIAL` or `FAILED`
> (clean runs stay uncluttered). This is **separate from the decision**: a
> `PASS · PARTIAL` means a positive verdict reached on incomplete coverage.
> Run with `--debug` to list the underlying degradation markers (e.g.
> `budget.forced-wrap-up`, `steps.near-exhaustion`, `extraction.low-confidence`)
> and why each fired. Requires `@uluops/core@0.22.0`.
>
> **Concurrency.** `-c/--concurrency` caps how many agent *definitions* run in
> parallel. A separate, engine-wide ceiling on concurrent in-flight LLM calls
> (across workflow phases, parallel steps, and inline agents) is set by the
> `ULUOPS_MAX_CONCURRENCY` env var (default 8).

**Examples:**

```bash
# Run code-validator with a specific model
ulu exec --project my-project agent code-validator -t . --model sonnet

# Generator: tell the agent what to create
ulu exec agent aristotle-generator -t ./src \
  -p "Create a health check endpoint for the Express API"

# Validator: provide focus context
ulu exec agent security-analyst -t ./src \
  -p "Focus on the authentication middleware and JWT handling"

# Use local definitions instead of registry
ulu exec --project my-project --local-definitions ./agent-defs \
  agent my-validator -t ./src

# Produce a publication-quality report (cwd default destination)
ulu exec agent wittgenstein-analyst -t ./docs --report

# Same, with explicit destination
ulu exec agent wittgenstein-analyst -t ./docs --report -o ~/my-report.md

# Execute without tracking results
ulu exec --no-tracking workflow ship ./packages/api

# Inspect what a definition expects
ulu exec describe code-validator

# Pin integrity hashes (from a trusted channel) — refuses with exit 4 on mismatch
ulu exec agent code-validator -t ./src \
  --hash sha256:… --prompt-hash sha256:…
```

> **Integrity pins are optional.** `--hash` verifies the YAML (source + config);
> `--prompt-hash` verifies the rendered prompt (agents/commands). Use both for
> full agent integrity. On mismatch — or if `--prompt-hash` is given for a
> definition with no rendered prompt — execution is **refused with exit code 4**
> (distinct from `1` usage/config and `2` API/runtime). `exec workflow`/`pipeline`
> have no rendered prompt; pin their YAML with `--hash` only.

---

### Executions

Execution tracking for definitions.

```bash
ulu executions record <type> <name> <version>   # Record execution (--source, --run-id for idempotency)
ulu executions stats <type> <name> <version>     # Get statistics (--window)
```

---

### Translation

Definition translation and legacy upgrades.

```bash
ulu translation version                          # Get translator version
ulu translation retranslate <type> <name> <ver>  # Re-translate (--new-version)
ulu translation upgrade <type> <name>            # Upgrade legacy YAML (--file)
```

---

### Completion

Generate shell completion scripts.

```bash
# Bash
ulu completion bash >> ~/.bashrc

# Zsh
ulu completion zsh >> ~/.zshrc

# Fish
ulu completion fish > ~/.config/fish/completions/ulu.fish
```

## Output Modes

| Mode | Flag | Description |
|------|------|-------------|
| **Human** | *(default)* | Pretty-printed tables and key-value output |
| **JSON** | `--json` | Raw JSON for scripting and piping |
| **Quiet** | `-q, --quiet` | Suppress spinners and non-essential output |
| **Debug** | `--debug` | Include request/response details |

```bash
# Pipe JSON output to jq
ulu issues list my-project --json | jq '.[] | .title'

# Quiet mode for scripts
ulu runs save --file results.json -q

# Debug a failing command
ulu projects get my-project --debug
```

> **Destructive commands in scripts and CI.** `projects delete`, `runs delete`,
> and `definitions delete` prompt for confirmation at an interactive terminal.
> In a non-interactive context (CI, piped stdin, automated agent harness) there
> is no prompt to answer, so they **fail closed**: without `--yes`/`-y` they
> print an error to stderr and **exit non-zero** rather than silently skipping
> the deletion with a success code. Always pass `-y` when scripting a delete.

## JSON Output Stability Contract

`--json` output shapes are part of this CLI's **public API**. Automated and CI
consumers parse them, and they cannot easily refuse an upgrade — so the contract
is explicit:

- **A change to any default `--json` output shape is a breaking change and
  requires a major version bump.** Adding fields, removing fields, re-nesting,
  or turning a bare array into an object (or vice-versa) all count.
- The default `--json` output is **frozen** at its current shape. New stability
  machinery is added additively and never alters the default bytes.

### Detecting shape changes at runtime (opt-in envelope)

Set `ULU_JSON_SCHEMA=1` (or pass the global `--json-envelope` flag) to wrap every
`--json` payload in a versioned envelope so a script can detect a shape change
instead of breaking silently:

```bash
ULU_JSON_SCHEMA=1 ulu deps get workflow ship 1.0.0 --json
```

```jsonc
{
  "schema": "uluops.cli/v1",   // envelope format id
  "cliVersion": "0.15.0",
  "kind": "deps.get",           // stable logical name of this output
  "schemaVersion": 2,           // per-output shape version — bumps on a breaking change
  "data": { /* the exact payload the default --json mode emits */ }
}
```

Pin `kind` + `schemaVersion` in your CI. The `data` field is byte-for-byte what
the default `--json` mode emits, so you can opt in without changing how you read
the payload — only how you guard it. (`kind` values such as `issue.history` and
`deps.get` are already at `schemaVersion: 2`, recording the breaking change they
shipped in v0.13.0.)

### For maintainers — changing a `--json` shape

The source of truth is the `SCHEMA_VERSIONS` registry in
[`src/formatters/json.ts`](src/formatters/json.ts); all `--json` output flows
through the single `emitJson()` chokepoint. To change an output shape you must:

1. Bump that `kind`'s `schemaVersion` in `SCHEMA_VERSIONS`.
2. Add a CHANGELOG entry marked **BREAKING** and ship it under a major bump.
3. Update the contract-anchor test for that surface (e.g. `deps get` /
   `issues list` / `issues history`) — these tests pin the shape and will fail
   CI on an unacknowledged change, which is the point.

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ULUOPS_API_KEY` | API key for authentication | - |
| `ULUOPS_PROJECT` | Project name for `ulu exec` result tracking when `--project` is not passed (useful in CI) | - |
| `ULUOPS_EMAIL` | Email for session auth | - |
| `ULUOPS_PASSWORD` | Password for session auth | - |
| `ULUOPS_DEBUG` | Enable debug logging (also expands the global unhandled-error handler's output) | `false` |
| `ULU_JSON_SCHEMA` | Set to `1` to wrap `--json` output in the versioned stability envelope | - |
| `ANTHROPIC_API_KEY` | API key for AI model execution (required for `ulu exec` commands) | - |
| `ULUOPS_MAX_CONCURRENCY` | Engine-wide cap on concurrent in-flight LLM calls for `ulu exec` (distinct from `exec agent -c/--concurrency`); honored by `@uluops/core` | `8` |
| `ULUOPS_THINKING_BUDGET` | Token budget for extended thinking (optional) | - |

Create a `.env` file in your project directory:

```env
ULUOPS_API_KEY=ulr_your-api-key-here
```

## Error Handling

The CLI provides contextual error messages with actionable hints:

| Error | Hint |
|-------|------|
| **401 Unauthorized** | Check `ULUOPS_API_KEY` or run `ulu auth login` |
| **403 Forbidden** | Insufficient permissions — contact admin |
| **404 Not Found** | Verify the resource name or ID |
| **400 Validation** | Check command arguments — run with `--help` |
| **429 Rate Limited** | Wait and retry — the CLI shows the retry delay |
| **Network Error** | Check your network connection and server status |

All errors include the HTTP status code and server error code when available. Use `--debug` for full request/response details.

## Troubleshooting

### "Authentication required" on every command

```bash
# Verify your credentials are set
echo $ULUOPS_API_KEY
ulu auth whoami
```

### "Connection refused" errors

```bash
# Verify the service is reachable and your credentials are valid
ulu auth whoami
```

### Shell completion not working

```bash
# Regenerate and source the completion script
ulu completion bash >> ~/.bashrc
source ~/.bashrc
```

## Related Packages

| Package | Description |
|---------|-------------|
| [`@uluops/ops-sdk`](https://www.npmjs.com/package/@uluops/ops-sdk) | TypeScript SDK for the validation tracker API |
| [`@uluops/registry-sdk`](https://www.npmjs.com/package/@uluops/registry-sdk) | TypeScript SDK for the definition registry API |

## License

MIT License - see [LICENSE](./LICENSE) for details.
