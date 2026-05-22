**[UluOps](https://uluops.ai)** · Operating Intelligence as Infrastructure

---

# @uluops/cli

[![npm version](https://img.shields.io/npm/v/@uluops/cli.svg)](https://www.npmjs.com/package/@uluops/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

Unified CLI for UluOps — validation tracking and registry management from a single command. Wraps both the [ops-sdk](https://www.npmjs.com/package/@uluops/ops-sdk) and [registry-sdk](https://www.npmjs.com/package/@uluops/registry-sdk) into an ergonomic terminal interface.

**Current version: 0.8.0** | [Changelog](./CHANGELOG.md)

## Quick Start

```bash
# Install
npm install -g @uluops/cli

# Authenticate
export ULUOPS_API_KEY=ulr_your-api-key-here

# Create a project and save a validation run
ulu projects create my-project
ulu runs save --file results.json

# Browse issues
ulu issues list my-project --status open --priority critical

# Check analytics
ulu analytics burndown --project my-project --days 30

# Run a validator agent
ulu exec agent code-validator -t ./src --model sonnet --project my-project
```

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Authentication](#authentication)
- [Configuration](#configuration)
- [Global Options](#global-options)
- [Command Reference](#command-reference)
  - [Auth](#auth) — Authentication & credential management
  - [Config](#config) — CLI configuration & profiles
  - [Projects](#projects) (`ulu p`) — Project lifecycle management
  - [Runs](#runs) (`ulu r`) — Validation run management
  - [Issues](#issues) (`ulu i`) — Issue tracking & management
  - [Analytics](#analytics) (`ulu a`) — Validation analytics & metrics
  - [Taxonomy](#taxonomy) — Failure taxonomy schema

  - [Definitions](#definitions) (`ulu def`) — Definition management
  - [Versions](#versions) — Definition version history
  - [Deps](#deps) — Dependency graphs
  - [Forks](#forks) — Definition forking
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
- **Profile-based configuration**: Multiple environments via named profiles with independent credentials
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

### Config Files

| File | Purpose |
|------|---------|
| `~/.uluops/profiles.json` | Profile settings (base URLs, default project, output preferences) |
| `~/.uluops/credentials.json` | Credentials per profile (API keys, session tokens) |
| `./.env` | Project-level environment overrides |

### Profiles

Profiles let you maintain separate configurations for different environments:

```bash
# Set config values on the default profile
ulu config set opsBaseUrl https://api.uluops.com/api/v1
ulu config set defaultProject my-project

# Create and switch to a new profile
ulu config use staging
ulu config set opsBaseUrl https://staging-api.uluops.com/api/v1

# Switch back
ulu config use default

# Use a profile for a single command
ulu projects list --profile staging

# View current config
ulu config list

# List all profiles
ulu config profiles
```

### Config Keys

| Key | Description | Default |
|-----|-------------|---------|
| `opsBaseUrl` | Validation tracker API URL | `http://localhost:3100/api/v1` |
| `registryBaseUrl` | Registry API URL | `http://localhost:3001/api/v1` |
| `defaultProject` | Default project for commands that accept `<project>` | - |
| `json` | Always output JSON | `false` |
| `quiet` | Suppress spinners | `false` |
| `debug` | Enable debug output | `false` |

## Global Options

Every command accepts these flags:

```
--api-key <key>      Override API key (env: ULUOPS_API_KEY)
--profile <name>     Config profile to use (default: 'default')
--base-url <url>     Override API base URL
--json               Output raw JSON for scripting
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
ulu auth api-keys create          # Create new API key
ulu auth api-keys revoke <id>     # Revoke an API key
```

**Examples:**

```bash
# Register and create an API key
ulu auth register --email user@example.com --password mypassword
ulu auth api-keys create --name "CI Pipeline"
# Save this key: ulr_abc123... (shown once)

# Login interactively
ulu auth login --email user@example.com --password mypassword

# Check who you are
ulu auth whoami
```

---

### Config

CLI configuration and profile management.

```bash
ulu config list                   # Show resolved config for active profile
ulu config get <key>              # Get a config value
ulu config set <key> <value>      # Set a config value
ulu config unset <key>            # Remove a config value
ulu config profiles               # List all profiles
ulu config use <profile>          # Switch active profile
ulu config path                   # Show config file locations
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

# Soft delete and restore
ulu projects delete my-app
ulu projects restore my-app
```

---

### Runs

Validation run management — save, compare, and archive pipeline results. Alias: `r`.

```bash
ulu runs list <project>           # List runs (--workflow, --limit)
ulu runs get <runId>              # Get run by UUID
ulu runs latest <project>         # Get latest run (--workflow)
ulu runs details <project>        # Detailed run with agents/recommendations
ulu runs save                     # Save run from JSON (--file or --stdin)
ulu runs validate                 # Dry run — preview without saving
ulu runs diff <project>           # Compare two runs (--base, --compare)
ulu runs archive <project>        # Archive old runs (--before-run, --keep-last)
ulu runs update <project>         # Update run metadata (--number, --score, --file)
ulu runs delete <runId>           # Delete a run
```

**Examples:**

```bash
# Save a validation run from a JSON file
ulu runs save --file validation-results.json

# Save from stdin (pipe from another tool)
cat results.json | ulu runs save --stdin

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
```

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
ulu issues search                 # Search across projects (--query)
ulu issues create                 # Create user-submitted issue
ulu issues update <id>            # Update status (--status, --reason)
ulu issues close <id>             # Mark as completed (--reason)
ulu issues edit <id>              # Edit metadata (--title, --severity, etc.)
ulu issues add-note <id>          # Add note (--message, --type)
ulu issues history <id>           # Status change history
ulu issues undo <id>              # Undo last status change
ulu issues restore <id>           # Restore soft-deleted issue
ulu issues bulk-update            # Bulk update statuses (--ids, --status)
ulu issues by-fingerprint <fp>    # Get issue by SHA-256 fingerprint
ulu issues update-by-fingerprint <fp>  # Update by fingerprint
```

**Examples:**

```bash
# List open critical issues
ulu issues list my-project --status open --priority critical

# Search across all projects
ulu issues search --query "authentication" --status open

# Create an issue manually
ulu issues create --project my-project \
  --title "SQL injection in login" \
  --priority critical \
  --severity critical \
  --type security \
  --file-path src/auth/login.ts \
  --line-number 45

# Close an issue with a reason
ulu issues close abc123 --reason "Fixed in PR #42"

# Add a resolution note
ulu issues add-note abc123 --message "Root cause: race condition" --type resolution

# Undo an accidental status change
ulu issues undo abc123

# Bulk close multiple issues
ulu issues bulk-update --ids id1,id2,id3 --status completed --reason "Batch fix"
```

**Filter options for `issues list`:**

| Flag | Values |
|------|--------|
| `--status` | `open`, `completed`, `deferred`, `wontfix`, `all` |
| `--priority` | `critical`, `suggested`, `backlog`, `all` |
| `--severity` | `critical`, `high`, `medium`, `low`, `info` |
| `--agent` | Any agent name (e.g., `code-validator`) |
| `--domain` | `STR`, `SEM`, `PRA`, `EPI` |
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
ulu analytics matrix              # Agent-taxonomy coverage matrix
ulu analytics resolution          # Issue resolution rates by project
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
ulu definitions list              # List definitions (--type, --status, --search)
ulu definitions get <type> <name> [version]   # Get definition (--yaml, --rendered)
ulu definitions create <type> <name>          # Create draft (--file)
ulu definitions update <type> <name> <ver>    # Update draft (--file)
ulu definitions publish <type> <name> <ver>   # Publish definition
ulu definitions deprecate <type> <name> <ver> # Deprecate (--reason, --successor)
ulu definitions validate [type]               # Validate YAML (--file, type auto-detected)
ulu definitions render [type]                 # Render YAML preview (--file, type auto-detected)
ulu definitions delete <type> <name> <ver>    # Delete draft (--yes)
```

**Definition types:** `agent`, `command`, `workflow`, `pipeline`

**Examples:**

```bash
# List all published agents
ulu definitions list --type agent --status published

# Get a definition (YAML output)
ulu def get agent code-validator 1.0.0 --yaml

# Get rendered markdown for a published definition
ulu def get agent code-validator --rendered

# Validate and render a local YAML file (type auto-detected from filename)
ulu def validate --file my-agent.agent.yaml
ulu def render --file my-agent.agent.yaml

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
ulu deps get <type> <name> <version>         # Show dependency graph (--max-depth)
ulu deps dependents <type> <name> <version>  # Show reverse dependencies
```

---

### Forks

Definition forking and lineage.

```bash
ulu forks list <type> <name> <version>       # List forks
ulu forks create <type> <name> <version>     # Fork definition (--fork-name)
ulu forks check <type> <name> <version>      # Check if forkable
ulu forks lineage <type> <name> <version>    # Show fork ancestry chain
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
ulu models sync                   # Sync from providers (admin only)
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
ulu exec pipeline foundations ./ --project my-project

# List available definitions
ulu exec list                          # All definitions
ulu exec list --type agent             # Filter by type (agent, command, workflow, pipeline)
ulu exec list --domain security        # Filter by domain

# Inspect a definition's metadata
ulu exec describe code-validator
```

**Parent options** (apply to all subcommands):

| Option | Description |
|--------|-------------|
| `--local-definitions <dir>` | Local YAML definitions directory |
| `--registry-url <url>` | Override registry URL |
| `--project <name>` | Project name for result tracking |
| `--no-tracking` | Disable validation service submission |

**Shared options** (all `exec` subcommands):

| Option | Description |
|--------|-------------|
| `-p, --prompt <text>` | Operator directive or context for the agent |
| `-m, --model <model>` | Model override (alias, tier, or provider:modelId) |

**Agent-specific options** (`exec agent` only):

| Option | Description |
|--------|-------------|
| `--max-tokens <n>` | Maximum response tokens |
| `--max-steps <n>` | Maximum tool loop iterations (default: 50) |
| `--temperature <n>` | Generation temperature 0-1 (default: 0) |
| `--exec-timeout <ms>` | Execution timeout in milliseconds |
| `-c, --concurrency <n>` | Max concurrent agents for parallel execution (default: 5) |
| `--threshold-pass <n>` | Pass threshold score (agents) |
| `--threshold-warn <n>` | Warning threshold score (agents) |
| `--report <path>` | Write raw agent output report to file (single agent only) |
| `--features-list <path>` | Write structured features/recommendations to file (single agent only) |

**Examples:**

```bash
# Run code-validator with a specific model
ulu exec agent code-validator -t . --model sonnet --project my-project

# Generator: tell the agent what to create
ulu exec agent aristotle-generator -t ./src \
  -p "Create a health check endpoint for the Express API"

# Validator: provide focus context
ulu exec agent security-analyst -t ./src \
  -p "Focus on the authentication middleware and JWT handling"

# Use local definitions instead of registry
ulu exec agent my-validator -t ./src \
  --local-definitions ./agent-defs \
  --project my-project

# Execute without tracking results
ulu exec workflow ship ./packages/api --no-tracking

# Inspect what a definition expects
ulu exec describe code-validator
```

---

### Executions

Execution tracking for definitions.

```bash
ulu executions record <type> <name> <version>   # Record execution (--source)
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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ULUOPS_API_KEY` | API key for authentication | - |
| `ULUOPS_EMAIL` | Email for session auth | - |
| `ULUOPS_PASSWORD` | Password for session auth | - |
| `ULUOPS_BASE_URL` | Ops API base URL | `http://localhost:3100/api/v1` |
| `ULUOPS_REGISTRY_URL` | Registry API base URL | `http://localhost:3001/api/v1` |
| `ULUOPS_AUTH_BASE_URL` | Auth endpoint base URL (for login/register) | Same as `ULUOPS_BASE_URL` |
| `ULUOPS_DEBUG` | Enable debug logging | `false` |
| `ANTHROPIC_API_KEY` | API key for AI model execution (required for `ulu exec` commands) | - |
| `ULUOPS_THINKING_BUDGET` | Token budget for extended thinking (optional) | - |

Create a `.env` file in your project directory:

```env
ULUOPS_API_KEY=ulr_your-api-key-here
ULUOPS_BASE_URL=https://api.uluops.ai/api/v1/ops
ULUOPS_REGISTRY_URL=https://api.uluops.ai/api/v1/registry
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
| **Network Error** | Check server status and base URL config |

All errors include the HTTP status code and server error code when available. Use `--debug` for full request/response details.

## Troubleshooting

### "Authentication required" on every command

```bash
# Verify your credentials are set
echo $ULUOPS_API_KEY
ulu auth whoami

# Check which profile is active
ulu config list
```

### "Connection refused" errors

```bash
# Check the configured base URL
ulu config get opsBaseUrl

# Test server connectivity
curl http://localhost:3100/api/v1/health
```

### Commands targeting the wrong environment

```bash
# Check active profile
ulu config profiles

# Override for a single command
ulu projects list --profile production --base-url https://api.uluops.com/api/v1
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
