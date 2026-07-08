# Changelog

All notable changes to `@uluops/cli` will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [0.22.3] - 2026-07-07

### Fixed

- **A failed safety scan no longer renders as "clean"** (perverse-outcome finding P6). A sync
  scan that aborts (parse error, timeout) carries `aggregateRiskLevel: 'none'` as a sentinel
  meaning "could not determine", not a clean verdict. Previously `ulu def get` printed "No
  risk signals." and `ulu exec` stayed silent:
  - `def get` now prints "⚠️  Safety scan incomplete (reason) — could not determine." and a
    deep-analysis `error` status prints "Deep analysis incomplete — could not determine."
  - `exec` emits an incomplete-scan advisory before running (suppressible via
    `--no-safety-warnings`).

  Uses the new `isVerdictTrustworthy` predicate from `@uluops/registry-sdk` (0.42.0).

### Dependencies

- `@uluops/registry-sdk` `0.39.0` → `0.42.0` (safety-verdict trustworthiness surface).
- Bump `@uluops/core` `0.29.1` → `0.30.0` — decision-category threading: custom-vocabulary
  negative verdicts (EXPOSED, BEWITCHED, WDL-remapped BLOCK) now gate pipeline stages,
  commands, and workflow phases via the propagated `decisionCategory` instead of literal
  decision-string comparisons, plus the CWE-345 core-register-remap guard. Additive
  surface (`resolveDecisionCategory`, `ExecutionResult.decisionCategory`); CLI builds and
  463 tests pass unchanged against the new version.

## [0.22.2] - 2026-07-06

### Dependencies

- **Advanced to the sdk-core 0.15.0 coherent set:** `@uluops/core` `0.28.1` →
  `0.28.2`, `@uluops/ops-sdk` `5.4.0` → `5.6.0`, `@uluops/registry-sdk` `0.38.0` →
  `0.39.0`. sdk-core 0.15.0 adds the streaming transport (`requestStream`/`getStream`),
  inherited on the ops/registry low-level clients; the CLI does not consume it, so
  this is a pin-alignment patch — one `sdk-core@0.15.0` across the tree, no
  behavior change.

## [0.22.1] - 2026-07-03

### Dependencies

- **`@uluops/core` 0.27.0 → 0.28.1.** Two tracking-quality fixes land in `ulu exec`:
  - `systemMetrics` in tracked analysis summaries now carries the agent's
    cognitive measurements only (analysis-block `system_metrics`, else
    `domainMetrics`, else `null`) — the execution envelope
    (tokens/model/duration/cost) is no longer merged in; that telemetry
    already travels first-class on `agents[]`. Extraction facts move to
    `epistemicAssessment` (core 0.28.0).
  - Off-vocabulary analysis-record severities (register-style values like
    `structural` or `NOTABLE` from cognitive lens agents) no longer cause the
    SDK to reject the entire tracking save — severities are sanitized onto
    the tracker enum with the original preserved as `data.rawSeverity`
    (core 0.28.1). Previously such runs completed but went unrecorded.

## [0.22.0] - 2026-07-02

Closes the sdk-core 0.14.0 security-observability rollout at the CLI — the top of
the dependency tree — by both adopting the release and surfacing its security
events to the user.

### Added

- **Security-event warnings.** The CLI now wires `onSecurityEvent` into every
  ops/registry/core client it constructs (including the `auth` login/register
  flows) and surfaces events to the user on **stderr** (stdout stays clean for
  `--json` and pipes). A blocked upstream redirect prints a prominent
  possible-MITM warning; a rejected credential (401) and a failed token refresh
  print concise notices. Highest value on best-effort paths (e.g. result
  tracking) where the command itself does not error, so the event would
  otherwise be invisible. Suppressed under `--quiet`; the internal
  `auth_strategy_replaced` event is shown only under `--debug`.

### Dependencies

- **Bump `@uluops/core` 0.25.1 → 0.27.0, `@uluops/ops-sdk` 5.0.0 → 5.4.0,
  `@uluops/registry-sdk` 0.37.0 → 0.38.0.** Puts the entire CLI dependency tree on
  a single `@uluops/sdk-core@0.14.0` (redirect hardening, `baseUrl`
  embedded-credential rejection, sanitized `requestId`). `core@0.27.0` is what
  exposes the `onSecurityEvent` passthrough the CLI now consumes.

## [0.21.3] - 2026-06-28

### Added

- **`def get` now shows `uniqueExecutionCount` alongside `executionCount`.** The registry exposes two execution counts — `executionCount` (total runs) and `uniqueExecutionCount` (distinct actors, gaming-resistant) — and the formatted definition view surfaces both.

### Changed

- **Bumped `@uluops/registry-sdk` `0.36.0` → `0.37.0`** (adds `uniqueExecutionCount` to the definition shapes and `SORT_FIELDS`).

## [0.21.2] - 2026-06-28

### Changed

- **Inherited `ulu exec` options now work at the tail, like `--model`.** `--no-tracking`, `--project`, `--local-definitions`, `--registry-url`, and `--no-safety-warnings` are declared on the `exec` parent, so Commander silently dropped them when placed *after* the subcommand (the natural spot — e.g. `ulu exec agent foo -t . --model … --no-tracking`). The previous behavior detected the misordering and **failed loudly** ("must appear BEFORE the subcommand"); now they are transparently relocated ahead of the subcommand before parse, so either position just works. A token immediately after a subcommand value-taking option (e.g. the model after `--model`) is left in place, so it is never mistaken for a misplaced option. Replaces `guardInheritedOptionOrder` (reject) with `reorderInheritedExecOptions` (accept); help text updated. No behavior change when options are already placed before the subcommand.

### Dependencies

- Bumps `@uluops/core` `0.24.3` → **`0.25.1`**, picking up the fix that stops `total_effective_tokens` double-counting Google thinking tokens (the AI SDK already folds thoughts into `outputTokens`). `ulu exec` now renders correct effective totals for Gemini runs. Verified live against `gemini-3-flash-preview` (`total_effective == input + output`).

## [0.21.1] - 2026-06-24

### Fixed

- **Locally-resolved workflows now run (via `@uluops/core` 0.24.3).** `ulu exec workflow <name> --local-definitions <dir>` previously returned a silent `BLOCK` (score 0, 0 agents): core's local resolution skipped the WDL `steps[]` → `commands[]`/`agentRefs[]` normalization (0.24.2), and command-steps naming a definition published as both an agent and its per-agent command — every cognitive-lens analyst — threw on ambiguous resolution (0.24.3). Bumps `@uluops/core` `0.24.1` → `0.24.3`; no CLI code changes. Validated end-to-end on sonnet (`foundations` BLOCK/0-agents → HOLD/4-agents).

