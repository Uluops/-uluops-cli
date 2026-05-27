# Changelog

All notable changes to `@uluops/cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.10.0] - 2026-05-27

### Added

- **Risk profile display in `ulu def get`** — definitions with safety scan results now show risk level, signal count, and scanner version in the output.
- **Runtime advisory on `exec agent`** — when executing an agent with elevated risk signals, the CLI displays a warning before execution begins.
- **`--no-safety-warnings` flag on `exec agent`** — suppresses runtime safety advisories for trusted definitions or CI environments.
- **Provenance display** — `ulu def get` now shows authorship provenance metadata (author, co-authors, model attribution) when available.

## [0.8.0] - 2026-05-22

### Added

- **`-o, --output <path>` on `def get --rendered` and `def render`** — write rendered output directly to a file instead of stdout (e.g., `ulu def get agent code-validator --rendered --target codex -o code-validator.toml`).
- **`-c, --concurrency <n>` on `exec agent`** — bounds parallel agent execution (default: 5). Prevents resource exhaustion when running many agents simultaneously.
- **SIGINT/SIGTERM handlers** — Ctrl-C during long-running exec commands now exits cleanly with code 130 instead of leaving orphaned spinners.
- **Default 30s HTTP timeout** — ops and registry clients now default to 30 seconds instead of hanging indefinitely when the API is unresponsive. Override with `--timeout`.
- **Biome linter** — `npm run lint` and `npm run lint:fix` scripts for style consistency enforcement.
- **19 new tests** — `getErrorCode`, `inferDefinitionType`, `resolveDefinitionType`, `resolveProject`, `redact` boundary, `SubscriptionRequiredError` upgrade box rendering. Suite: 349 → 368.

### Changed

- **`--timeout` on `exec agent` renamed to `--exec-timeout`** — disambiguates from the global `--timeout` (HTTP request timeout) to avoid silent overlap where one flag sets both.
- **`readJsonInput` and `stripBom` extracted to `utils.ts`** — I/O utilities previously co-located in `runs.ts` are now shared alongside `readFileOption` and `writeFileAtomic`.
- **Type-safe Commander option reading** — `getMergedOptions` uses per-field `typeof` guards instead of blanket `as ExecOptions`. `buildExecOptions` uses `optString()` helper instead of unguarded `as string` casts.
- **`runs validate` now validates required fields** — same field guards as `runs save` (project, workflowType) applied before API call.

### Fixed

- **EPIPE crash on broken pipe** — piping CLI output to `head`, `less`, or a truncated consumer no longer crashes with `Error: write EPIPE`. The CLI exits cleanly.
- **`writeReportFiles` errors no longer masked** — file I/O failures in `--report`/`--features-list` now show filesystem-specific messages instead of misleading SDK error hints.
- **`getErrorCode()` replaces unguarded `as NodeJS.ErrnoException`** — 3 catch blocks now use safe extraction with `instanceof` + `'code' in error` guard.
- **Stale `render.test.ts` deleted** — test file imported a module removed in v0.5.0.
- **All devDep vulnerabilities resolved** — fresh lockfile eliminates 4 HIGH + 2 MODERATE findings in vitest/vite transitive dependencies.
- **`.env` permissions hardened to 0600** — was world-readable (0644) on disk.

## [0.7.1] - 2026-05-21

### Fixed

- **`--target-model` renamed to `-m, --model`** — natural flag name for model override on `def get --rendered`. Old `--target-model` was unintuitive.

## [0.7.0] - 2026-05-21

### Added

- **Multi-harness rendering** — `ulu def get --rendered` now accepts `--target` to render definitions for different AI harnesses: `claude-code` (default), `opencode`, `codex`, `gemini-cli` (with aliases `claude`, `oc`, `gemini`).
- **Target model override** — `--model` / `-m` sets the model in the rendered output envelope (e.g., `--target opencode --model gpt-5.3-turbo`).

## [0.6.0] - 2026-05-21

### Added

- **Default project fallback** — commands that take a `<project>` argument (`runs list`, `runs latest`, `runs details`, `runs diff`, `runs archive`, `runs update`, `issues list`) now fall back to `defaultProject` from config when the argument is omitted. Set it once with `ulu config set defaultProject <name>`.
- **Interactive auth login** — `ulu auth login` now prompts for email and password when flags are omitted and a terminal is available. Password input is masked.
- **`--all` flag on `issues list`** — issue list now defaults to `--status open`. Use `--all` to show all statuses.
- **Interactive delete confirmations** — `ulu projects delete` and `ulu runs delete` now prompt for y/n confirmation instead of requiring `--yes`. The `--yes` flag still works for CI/scripting.
- **Exec elapsed time feedback** — single-agent `exec agent` runs show elapsed seconds in the spinner every 5s. Parallel agent runs print per-agent results as they complete.
- **Auto-detect stdin** — `ulu runs save` and `ulu runs validate` auto-detect piped input, no `--stdin` flag needed. `cat results.json | ulu runs save` just works.

## [0.5.0] - 2026-05-21

### Added

- **Help after error** — every Commander error now shows the full usage, options, and examples. No more guessing the syntax from `missing required argument 'name'`.
- **Usage examples on all command groups** — `ulu projects`, `ulu runs`, `ulu issues`, `ulu exec`, `ulu def`, `ulu analytics`, `ulu auth`, `ulu config`, `ulu models`, `ulu versions`, `ulu deps`, `ulu forks`, `ulu executions`, `ulu translation`, `ulu completion`, `ulu taxonomy`, and `ulu render` all show examples in `--help` output.
- **Command aliases** — `ulu p` (projects), `ulu r` (runs), `ulu i` (issues), `ulu a` (analytics), `ulu x` (exec). `ulu def` (definitions) already existed.

### Changed

- **Polished subcommand descriptions** — 14 subcommand descriptions rewritten to guide usage (e.g. "Get a definition" → "Get a definition by type, name, and optional version").
- **Dotenv tip noise suppressed** — upgraded `@uluops/sdk-core` to 0.10.1 which passes `quiet: true` to dotenv v17, eliminating the `[dotenv@17.2.4] injecting env ... -- tip: ...` output on every invocation.

### Removed

- **Dead `render.ts`** — orphaned command file that was never registered (render functionality lives in `ulu def render` and `ulu def get --rendered`).

## [0.4.0] - 2026-05-21

### Changed

- **`ulu render` removed** — `render preview` moved to `ulu def render`, `render get` moved to `ulu def get --rendered`. All definition operations now live under one command group.
- **Type auto-detection from filename** — `ulu def validate` and `ulu def render` no longer require the `type` argument. Type is inferred from the filename pattern (e.g., `*.agent.yaml` → agent). Explicit type still accepted.
- **`--rendered` flag on `ulu def get`** — fetches rendered markdown for a published definition. Replaces the old `ulu render get` command.

## [0.3.0] - 2026-05-21

### Added

- **`ulu exec pipeline` subcommand** — execute multi-stage pipelines from the CLI, mirroring the `exec workflow` pattern. Supports `-m`/`--model` and `-p`/`--prompt` flags.

### Dependencies

- `@uluops/core` — requires v0.15.0+ for `runPipeline()` support

## [0.2.1] - 2026-05-21

### Fixed

- **Global install crash** — replaced `file:` dependency references for `@uluops/ops-sdk`, `@uluops/registry-sdk`, and `@uluops/sdk-core` with npm version ranges. Global installs (`npm i -g`) previously failed with `ERR_MODULE_NOT_FOUND` because `file:` paths are unresolvable outside the monorepo.

## [0.2.0] - 2026-05-21

### Added

- **`--prompt` / `-p` flag on all exec subcommands** — pass an operator directive or context to agent runs via `exec run`, `exec agent`, `exec command`, and `exec workflow`. The prompt is threaded into `ExecutionInput.prompt` and appears as a `Directive:` section in the agent's initial message. Especially useful for generator agents that need to know *what* to create.

### Dependencies

- `@uluops/core` — requires v0.13.0+ for `ExecutionInput.prompt` and `runAgent(name, string | ExecutionInput)` support

## [0.1.0] - 2026-02-06

### Added
- Unified `ulu` CLI command wrapping both `@uluops/ops-sdk` and `@uluops/registry-sdk`
- Commander.js-based command framework with global options (`--api-key`, `--profile`, `--json`, `--debug`, `-q`)
- Profile-based configuration system with `~/.uluops/profiles.json` and `~/.uluops/credentials.json`
- **Auth commands**: login, logout, whoami, register, forgot-password, reset-password, change-password, profile, update-profile, sessions list/revoke, api-keys list/create/revoke (14 commands)
- **Project commands**: list, get, create, delete, restore, summary, trends, rename, bulk-update-issues, merge-issues (10 commands)
- **Run commands**: list, get, latest, details, save (from file or stdin), validate (dry run), diff, archive, update, delete (10 commands)
- **Issue commands**: list, get, search, create, update, close, edit, add-note, history, undo, restore, bulk-update, by-fingerprint, update-by-fingerprint (14 commands)
- **Analytics commands**: validators, reliability, hotspots, burndown, velocity, discovery, matrix, resolution, taxonomy, full-taxonomy, trends (11 commands)
- **Admin commands**: stats, users list/get/create/update/deactivate/reactivate/reset-password/bulk-deactivate, sessions list/terminate/terminate-user, keys list/revoke (15 commands)
- **Definition commands**: list, get, create, update, publish, deprecate, validate, delete (8 commands) with `def` alias
- **Version commands**: list, diff (2 commands)
- **Render commands**: get, preview (2 commands)
- **Dependency commands**: get, dependents (2 commands)
- **Fork commands**: list, create, check, lineage (4 commands)
- **Model commands**: list, get, providers, aliases, resolve, sync (6 commands)
- **Execution commands**: record, stats (2 commands)
- **Translation commands**: version, retranslate, upgrade (3 commands)
- **Config commands**: list, get, set, unset, profiles, use, path (7 commands)
- **Completion**: bash, zsh, fish shell completion via Commander tree introspection
- Contextual error handling with actionable hints for 401, 403, 404, 400, 429, and network errors
- `ora` spinner feedback for long-running operations (suppressed with `-q`)
- Output formatters: table, key-value, ops-specific (projects/runs/issues), registry-specific (definitions/models/versions)
- `--json` flag on every command for scripting and CI/CD piping
- Credential priority chain: CLI flag → env vars → session token → profile credentials → `.env` file
- Sensitive value redaction in debug output via `redact()` utility
- Comprehensive README with installation, auth, config, all command groups, examples, and troubleshooting

### Fixed
- Login flow no longer passes email/password to OpsClient constructor, preventing "Session expired" errors on unauthenticated login POST

### Testing
- 253 tests across command integration, context/error handling, formatters, and utilities
- Pure function coverage for utils (29 tests), table formatter (16), ops formatter (19), registry formatter (25)
- Context creation and error handler tests (21 tests)
- Command integration tests for all modules: projects, issues, runs, analytics, auth, admin, definitions, models (79 tests)
