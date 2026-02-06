# Changelog

All notable changes to `@uluops/cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

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
- 252 tests across command integration, context/error handling, formatters, and utilities
- Pure function coverage for utils (29 tests), table formatter (16), ops formatter (19), registry formatter (25)
- Context creation and error handler tests (21 tests)
- Command integration tests for all modules: projects, issues, runs, analytics, auth, admin, definitions, models (79 tests)