## [0.21.0] - 2026-06-23

### Added

- **Surfaces tracking failures instead of silently dropping them.** When a run executes successfully but recording it to the tracker fails (e.g. a free-tier `402 PROJECT_LIMIT` or `SUBSCRIPTION_REQUIRED`), `ulu exec agent`/`command`/`workflow`/`pipeline` now print a non-alarming `Run not recorded: <message>` line — and, for cap/tier failures carrying an `upgradeUrl`, append ` — upgrade: <url>`. Previously the dashboard link was silently omitted, leaving no signal the run wasn't recorded. Renders the new typed `trackingError` from `@uluops/core`. The run itself still succeeds — this is a notice, not an error.

### Changed

- `runs get-details` agent line renders `—` for scoreless agents (generators, executors) instead of a fabricated `null/100`.

### Dependencies

- **Bumped `@uluops/core` 0.23.0 → 0.24.1** (exact). Adds the typed `trackingError` (`{ code, statusCode, message, requestId, details }`) on agent/execution results that the new tracking-failure render consumes. (0.24.1 fixes the root-level `TrackingError` export that was missing from 0.24.0.)
- **Bumped `@uluops/ops-sdk` 4.0.1 → 5.0.0** (exact). The SDK's response schema now allows nullable `maxScore`; on 4.0.1 a scoreless run (null `max_score`) would throw a ZodError when parsed by `runs get-details` / `runs save`. Completes the score-nullability transition on the CLI's read path (the formatters were already null-aware as of 0.20.0).

## [0.20.0] - 2026-06-22

### Dependencies

- **Bumped `@uluops/core` 0.22.8 → 0.23.0** (exact). Core makes agent `score`/`maxScore` nullable — generators and executors produce artifacts, not scores, and now report `null` instead of a fabricated `0`/`100`. See `@uluops/core@0.23.0` for the full contract.

### Changed

- **The CLI now renders scoreless results honestly.** A generator/executor run no longer prints a fabricated `Score: 0/100` — the score line is omitted (and `--json` shows `score: null`, with `maxScore` absent). Per-category scores render `—` when null. Batch `exec agent` runs **exclude scoreless agents** from the "Average score" rollup (a null is no longer folded in as `0`, which previously dragged the average toward zero).

### Internal

- Followed `@uluops/core`'s `AgentResult` widening (`score`/`maxScore`/category/finding fields → `number | null`): null-guarded the result formatter and the `exec` batch summary; widened the category table column types. No change to scored (validator/analyst/forecaster) output.

## [0.19.2] - 2026-06-17

### Dependencies

- **Bumped `@uluops/ops-sdk` 4.0.0 → 4.0.1** (exact). Pulls in the username slug
  validator fix: `ulu auth update-profile --username <name>` now accepts
  hyphenated slugs like `ulu-labs` (previously rejected client-side by the old
  letter-start, underscore-only pattern). With the ops-api fold-in, setting a
  username via this command also confirms it — clearing the registry publish
  gate from the CLI. 460 tests green against 4.0.1.

## [0.19.1] - 2026-06-16

### Dependencies

- **Bumped `@uluops/ops-sdk` 3.3.0 → 3.4.0** (exact). Pulls in the CWE-20 defensive string-length ceilings on the issue-domain response schemas (`IssueResponseSchema`, `OccurrenceResponseSchema`, `IssueNoteResponseSchema`, `StatusHistoryResponseSchema`): a degenerate or malicious tracker server returning oversized fields now throws a `ZodError` at parse time instead of forcing a large heap allocation on the calling host. The CLI consumes these schemas in `issues history` picker mode and `formatIssue`, so the protection applies transparently to `ulu issues` / `ulu runs` reads. Compliant servers are unaffected. 460 tests green against 3.4.0.

## [0.19.0] - 2026-06-16

### Dependencies

- **Bumped `@uluops/core` 0.22.1 → 0.22.7, `@uluops/registry-sdk` 0.32.1 → 0.35.0, `@uluops/ops-sdk` 3.2.1 → 3.3.0** (all exact). Pulls in the registry-sdk `ResponseValidationError` + safety/`riskProfile`/`RetranslateResult` root exports, and the sdk-core 0.13.0 runtime fixes (`retries: 0` makes one attempt with a typed error; actionable 401 with the server reason preserved; `isApiKey()` enforces minimum length) — all via the upgraded core/SDK chain. 460 tests green against the new versions.

### Added

- **`ulu exec describe ... --version <v>` now fails closed** instead of silently printing the CLI version and exiting 0. Commander's program-level `-V/--version` is an immediate option that fires during parse (before any subcommand action or preAction hook), so a captive CI script that hardcoded `--version` against `describe` got the CLI version string + exit 0 rather than resolving the definition version. A pre-parse argv guard now detects this shadow and errors (exit 2) with a pointer to `--def-version` (or the `<name>@<version>` suffix). Bare `ulu --version` is untouched.
- **`ulu auth whoami --json` now emits the inferred credential source to stderr.** The default `--json` stdout shape stays frozen (adding a field is a breaking change under the JSON Output Stability Contract), but the most-captive population — CI debugging which identity authenticated — gets the source in the same invocation via stderr instead of being forced into a second non-JSON call.

### Changed

