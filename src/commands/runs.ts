import type { SaveRunInput, UpdateRunByNumberInput } from '@uluops/ops-sdk';
import type { Command } from 'commander';
import { z } from 'zod';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import { formatRun, formatRuns } from '../formatters/ops.js';
import {
  confirmOrExit,
  exitWithError,
  getFlexibleProperty,
  normalizeKeys,
  parseFloatOption,
  parseIntOption,
  readJsonInput,
  resolveProject,
  withSpinner,
} from '../utils.js';

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

const RunsUpdateJsonInputSchema = z.object({
  agents: z.array(RunsUpdateAgentInputSchema).optional(),
});

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
    .command('list [project]')
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
            ctx.client.runs.listByProject(project, {
              workflowType: options.workflow,
              limit: parseIntOption(options.limit, '--limit'),
            }),
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
    .command('details [project]')
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
          console.log(`Passed: ${details.run.allGatesPassed ? 'Yes' : 'No'}`);
          console.log('');

          if (details.agents.length > 0) {
            console.log('Agents:');
            for (const v of details.agents) {
              const marker = v.decision === 'PASS' ? '\u2713' : '\u2717';
              console.log(
                `  ${marker} ${v.name}: ${v.score}/${v.maxScore ?? 100} (${v.decision})`,
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
        } else {
          console.log(`Run #${result.run.runNumber} saved successfully`);
          console.log('');
          console.log('Correlation:');
          console.log(
            `  New issues: ${getFlexibleProperty(result.correlation, 'newIssues', 0)}`,
          );
          console.log(
            `  Recurring: ${getFlexibleProperty(result.correlation, 'recurringIssues', 0)}`,
          );
          console.log(
            `  Regressions: ${getFlexibleProperty(result.correlation, 'regressions', 0)}`,
          );
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
    .command('archive [project]')
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
    .command('update [project]')
    .description(
      'Update run metadata (scores, tokens) by project and run number',
    )
    .requiredOption('-n, --number <number>', 'Run number')
    .option('--score <number>', 'New average score')
    .option('--passed <boolean>', 'All gates passed (true/false)')
    .option('-f, --file <path>', 'JSON file with agent updates')
    .option('--stdin', 'Read agent updates from stdin')
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

        // Read agent updates from file/stdin if provided.
        // The schema is a lightweight surface guard; the API performs strict
        // validation. We fail fast on obvious type errors so users see "wrong
        // shape" before a network round-trip.
        if (options.file || options.stdin) {
          const raw = await readJsonInput(options);
          const parsed = RunsUpdateJsonInputSchema.safeParse(raw);
          if (!parsed.success) {
            exitWithError(
              `Invalid JSON input for runs update: ${parsed.error.message}`,
            );
          }
          if (parsed.data.agents) {
            input.agents = parsed.data
              .agents as UpdateRunByNumberInput['agents'];
          }
        }

        const run = await withSpinner(
          ctx,
          {
            start: 'Updating run...',
            success: 'Run updated',
            failure: 'Failed to update run',
          },
          () => ctx.client.runs.update(input),
        );

        if (ctx.json) {
          emitJson(ctx, run, 'run.update');
        } else {
          console.log(formatRun(run));
        }
      } catch (error) {
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

      await confirmOrExit(`Permanently delete run ${runId}?`, options.yes);

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
