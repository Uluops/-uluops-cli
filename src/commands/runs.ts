import {
  AnalysisEchoMismatchError,
  type RunUpdatePreview,
  type SaveRunInput,
  type UpdateRunByNumberInput,
  type UpdateRunPreviewByNumberInput,
} from '@uluops/ops-sdk';
import type { Command } from 'commander';
import { z } from 'zod';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import { formatRun, formatRuns } from '../formatters/ops.js';
import { formatAnalysisRejections } from '../formatters/rejections.js';
import {
  confirmOrExit,
  exitWithError,
  getFlexibleProperty,
  normalizeKeys,
  parseFloatOption,
  parseIntOption,
  readJsonInput,
  resolveProject,
  stripAnsi,
  toCamelCase,
  withSpinner,
} from '../utils.js';

/**
 * Exit code for "the analysis update was applied but could not be confirmed; do not retry".
 * Distinct from 1 (refused, nothing written) so a script that retries on failure can tell the
 * two apart (code-auditor review, 2026-11-03). Pending Alex's ruling on the exit-code contract.
 */
const APPLIED_UNCONFIRMED_EXIT = 5;

/**
 * Minimal runtime schema for the JSON input accepted by `ulu runs update`.
 *
 * Mirrors the shape of `AgentInput` from @uluops/ops-sdk but stays
 * intentionally loose — the canonical authority is the API. We validate just
 * enough to fail fast at the CLI on obvious malformed input (wrong types,
 * empty agent name) rather than passing untyped data through.
 */
const RunsUpdateAgentInputSchema = z
  .object({
    name: z.string().min(1),
    score: z.number().min(0).max(100).optional().nullable(),
    maxScore: z.number().min(0).max(100).optional(),
    decision: z.string().min(1),
    summary: z.string().optional(),
    model: z.string().optional(),
    durationMs: z.number().int().nonnegative().optional(),
    definitionVersion: z.string().optional(),
  })
  .passthrough();

/**
 * Analysis entries are checked here only as objects in arrays within the server's count caps
 * (100 records, 20 summaries): ops-sdk's update path validates each entry strictly before
 * sending, and the server judges the rest. An update is refused WHOLE if any entry is invalid,
 * unlike a save (spec analysis-never-loses-the-run §3.7).
 */
const AnalysisEntryInputSchema = z.record(z.string(), z.unknown());

const RunsUpdateJsonInputSchema = z.object({
  agents: z.array(RunsUpdateAgentInputSchema).optional(),
  analysisRecords: z
    .array(AnalysisEntryInputSchema)
    .max(
      100,
      'at most 100 analysis_records per update: split the file and send the later parts with --record-mode merge (replace would retire the earlier parts)',
    )
    .optional(),
  analysisSummary: z
    .union([
      AnalysisEntryInputSchema,
      z
        .array(AnalysisEntryInputSchema)
        .max(20, 'at most 20 analysis_summary entries per update'),
    ])
    .optional(),
  recordWriteMode: z.enum(['replace', 'merge']).optional(),
});

/**
 * The file's top-level keys in camelCase, so a `runs save` input (`analysis_records`,
 * `analysis_summary`, `record_write_mode`) can be reused as it is. The analysis entries are
 * camelCased all the way down, as `runs save` does and the server does again on receipt;
 * `agents` keeps its keys exactly as before 0.46.0 (the update path's token fields differ from
 * the save path's, and this change is not the place to alter them).
 */
function normalizeUpdateInput(raw: unknown): unknown {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const k = toCamelCase(key);
    out[k] =
      k === 'analysisRecords' || k === 'analysisSummary'
        ? normalizeKeys(value)
        : value;
  }
  return out;
}

