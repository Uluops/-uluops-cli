/**
 * `ulu log` — the project's second history as a command (ulu log spec v0.1.13
 * §3.1–§3.6; checklist Phase 4).
 *
 * Git remembers what changed. This remembers what was decided: runs (what was
 * examined) and decisions (what was decided, with reasons) interleaved newest
 * first, plus what came back. `--stat` is the rollup, `--orgs` the rollup per
 * org the caller belongs to.
 *
 * ## Project resolution — D5, and why the resolver is NOT exported
 *
 * `resolveLogProject` below is module-private on purpose (spec §3.5): the file
 * key `project` in `.uluops.json` governs READS only. `ulu exec` keeps its own
 * ladder (flag → `ULUOPS_PROJECT` → inferred basename) and never sees the file's
 * project, so a walked file can never decide where a run LANDS, only what is
 * shown. An unexported symbol cannot be imported by a write path; exporting it
 * would be a one-line change a reviewer sees. The org half of the same file is
 * resolved by `createOpsContext` (D13) — this command reads the SAME nearest
 * file for `project`, so org and project always come from one place.
 *
 * Ladder: `--project` → positional → nearest `.uluops.json` `project` →
 * `ULUOPS_PROJECT` → error listing the caller's projects. The reader's
 * refusals (foreign uid, bad JSON, unknown key, project without org) STOP the
 * ladder with the reader's message — a silently skipped file is a silently
 * wrong project.
 */

import {
  findWorkspaceOrgFile,
  isNotFoundError,
  isOrgAccessDeniedError,
  type LogEventKind,
  type OrgListEntry,
  type OrgLogStat,
  type ProjectLogQuery,
  readWorkspaceFile,
  WORKSPACE_ORG_FILE,
} from '@uluops/ops-sdk';
import type { Command } from 'commander';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
  type OpsCliContext,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import {
  formatLogFooter,
  formatLogStream,
  formatOrgLogStats,
  formatProjectLogStat,
} from '../formatters/log.js';
import { exitWithError, parseIntOption, withSpinner } from '../utils.js';

const KINDS: readonly LogEventKind[] = ['run', 'decision', 'regression'];

interface LogOptions {
  project?: string;
  stat?: boolean;
  orgs?: boolean;
  since?: string;
  until?: string;
  limit?: string;
  cursor?: string;
  kind?: string;
  workflow?: string;
  agent?: string;
  includeArchived?: boolean;
  /** commander maps `--no-collapse` to `collapse: false`; default true. */
  collapse: boolean;
}

/** Where the project name came from — printed beside the org provenance and in the 404 message. */
interface LogProjectResolution {
  project: string;
  source: 'flag' | 'positional' | 'workspace' | 'env';
  /** The nearest workspace file, when one exists (answered or not). */
  path?: string;
}

/**
 * The D5 ladder. NOT exported — see the module header.
 *
 * @param positional - `ulu log <project>`
 * @param flag - `-p, --project <name>` (wins over the positional)
 * @param cwd - where the walk starts (injectable for tests)
 * @param env - where `ULUOPS_PROJECT` is read (injectable for tests)
 * @returns the project and its rung, or `undefined` with the nearest file's path when nothing answered
 */
function resolveLogProject(
  positional: string | undefined,
  flag: string | undefined,
  cwd: string = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): LogProjectResolution | { project: undefined; path?: string } {
  if (flag !== undefined && flag !== '')
    return { project: flag, source: 'flag' };
  if (positional !== undefined && positional !== '')
    return { project: positional, source: 'positional' };

  // The nearest file — the same walk `createOpsContext` used for the org, so the
  // two keys always come from one file. The walk is bounded at $HOME (SDK
  // default); outside it this rung cannot answer, which `--help` states.
  const path = findWorkspaceOrgFile(cwd);
  let fromFile: string | undefined;
  if (path !== undefined) {
    // Throws on the reader's refusals — deliberately not caught: the ladder stops.
    fromFile = readWorkspaceFile(path)?.project;
    if (fromFile !== undefined)
      return { project: fromFile, source: 'workspace', path };
  }

  const fromEnv = env.ULUOPS_PROJECT;
  if (fromEnv !== undefined && fromEnv !== '') {
    // The env rung never wins silently over a file that exists but names no project.
    if (path !== undefined) {
      console.error(
        `project from ULUOPS_PROJECT; nearest ${WORKSPACE_ORG_FILE} (${path}) names no project`,
      );
    }
    return {
      project: fromEnv,
      source: 'env',
      ...(path !== undefined ? { path } : {}),
    };
  }

  return path !== undefined
    ? { project: undefined, path }
    : { project: undefined };
}

