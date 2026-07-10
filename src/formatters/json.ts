import { getCliVersion } from '../version.js';

/**
 * The single chokepoint for all machine-readable `--json` output.
 *
 * Every `--json` emission in the CLI flows through {@link emitJson}. In default
 * mode it prints the payload byte-for-byte identically to the historical
 * `console.log(JSON.stringify(value, null, 2))` — the default contract is
 * frozen. When the caller opts in (`ULU_JSON_SCHEMA=1` or `--json-envelope`),
 * the payload is wrapped in a uniform versioned envelope so automated consumers
 * can detect shape changes at runtime instead of breaking silently.
 *
 * ## Stability contract
 * `--json` output shapes are part of the CLI's public API. A change to any
 * default `--json` shape is a BREAKING change and requires a MAJOR version bump.
 * Each logical output owns a `schemaVersion` in {@link SCHEMA_VERSIONS} — the
 * source of truth. When you change a payload shape you MUST bump its
 * `schemaVersion`, add a CHANGELOG `BREAKING` entry, and update its
 * contract-anchor test. See the README "JSON Output Stability Contract" section.
 */

/** Identifier of the envelope wrapper format. Bumps only if the wrapper itself changes. */
export const ENVELOPE_SCHEMA = 'uluops.cli/v1';

/**
 * Per-kind output shape versions — the source of truth for `--json` stability.
 *
 * Most kinds are at `1`. `issue.history` and `deps.get` start at `2` to record
 * the breaking shape change they already shipped in CLI v0.13.0 (the regression
 * this contract was built to prevent recurring silently).
 *
 * A `kind` is a stable logical name for one output shape — usually one per
 * command, but a command that emits a different shape under a flag (e.g.
 * `exec describe` with vs. without a name) gets a distinct kind so the
 * difference is visible to consumers.
 */
export const SCHEMA_VERSIONS = {
  // analytics — kind = `analytics.<subcommand>`
  'analytics.agents': 1,
  'analytics.reliability': 1,
  'analytics.hotspots': 1,
  'analytics.burndown': 1,
  'analytics.velocity': 1,
  'analytics.discovery': 1,
  'analytics.matrix': 1,
  'analytics.resolution': 1,
  'analytics.taxonomy': 1,
  'analytics.fullTaxonomy': 1,
  'analytics.trends': 1,
  // auth
  'auth.login': 1,
  'auth.logout': 1,
  'auth.whoami': 1,
  'auth.register': 1,
  'auth.forgotPassword': 1,
  'auth.resetPassword': 1,
  'auth.changePassword': 1,
  'auth.profile': 1,
  'auth.updateProfile': 1,
  'auth.sessions.list': 1,
  'auth.sessions.revoke': 1,
  'auth.apiKeys.list': 1,
  'auth.apiKeys.create': 1,
  'auth.apiKeys.revoke': 1,
  // definitions
  'definition.list': 1,
  'definition.getRendered': 1,
  'definition.get': 1,
  'definition.create': 1,
  'definition.update': 1,
  'definition.publish': 1,
  'definition.deprecate': 1,
  'definition.validate': 1,
  'definition.render': 1,
  'definition.delete': 1,
  // deps
  'deps.get': 2,
  'deps.dependents': 1,
  // exec
  'exec.run': 1,
  'exec.agent': 1,
  'exec.agentBatch': 1,
  'exec.command': 1,
  'exec.workflow': 1,
  'exec.pipeline': 1,
  'exec.list': 1,
  'exec.describeList': 1,
  'exec.describe': 1,
  // executions
  'execution.record': 1,
  'execution.stats': 1,
  // forks
  'fork.list': 1,
  'fork.create': 1,
  'fork.check': 1,
  'fork.lineage': 1,
  // issues
  'issue.list': 1,
  'issue.getFull': 1,
  'issue.get': 1,
  'issue.search': 1,
  'issue.update': 1,
  'issue.close': 1,
  'issue.addNote': 1,
  'issue.historyList': 1,
  'issue.history': 2,
  'issue.undo': 1,
  'issue.create': 1,
  'issue.edit': 1,
  'issue.restore': 1,
  'issue.bulkUpdate': 1,
  'issue.byFingerprint': 1,
  'issue.updateByFingerprint': 1,
  // languages
  'language.list': 1,
  'language.get': 1,
  // models
  'model.list': 1,
  'model.get': 1,
  'model.providers': 1,
  'model.aliases': 1,
  'model.resolve': 1,
  // projects
  'project.list': 1,
  'project.get': 1,
  'project.create': 1,
  'project.delete': 1,
  'project.restore': 1,
  'project.summary': 1,
  'project.trends': 1,
  'project.rename': 1,
  'project.bulkUpdateIssues': 1,
  'project.mergeIssues': 1,
  // runs
  'run.list': 1,
  'run.get': 1,
  'run.latest': 1,
  'run.details': 1,
  'run.save': 1,
  'run.validate': 1,
  'run.diff': 1,
  'run.archive': 1,
  'run.update': 1,
  'run.delete': 1,
  // taxonomy
  'taxonomy.get': 1,
  // translation
  'translation.version': 1,
  'translation.retranslate': 1,
  'translation.upgrade': 1,
  // versions
  'version.list': 1,
  'version.diff': 1,
} as const;

/** Stable logical name of a `--json` output shape. Derived from the registry. */
export type JsonKind = keyof typeof SCHEMA_VERSIONS;

/** True when the versioned envelope is opted into via env var or `--json-envelope`. */
function envelopeEnabled(): boolean {
  return process.env.ULU_JSON_SCHEMA === '1';
}

/**
 * Emit `data` as `--json` output when `ctx.json` is set.
 *
 * Returns `true` if it emitted (so the caller can `return` and skip the
 * human-readable branch), `false` if `ctx.json` was not set.
 *
 * Default mode is byte-for-byte identical to `console.log(JSON.stringify(data,
 * null, 2))`. Envelope mode wraps as
 * `{ schema, cliVersion, kind, schemaVersion, data }`.
 *
 * @example
 * // Emit a project list in --json mode, then skip the human-readable branch
 * if (emitJson(ctx, projects, 'project.list')) return;
 * console.log(formatProjects(projects));
 */
export function emitJson(
  ctx: { json: boolean },
  data: unknown,
  kind: JsonKind,
): boolean {
  if (!ctx.json) return false;
  if (envelopeEnabled()) {
    console.log(
      JSON.stringify(
        {
          schema: ENVELOPE_SCHEMA,
          cliVersion: getCliVersion(),
          kind,
          schemaVersion: SCHEMA_VERSIONS[kind],
          data,
        },
        null,
        2,
      ),
    );
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
  return true;
}