/** Print the server's per-agent plan for an analysis update (POST /runs/update-preview). */
function printUpdatePreview(plan: RunUpdatePreview): void {
  console.log(
    `Update preview (record mode: ${plan.recordMode}) — nothing written`,
  );
  const agents = Object.entries(plan.byAgent);
  if (agents.length === 0) {
    console.log('  (no agents named in the analysis)');
    return;
  }
  for (const [agent, a] of agents) {
    console.log(
      `  ${stripAnsi(agent)}: create ${a.wouldCreateRecords} records, ${a.wouldCreateSummaries} summaries; supersede ${a.wouldSupersedeRecords} records, ${a.wouldSupersedeSummaries} summaries; retire ${a.wouldRetireRecordIds.length} records`,
    );
    for (const id of a.wouldRetireRecordIds) {
      console.log(`    retire: ${stripAnsi(id)}`);
    }
  }
}

/**
 * Register run commands
 */
export function registerRunCommands(program: Command): void {
  const runs = program
    .command('runs')
    .alias('r')
    .description('Manage validation runs')
    .addHelpText(
      'after',
      `
Examples:
  $ ulu runs list ops-sdk
  $ ulu runs latest ops-sdk
  $ ulu runs get abc12345
  $ ulu runs details ops-sdk -n 42
  $ ulu runs save --file results.json --project ops-sdk
`,
    );

  // ulu runs list [project]
  runs
    .command('list <project>')
    .description('List runs for a project')
    .option('-w, --workflow <type>', 'Filter by workflow type')
    .option('-l, --limit <number>', 'Maximum number of runs to return', '20')
    .action(async (projectArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const project = resolveProject(projectArg);
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching runs...', failure: 'Failed to fetch runs' },
          () =>
            // ops-sdk 6.0.0 (T13): the list envelope is {data, total}; this
            // command's table wants the rows.
            ctx.client.runs
              .listByProject(project, {
                workflowType: options.workflow,
                limit: parseIntOption(options.limit, '--limit'),
              })
              .then((r) => r.data),
        );

        if (ctx.json) {
          emitJson(ctx, data, 'run.list');
        } else if (data.length === 0) {
          console.log('No runs found');
        } else {
          console.log(formatRuns(data));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs get <runId>
  runs
    .command('get <runId>')
    .description('Get run details by ID or UUID')
    .action(async (runId: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const run = await withSpinner(
          ctx,
          { start: 'Fetching run...', failure: 'Failed to fetch run' },
          () => ctx.client.runs.get(runId),
        );

        if (ctx.json) {
          emitJson(ctx, run, 'run.get');
        } else {
          console.log(formatRun(run));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs latest [project]
  runs
    .command('latest [project]')
    .description('Get the latest run for a project')
    .option('-w, --workflow <type>', 'Filter by workflow type')
    .action(async (projectArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const project = resolveProject(projectArg);
      const ctx = createOpsContext(globalOpts);

      try {
        const run = await withSpinner(
          ctx,
          {
            start: 'Fetching latest run...',
            failure: 'Failed to fetch latest run',
          },
          () => ctx.client.runs.getLatest(project, options.workflow),
        );

        if (ctx.json) {
          emitJson(ctx, run, 'run.latest');
        } else {
          console.log(formatRun(run));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs details [project]
  runs
    .command('details <project>')
    .description(
      'Get detailed run information including agents and recommendations',
    )
    .option('-n, --number <number>', 'Run number (defaults to latest)')
    .action(async (projectArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const project = resolveProject(projectArg);
      const ctx = createOpsContext(globalOpts);

      try {
        const runNumber = options.number
          ? parseIntOption(options.number, '--number')
          : undefined;
        const details = await withSpinner(
          ctx,
          {
            start: 'Fetching run details...',
            failure: 'Failed to fetch run details',
          },
          () => ctx.client.runs.getDetails(project, runNumber),
        );

        if (ctx.json) {
          emitJson(ctx, details, 'run.details');
        } else {
          console.log(
            `Run #${details.run.runNumber} - ${details.run.workflowType}`,
          );
          console.log(`Score: ${details.run.averageScore?.toFixed(1) ?? '-'}`);
          console.log(
            `Passed: ${details.run.allGatesPassed === null ? 'N/A' : details.run.allGatesPassed ? 'Yes' : 'No'}`,
          );
          console.log('');

          if (details.agents.length > 0) {
            console.log('Agents:');
            for (const v of details.agents) {
              const marker = v.decision === 'PASS' ? '\u2713' : '\u2717';
              // Scoreless agents (generators, executors) have null score/maxScore.
              const scoreDisplay =
                v.score == null
                  ? '\u2014'
                  : `${v.score}/${v.maxScore ?? '\u2014'}`;
              console.log(
                `  ${marker} ${v.name}: ${scoreDisplay} (${v.decision})`,
              );
            }
          }

          if (details.recommendations.length > 0) {
            console.log('\nRecommendations:');
            for (const r of details.recommendations.slice(0, 10)) {
              console.log(`  - ${r.title}`);
              console.log(`    ${r.priority} from ${r.agent}`);
            }
            if (details.recommendations.length > 10) {
              console.log(
                `\n  ... and ${details.recommendations.length - 10} more`,
              );
            }
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs save
  runs
    .command('save')
    .description('Save a validation run')
    .option('-f, --file <path>', 'JSON file containing run data')
    .option('--stdin', 'Read JSON from stdin (auto-detected when piping)')
    .option('-p, --project <name>', 'Override project name in input')
    .option('-w, --workflow <type>', 'Override workflow type in input')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      // Auto-detect piped stdin (isTTY is false when piping, undefined in non-TTY contexts like tests)
      if (!options.file && !options.stdin && process.stdin.isTTY === false) {
        options.stdin = true;
      }
      if (!options.file && !options.stdin) {
        exitWithError(
          'Either --file or --stdin is required (or pipe data to stdin)',
        );
      }

      try {
        // Read, normalize (snake_case → camelCase), and parse input
        const input = normalizeKeys(
          await readJsonInput(options),
        ) as SaveRunInput;

        // Apply overrides
        if (options.project) input.project = options.project;
        if (options.workflow) input.workflowType = options.workflow;

        // Validate required fields
        if (!input.project) {
          exitWithError(
            'Missing required field: project (or snake_case: project)',
          );
        }
        if (!input.workflowType) {
          exitWithError(
            'Missing required field: workflowType (or snake_case: workflow_type)',
          );
        }
        if (!Array.isArray(input.agents)) {
          exitWithError('Missing required field: agents (must be an array)');
        }
        // A run with no findings is valid — default to an empty list rather than
        // failing server-side validation with an opaque "expected array,
        // received undefined" error.
        if (input.recommendations === undefined) {
          input.recommendations = [];
        }

        const result = await withSpinner(
          ctx,
          {
            start: 'Saving run...',
            success: 'Run saved',
            failure: 'Failed to save run',
          },
          () => ctx.client.runs.save(input),
        );

        if (ctx.json) {
          emitJson(ctx, result, 'run.save');
          // stdout stays the JSON contract; the rejection also goes to stderr, so a caller that
          // reads only `.run` still sees it (perverse-outcome review P2).
          for (const line of formatAnalysisRejections(
            result.analysisWrite?.rejected,
            {
              run: { project: input.project, runNumber: result.run.runNumber },
              replay: result.deduplicated === true,
            },
          )) {
            console.error(line);
          }
        } else {
          console.log(`Run #${result.run.runNumber} saved successfully`);
          // The server keeps the run and rejects an invalid agent's analysis as a unit
          // (ops-api R2). Say so here, or the line above reads as a clean save.
          for (const line of formatAnalysisRejections(
            result.analysisWrite?.rejected,
            {
              run: { project: input.project, runNumber: result.run.runNumber },
              replay: result.deduplicated === true,
            },
          )) {
            console.log(line);
          }
          // Where it landed — the API's answer (the echo's orgSlug), not the flag;
          // beside the base URL because a slug is server-relative (spec 2.4, F-6).
          console.log(
            `Org: ${result.run.orgSlug ?? ctx.org ?? 'personal'}  (${ctx.orgSource}${ctx.org && result.run.orgSlug && ctx.org !== result.run.orgSlug ? ', API answered differently' : ''})  ·  ${ctx.baseUrl}`,
          );
          console.log('');
          console.log('Correlation:');
          // correlation is nullable since ops-sdk 5.7.0: null means the counts
          // were never persisted (dedup replay of a pre-counts run), not zero.
          const correlation = result.correlation;
          if (correlation == null) {
            console.log(
              '  (counts unavailable — replay of a run saved before correlation counts were persisted)',
            );
          } else {
            console.log(
              `  New issues: ${getFlexibleProperty(correlation, 'newIssues', 0)}`,
            );
            console.log(
              `  Recurring: ${getFlexibleProperty(correlation, 'recurringIssues', 0)}`,
            );
            console.log(
              `  Regressions: ${getFlexibleProperty(correlation, 'regressions', 0)}`,
            );
          }
          if (result.deduplicated) {
            console.log(
              '\n(Deduplicated: run with same idempotency key already existed)',
            );
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs validate
  runs
    .command('validate')
    .description('Validate run input without saving (dry run)')
    .option('-f, --file <path>', 'JSON file containing run data')
    .option('--stdin', 'Read JSON from stdin (auto-detected when piping)')
    .option('-p, --project <name>', 'Override project name in input')
    .option('-w, --workflow <type>', 'Override workflow type in input')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      // Auto-detect piped stdin (isTTY is false when piping, undefined in non-TTY contexts like tests)
      if (!options.file && !options.stdin && process.stdin.isTTY === false) {
        options.stdin = true;
      }
      if (!options.file && !options.stdin) {
        exitWithError(
          'Either --file or --stdin is required (or pipe data to stdin)',
        );
      }

      try {
        // Read, normalize (snake_case → camelCase), and parse input
        const input = normalizeKeys(
          await readJsonInput(options),
        ) as SaveRunInput;

        // Apply overrides
        if (options.project) input.project = options.project;
        if (options.workflow) input.workflowType = options.workflow;

        // Validate required fields (same guards as save path)
        if (!input.project) {
          exitWithError(
            'Missing required field: project (or snake_case: project)',
          );
        }
        if (!input.workflowType) {
          exitWithError(
            'Missing required field: workflowType (or snake_case: workflow_type)',
          );
        }
        // Same default as the save path: a run with no findings is valid. Without it, validate
        // refused ("recommendations: expected array, received undefined") the input that
        // `runs save` accepts, so the dry run disagreed with the save it previews.
        if (input.recommendations === undefined) {
          input.recommendations = [];
        }

        const result = await withSpinner(
          ctx,
          {
            start: 'Validating...',
            success: 'Validation complete',
            failure: 'Validation failed',
          },
          () => ctx.client.runs.validate(input),
        );

        if (ctx.json) {
          emitJson(ctx, result, 'run.validate');
          for (const line of formatAnalysisRejections(result.wouldReject, {
            mode: 'would',
          })) {
            console.error(line);
          }
        } else {
          const wouldCreate = getFlexibleProperty(result, 'wouldCreate', false);
          const wouldUpdate = getFlexibleProperty(result, 'wouldUpdate', false);
          const wouldRegress = getFlexibleProperty(
            result,
            'wouldRegress',
            false,
          );
          const validationErrors = getFlexibleProperty<string[]>(
            result,
            'validationErrors',
            [],
          );
          const preview = getFlexibleProperty<
            Record<string, unknown> | undefined
          >(result, 'preview', undefined);

          console.log('Validation Preview:');
          console.log(`  Would create: ${wouldCreate ? 'Yes' : 'No'}`);
          console.log(`  Would update: ${wouldUpdate ? 'Yes' : 'No'}`);
          console.log(`  Would regress: ${wouldRegress ? 'Yes' : 'No'}`);

          if (validationErrors.length > 0) {
            console.log('\nValidation Errors:');
            for (const err of validationErrors) {
              console.log(`  - ${err}`);
            }
          }

          if (preview) {
            const newIssues = getFlexibleProperty<unknown[]>(
              preview,
              'newIssues',
              [],
            );
            const recurringIssues = getFlexibleProperty<unknown[]>(
              preview,
              'recurringIssues',
              [],
            );
            const regressions = getFlexibleProperty<unknown[]>(
              preview,
              'regressions',
              [],
            );
            console.log('\nCorrelation Preview:');
            console.log(`  New issues: ${newIssues.length}`);
            console.log(`  Recurring: ${recurringIssues.length}`);
            console.log(`  Regressions: ${regressions.length}`);
          }

          // The analysis a save of this input would reject (ops-api R2): the save keeps the run
          // and drops these agents' analysis, so this is the moment to fix them.
          const wouldReject = formatAnalysisRejections(result.wouldReject, {
            mode: 'would',
          });
          if (wouldReject.length > 0) {
            console.log('\nAnalysis:');
            for (const line of wouldReject) console.log(`  ${line}`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs diff [project]
  runs
    .command('diff [project]')
    .description(
      'Compare two runs by run number (shows score diff, new/resolved issues)',
    )
    .requiredOption('-b, --base <number>', 'Base run number')
    .requiredOption('-c, --compare <number>', 'Compare run number')
    .action(async (projectArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const project = resolveProject(projectArg);
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Comparing runs...', failure: 'Failed to compare runs' },
          () =>
            ctx.client.runs.diff({
              project,
              baseRun: parseIntOption(options.base, '--base'),
              compareRun: parseIntOption(options.compare, '--compare'),
            }),
        );

        if (ctx.json) {
          emitJson(ctx, result, 'run.diff');
        } else {
          console.log(`Comparing run #${options.base} → #${options.compare}\n`);

          if (result.fixed.length > 0) {
            console.log(`Fixed (${result.fixed.length}):`);
            for (const issue of result.fixed.slice(0, 5)) {
              console.log(`  \u2713 ${issue.title}`);
            }
            if (result.fixed.length > 5) {
              console.log(`  ... and ${result.fixed.length - 5} more`);
            }
          }

          if (result.new.length > 0) {
            console.log(`\nNew (${result.new.length}):`);
            for (const issue of result.new.slice(0, 5)) {
              console.log(`  + ${issue.title}`);
            }
            if (result.new.length > 5) {
              console.log(`  ... and ${result.new.length - 5} more`);
            }
          }

          if (result.unchanged.length > 0) {
            console.log(`\nUnchanged: ${result.unchanged.length} issues`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs archive [project]
  runs
    .command('archive <project>')
    .description('Archive old runs')
    .option('--before-run <number>', 'Archive runs before this run number')
    .option(
      '--before-date <date>',
      'Archive runs before this date (ISO format)',
    )
    .option('--keep-last <number>', 'Keep the last N runs')
    .option('--reason <text>', 'Reason for archiving')
    .action(async (projectArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const project = resolveProject(projectArg);
      const ctx = createOpsContext(globalOpts);

      if (!options.beforeRun && !options.beforeDate && !options.keepLast) {
        exitWithError(
          'One of --before-run, --before-date, or --keep-last is required',
        );
      }

      try {
        const result = await withSpinner(
          ctx,
          {
            start: 'Archiving runs...',
            success: 'Runs archived',
            failure: 'Failed to archive runs',
          },
          () =>
            ctx.client.runs.archive({
              project,
              beforeRunNumber: options.beforeRun
                ? parseIntOption(options.beforeRun, '--before-run')
                : undefined,
              beforeDate: options.beforeDate,
              keepLast: options.keepLast
                ? parseIntOption(options.keepLast, '--keep-last')
                : undefined,
              reason: options.reason,
            }),
        );

        if (ctx.json) {
          emitJson(ctx, result, 'run.archive');
        } else {
          console.log(`Archived ${result.archived} runs`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu runs update [project]
  runs
    .command('update <project>')
    .description(
      'Update run metadata (scores, tokens) or repair its analysis, by project and run number',
    )
    .requiredOption('-n, --number <number>', 'Run number')
    .option('--score <number>', 'New average score')
    .option('--passed <boolean>', 'All gates passed (true/false)')
    .option(
      '-f, --file <path>',
      'JSON file with agent updates and/or analysis (analysis_records, analysis_summary)',
    )
    .option('--stdin', 'Read the JSON from stdin')
    .option(
      '--record-mode <mode>',
      'How analysis records are written: replace (default) or merge',
    )
    .option(
      '--preview',
      'Show what the analysis update would create, supersede and retire; write nothing',
    )
    // Not `-y/--yes`: elsewhere in this cli that means "skip confirmation", and a caller that
    // appends it by reflex would retire records it never looked at (perverse-outcome review P3;
    // Alex 2026-11-03: named for what it permits, no short alias).
    .option(
      '--allow-retire',
      'Write a replace-mode update even when it retires records the file leaves out (they are listed after the write)',
    )
    .addHelpText(
      'after',
      `
Analysis repair (a save that printed "Analysis rejected for <agent>"):
  Put each rejected agent's COMPLETE records and summary in a file, using the
  \`runs save\` field names (analysis_records, analysis_summary). Include only
  the rejected agents: no agents[], nothing for agents whose analysis was stored.
  Use the run the save printed (after exec: the Dashboard link), not runs latest.

  $ ulu runs update ops-sdk -n 42 --file fix.json --preview   # nothing written
  $ ulu runs update ops-sdk -n 42 --file fix.json

  Records are written per agent. replace (the default) supersedes the named
  agents' records and RETIRES any record of theirs the file leaves out; every
  analysis write is previewed first, and one that would retire records is
  refused unless --allow-retire (the ids are listed either way). merge
  supersedes only the record ids sent and retires nothing. Summaries always
  replace. Unlike a save, an update is refused whole if any entry is invalid.
  At most 100 records and 20 summaries per update; send a larger set in parts
  with --record-mode merge. Exit 5: the write was applied but not confirmed;
  do not retry. Field reference: README, "Repairing rejected analysis".
`,
    )
    .action(async (projectArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const project = resolveProject(projectArg);
      const ctx = createOpsContext(globalOpts);

      try {
        const input: UpdateRunByNumberInput = {
          project,
          runNumber: parseIntOption(options.number, '--number'),
        };

        if (options.score !== undefined)
          input.averageScore = parseFloatOption(options.score, '--score');
        if (options.passed !== undefined)
          input.allGatesPassed = options.passed === 'true';

        // Read agent updates / analysis from file or stdin if provided.
        // The schema is a lightweight surface guard; the SDK validates analysis
        // entries strictly and the API performs the rest. We fail fast on
        // obvious type errors so users see "wrong shape" before a round-trip.
        if (options.file || options.stdin) {
          const raw = normalizeUpdateInput(await readJsonInput(options));
          const parsed = RunsUpdateJsonInputSchema.safeParse(raw);
          if (!parsed.success) {
            exitWithError(
              `Invalid JSON input for runs update:\n${z.prettifyError(parsed.error)}`,
            );
          }
          if (parsed.data.agents) {
            input.agents = parsed.data
              .agents as UpdateRunByNumberInput['agents'];
          }
          if (parsed.data.analysisRecords) {
            input.analysisRecords = parsed.data
              .analysisRecords as unknown as UpdateRunByNumberInput['analysisRecords'];
          }
          if (parsed.data.analysisSummary) {
            input.analysisSummary = parsed.data
              .analysisSummary as unknown as UpdateRunByNumberInput['analysisSummary'];
          }
          if (parsed.data.recordWriteMode) {
            input.recordWriteMode = parsed.data.recordWriteMode;
          }
        }

        if (options.recordMode !== undefined) {
          if (
            options.recordMode !== 'replace' &&
            options.recordMode !== 'merge'
          ) {
            exitWithError('--record-mode must be replace or merge');
          }
          input.recordWriteMode = options.recordMode;
        }

        const hasAnalysis =
          input.analysisRecords !== undefined ||
          input.analysisSummary !== undefined;
        // The server answers a mode without records with a named 400; say it here instead.
        if (input.recordWriteMode !== undefined && !input.analysisRecords) {
          exitWithError(
            'A record write mode needs analysis_records in the input (summaries have no mode).',
          );
        }

        const previewInput = (): UpdateRunPreviewByNumberInput => ({
          project: input.project,
          runNumber: input.runNumber,
          ...(input.analysisRecords && {
            analysisRecords: input.analysisRecords,
          }),
          ...(input.analysisSummary && {
            analysisSummary: input.analysisSummary,
          }),
          ...(input.recordWriteMode && {
            recordWriteMode: input.recordWriteMode,
          }),
        });

        if (options.preview) {
          if (
            input.agents ||
            input.averageScore !== undefined ||
            input.allGatesPassed !== undefined
          ) {
            exitWithError(
              '--preview shows analysis writes only: drop --score, --passed and agents, and run the metadata update without --preview. See `ulu runs update --help`.',
            );
          }
          if (!hasAnalysis) {
            exitWithError(
              '--preview needs analysis_records or analysis_summary in --file/--stdin (it previews analysis writes only). See `ulu runs update --help`.',
            );
          }
          const plan = await withSpinner(
            ctx,
            {
              start: 'Previewing update...',
              success: 'Preview ready',
              failure: 'Preview failed',
            },
            () => ctx.client.runs.previewUpdate(previewInput()),
          );
          if (ctx.json) emitJson(ctx, plan, 'run.updatePreview');
          else printUpdatePreview(plan);
          return;
        }

        if (!hasAnalysis) {
          const run = await withSpinner(
            ctx,
            {
              start: 'Updating run...',
              success: 'Run updated',
              failure: 'Failed to update run',
            },
            () => ctx.client.runs.update(input),
          );
          if (ctx.json) emitJson(ctx, run, 'run.update');
          else console.log(formatRun(run));
          return;
        }

        // Every analysis write is previewed first (read-only). Two reasons:
        // 1. A replace-mode records write retires every record of a named agent that the file
        //    leaves out. Repairing a rejected agent retires nothing (none of its rows were
        //    stored), but the same command on an agent that has rows retires analysis by
        //    omission, so the preview names the ids, and the write is refused unless
        //    --allow-retire. With it, the ids are printed after the write: never silent.
        // 2. ops-sdk checks the preview's echoed mode (`preview-mode-mismatch`). A server that
        //    ignored --record-mode would run a merge as a replace; caught here, nothing has been
        //    written yet (code-auditor review, 2026-11-03: merge used to skip this).
        const plan = await ctx.client.runs.previewUpdate(previewInput());
        const retiring = Object.entries(plan.byAgent)
          .filter(([, a]) => a.wouldRetireRecordIds.length > 0)
          .map(([agent, a]) => [agent, a.wouldRetireRecordIds] as const);
        const retireList = retiring
          .map(
            ([agent, ids]) =>
              `  ${stripAnsi(agent)}: ${ids.map((id) => stripAnsi(id)).join(', ')}`,
          )
          .join('\n');
        if (retiring.length > 0 && !options.allowRetire) {
          const message =
            'This replace-mode update would retire records of these agents that the file leaves out. Nothing was written.';
          if (ctx.json) {
            console.error(
              JSON.stringify(
                {
                  code: 'WOULD_RETIRE_RECORDS',
                  applied: false,
                  message,
                  wouldRetireRecordIds: Object.fromEntries(retiring),
                },
                null,
                2,
              ),
            );
            process.exit(1);
          }
          exitWithError(
            `${message}\n${retireList}\nChoose one:\n` +
              "  - add those records to the file, so it carries each named agent's complete set;\n" +
              '  - --record-mode merge: supersedes only the record_ids sent and keeps the rest live (a record whose id you changed stays live beside its new version);\n' +
              '  - --allow-retire: retire them (they stop being live analysis; only superseded-history reads still show them).',
          );
        }

        const result = await withSpinner(
          ctx,
          {
            start: 'Updating run...',
            success: 'Run updated',
            failure: 'Failed to update run',
          },
          () => ctx.client.runs.updateWithEcho(input),
        );

        if (ctx.json) {
          emitJson(
            ctx,
            { ...result, retiredRecordIds: Object.fromEntries(retiring) },
            'run.updateAnalysis',
          );
        } else {
          console.log(formatRun(result.run));
          const w = result.analysisWrite;
          if (w) {
            console.log('');
            console.log(
              `Analysis (${w.recordMode}): created ${w.createdRecords} records, ${w.createdSummaries} summaries; superseded ${w.supersededRecords} records, ${w.supersededSummaries} summaries`,
            );
          }
          if (retiring.length > 0) {
            console.log(`Retired (--allow-retire):\n${retireList}`);
          }
        }
      } catch (error) {
        if (error instanceof AnalysisEchoMismatchError) {
          // From a PREVIEW (ours runs before every analysis write): read-only, nothing written.
          if (error.reason === 'preview-mode-mismatch') {
            const message = `Nothing was written: the server answered a ${error.expectedRecordMode} preview as ${error.actualRecordMode ?? 'no mode'}, so it would not run this update as requested. The tracker this cli talks to may predate record write modes.`;
            if (ctx.json) {
              console.error(
                JSON.stringify(
                  {
                    code: 'ANALYSIS_ECHO_MISMATCH',
                    applied: false,
                    reason: error.reason,
                    message,
                  },
                  null,
                  2,
                ),
              );
              process.exit(1);
            }
            exitWithError(message);
          }
          // From the WRITE: it landed, but its echo did not match what was sent. A retry would
          // apply it again (workspace rule; ops-sdk 5.18.0). The SDK's own message says what may
          // have happened to the records (e.g. "RECORDS MAY HAVE BEEN RETIRED" on a merge the
          // server ran as replace), so it is printed, not paraphrased.
          const message = `The update was applied, but the server's analysis echo did not match the request (${error.reason}). Do not run it again; check the run with \`ulu runs details ${project} -n ${options.number}\`.`;
          if (ctx.json) {
            console.error(
              JSON.stringify(
                {
                  code: 'ANALYSIS_ECHO_MISMATCH',
                  applied: true,
                  reason: error.reason,
                  message,
                  sdkMessage: error.message,
                  run: error.run,
                  analysisWrite: error.analysisWrite,
                },
                null,
                2,
              ),
            );
            process.exit(APPLIED_UNCONFIRMED_EXIT);
          }
          console.error(`Error: ${message}`);
          console.error(stripAnsi(error.message));
          process.exit(APPLIED_UNCONFIRMED_EXIT);
        }
        handleOpsError(error, ctx);
      }
    });

  // ulu runs delete <runId>
  runs
    .command('delete <runId>')
    .description('Delete a run by ID (fails if run has linked issues)')
    .option('-y, --yes', 'Skip confirmation')
    .action(async (runId: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      await confirmOrExit(
        `Permanently delete run ${runId} in org ${ctx.org ?? 'personal'} (${ctx.orgSource}) at ${ctx.baseUrl}?`,
        options.yes,
      );

      try {
        await withSpinner(
          ctx,
          {
            start: 'Deleting run...',
            success: 'Run deleted',
            failure: 'Failed to delete run',
          },
          () => ctx.client.runs.delete(runId),
        );

        if (ctx.json) {
          emitJson(ctx, { success: true, runId }, 'run.delete');
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