function describeProjectSource(r: LogProjectResolution): string {
  switch (r.source) {
    case 'flag':
      return '--project';
    case 'positional':
      return 'argument';
    case 'workspace':
      return `workspace ${r.path ?? ''}`.trimEnd();
    case 'env':
      return 'env ULUOPS_PROJECT';
  }
}

function parseKinds(value: string | undefined): LogEventKind[] | undefined {
  if (value === undefined) return undefined;
  const kinds = value
    .split(',')
    .map((k) => k.trim())
    .filter((k) => k.length > 0);
  const bad = kinds.filter((k) => !(KINDS as readonly string[]).includes(k));
  if (bad.length > 0 || kinds.length === 0) {
    exitWithError(
      `--kind takes a comma-separated subset of ${KINDS.join(', ')}; got "${value}"`,
    );
  }
  return kinds as LogEventKind[];
}

/** The org the project will be looked up in, for the 404 message. */
function orgLabel(ctx: OpsCliContext): string {
  return ctx.org ?? 'personal';
}

/**
 * Register `ulu log`.
 */
export function registerLogCommands(program: Command): void {
  program
    .command('log [project]')
    .description(
      "The project's second history: runs (what was examined) and decisions (what was decided, with reasons) interleaved, newest first",
    )
    .option(
      '-p, --project <name>',
      'Project name or id (wins over the positional; both over the workspace file)',
    )
    .option(
      '--stat',
      'The rollup: examined / found / decided / came back / activity',
    )
    .option(
      '--orgs',
      'The rollup per org you belong to, with a per-project table (implies --stat)',
    )
    .option('--since <iso>', 'Window start (ISO 8601)')
    .option('--until <iso>', 'Window end (ISO 8601); since <= until')
    .option('-n, --limit <n>', 'Events per page, 1-500 (default 50)')
    .option(
      '--cursor <cursor>',
      'Continue from a previous page (the footer prints it; --json carries it as nextCursor)',
    )
    .option(
      '--kind <kinds>',
      'Comma-separated subset of run,decision,regression',
    )
    .option(
      '--workflow <type>',
      'Only runs of this workflow type (ledger events have no workflow)',
    )
    .option(
      '--agent <name>',
      "Runs by agent name (snapshots); decisions and regressions by the issue's agent",
    )
    .option('--include-archived', 'Include archived runs')
    .option(
      '--no-collapse',
      'Print one line per issue instead of collapsing same-second identical decisions',
    )
    .addHelpText(
      'after',
      `
Project resolution (reads only): --project, then the argument, then the "project" key of the
nearest .uluops.json above the current directory (the same file that names the org; a file
carrying "project" must also carry "org", "personal" for no org, or it is refused), then
ULUOPS_PROJECT, then an error listing your projects. The walk stops at your home directory,
so outside it the file rung cannot answer. The file's "project" key governs ulu log only:
ulu exec keeps its own resolution (--project, ULUOPS_PROJECT, the directory name) and can
track under a different name than ulu log reads. A refused file (owned by another user,
unparseable, an unknown key, "project" without "org") stops the ladder with its own message.

Reading the log:
  run times are as reported by the saving client; within a second, order is as recorded; for
  events recorded before millisecond timestamps (migration 080) it is not meaningful.
  "regressed" is a finding a run re-detected; "open <- <status>" without a run is reopened by
  decision. "no reason recorded" is the ledger's silence, not a person's. "by agent" prints
  only when the ledger says so; nothing printed means unattributed, never "human".
  same-second identical changes are collapsed within a page; --no-collapse to expand.
  a status-mixed bulk change shows one line per originating status; unrelated identical
  changes in one second merge. Collapse is per page: a group across a page boundary shows as
  two lines. --json is never collapsed. Times are UTC.

Reading --stat:
  Decided is the current status of findings first seen in the window (run times); Activity is
  what changed in the window (ledger times). "completed" prints as fixed. "reopened" under
  Activity counts transitions into open. With no window both frames say "all time".

Examples:
  $ ulu log                              # nearest .uluops.json names the project
  $ ulu log ops-uluops-api --stat
  $ ulu log -p ops-uluops-api --since 2026-09-01T00:00:00Z --kind decision,regression
  $ ulu log --orgs
  $ ulu log ops-uluops-api --json -n 100 | jq '.data[] | select(.type == "regression")'
`,
    )
    .action(async (positional: string | undefined, opts: LogOptions, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      // --orgs implies --stat and needs no project.
      if (opts.orgs) {
        await runOrgs(ctx, opts);
        return;
      }

      let attempt: ReturnType<typeof resolveLogProject>;
      try {
        attempt = resolveLogProject(positional, opts.project);
      } catch (error) {
        exitWithError(error instanceof Error ? error.message : String(error));
      }
      if (attempt.project === undefined) {
        await failNoProject(ctx, attempt.path);
        return; // failNoProject never returns; this makes the narrowing visible to tsc
      }
      const resolved: LogProjectResolution = attempt;
      const project = resolved.project;
      const provenance = `${ctx.orgProvenance}; project from ${describeProjectSource(resolved)}`;

      try {
        if (opts.stat) {
          const stat = await withSpinner(
            ctx,
            {
              start: 'Fetching log rollup...',
              failure: 'Failed to fetch log rollup',
            },
            () =>
              ctx.client.projects.getLogStat(project, {
                since: opts.since,
                until: opts.until,
              }),
          );
          if (emitJson(ctx, stat, 'log.stat')) return;
          console.log(
            formatProjectLogStat(stat, {
              subject: project,
              orgLine: `org: ${orgLabel(ctx)}, ${provenance}`,
            }),
          );
          return;
        }

        const query: ProjectLogQuery = {
          since: opts.since,
          until: opts.until,
          limit:
            opts.limit !== undefined
              ? parseIntOption(opts.limit, '--limit')
              : undefined,
          cursor: opts.cursor,
          kind: parseKinds(opts.kind),
          workflowType: opts.workflow,
          agent: opts.agent,
          includeArchived: opts.includeArchived === true ? true : undefined,
        };
        const page = await withSpinner(
          ctx,
          { start: 'Fetching log...', failure: 'Failed to fetch log' },
          () => ctx.client.projects.getLog(project, query),
        );
        if (emitJson(ctx, page, 'log.stream')) return; // never collapsed
        if (page.data.length === 0) {
          console.log(
            `No events for ${project} (org: ${orgLabel(ctx)}, ${provenance})`,
          );
          return;
        }
        const rendered = formatLogStream(page, { collapse: opts.collapse });
        console.log(rendered.text);
        console.log('');
        console.log(formatLogFooter(page, rendered.collapsed));
      } catch (error) {
        if (isNotFoundError(error)) {
          const from =
            resolved.source === 'workspace' && resolved.path !== undefined
              ? `, from ${resolved.path}`
              : '';
          exitWithError(
            `project '${project}' not found in org ${orgLabel(ctx)}${from}`,
          );
        }
        handleOpsError(error, ctx);
      }
    });
}

