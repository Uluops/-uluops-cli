**[UluOps](https://uluops.ai)** · The operations layer for agentic work

---

# @uluops/cli

[![npm version](https://img.shields.io/npm/v/@uluops/cli.svg)](https://www.npmjs.com/package/@uluops/cli)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20.3+-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)

Unified CLI for UluOps — runs, findings, issues, the definition registry, and executing agents, commands, workflows and pipelines against your AI provider (`ulu exec`), from a single command. Wraps both the [ops-sdk](https://www.npmjs.com/package/@uluops/ops-sdk) and [registry-sdk](https://www.npmjs.com/package/@uluops/registry-sdk) into an ergonomic terminal interface.

See the [changelog](./CHANGELOG.md) for release history. The npm badge above tracks the published version.

## Quick Start

Requires Node.js 20.3 or higher.

```bash
# Install
npm install -g @uluops/cli

# Authenticate
export ULUOPS_API_KEY=ulr_your-api-key-here

# Create a project and save a run
ulu projects create my-project
ulu runs save --file results.json
# → Run #1 saved for my-project (3 agents, 12 recommendations)

# Browse issues
ulu issues list my-project --status open --priority critical

# Check analytics
ulu analytics burndown --project my-project --days 30

# Run a validator agent (requires ANTHROPIC_API_KEY; parent options like
# --project work before OR after the subcommand, like --model)
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
  - [Orgs](#orgs) — An org's member-visible activity
  - [Log](#log--the-projects-second-history) — Runs and decisions interleaved, newest first
  - [Runs](#runs) (`ulu r`) — Runs and the findings they produced
  - [Issues](#issues) (`ulu i`) — Issue tracking & management
  - [Analytics](#analytics) (`ulu a`) — Analytics for runs, findings and issues
  - [Taxonomy](#taxonomy) — Failure taxonomy schema

  - [Definitions](#definitions) (`ulu def`) — Definition management
  - [Versions](#versions) — Definition version history
  - [Deps](#deps) — Dependency graphs
  - [Forks](#forks) — Definition forking
  - [Languages](#languages) (`ulu lang`) — Definition language schemas
  - [Models](#models) — AI model catalog
  - [Exec](#exec) (`ulu x`) — Execute agents, commands, workflows, and pipelines
  - [Providers and shell access](#providers-and-shell-access) — Which models `ulu exec` can run; OpenRouter; cost; bash
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

- **Unified interface**: Single `ulu` command covers both the tracker (runs, findings, issues) and the definition registry APIs
- **The second history**: `ulu log` interleaves a project's runs and decisions newest-first (`--stat` for the rollup, `--orgs` across every org you belong to); `ulu orgs audit-feed` for an org's member-visible activity
- **Command aliases**: `ulu p` (projects), `ulu r` (runs), `ulu i` (issues), `ulu a` (analytics), `ulu x` (exec), `ulu def` (definitions)
- **Flexible authentication**: API key, session token, or email/password — same credential chain as the SDKs
- **Machine-friendly output**: `--json` flag on every command for scripting and CI/CD integration
- **Shell completion**: Tab completion for bash, zsh, and fish
- **Contextual error hints**: Actionable suggestions on auth failures, 404s, rate limits, and network errors — usage and examples shown on every error
- **Security-event warnings** on stderr for a blocked redirect, a rejected credential or a failed token refresh ([details](#security-warnings))
- **Honest tracking signals**: When a run succeeds but recording it to the tracker fails (e.g. a free-tier project-limit cap), the result surfaces `Run not recorded: …` with an upgrade link instead of silently dropping the dashboard link. When the run is saved but the tracker rejects some agent's analysis, `Analysis rejected for <agent>: …` says which
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
- Node.js 20.3.0 or higher

Every model provider `ulu exec` supports — Anthropic, OpenAI, Google and OpenRouter — ships with the CLI; there is nothing else to install. Set the provider's API key to use it (see [Providers and shell access](#providers-and-shell-access)).

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

- **Two-factor accounts:** `ulu auth login` has no TOTP or passkey step yet, so an account with two-factor sign-in cannot log in here. Use an API key for ordinary commands, and the web for the [session-only actions](#commands-that-need-a-signed-in-session).
- **Logging in ends your other sessions**, the browser's included: the API keeps one session per user.
- **It replaces the stored profile entry**, so an API key stored in that profile is overwritten by the session.

### 3. Email/Password (Environment)

```bash
export ULUOPS_EMAIL=user@example.com
export ULUOPS_PASSWORD=your-password
ulu projects list
```

### Credential Priority Chain

The CLI uses the first of these that is set:

1. `--api-key` flag
2. Environment variables, in this order: `ULUOPS_API_KEY`; `ULUOPS_EMAIL` + `ULUOPS_PASSWORD`; `ULUOPS_SESSION_TOKEN`. A `.env` file in the current directory, then `~/.uluops/.env`, fills any of them the shell has not set (it never overrides the shell).
3. The stored profile in `~/.uluops/credentials.json` (`--profile <name>`, default `default`): the API key or the session `ulu auth login` saved there.

So after `ulu auth login`, a key in `--api-key` or `ULUOPS_API_KEY` is still the one sent, including a `ULUOPS_API_KEY` line in a `.env` file, which `env -u` does not remove.

### Commands that need a signed-in session

Setting or changing a password and minting API keys refuse an API key with `403 SESSION_REQUIRED`, however the key reaches the CLI: `ulu auth set-password`, `ulu auth change-password`, `ulu auth api-keys create` and `ulu auth api-keys rotate`. To run one:

```bash
ulu auth login                       # prompts on a terminal
env -u ULUOPS_API_KEY ulu auth change-password -c '…' -n '…'   # no --api-key; ULUOPS_API_KEY unset
# PowerShell: Remove-Item Env:ULUOPS_API_KEY, then run the command
```

If the key is in `./.env` or `~/.uluops/.env`, the CLI loads it back after `env -u`: comment that line out while you run the command.

**Changing or resetting your password ends every session and deletes every API key**, the one in `ULUOPS_API_KEY` included: mint a new key afterwards. A two-factor account cannot log in from the CLI yet, so it does these on the web.

## Configuration

| File | Purpose |
|------|---------|
| `~/.uluops/credentials.json` | Credentials per profile (API keys, session tokens) |
| `./.env` | Project-level environment overrides |

## Global Options

### Which org a command acts in

Every org-scoped command sends `X-Org-Slug` for the first of these that is set (the API never infers an org from a project name):

1. `--org <slug>`
2. The nearest `.uluops.json` above the current directory: `{ "org": "ulu-labs" }` at the root of a work checkout; `{ "org": "personal" }` in a personal repo nested under it stops the walk.
3. `ULUOPS_ORG_SLUG`, from your shell or from `./.env` / `~/.uluops/.env`.
4. Your personal org.

- **Registry commands** (`ulu def`, `versions`, `forks`, `deps`, …) send the org on writes only (create, update, publish, deprecate, archive, delete, fork). Reads return the marketplace view, including your org's private definitions; tell same-named rows apart by `namespace` in `--json`.
- **`orgs audit-feed`** takes the org as its argument, not as a scope.
- **`ulu exec`** passes the same org to `@uluops/core`; **`ulu runs save`** prints where the run landed.
- **`projects rehome`** prints where the org came from: the `.uluops.json` path, or `env-file` when the variable came from a file, so a stray `.env` can't pass for your shell.

### Flags

Every command accepts these flags:

```text
--api-key <key>      Override API key (env: ULUOPS_API_KEY)
--profile <name>     Config profile to use (default: 'default')
--base-url <url>     Override the base URL of the API the command talks to (tracker or registry)
--timeout <ms>       Request timeout in milliseconds (default: 30000 for ops/registry, 600000 for exec)
--json               Output raw JSON for scripting
--json-envelope      Wrap --json output in the versioned stability envelope (same as ULU_JSON_SCHEMA=1)
--debug              Enable debug output
-q, --quiet          Suppress spinners and non-essential output
-V, --version        Show CLI version
-h, --help           Show help for any command
```

### Security warnings

Security events from `@uluops/sdk-core` print as `⚠ Security:` notices on stderr (stdout stays clean for `--json`), beside the normal error, and also when the command itself succeeds, as on best-effort result tracking. `-q` suppresses them.

- **Blocked redirect:** the API answered with a 3xx the CLI will not follow (possibly a man-in-the-middle, a moved endpoint or a captive portal). The request, which can carry credentials, is not re-sent.
- **Credential rejected (401):** expired, revoked or invalid; the notice carries the server request id.
- **Token refresh failed:** run `ulu auth login` (a two-factor account uses an API key instead).

## Command Reference

### Auth

Authentication and credential management.

```bash
ulu auth login                    # Login with email/password
ulu auth logout                   # Revoke all sessions
ulu auth whoami                   # Show current user
ulu auth register                 # Register new account
ulu auth forgot-password          # Request password reset email
ulu auth reset-password           # Reset password with the emailed token (or the whole link)
ulu auth set-password             # Set a FIRST password on an account that has none (OAuth-only; needs a signed-in session)
ulu auth change-password          # Change current password (needs the current one and a signed-in session)
ulu auth profile                  # View user profile
ulu auth update-profile           # Update profile (display name, bio, avatar)
ulu auth sessions list            # List active sessions
ulu auth sessions revoke <id>     # Revoke a session
ulu auth api-keys list            # List API keys
ulu auth api-keys create          # Create new API key (--name, --scope <read|write>, --expires <ISO date>)
ulu auth api-keys rotate <id>     # Rotate a key: re-mint preserving name+scope, revoke the old
ulu auth api-keys revoke <id>     # Revoke an API key
```

**Examples:**

```bash
# Register and create an API key
ulu auth register --email user@example.com --password mypassword
ulu auth api-keys create --name "CI Pipeline"
ulu auth api-keys create --name "CI Pipeline" --expires 2026-12-31  # optional expiry
ulu auth api-keys create --name "readonly-briefing" --scope read     # a key that cannot write
# Save this key: ulr_abc123... (shown once)

# Login interactively
ulu auth login --email user@example.com --password mypassword

# Check who you are
ulu auth whoami
```

---

### Projects

> **A name that starts with `-`** (a project named after the repo `-uluops-core`) is read as an option, so `ulu projects get -uluops-core` fails with `unknown option`, and the error prints the command to run instead:
>
> - put the name after `--`, flags first: `ulu projects get -- -uluops-core`, `ulu issues list --status open -- -uluops-core`;
> - a flag that takes the name accepts `=`: `--project=-uluops-core`;
> - quoting does not help: the shell removes the quotes.

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
ulu projects rehome <name>        # Move project to another org (--to required; source = --org)
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

# Move a project (and its whole history) from org acme to org ulu-labs.
# The project is looked up in the org this command acts in (see "Which org a
# command acts in"). Needs admin/owner in both orgs.
ulu projects rehome my-app --org acme --to ulu-labs --reason "team took it over"
```

After a move, writes to the old address answer `410 PROJECT_REHOMED` naming the new org, instead of creating a new project there; moving back is the same command the other way. The prompt, the success line, each refusal's hint and `ulu projects rehome --help` (which explains why a re-run after the move answers 404) cover the rest.

---

### Orgs

Reads an org's **member-visible** activity. Org creation, membership and invitations are dashboard
surfaces. `--org` does not apply here — the org is the positional argument.

```bash
ulu orgs audit-feed <slug>        # Org-visible audit feed (any member); ACTOR = user id prefix, system (org purge) or unknown; --limit 1–100, --cursor, --json
```

Today the feed lists projects moved out of the org into someone's personal org (org-to-org moves are not in it), one line each (`"billing" moved to alexself2 (personal org) — reason`, with when and who), paged with the `--cursor` the previous page printed, `--json` giving `data.entries[]`, `count`, `hasMore` and `nextCursor`, and other members' text stripped of terminal control sequences and newlines.

---

### Log — the project's second history

Git remembers what changed. `ulu log` remembers what was decided: runs (what was examined) and
decisions (what was decided, with reasons) interleaved newest first, plus what came back.

```bash
ulu log [project]                 # The stream, newest first, 50 events a page (-n 1-500; --cursor to continue)
ulu log [project] --stat          # The rollup: examined / found / decided / came back / activity
ulu log --orgs                    # The rollup per org you belong to, with a per-project table (implies --stat)
ulu log --since <iso> --until <iso> --kind run,decision,regression --workflow <type> --agent <name> --include-archived
ulu log --no-collapse             # One line per issue instead of collapsing same-second identical decisions
ulu log --json                    # The API's page or rollup, byte-for-byte; never collapsed
```

**Which project.** `--project`/`-p`, then the argument, then the `project` key of the nearest `.uluops.json` (which must also name an `org`, `"personal"` for none, or the file is refused), then `ULUOPS_PROJECT`; otherwise the error lists your projects. That file decides only what `ulu log` shows, never where a run lands: `ulu exec` tracks under `--project`, `ULUOPS_PROJECT` or the directory name, so the two can differ.

> **Before adding `project` to a shared checkout,** make sure every tool that reads its `.uluops.json` is on `@uluops/ops-sdk` ≥ 6.5.0 (this CLI is): older ones refuse the file for every command, not only `ulu log`. Find the copies with `find <tree> -path '*/@uluops/ops-sdk/dist/config/workspace-org.js'` and check each one's `package.json` version.

**Reading the stream.** Runs and decisions interleave newest first, in UTC; `ulu log --help` explains every line form (`regressed`, `no reason recorded`, collapsed bulk changes, `--no-collapse`).

```text
$ ulu log my-app -n 3
run #24   2026-11-15 20:38   post-implementation   post-implementation@1.2.0 +5   score 90, gates ok
          new 31 . recurring 0 . regression 0
decided   2026-11-15 20:41   6494717db099  wontfix <- open      "Needs a non-null assertion the lint forbids."
decided   2026-11-15 20:41   dd48c9f4528f  observation <- open  "Two sites, below the extraction bar."

3 events shown; more: --cursor eyJhdCI6IjIwMjYtMTEtMTVUMjA6NDE6MTYuODgxWiIs…
```

**Reading `--stat`.** *Decided* is the current status of the findings first seen in the window, *Activity* is what changed in it, and with no window both say *all time*.

```text
$ ulu log my-app --stat
UluOps log - my-app   (org: acme, explicit; project from argument)

Examined   24 runs, 2026-11-13 to 2026-11-15, 7 definitions
           pre-implementation x16   post-implementation x3   executor x1   exploration x1   manual x1
           security x1   triage x1
Found      992 findings
Decided    fixed 840 (840 with reason) . deferred 4 (4) . wontfix 20 (20)
           false-positive 5 (5) . observation 86 (86) . open 37
Came back  0 caught by re-running (0 events; never) . 0 reopened by decision
Activity   955 decisions, all time (fixed 840 . deferred 4 . wontfix 20 . fp 5 . obs 86 . reopened 0)
           23 runs with correlation recorded (since 2026-07-08)
```

**`--orgs`** prints the rollup for every org you belong to, with its projects last-run first (cached 60 s server-side; a key bound to one org skips the others, with a note on stderr).

```text
$ ulu log --orgs
acme   (admin)   3 projects . 59 runs . 1,762 findings . 1,192 fixed . 0 regressions   (as of 2026-11-15 23:27 UTC)
  my-app                24 runs .   992 findings .   840 fixed .   0 regressions
  billing               28 runs .   385 findings .   218 fixed .   0 regressions
  web                    7 runs .   385 findings .   134 fixed .   0 regressions
```

---

### Runs

Runs and the findings they produced — save, compare, and archive them. Alias: `r`.

```bash
ulu runs list <project>           # List runs (--workflow, --limit)
ulu runs get <runId>              # Get run by UUID
ulu runs latest <project>         # Get latest run (--workflow)
ulu runs details <project>        # Detailed run with agents/recommendations (-n for a specific run number)
ulu runs save                     # Save run from JSON (--file or --stdin; -p/-w override input fields)
ulu runs validate                 # Dry run — preview against the live tracker, incl. analysis a save would reject (requires auth; -p/-w override)
ulu runs diff <project>           # Compare two runs (--base, --compare)
ulu runs archive <project>        # Archive old runs (--before-run, --before-date, --keep-last, --reason)
ulu runs update <project>         # Update run metadata or repair its analysis (--number, --score, --passed, --file, --preview, --record-mode, --allow-retire)
ulu runs delete <runId>           # Delete a run
```

**Examples:**

```bash
# Save a run from a JSON file
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

# Repair analysis the tracker rejected on save (see "Repairing rejected analysis" below)
ulu runs update my-project --number 5 --file fix.json --preview   # nothing written
ulu runs update my-project --number 5 --file fix.json
```

#### Repairing rejected analysis

When a save rejects one agent's analysis, the run is still saved (exit `0`) and `Analysis rejected for <agent>: …` lists the issues (`ulu runs validate` predicts it as `Would reject analysis for <agent>: …`; under `--json` both go to stderr). Do not save again, which creates a second run: put only the rejected agents' **complete** records and summary in a file, with no `agents` and nothing for agents whose analysis was stored (that would replace theirs too), and send it with `ulu runs update`:

```json
{
  "analysis_records": [
    { "agent_name": "agent-h", "record_type": "finding", "record_id": "h-1", "title": "…", "data": { "note": "…" } }
  ],
  "analysis_summary": [{ "agent_name": "agent-h", "decision": "PASS" }]
}
```

The same fields work in `runs save` input. snake_case or camelCase both work.

| entry | field | required | notes |
|---|---|---|---|
| record | `record_type` | yes | your category (`finding`, `fear`, `assumption`, …); up to 50 chars |
| record | `record_id` | yes | short stable slug per agent, up to 100 chars; the key `merge` and `replace` match on |
| record | `title` | yes | up to 500 chars |
| record | `data` | yes | object; nested at most 8 levels |
| record | `agent_name` | on multi-agent runs | names the agent the record belongs to |
| record | `classification` | no | up to 50 chars |
| record | `severity` | no | `critical`, `high`, `medium`, `low` or `info` |
| summary | `decision` | yes | the agent's decision (`PASS`, `VITAL`, …); up to 50 chars |
| summary | `agent_name` | on multi-agent runs | |
| summary | `score` | no | 0–100 |
| summary | `decision_vocabulary`, `system_metrics`, `category_scores`, `epistemic_assessment`, `audit_implications`, `exploration_maps` | no | as the agent reports them; `category_scores` entries are `{ name, weight, score }` with integer `weight` ≥ 1 and integer `score` |

Send it with `ulu runs update <project> -n <run> --file fix.json`, taking the run number from `runs save`'s output or `ulu exec`'s Dashboard link (`ulu runs latest` can be another run on a busy project); an update takes at most 100 records and 20 summaries (send more in parts with `--record-mode merge`) and is refused whole if any entry is invalid (a save's rejection names the field, e.g. `records[1].data: …`). Either mode repairs a rejected agent, but on an agent that already has records a `replace` write retires every record the file leaves out, so the CLI refuses it, naming them, unless you pass `--allow-retire` or switch to `merge`; `--preview` shows the plan and writes nothing.

| `--record-mode` | records of the named agents | summaries |
|---|---|---|
| `replace` (default) | superseded; any record **left out of the file is retired** | replaced |
| `merge` | only the `record_id`s sent are superseded; nothing is retired | replaced |

### Run Input Format

The JSON file for `ulu runs save` follows this structure (`analysis_records` and `analysis_summary` are optional; their fields are under [Repairing rejected analysis](#repairing-rejected-analysis)):

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
  --failure-code SEM-INC/C \
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

**Filter options for `issues list`:**

| Flag | Values |
|------|--------|
| `--status` | `open`, `completed`, `deferred`, `wontfix`, `all` |
| `--all` | Shorthand for `--status all` |
| `--priority` | `critical`, `high`, `suggested`, `backlog` |
| `--severity` | `critical`, `high`, `medium`, `low`, `info` |
| `--agent` | Any agent name (e.g., `code-validator`) |
| `--domain` | `STR`, `SEM`, `PRA`, `EPI` |
| `--include-resolved` | Include resolved (completed/wontfix/deferred) issues in results |
| `--limit` | Max results (default: 50) |

---

### Analytics

Analytics and trends for runs, findings and issues. Alias: `a`.

```bash
ulu analytics agents              # Agent performance (avg score, pass rate)
ulu analytics reliability         # Agent reliability (false-positive, declined, resolution rates)
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

# New issues vs recurring — are runs finding new problems?
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
ulu definitions get <type> <name> [version]   # Get definition (--yaml, --rendered, --target, --render-profile, --include-runtime, -m/--model, -o)
ulu definitions create <type> <name>          # Create draft (--file, --visibility public|private)
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

# Render for a harness with a model-specific override
ulu def get agent code-validator --rendered --target gemini-cli -m gemini-2.5-pro

# Write rendered output to file instead of stdout
ulu def get agent code-validator --rendered -o ./code-validator.md

# Validate and render a local YAML file (type auto-detected from filename)
ulu def validate --file my-agent.agent.yaml
ulu def render --file my-agent.agent.yaml

# Render the declared-only core profile: only what the definition declares, with no
# factory-supplied output contract, scoring instruction or tone (registry on definition-factory
# >= 0.81.0). Omitting --render-profile renders the registry's stored profile, uluops-full.
ulu def render --file my-agent.agent.yaml --render-profile core

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

The model catalog comes from [models.dev](https://models.dev): the UluOps registry syncs its models, providers and prices (USD per million tokens) from there.

```bash
ulu models list                   # List models (--provider, --tier, --capability vision|tools|reasoning, --status)
ulu models get <provider> <id>    # Get model details
ulu models get openrouter deepseek/deepseek-v4-flash   # ids containing "/" work too
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
| `--no-tracking` | Do not save the run to the tracker |
| `--no-safety-warnings` | Suppress risk warnings and runtime advisories |
| `--registry-url <url>` | Override the registry URL definitions are resolved from |
| `--extended-thinking` / `--no-extended-thinking` | Turn extended thinking on or off for this run (every subcommand). Off by default; overrides `ULUOPS_EXTENDED_THINKING`. Thinking tokens are billed as output. Works on OpenAI, Google and OpenRouter models; on direct Anthropic models (the default `sonnet`) it prints "requested but not applied: no-mapping", because that mapping is not built yet — use an `openrouter:anthropic/…` model for Claude thinking. What each run actually did is recorded on the result (`runConditions`). |

**Shared options** (all `exec` subcommands):

| Option | Description |
|--------|-------------|
| `-p, --prompt <text>` | Operator directive or context for the agent |
| `-m, --model <model>` | Model override (alias, tier, or provider:modelId, e.g. `openai:gpt-5`, `openrouter:deepseek/deepseek-v4-flash`). The provider's API key must be set; see [Providers and shell access](#providers-and-shell-access). |
| `--hash <sha256:...>` | **Optional.** Pin the expected YAML hash (from a trusted channel). Verifies the resolved definition source + config before executing; refuses on mismatch (**exit 4**). Available on `run`, `agent`, `command`, `workflow`, and `pipeline` (requires `@uluops/core@0.32.0`). |
| `--prompt-hash <sha256:...>` | **Optional.** Pin the expected rendered-prompt hash. Pair with `--hash` for full agent/command executed-prompt integrity. Only `run`, `agent`, and `command` — workflows/pipelines have no rendered prompt, so supplying it for one is refused as "unavailable" (**exit 4**). |

**Agent-specific options** (`exec agent` only):

| Option | Description |
|--------|-------------|
| `-t, --target <path>` | **Required.** Target directory to analyze |
| `--max-tokens <n>` | Maximum response tokens |
| `--max-steps <n>` | Maximum tool loop iterations (default: 50) |
| `--temperature <n>` | Generation temperature 0-1 (default: 0) |
| `--exec-timeout <ms>` | Execution timeout in milliseconds |
| `-c, --concurrency <n>` | Max concurrent agents for parallel execution (default: 5) |
| `--threshold-pass <n>` | Pass threshold (agents): a score below it caps a positive verdict to conditional. The agent's own decision text is kept; the category gates |
| `--threshold-warn <n>` | Warn threshold (agents): a score below it caps the verdict to negative |
| `--report [path]` | Write a human-readable, publication-quality report to file (single agent only). With no path, defaults to `./<agent>-report-<YYYYMMDDTHHmmss>.md` in cwd. Injects a report-mode directive into the agent's prompt and disables structured-output enforcement so the model can emit prose. **Disables tracker submission** (implies `--no-tracking`): the schema-validated path the tracker depends on is no longer guaranteed under report mode, so `--report` silently wins over `--project` rather than erroring. With `--project` (or `ULUOPS_PROJECT`) set, a "tracking disabled" notice prints even under `-q`. Run without `--report` for tracker submission. |
| `-o, --output <path>` | Explicit output path for `--report` (overrides the `--report` argument and the default) |
| `--features-list <path>` | Write structured features/recommendations to file (single agent only) |

**Examples:**

```bash
# Run code-validator with a specific model
ulu exec --project my-project agent code-validator -t . --model sonnet

# Generator: tell the agent what to create (generators produce artifacts, not
# scores — the result has no score; `--json` shows score: null)
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

# Pin a pipeline or command the same way (CI: pin what you run, especially
# with bash enabled — the YAML pin covers the whole workflow/pipeline runtime)
ulu exec pipeline api-server-validate ./src --hash sha256:…
ulu exec command validate ./src --hash sha256:… --prompt-hash sha256:…
```

---

### Providers and shell access

`ulu exec` runs on any provider whose API key is set in the environment (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, …); pick one with `--model provider:modelId`. Anthropic, OpenAI, Google and OpenRouter are bundled.

**OpenRouter (experimental).** Bundled since CLI 0.34.1 — set the key and pick a model:

```bash
export OPENROUTER_API_KEY=your_openrouter_key
ulu exec agent code-validator -t ./src --model openrouter:deepseek/deepseek-v4-flash
```

OpenRouter is used only when `OPENROUTER_API_KEY` is set and you pick an `openrouter:` model, and then everything the agent reads goes to OpenRouter and the upstream serving it, which the CLI limits to upstreams that do not retain or train on prompts (`data_collection: deny`, not zero data retention, which only your [OpenRouter privacy settings](https://openrouter.ai/settings/privacy) enforce), so most `:free` models fail with "Filter by Data Policy" unless you prefix that one command with `OPENROUTER_DATA_COLLECTION=allow` (never export it from a shell profile: it would then apply to every run, private code included). The provider ships with the CLI at the version `@uluops/core` is built against, so a global `@openrouter/ai-sdk-provider` left from an earlier CLI can be removed with `npm uninstall -g @openrouter/ai-sdk-provider` (library users of core install it themselves: see [`@uluops/core`'s OpenRouter notes](https://github.com/Uluops/-uluops-core#openrouter-experimental)).

**Cost.** Each run prints `Cost: $<total> (<basis>)` under Token Usage, where `billed` is the provider's own bill (OpenRouter reports one per request), `estimated` prices the tokens at the registry's catalog rates and `mixed` is both, and the cost stays local: it is not sent to the Tracker (`--json` carries `costUsd`, `costUsdBilled`, `costUsdTotal` and `costBasis`).

**When OpenRouter refuses.** The CLI prints OpenRouter's reason; out of credit (402) fails an `exec pipeline` run (exit 1) and records the agents it cut off as `ABORTED` with no tracker issue, and when the refusal says the request's worst case exceeds your balance, a lower `--max-tokens` is enough.

**Shell access.** Agents that declare `Bash` get a shell only when you set `ULUOPS_ALLOWED_TOOLS=bash` (a `./.env` or `~/.uluops/.env` line counts), and then every such agent runs commands through `sh -c` from the target directory, not confined to it and not sandboxed but without your API keys or tokens, on Anthropic, OpenAI and OpenRouter models (on others it runs without a shell and core warns).

**Pipeline steps (`--allow-steps`).** A pipeline's `steps:` are shell commands from its definition that run only with `--allow-steps` (on `exec pipeline` and `exec run`; `ULUOPS_ALLOW_STAGE_STEPS=true` turns them on for every run), and there is no command allowlist, so the flag trusts the pipeline's author, registry-resolved pipelines included, with your shell: pin what you run in CI with `--hash`.

### Executions

Execution tracking for definitions.

```bash
ulu executions record <type> <name> <version>   # Record execution (--source, --run-id for idempotency)
ulu executions stats <type> <name> <version>     # Get statistics (--window)
```

---

### Translation

Definition translation and legacy upgrades.

If a write's response fails validation, read the definition and its versions before retrying: the write may have committed.

```bash
ulu translation version                          # Get translator version
ulu translation retranslate <type> <name> <ver>  # Re-translate (--new-version)
ulu translation upgrade <type> <name>            # Upgrade legacy YAML (--file)
```

---

### Completion

Generate shell completion scripts.

```bash
# Bash — add to ~/.bashrc
echo 'eval "$(ulu completion bash)"' >> ~/.bashrc

# Zsh — add to ~/.zshrc
echo 'eval "$(ulu completion zsh)"' >> ~/.zshrc

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

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `ULUOPS_API_KEY` | API key for authentication | - |
| `ULUOPS_PROJECT` | Project name for `ulu exec` result tracking when `--project` is not passed (useful in CI) | - |
| `ULUOPS_EMAIL` | Email for session auth | - |
| `ULUOPS_PASSWORD` | Password for session auth | - |
| `ULUOPS_SESSION_TOKEN` | A session token to use directly (after `ULUOPS_API_KEY` and email/password) | - |
| `ULUOPS_ORG_SLUG` | Org a command acts in when no `--org` flag or `.uluops.json` answers — see [Which org a command acts in](#which-org-a-command-acts-in) | personal org |
| `ULUOPS_BASE_URL` | Tracker API base URL (the `--base-url` flag overrides it) | `https://api.uluops.ai/api/v1` |
| `ULUOPS_REGISTRY_URL` | Registry API base URL (the `--base-url` flag overrides it on registry commands) | `https://api.uluops.ai/api/v1/registry` |
| `ULUOPS_SUBMISSION_URL` | Where `ulu exec` submits tracked results, when it should differ from the tracker base URL | the tracker base URL |
| `ULUOPS_DEBUG` | Enable debug logging (also expands the global unhandled-error handler's output) | `false` |
| `ULU_JSON_SCHEMA` | Set to `1` to wrap `--json` output in the versioned stability envelope | - |
| `ANTHROPIC_API_KEY` | API key for Anthropic models (the default provider for `ulu exec`) | - |
| `OPENAI_API_KEY`, `GOOGLE_API_KEY`, `OPENROUTER_API_KEY`, … | API key for that provider's models; any `<PROVIDER>_API_KEY` that is set makes the provider available to `ulu exec` (`GOOGLE_GENERATIVE_AI_API_KEY` also works for Google) | - |
| `ULUOPS_ALLOWED_TOOLS` | Comma-separated tool allowlist for `ulu exec`; `bash` (any case) gives agents that declare Bash a shell — see [Providers and shell access](#providers-and-shell-access) | bash denied |
| `ULUOPS_MAX_CONCURRENCY` | Engine-wide cap on concurrent in-flight LLM calls for `ulu exec` (distinct from `exec agent -c/--concurrency`); honored by `@uluops/core` | `8` |
| `ULUOPS_EXTENDED_THINKING` | `on` or `off`: extended thinking for every `ulu exec` run (the flags above win). Anything else is off with a warning. **A value in `./.env` or `~/.uluops/.env` applies to every run in that directory or machine** — the CLI prints a caution when that is where it came from | `off` |
| `ULUOPS_THINKING_BUDGET` | Thinking budget in tokens when thinking is on (Google, OpenRouter; ignored by OpenAI, which takes an effort). Whole numbers only — anything else is ignored with a warning. Capped by core so the answer keeps at least half of `--max-tokens` | core default (10000) |

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
| **403 `SESSION_REQUIRED`** | The command needs a signed-in session, not an API key: see [Commands that need a signed-in session](#commands-that-need-a-signed-in-session) |
| **404 Not Found** | Verify the resource name or ID |
| **400 Validation** | Check command arguments — run with `--help`; a 400/409 that carries a business `reason` (re-home's `same_org`, `name_collision`, …) is explained as state instead |
| **402 Project limit** | The destination org is at its project cap — a re-home/create refusal, not a subscription gate |
| **410 Re-homed** | The project moved orgs; the hint names the org to pass as `--org` |
| **429 Rate Limited** | Wait and retry — the CLI shows the retry delay |
| **Network Error** | Check your network connection and server status |

All errors include the HTTP status code and server error code when available. Use `--debug` for full request/response details.

### Exit codes

| code | meaning |
|---|---|
| `0` | success, including any completed agent, command or workflow run whatever its verdict, and a pipeline that decided `PASS` or `WARN` |
| `1` | usage, configuration or execution error, including a pipeline stopped by a deadline or credit limit |
| `2` | API or runtime error |
| `3` | a pipeline decided `FAIL` (a blocking gate failed or errored, accepted a conditional or saw `INVALID`, or the run was cancelled) |
| `4` | execution refused by an integrity pin |
| `5` | `runs update` applied the analysis but its echo did not match: **do not retry**, check the run |

`ulu exec pipeline ship . && deploy` therefore still blocks on a failed gate. A stage with no gate never fails a pipeline (it WARNs, exit `0`).

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
| [`@uluops/ops-sdk`](https://www.npmjs.com/package/@uluops/ops-sdk) | TypeScript SDK for the tracker API — runs, findings, issues, analytics |
| [`@uluops/registry-sdk`](https://www.npmjs.com/package/@uluops/registry-sdk) | TypeScript SDK for the definition registry API |

## License

MIT License - see [LICENSE](./LICENSE) for details.