- **`auth whoami` credential-source label is now "Credential Source (inferred)"** (was "Credential Source"). The label is re-derived from flags/env by mirroring sdk-core's precedence ladder, not reported by the SDK; the "(inferred)" qualifier makes that honest and prevents the label from reading as an authoritative readout that could silently drift if sdk-core's precedence changes.
- **`exec --report` wording corrected from "mutually exclusive" to "disables tracker submission."** The relationship is asymmetric (report mode silently wins and forces no-tracking, with no hard-error guard even when `--project` is set), not a symmetric mutual-exclusion. README, option help, and the inline comment are reconciled.
- **The "Report mode enabled — tracking disabled" notice now survives `-q`** when tracking intent is explicit (`--project` or `ULUOPS_PROJECT`). Previously `--report --project X -q` (the CI shape) got neither a tracker record nor the disclosure that explains why.
- **`--exec-timeout` help corrected**: removed the unreachable/mislabeled "5m SDK fallback" precedence tier (exec's `--timeout` always provides a 600s/10min default, so the fallback can never be reached). Precedence now reads `--exec-timeout > definition default > --timeout (default 600s/10min)`.
- **`ulu issues history` now ships an examples help block** (`--help`), matching the other `issues` subcommands.

### Fixed

- Picker-mode `--json` output (`ulu issues history --project <slug>`, kind `issue.historyList`) now has a contract-anchor test pinning its bare-array shape and DESC-by-`updatedAt` sort.

### Internal

- Renamed a shadowing `issues` local in the history picker action to `recentIssues` (was shadowing the outer `issues` command builder).
- Test suite 460 cases (was 454): +2 whoami (inferred label + stderr-in-json), +5 `--version` shadow guard, +1 picker-`--json` anchor, report-notice test split into intent/no-intent paths.

## [0.18.4] - 2026-06-16

### Changed

- `runs list`/`details`/`archive`/`update` and `issues list` now declare the project as a required positional (`<project>`) instead of optional (`[project]`), so Commander reports a clear "missing required argument" error instead of falling through to a fallback message.
- Bumped `@uluops/core` to `0.22.1`.

### Fixed

- `exec` misplaced-option correction hint no longer appends a `<value>` placeholder for boolean inherited flags (e.g. `--no-tracking`, `--no-safety-warnings`); the placeholder now appears only for value-taking flags (`--project`, `--local-definitions`).
- `resolveProject` "no project specified" error now points to the positional-argument form instead of a `--project` flag that those commands do not accept.
- `issues list --priority` help and README now list the correct values (`critical`, `high`, `suggested`, `backlog`) — `high` was missing and the unsupported `all` was removed.

### Documentation

- Corrected all `exec` examples (README and command help) for the v0.16.0 argument-order change — parent options (`--project`, `--no-tracking`, `--local-definitions`) now appear before the subcommand.
- Fixed stale help-text examples: `runs details -n`, `runs save --project`, `def list --search`, and `issues close --reason` (removed the nonexistent `--status` flag).
- Documented previously-undocumented surfaces: `--json-envelope`, `ULUOPS_PROJECT`, `ULUOPS_MAX_CONCURRENCY`, `definitions update` options (`--change-type`, `--visibility`, `--display-name`, `--description`), `runs details -n`, `runs archive --before-date`, and `definitions list` filters (`--domain`, `--limit`, `--offset`).
- Clarified that `runs validate` previews against the live tracker and requires auth; added `ANTHROPIC_API_KEY` to the Quick Start at point of use.
- Documented `def get -m/--model`, `definitions create --visibility`, and the `issues list --all` shorthand; added a model-targeted render example.
- Shell-completion setup now uses `eval "$(ulu completion <shell>)"`, matching the tool's own `--help` and generated-script guidance.

## [0.18.3] - 2026-06-15

### Added

- **Run completeness in agent output.** `exec agent` now prints a `Completeness:` badge next to the decision when a run did not fully finish its work (`PARTIAL` / `FAILED`); clean runs are unchanged. This is distinct from the decision — a `PASS · PARTIAL` flags a positive verdict reached on incomplete coverage. With `--debug`, the underlying degradation markers (`budget.forced-wrap-up`, `steps.near-exhaustion`, `extraction.low-confidence`, etc.) and their detail are listed.

### Changed

- Bump `@uluops/core` to `0.22.0` (execution completeness & typed degradation markers). The engine-wide concurrency cap added in core 0.21.1 is tunable via `ULUOPS_MAX_CONCURRENCY` (default 8) — distinct from `exec agent -c/--concurrency`, which caps how many agent definitions run in parallel.

## [0.18.2] - 2026-06-15

### Changed

- Bump `@uluops/core` to `0.21.1` (agent-execution resilience hardening). Two behaviors surface through the CLI:
  - **Global LLM concurrency cap.** `exec` runs now bound total in-flight LLM calls across all fan-out (workflow phases, parallel steps, inline pipeline agents) via a shared limiter in core. Tune with the `ULUOPS_MAX_CONCURRENCY` env var (default 8). This is separate from `exec agent -c/--concurrency`, which caps how many agent definitions the CLI runs in parallel, and from a workflow's per-level `max_parallel`.
  - **maxSteps exhaustion is now explicit.** When an agent hits the `--max-steps` ceiling while still calling tools and returns no output, core throws a typed `MaxStepsExhaustedError` instead of emitting a silent low-confidence failure. The run surfaces a clear error (raise `--max-steps` or narrow the target) rather than a result indistinguishable from a crash.

## [0.18.1] - 2026-06-15

### Changed

- Bump `@uluops/core` to `0.21.0` and `@uluops/registry-sdk` to `0.32.1` — capability-gated structured-output-with-tools (Option C) and non-destructive extraction-confidence handling (Option B). A correctly-parsed decision is no longer overwritten by a low-confidence extraction method.

## [0.18.0] - 2026-06-14

### Added

- **`exec agent --hash` / `--prompt-hash`** — caller-pinned integrity verification. Supply expected `sha256:` hashes from a trusted channel; the resolved definition is verified fail-closed before execution. `--hash` pins the YAML (source + config); `--prompt-hash` pins the rendered prompt and is required (with `--hash`) for full agent executed-prompt integrity. On mismatch the run is **refused with exit code 4** (distinct from 1=usage/config and 2=API/runtime), printing expected-vs-actual. The flags are agent-only; `exec workflow|pipeline` reject `--prompt-hash` (they have no rendered prompt — pin the YAML instead). Requires `@uluops/core@0.20.0`.

### Changed

- Bump `@uluops/core` to `0.20.0` (frozen-artifact execution + caller-pinned verification).

## [0.17.1] - 2026-06-11

### Fixed

- **`exec agent --report` fails closed for multiple agents.** `--report` writes a single human-readable report and is single-agent only; passing multiple agent names with `--report` now errors instead of silently reporting on just one (captive-user run #12, PRA-FRA/H).
- Pin `@uluops/core` to `0.19.0` (per-model context-budget reconciliation).

## [0.17.0] - 2026-06-09

### Fixed

- **Honest error surfacing and flag behavior** (captive-user run #11). Surface underlying error messages instead of opaque failures, document the API base URL and show which credential source is in use, and make `--report` / `--version` / `--timeout` behave as documented.

## [0.16.0] - 2026-06-09

> Minor bump (breaking-for-scripts): `ulu exec` runs that previously tracked
> under a silently-inferred project name now require an explicit/confirmed
> project, and fail closed (exit 1) in non-interactive contexts.

### Changed

- **Inferred project names are now confirmed, not silently used.** When `ulu exec`
  runs with tracking on and no project resolves (`--project` or `ULUOPS_PROJECT`),
  the core SDK previously invented a project name from `basename(resolve(target))`
  — minting phantom tracker projects named `src`, `dist`, the cwd basename, etc.
  A captive automated caller never agreed to that name and couldn't act on the
  stderr-only warning, so it silently polluted the tracker (captive-user
  `PRA-FRA/H`). Now:
  - **At a TTY:** the CLI shows the project the run would be tracked under and
    asks to confirm (`This run will be tracked under inferred project "<name>".
    Proceed? [y/N]`). Confirm → the name is used explicitly; decline → cancel
    (exit 0).
  - **Non-interactive / CI:** there is no one to confirm an unintended name, so
    it **fails closed** — actionable stderr message + **exit 1**, before the model
    call. Pass `--project <name>`, set `ULUOPS_PROJECT`, or `--no-tracking`.
  - **Breaking for scripts** that relied on inference: CI `ulu exec` invocations
    must now name their project explicitly (which they should have been doing —
    inference silently scattered runs across phantom projects).
- **Inherited `exec` options placed after the subcommand are now a loud error.**
  `--project` / `--no-tracking` / `--local-definitions` / `--registry-url` /
  `--no-safety-warnings` are options of `ulu exec`, not the subcommand. Placed
  after the subcommand (`ulu exec agent foo -t . --project x`) Commander silently
  swallowed them, falling through to project inference and tracking under the
  wrong name with no signal (captive-user `PRA-FRA/M`). The CLI now detects this
  and exits 1 with the canonical order (`ulu exec --project <name> <subcommand>
  …`). A bogus flag already errored; a *known* inherited flag no longer slips
  through silently.

### Internal

- Replaced the advisory `warnIfProjectInferred` with `confirmInferredProjectOrExit`
  (reuses the 0.14.0 `confirmOrExit` TTY/non-TTY fail-closed pattern) and added a
  deterministic, parser-independent `guardInheritedOptionOrder` argv scan wired
  via an `exec` `preAction` hook. CLI-only change — no `@uluops/core` change
  required, since the CLI now resolves + confirms the project and passes it
  explicitly, so the SDK's inference fallback is never reached from the CLI.

## [0.15.0] - 2026-06-09

> Minor bump (additive, non-breaking): the default `--json` output shape is
> unchanged byte-for-byte. This release adds an **opt-in** versioned envelope and
> a documented stability contract on top of it.

### Added

- **`--json` Output Stability Contract.** `--json` output shapes are now treated
  as public API: a change to any default shape is breaking and requires a major
  version bump. This addresses a captive-user finding (`EPI-ASS/H`) — in v0.13.0
  the `issues history` and `deps get` `--json` shapes changed silently, breaking
  automated consumers with no way to detect the change. See the new "JSON Output
  Stability Contract" section in the README.
- **Opt-in versioned `--json` envelope.** Set `ULU_JSON_SCHEMA=1` (or pass the
  global `--json-envelope` flag) to wrap every `--json` payload as
  `{ schema, cliVersion, kind, schemaVersion, data }`. Scripts can pin `kind` +
  `schemaVersion` to detect a future shape change instead of failing silently.
  `data` is byte-for-byte identical to the default `--json` payload, so opting in
  changes how you *guard* the output, not how you *read* it. Default `--json`
  output (no env var / flag) is **unchanged**.
- **Per-output `schemaVersion` registry** (`SCHEMA_VERSIONS` in
  `src/formatters/json.ts`) as the single source of truth for output-shape
  versions. The two outputs that already shipped a breaking change in v0.13.0 —
  `issue.history` and `deps.get` — start at `schemaVersion: 2` to record it.
- **Contract-anchor tests** pinning representative `--json` shapes (`deps get`'s
  full envelope, `issues list`'s bare array, `issues history`'s envelope) so a
  future silent shape change fails CI.

### Internal

- All `--json` emission across the CLI now flows through a single `emitJson()`
  chokepoint (`src/formatters/json.ts`), replacing ~100 inline
  `console.log(JSON.stringify(...))` sites. This is the single point where output
  versioning and the stability policy are enforced. Default-mode output is
  byte-for-byte unchanged — proven by the full existing test suite passing with
  zero test edits.
- Extracted CLI version reading into a shared `getCliVersion()` (`src/version.ts`)
  used by both the entry point and the JSON envelope.

## [0.14.0] - 2026-06-09

> Minor bump (not patch): the non-interactive exit-code change below is breaking
> for any script that relied on the old silent exit-0 skip.

### Changed

- **Destructive delete commands now fail closed in non-interactive contexts.**
  `projects delete`, `runs delete`, and `definitions delete` previously printed a
  cancellation message and **exited 0** when run without `--yes` and without an
  interactive TTY (e.g. in CI or when called by an automated agent harness). A
  silent exit-0 skip is indistinguishable from a successful deletion to a captive
  automated caller, so the operation looked done when it had not run. These
  commands now write `Confirmation required, but stdin is not an interactive
  terminal.` to **stderr** and **exit 1** instead. Pass `--yes`/`-y` to proceed
  non-interactively. Interactive behavior is unchanged: at a TTY you are still
  prompted, and answering "no" cancels cleanly with exit 0.
  - **Breaking for scripts** that relied on the old exit-0 skip. Any automation
    that deletes resources must now pass `-y` explicitly (which it should have
    been doing — the old behavior silently no-op'd the deletion).
- **Unified the confirmation protocol across delete commands.** `definitions
  delete` previously used a divergent "To confirm, run again with --yes flag"
  message and never prompted, even at a TTY, while `projects`/`runs` used an
  interactive `[y/N]` prompt. All three now route through a single
  `confirmOrExit` helper, so confirmation behaves identically across resource
  types. `definitions delete` now also prompts interactively at a TTY.

### Internal

- Replaced the `confirmAction` util (which collapsed "user declined" and "no TTY
  available" into the same `false` return) with `confirmOrExit`, which
  distinguishes the two: a deliberate decline at a prompt exits 0; an inability
  to prompt fails closed with a non-zero exit. Added fail-closed test coverage
  for all three delete commands. Suite 418/418 passes.
- Source: captive-user analysis of `@uluops/cli` (tracker run #11, findings
  `cu-a1` PRA-FRA/H and `cu-a2` SEM-COM/H).

## [0.13.2] - 2026-06-08

### Fixed

- **`prepublishOnly` lint step now passes.** The `stripAnsi()` helper added in 0.13.1 used `// eslint-disable-next-line no-control-regex` comments to suppress the control-byte regex warnings, but this package uses **Biome**, not ESLint — the comments had no effect, and `npm run lint` (called by `prepublishOnly`) failed at publish time with 4× `lint/suspicious/noControlCharactersInRegex` errors. Replaced with Biome's `// biome-ignore lint/suspicious/noControlCharactersInRegex: <reason>` syntax per directive, restructured the function with a single chained-replace expression so each suppression sits immediately above its target regex. Caught when running the actual publish chain.

### Internal

- Ran `biome check --write src/` to clear two pre-existing formatter errors in `src/commands/issues.ts` (multi-line wrap of the `renderHistoryEnvelope` `case 'note'` block) and `src/commands/deps.ts` (similar wrap). Pure formatting changes — no semantics. Suite 417/417 still passes.

## [0.13.1] - 2026-06-08

Post-implementation hardening on the 0.13.0 wave. No breaking changes;
all improvements are defensive, doc-fix, or test-strengthening.

### Security

- **ANSI escape stripping on all server-controlled string renders (CWE-116).** New `stripAnsi()` helper in `src/utils.ts` neutralizes terminal injection vectors: CSI sequences (`\x1b[...m`), OSC sequences (`\x1b]...\x07` — title spoofing), and bare control bytes below 0x20. Applied at every `console.log` site that prints SDK-returned `name`, `version`, `context`, `title`, `agentName`, `noteType`, `createdBy`, or `content`. The SDK schemas constrain length but did not strip control bytes; a compromised registry/tracker API could otherwise return `\x1b[2J\x1b[H[SUDO] Password:` and clear the operator's terminal. Compliant servers are unaffected.
- **Bump `@uluops/ops-sdk` 3.2.0 → 3.2.1.** Picks up CWE-20 `.max()` bounds on history event string fields (`agentName`/255, `description`/10k, `reason`/2k, `content`/10k, `createdBy`/200), `Extract<>` → `z.infer<>` constituent event types, and the README envelope-shape fix.
- **Bump `@uluops/registry-sdk` 0.31.0 → 0.31.1.** Picks up CWE-674 pre-parse depth guard on the dependency graph (`MAX_SAFE_GRAPH_DEPTH=50` server-side throws `RangeError`) and CWE-20 `.max()` bounds on `name`/`version`/`context` fields. The CLI also carries a client-side `MAX_RENDER_DEPTH=60` defense-in-depth ceiling in `printTree` for the case where the SDK guard is bypassed (mocked clients, schema changes).

### Changed

- **`ulu issues history` action callback extracted.** The 139-line, 4-deep-nested callback in `issues.ts` was split: the event-rendering loop is now `renderHistoryEnvelope(envelope)` at module scope. Picker and fingerprint-resolution branches stay inline. No behavior change.
- **Exhaustiveness guard added to the `HistoryEvent` switch.** `default: { const _exhaustive: never = event; ... }` ensures `tsc` fails compilation if `@uluops/ops-sdk` adds a 4th event variant — forcing a deliberate decision rather than a silent passthrough.

### Fixed

- **Inline truncation pattern replaced with the existing `truncate()` helper.** Three sites in the event renderer were duplicating `.slice(0, 200) + (length > 200 ? '...' : '')`. Now they use `truncate(stripAnsi(content), MAX_EVENT_DETAIL_DISPLAY)` with a named constant. Closes optimizer STR-EXC/M.
- **Removed redundant `as Dependent[]` cast** in `deps.ts:139` — `dependents` is already typed as `Dependent[]` from `DependentsResponse`.

### Docs

- **README example for `ulu issues history`** now shows all three invocation modes (by UUID, by fingerprint + `--project`, picker mode by `--project` alone). Was previously a single-line bare-UUID example.
- **README example for `ulu deps get`** now shows `--tree` rendering, `--max-depth`, and a `deps dependents` example. Was previously just a one-line listing.
- **README `--json` BREAKING callout** for `ulu issues history` — was only in the CHANGELOG, now also above the Issues section examples.
- **CHANGELOG `[0.13.0]` Dependencies section** updated to reflect the actual shipped pins (3.2.1 / 0.31.1 — not 3.2.0 / 0.31.0 as previously stated). This entry's Security section now also calls out the CWE-20 / CWE-674 chain explicitly.

### Tests

- **MAX_RENDER_DEPTH=60 truncation test** added — builds a 62-deep chain, asserts the truncation marker `"... (truncated at depth 60)"` fires. Without this, a regression removing the depth guard would pass all tests.
- **Mock factory `createIssue()` field rename**: `validator` → `agent`. The SDK schema field is `agent`; pre-r2 the mock shipped an undefined `agent` and a phantom `validator` key. Tests that asserted on agent rendering passed only because they checked counts, not the rendered value.
- **`--full` mock corrected**: occurrences use `agentName` not `validator`; details envelope key is `history` not `statusHistory`. Plus a new assertion (`'code-validator at src/index.ts:42'`) anchors the agent-name rendering.
- **`noteType: 'investigation'` → `'context'`** in the merged-envelope test. The SDK enum only allows `context | resolution | blocker`; the invalid value worked only because the mock client bypasses Zod.

Suite 414 → 417.  Build + typecheck + lint clean.

## [0.13.0] - 2026-06-08

### Added

- **`ulu issues history --project <slug>` (picker mode).** Run with `--project` alone (no positional arg) to list the project's recent issues sorted by last activity, with fingerprint-prefix handles, status, and title. Surfaces a hint for drilling in. Solves the human-discoverability gap — operators no longer need a UUID or full fingerprint in hand to find a starting point. Server returns by priority then recency, so the picker biases toward critical/high issues with recent activity (`--limit` is honored).
- **`ulu issues history <id-or-fingerprint> --project <slug>`.** The positional arg can now be a fingerprint when `--project` is set; the CLI resolves the fingerprint to an issue id via `getByFingerprint` and then fetches history. Matches the existing `by-fingerprint` / `update-by-fingerprint` ergonomics so operators can work from the human-readable handle they already have.

### Changed

- **`ulu issues history <id>` now renders the merged history envelope** introduced by ops-sdk v3.2.0 (live-tests T2 §3.1, Bug A/B/C). The dedicated history endpoint used to return a bare `StatusHistory[]` and silently dropped occurrences + notes; it also destroyed rows on undo, leaving a non-monotonic audit trail. The new envelope merges all three event sources into a single timestamp-sorted stream with a discriminated `type` field (`'occurrence' | 'status' | 'note'`). The CLI now iterates `events[]` and renders:
  - `status` events with an `[undo]` marker for tombstones, a `Reverts: <id>` line when the row reverts an earlier change, and the reason line as before
  - `occurrence` events with agent name, run id, and a truncated description
  - `note` events with note type, author, and a truncated content body
  A `⚠ Truncated to most recent N of M events` warning surfaces when the server applies the 1000-event ceiling.
- **BREAKING (JSON output):** `--json ulu issues history` now emits the `IssueHistoryEnvelope` shape (`{issueId, events, totalEvents, truncated}`) instead of a flat `StatusHistory[]`. Scripts consuming `result[0]` or `Array.isArray(result)` need to switch to `result.events`. The bare-array shape was lossy on F10 (occurrences + notes were dropped on the server side, then undo destroyed status rows) so most real consumers were already getting `[]` before the fix landed.
- **`ulu deps get` / `ulu deps dependents` now render the real envelope shapes** (live-tests T2 §3.5, R12). registry-sdk v0.31.0 fixed both endpoints to return real structured graphs/lists instead of the silent `{}` they used to parse to. The CLI used to defend against the broken contract with `data.nodes ?? data.flat ?? []` fallbacks; that scaffolding is gone. `deps get` now prints a flat indented list by default (each line tagged with its `(depth N)`) and accepts `--tree` to render the recursive graph as an indented tree with `[context]` labels per edge (`[invokes.agent]`, `[stage "Final Checks"]`, `[dependencies.requires]`, etc). `deps dependents` now shows `← context` arrows so operators can see which reference type each consumer uses.
- Removed: the unused `cycleDetected` / `cycles` warning — the registry API never tracked those.

### Dependencies

- `@uluops/ops-sdk` 3.1.2 → 3.2.1 (envelope types: `IssueHistoryEnvelope`, `HistoryEvent`, `TransitionType`; plus 3.2.1's CWE-20 `.max()` string bounds on event fields).
- `@uluops/registry-sdk` 0.30.2 → 0.31.1 (R12 envelope types: `DependencyGraphResponse`, `DependentsResponse`, `Dependent`, `FlatDep`, recursive `DependencyNode`; plus 0.31.1's CWE-674 depth guard + CWE-20 string bounds).

### Internal

- Issues test suite gained 3 new history-renderer cases (merged-event rendering with all 3 event types + undo tombstone, truncation warning, empty envelope). Picker mode added 3 more cases (sorted list, empty project, no-arg error). Deps test suite fully rewritten for R12 envelope shape (5 cases: flat default + tree view + no-deps + populated dependents + no-dependents). Suite 408 → 414.

## [0.12.9] - 2026-06-05

### Changed

- **Ambiguous-name disambiguation hint now uses the actual types from the SDK error message.** Previously the hint suggested `--type <agent|command|workflow|pipeline>` regardless of which types actually matched the name, leaving operators to guess. The hint now parses `(agent, command)` from the SDK's "Multiple definitions named X found" message and emits one concrete `--type <name>` line per match, gated through a known-types whitelist so unexpected tokens in the message are dropped. Operators copy-paste a real flag instead of choosing from four hypotheticals.
- **`ulu exec describe` with no name now lists all definitions** instead of printing commander's `error: missing required argument 'name'`. Operators land on the help page only when they pass `-h`. `--type` is honored as a filter in the no-name case (equivalent to `ulu exec list --type <t>`). Existing behavior with a name is unchanged.

### Internal

- 1 new `extractAmbiguousTypes` test in `test/context.test.ts` covering the type whitelist filtering; 2 new `exec describe` no-name tests in `test/commands/exec.test.ts` (unfiltered list, --type-filtered list). Suite now 408 cases (+3).

## [0.12.8] - 2026-06-05

### Added

- **`ulu exec describe` now accepts `-t/--type` and `-v/--version` flags.** Resolves the longstanding gap where the SDK's "Multiple definitions named X found (agent, command). Specify type explicitly" error was unactionable — the CLI had no way to pass the type through. `ulu exec describe socrates-explorer --type agent` now works. Both flags forward to `client.describe(name, version, type)`, which gained the matching pass-through in `@uluops/core` 0.18.5.

### Fixed

- **`handleCoreError` no longer slaps the auth-credentials hint on every `ConfigurationError`.** The previous behavior printed `Hint: Check ULUOPS_API_KEY and ANTHROPIC_API_KEY environment variables.` after any `ConfigurationError`, including SDK ambiguous-name errors and path-traversal validation errors that have nothing to do with credentials. Replaced with a regex gate (`isAuthRelatedMessage`): the auth hint now appears only when the error message references API keys, credentials, tokens, or auth/authorization/unauthorized/forbidden. Messages matching `/multiple definitions named/i` get a targeted disambiguation hint pointing to `--type`. Unmatched messages get no hint, letting the SDK message speak for itself.

### Changed

- **`@uluops/core` bumped 0.18.4 → 0.18.5** for the `client.describe(name, version?, type?)` signature extension.

### Internal

- 2 new `handleCoreError` tests in `test/context.test.ts` covering the disambiguation-hint branch and the no-hint-for-unrelated-message branch; 1 new test in `test/commands/exec.test.ts` verifying `--type`/`--version` forward to `client.describe`; existing describe test updated for the new three-arg call shape. Suite now 405 cases (+3).

## [0.12.7] - 2026-06-05

### Fixed

- **`ulu exec describe` no longer renders `[object Object]` for array-of-object fields.** `formatKeyValue` in `src/formatters/table.ts` previously fell through to template-string coercion for any array, invoking `Array.prototype.toString()` and stringifying object elements as `[object Object]`. Visible on `calibration_examples` and any future ADL/CDL field shaped as `Array<Record<string, unknown>>`. Arrays of objects now recurse into nested key-value blocks; each entry is printed as a bulleted record with its own indented sub-fields. Primitive-array behavior (`tags`, `tools`, `regions` joined with commas) preserved.
- **Multi-element long-string arrays in `describe` now render as bullets instead of one comma-joined blob.** Affects fields like `downstream_handoff.<target>` where each entry is an independent rationale string. Heuristic: arrays with >1 element AND any element exceeding 40 chars switch to bullet rendering. Short string arrays (tags, tool lists) stay inline.

### Internal

- 4 new `formatKeyValue` tests in `test/formatters/table.test.ts` — array-of-objects rendering, primitive-array inline behavior, multi-element long-string bulleting, and single-element long-string inline fallback. Suite now 402 cases (+4).

## [0.12.5] - 2026-06-02

### Security

- **`~/.uluops` directory now created with `0o700` permissions.** Previously fell through to the OS umask default (typically `0o755`), making the directory listing — which exposes profile names — readable to other users on shared/multi-user systems. The credential file itself was already `0o600` via `writeFileAtomic`, so this closes the listing-side gap. On every credential write the CLI also runs a best-effort `chmodSync(configDir, 0o700)` to tighten any pre-existing directory that was created at the older default; failures (e.g., root-owned dir) are ignored.

### Added

- **`--timeout` now appears in the README Global Options block** with the dual default (`30000` for ops/registry, `600000` for exec) matching the in-CLI `--help` output. Resolves a docs gap left over from when the option existed but was undocumented.
- **4 `stripBom` tests** in `test/utils.test.ts` covering the BOM-stripping branch, the non-BOM pass-through, the empty-string edge, and the position-0-only stripping guarantee.

### Changed

- **Extracted `hasCredentials` helper in `src/context.ts`.** Collapses the three-way duplicated `apiKey || sessionToken || (email && password)` OR-chain at `createOpsContext`, `createRegistryContext`, and `createCoreContext` into a single function with a local `CredentialFields` type. No cross-SDK import; the CLI's credential model stays the CLI's concern. Param of `requireCredentials` renamed from `hasCredentials` to `present` to avoid shadowing.

### Internal

- Test suite now 398 cases (+4).

## [0.12.4] - 2026-06-02

### Added

- **Warning when `--project` is omitted with tracking enabled.** `exec run`, `exec agent`, `exec command`, `exec workflow`, and `exec pipeline` now print a stderr advisory showing the project name the SDK would silently infer from `basename(resolve(target))` and pointing to `--project` or `--no-tracking`. Suppressed under `--quiet`, `--json`, when `ULUOPS_PROJECT` is set, or when the operator passes `--project` explicitly. Surfaces the phantom-project class of bug (`exec agent foo ./src` creating a project literally named `src`) without breaking the one-line ad-hoc invocation pattern. The structural fix lives in `ops-uluops-api` issue `76f1c7e6`.
- **Inherited options now visible on `exec` subcommand help.** `ulu exec agent --help`, `ulu exec pipeline --help`, etc. now list `--project`, `--no-tracking`, `--no-safety-warnings`, `--local-definitions`, `--registry-url` as inherited from the parent `exec` command, plus a pointer to global flags. Previously these were invisible in subcommand help, leading operators to believe tracking and project-scoping weren't available on the subcommand they were looking at.
- **Default exec timeout: 10 minutes.** `createCoreContext` now passes `timeout: 600_000` to `UluOpsClient` when `--timeout` is not specified, overriding the SDK's internal 5-minute fallback with a single predictable CLI-owned ceiling that accounts for model cold-start and long agent execution. Ops/registry HTTP timeout remains 30s. `--timeout` help text updated to reflect both defaults.
- **`zod@4.3.6` added as a direct dependency** (exact pin, matching `@uluops/ops-sdk`'s pin) to back the new `runs update` input schema.

### Changed

- **Type-safety refactor of `exec` action callbacks.** Replaced all `cmdOpts['key'] as string | undefined` casts (and one related `opts.featuresList as string`) with the existing `optString(opts, key)` helper. The helper was already in-file; usage is now uniform across all six action callbacks. Behavior unchanged.
- **`runs update --file/--stdin` JSON input now Zod-validated.** Replaced the unguarded `(await readJsonInput(options)) as { agents?: unknown[] }` assertion with a `safeParse` against a minimal `RunsUpdateJsonInputSchema`. Validates `agents[].name`, `decision`, and numeric ranges before the network round-trip; passes through unknown fields (`.passthrough()`) so the API remains the canonical authority. Invalid input now exits with a clear `Invalid JSON input for runs update: <zod error>` message instead of forwarding malformed payloads.
- **`runPipeline` double assertion removed.** `src/commands/exec.ts` previously cast `ctx.client` through `unknown` to access `runPipeline`. The method has been public on `UluOpsClient` since 0.18.0; the cast (and the dependent `as ExecutionResult` on the formatter call) was stale. Direct call now.

### Fixed

- **README documents `-t/--target` on `exec agent`.** The required option was missing from the "Agent-specific options" table.
- **README documents `def get --rendered` options.** `--target <harness>` and `-o, --output <path>` were undocumented; added to the listing and two example invocations.

### Removed

- **`@uluops/sdk-core` no longer listed as a direct dependency.** Verified unimported in `src/`/`test/`; remains transitively available via `@uluops/ops-sdk` and `@uluops/registry-sdk`.

### Internal

- 20 new tests across `test/utils.test.ts` (writeFileAtomic — 6), `test/commands/exec.test.ts` (`exec pipeline` happy/prompt/JSON/error paths plus `warnIfProjectInferred` 7-case matrix — 11), and `test/commands/runs.test.ts` (Zod validation — 4). Test suite now 394 cases.
- `warnIfProjectInferred` exported as `@internal` for direct unit testing rather than driving it via Commander argv plumbing.

## [0.12.3] - 2026-06-02

### Changed

- **`--report` now implies `--no-tracking`.** Empirical verification of 0.12.2 (`openai:gpt-5.5` and `anthropic:claude-sonnet-4-6` against the CLI source) revealed that the Phase 2 report-mode directive is overruled by AI SDK structured-output enforcement at the API level — OpenAI's strict `json_schema` mode prevents prose emission entirely, and even on Claude the schema-validated extraction path breaks. 0.12.3 resolves this by signaling `reportMode: true` to `@uluops/core@0.18.3`'s new gating logic (which omits the output schema from the AI SDK call), and force-sets `trackResults: false` to preserve the tracker's schema-validated analytics contract. The exclusivity is unconditional. When the operator's terminal is not in quiet mode, a one-line stderr notice prints: `Report mode enabled — tracking disabled. For tracker submission, run without --report.`
- **Bumps `@uluops/core` to `0.18.3` (exact pin).** Required for the `reportMode` plumbing on `ExecutionOptions` / `ResolvedExecutionContext` / `AgentExecutor.execute` and for the `OutputExtractor` discriminator-first regex chain.

### Internal

- Three new tests in `test/commands/exec.test.ts` pin the v0.1.1 contract: `--report` alone forces `reportMode=true`/`trackResults=false`/stderr notice; non-report invocations leave `reportMode` undefined and respect `--no-tracking`; `--report` in quiet mode suppresses the notice without affecting flag mutation.

## [0.12.2] - 2026-06-02

### Added

- **`--report` flag now produces publication-quality reports.** When `--report` is set on `ulu exec agent`, the CLI injects a report-mode directive into the operator prompt steering the agent to compose a human-readable artifact in the form appropriate to its cognitive lens (prose, narrative, structured sections, dialectical passages). Previously `--report` wrote whatever raw findings the agent produced; now the agent knows it is producing a report for human readership. The structured findings (tracker submission, `--features-list` JSON) continue to flow as sibling artifacts, unchanged.
- **`-o, --output <path>` flag on `exec agent`** provides explicit destination override for `--report`, with precedence over the `--report` positional argument and the cwd default.
- **`--report [path]` is now an optional argument.** Called as `--report` (no path), it defaults to `./<agent-name>-report-<YYYYMMDDTHHmmss>.md` in cwd. The prior `--report <path>` form continues to work via Commander's optional-argument semantics.

### Changed

- **Bumps `@uluops/core` to `0.18.2` (exact pin).** Required for the lifted 32 KiB → 512 KiB `rawOutput` truncation cap; publication-quality reports empirically observed at 33–208 KB would otherwise be silently clipped — frequently mid-JSON, which also corrupted analysis-block extraction.

### Internal

- Exported `resolveReportPath`, `applyReportModeDirective`, and `REPORT_MODE_DIRECTIVE` (all marked `@internal`) from `commands/exec.ts` to support unit testing. 11 new tests added in `test/commands/exec.test.ts` pin the path-resolution precedence (`--output` > positional > default), the prompt-composition rules, and the contract between the directive's `\`\`\`json analysis` fence marker and core's `AnalysisSummaryExtractor` regex.

## [0.12.1] - 2026-06-01

### Fixed

- **Install no longer fails on `ETARGET No matching version found for @uluops/ops-sdk@3.0.0`.** `0.12.0` transitively required `@uluops/core@0.18.0`, which had been published with broken pins to `@uluops/ops-sdk@3.0.0` and `@uluops/registry-sdk@0.30.0` — both subsequently unpublished from the registry. This release pulls in `@uluops/core@0.18.1` which repaired those references, unblocking fresh installs.

### Security

- **Bump full UluOps dep chain to today's hardened versions.** `@uluops/sdk-core` 0.11.0 → 0.11.1, `@uluops/ops-sdk` 3.0.3 → 3.0.5, `@uluops/registry-sdk` 0.30.1 → 0.30.2, `@uluops/core` 0.18.0 → 0.18.1. All packages now resolve to a single `@uluops/sdk-core@0.11.1` instance in `node_modules` (no duplicate nested copies), so the sdk-core security hardening — `redirect: 'error'` on all fetch sites, `stripControlChars` in error messages, widened `SENSITIVE_KEYS`, `REDACTED_DETAIL_KEYS` `column` fix, and `sanitizeString` URL-userinfo + bare JWT coverage — applies uniformly across every SDK code path the CLI invokes. See `@uluops/sdk-core` CHANGELOG 0.11.1.

### Supply chain

- **Pin remaining caret deps to exact versions.** `commander`, `ora`, `@biomejs/biome`, `@types/node`, `@vitest/coverage-v8`, `tsx`, `typescript`, `vitest` stripped of caret ranges per the UluOps exact-pinning policy adopted 2026-06-01 in response to the RedHat-class supply-chain attack pattern.

## [0.12.0] - 2026-06-01

### Changed

- Bumps `@uluops/sdk-core` to `0.11.0`, `@uluops/ops-sdk` to `3.0.0`, `@uluops/registry-sdk`
  to `0.30.0`, `@uluops/core` to `0.18.0` (all exact pins). Aligns with the sdk-core
  schema-removal cascade.

### Fixed

- `ulu definitions publish` now correctly destructures the `PublishResult` (registry-sdk
  0.29.0 changed the return type from `Definition` to `{ definition, warnings }`).
  Surfaces non-fatal publish warnings instead of crashing with `Cannot read properties of
  undefined`.
- `ulu forks lineage` was reading `result.chain` and `result.current` (untyped) through
  the typed `ForkLineage` interface, which only declares `{ isFork, fork, source }`.
  Refactored to use the `asFlexibleResponse` cast it already had imported, with explicit
  inner types for the legacy `chain`/`current` shape.

## [0.11.0] - 2026-05-27

### Added

- **`ulu languages` command** (alias: `ulu lang`) — browse definition language schemas. `ulu lang` lists all 4 languages with current versions. `ulu lang adl` shows metadata for a specific language. `ulu lang adl --json` returns full schema content. `ulu lang adl -o schema.json` writes the JSON Schema to a file.

## [0.10.2] - 2026-05-27

### Removed

- **`ulu config` command** — profile-based configuration (`config list`, `config set`, `config get`, `config unset`, `config profiles`, `config use`, `config path`) has been removed. The feature was structurally complete but mostly hollow — only `defaultProject` was consumed at runtime, while `opsBaseUrl`, `registryBaseUrl`, `json`, `quiet`, and `debug` stored in profiles had no effect on CLI behavior. Use environment variables and CLI flags instead.
- **`defaultProject` profile fallback** — `resolveProject` no longer reads `~/.uluops/profiles.json`. Pass `--project <name>` explicitly.

### Fixed

- **Removed stale `models sync` test** — test referenced a subcommand that was removed from the implementation but not the test suite.

## [0.10.1] - 2026-05-27

### Fixed

- **`file:` dependencies replaced with npm version ranges** — `@uluops/core`, `@uluops/ops-sdk`, `@uluops/registry-sdk`, and `@uluops/sdk-core` were using local `file:` references that broke when installed from npm.

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