/** No project on any rung: say which rungs were tried and list what exists. */
async function failNoProject(
  ctx: OpsCliContext,
  path: string | undefined,
): Promise<never> {
  const fileNote =
    path !== undefined
      ? `nearest ${WORKSPACE_ORG_FILE} (${path}) names org but no project`
      : `no ${WORKSPACE_ORG_FILE} above the current directory`;
  let names: string[] = [];
  try {
    names = (await ctx.client.projects.list()).data.map((p) => p.name);
  } catch {
    // listing is a courtesy; the error below stands without it
  }
  const list =
    names.length > 0
      ? `\nProjects in org ${orgLabel(ctx)}: ${names.join(', ')}`
      : '';
  exitWithError(
    `no project given: pass one, add "project" to the workspace file, or set ULUOPS_PROJECT (${fileNote})${list}`,
  );
}

async function runOrgs(ctx: OpsCliContext, opts: LogOptions): Promise<void> {
  try {
    const orgs = await withSpinner(
      ctx,
      { start: 'Fetching orgs...', failure: 'Failed to fetch orgs' },
      () => ctx.client.orgs.list(),
    );
    const entries: { org: OrgListEntry; stat: OrgLogStat }[] = [];
    const skipped: string[] = [];
    for (const org of orgs) {
      try {
        const stat = await withSpinner(
          ctx,
          {
            start: `Fetching ${org.slug}...`,
            failure: `Failed to fetch ${org.slug}`,
          },
          () =>
            ctx.client.orgs.getLogStat(org.slug, {
              since: opts.since,
              until: opts.until,
            }),
        );
        entries.push({ org, stat });
      } catch (error) {
        // A key BOUND to one org still lists every org its holder belongs to,
        // but may read only its own: the platform answers 403 for the others.
        // That is one org's answer, not the command's — note it and go on.
        if (!isOrgAccessDeniedError(error)) throw error;
        skipped.push(org.slug);
      }
    }
    if (skipped.length > 0) {
      console.error(
        `not readable with this key (bound to another org): ${skipped.join(', ')}`,
      );
    }
    if (
      emitJson(
        ctx,
        entries.map((e) => e.stat),
        'log.orgs',
      )
    )
      return;
    if (entries.length === 0) {
      console.log(
        orgs.length === 0
          ? 'You belong to no orgs'
          : 'None of your orgs is readable with this key',
      );
      return;
    }
    console.log(formatOrgLogStats(entries));
  } catch (error) {
    handleOpsError(error, ctx);
  }
}
