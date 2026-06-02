import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, resolve } from 'node:path';
import type {
  AgentResult,
  DefinitionType,
  ExecutionOptions,
} from '@uluops/core';
import type { Command } from 'commander';
import {
  type CoreExecOptions,
  createCoreContext,
  type GlobalOptions,
  handleCoreError,
} from '../context.js';
import {
  formatAgentResult,
  formatDefinitionDetails,
  formatDefinitionList,
  formatExecutionResult,
} from '../formatters/core.js';
import { parseFloatOption, parseIntOption, withSpinner } from '../utils.js';

type ExecOptions = GlobalOptions &
  CoreExecOptions & { safetyWarnings?: boolean };

/**
 * Get merged options from the exec parent command and the subcommand
 */
function getMergedOptions(cmd: Command): ExecOptions {
  // Commander nests parent options — walk up to get them.
  // Each opts() returns Record<string, unknown>; we read fields by name
  // rather than blindly asserting the merged shape.
  const parentOpts = cmd.parent?.opts() ?? {};
  const grandParentOpts = cmd.parent?.parent?.opts() ?? {};
  const merged = { ...grandParentOpts, ...parentOpts, ...cmd.opts() };
  return {
    apiKey: typeof merged.apiKey === 'string' ? merged.apiKey : undefined,
    profile: typeof merged.profile === 'string' ? merged.profile : undefined,
    baseUrl: typeof merged.baseUrl === 'string' ? merged.baseUrl : undefined,
    json: typeof merged.json === 'boolean' ? merged.json : undefined,
    debug: typeof merged.debug === 'boolean' ? merged.debug : undefined,
    quiet: typeof merged.quiet === 'boolean' ? merged.quiet : undefined,
    timeout: typeof merged.timeout === 'string' ? merged.timeout : undefined,
    localDefinitions:
      typeof merged.localDefinitions === 'string'
        ? merged.localDefinitions
        : undefined,
    registryUrl:
      typeof merged.registryUrl === 'string' ? merged.registryUrl : undefined,
    project: typeof merged.project === 'string' ? merged.project : undefined,
    tracking:
      typeof merged.tracking === 'boolean' ? merged.tracking : undefined,
    safetyWarnings:
      typeof merged.safetyWarnings === 'boolean'
        ? merged.safetyWarnings
        : undefined,
  } as ExecOptions;
}

/**
 * Warn when tracking is enabled but no project was specified.
 *
 * The core SDK silently infers a project name from `basename(resolve(target))`,
 * which creates phantom projects named after random target dirs (e.g., `src`,
 * `dist`). This helper surfaces the inference at the CLI layer so users can
 * either pass `--project <name>` or opt out with `--no-tracking`.
 *
 * Honors `ULUOPS_PROJECT` env as an implicit project setter and suppresses the
 * warning under `--quiet` or `--json`.
 *
 * @internal Exported for unit testing only.
 */
export function warnIfProjectInferred(
  options: ExecOptions,
  target: string | undefined,
): void {
  if (options.quiet || options.json) return;
  if (options.tracking === false) return;
  if (options.project) return;
  if (process.env['ULUOPS_PROJECT']) return;
  if (!target) return;
  const inferred = basename(resolve(target));
  console.error(
    `⚠️  No --project specified; tracking under inferred name "${inferred}". ` +
      `Pass --project <name> to set explicitly, or --no-tracking to skip submission.`,
  );
}

/**
 * Help text shown on every exec subcommand so users discover options that
 * Commander would otherwise hide because they're declared on the parent
 * `exec` command. Without this, `ulu exec agent --help` looks like agents
 * cannot be tracked or scoped to a project, which is the opposite of true.
 */
const EXEC_INHERITED_HELP = `
Inherited options (from \`ulu exec\`, must appear before the subcommand):
  --local-definitions <dir>  Local YAML definitions directory
  --registry-url <url>       Override registry URL
  --project <name>           Project name for result tracking
  --no-tracking              Disable validation service submission
  --no-safety-warnings       Suppress risk warnings and runtime advisories

Inherited global options (see \`ulu --help\`):
  --api-key, --profile, --base-url, --timeout, --json, --debug, -q/--quiet
`;

/** Read a string option from Commander's untyped opts record. */
function optString(
  opts: Record<string, unknown>,
  key: string,
): string | undefined {
  const v = opts[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Build ExecutionOptions from CLI flags
 */
function buildExecOptions(
  opts: Record<string, unknown>,
): ExecutionOptions | undefined {
  const execOpts: ExecutionOptions = {};
  let hasOptions = false;

  const model = optString(opts, 'model');
  if (model) {
    execOpts.model = model;
    hasOptions = true;
  }
  const maxTokens = optString(opts, 'maxTokens');
  if (maxTokens) {
    execOpts.maxTokens = parseIntOption(maxTokens, '--max-tokens');
    hasOptions = true;
  }
  if (opts.thresholdPass !== undefined) {
    execOpts.thresholds = {
      ...execOpts.thresholds,
      pass: Number(opts.thresholdPass),
    };
    hasOptions = true;
  }
  if (opts.thresholdWarn !== undefined) {
    execOpts.thresholds = {
      ...execOpts.thresholds,
      warn: Number(opts.thresholdWarn),
    };
    hasOptions = true;
  }
  const project = optString(opts, 'project');
  if (project) {
    execOpts.project = project;
    hasOptions = true;
  }
  if (opts.tracking === false) {
    execOpts.trackResults = false;
    hasOptions = true;
  }
  const temperature = optString(opts, 'temperature');
  if (temperature !== undefined) {
    execOpts.temperature = parseFloatOption(temperature, '--temperature');
    hasOptions = true;
  }
  const maxSteps = optString(opts, 'maxSteps');
  if (maxSteps) {
    execOpts.maxSteps = parseIntOption(maxSteps, '--max-steps');
    hasOptions = true;
  }
  const execTimeout = optString(opts, 'execTimeout');
  if (execTimeout) {
    execOpts.timeoutMs = parseIntOption(execTimeout, '--exec-timeout');
    hasOptions = true;
  }

  return hasOptions ? execOpts : undefined;
}

/**
 * Steering directive prepended to the operator prompt when `--report` is set.
 *
 * Announces report mode to the agent and asks it to compose a publication-quality
 * artifact in the form appropriate to its cognitive lens. The directive is
 * lens-agnostic by design — it does not specify sections, headings, or length.
 *
 * The `\`\`\`json analysis` fence marker is contract-bound to the regex in
 * `@uluops/core`'s AnalysisSummaryExtractor.parseAnalysisBlock, which prefers
 * the discriminated form over plain ```json so that illustrative `\`\`\`json`
 * blocks in the prose body cannot accidentally claim the canonical match.
 *
 * @internal Exported for unit testing only.
 */
export const REPORT_MODE_DIRECTIVE = `[Report mode]
This invocation is producing a human-readable report alongside the standard
structured findings. Compose your output as a publication-quality artifact in
the form appropriate to your cognitive lens — prose, narrative, structured
sections, dialectical passages, or whatever shape best conveys your analysis
to a human reader.

The structured JSON block your output contract requires must still be present
(it is consumed by the tracker and by downstream parsers). Emit it ONCE, at
the end of the report, using the fence marker \`\`\`json analysis (with the
word "analysis" after \`json\`, separated by a single space) so that any
illustrative \`\`\`json examples appearing earlier in the prose are not
mistaken for the canonical block. Everything before the \`\`\`json analysis
fence is the report itself; everything inside it is the structured payload.

Length should be governed by the substance of what you have to say, not by a
target. Brief is fine if the analysis is brief; long is fine if the analysis
is long.`;

/**
 * If --report is set, prepend the report-mode directive to the operator prompt.
 * Otherwise, return the prompt unchanged.
 *
 * Composition rule: the directive goes first so it frames whatever the operator
 * said. Operators may want to add their own lens-specific guidance ("focus on
 * type safety"); the report-mode signal must reach the agent regardless.
 *
 * @internal Exported for unit testing only.
 */
export function applyReportModeDirective(
  prompt: string | undefined,
  reportRequested: boolean,
): string | undefined {
  if (!reportRequested) return prompt;
  if (!prompt) return REPORT_MODE_DIRECTIVE;
  return `${REPORT_MODE_DIRECTIVE}\n\n${prompt}`;
}

/**
 * Resolve the report output path from CLI flags.
 *
 * Precedence:
 *   1. `-o, --output <path>` (explicit override)
 *   2. `--report <path>` (the optional positional argument on --report)
 *   3. cwd default: ./<agent-name>-report-<YYYYMMDDTHHmmss>.md
 *
 * Returns null when --report is not set.
 *
 * @internal Exported for unit testing only.
 */
export function resolveReportPath(
  result: AgentResult,
  opts: Record<string, unknown>,
): string | null {
  if (opts.report === undefined) return null;

  // Explicit -o/--output wins.
  if (typeof opts.output === 'string' && opts.output.length > 0) {
    return resolve(opts.output);
  }

  // --report <path> — Commander gives the string here.
  if (typeof opts.report === 'string' && opts.report.length > 0) {
    return resolve(opts.report);
  }

  // --report with no argument — derive a cwd-relative default.
  // ISO 8601 basic format: YYYYMMDDTHHmmss (no separators except T).
  const ts = new Date()
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d+Z$/, '');
  const safeName = result.name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  return resolve(process.cwd(), `${safeName}-report-${ts}.md`);
}

/**
 * Write agent report and/or features list files if CLI flags are set.
 */
async function writeReportFiles(
  result: AgentResult,
  opts: Record<string, unknown>,
): Promise<void> {
  const reportPath = resolveReportPath(result, opts);
  if (reportPath) {
    if (result.rawOutput) {
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, result.rawOutput, 'utf-8');
      console.log(`Report written to ${reportPath}`);
    } else {
      console.log(
        'No raw output available to write (agent may have hit step limit)',
      );
    }
  }

  const featuresList = optString(opts, 'featuresList');
  if (featuresList) {
    const featuresPath = resolve(featuresList);
    const features = {
      agent: result.name,
      version: result.version,
      decision: result.decision,
      score:
        result.agentType === 'validator'
          ? (result as { score: number }).score
          : undefined,
      maxScore:
        result.agentType === 'validator'
          ? (result as { maxScore: number }).maxScore
          : undefined,
      recommendations: result.recommendations,
      metrics: {
        durationMs: result.durationMs,
        model: result.metrics.model,
        inputTokens: result.metrics.inputTokens,
        outputTokens: result.metrics.outputTokens,
        totalEffectiveTokens: result.metrics.totalEffectiveTokens,
      },
    };
    await mkdir(dirname(featuresPath), { recursive: true });
    await writeFile(featuresPath, JSON.stringify(features, null, 2), 'utf-8');
    console.log(`Features list written to ${featuresPath}`);
  }
}

/**
 * Register exec commands for core SDK execution
 */
export function registerExecCommands(program: Command): void {
  const exec = program
    .command('exec')
    .alias('x')
    .description('Execute agents, commands, workflows, and pipelines')
    .option('--local-definitions <dir>', 'Local YAML definitions directory')
    .option('--registry-url <url>', 'Override registry URL')
    .option('--project <name>', 'Project name for result tracking')
    .option('--no-tracking', 'Disable validation service submission')
    .option(
      '--no-safety-warnings',
      'Suppress risk warnings and runtime advisories',
    )
    .addHelpText(
      'after',
      `
Examples:
  $ ulu exec agent code-validator ./src
  $ ulu exec agent code-validator ./src --model sonnet --project my-project
  $ ulu exec agent wittgenstein-analyst ./docs --report               # cwd default path
  $ ulu exec agent wittgenstein-analyst ./docs --report -o ~/report.md
  $ ulu exec workflow ship ./src
  $ ulu exec pipeline foundations ./src
  $ ulu exec describe code-validator
`,
    );

  // ── exec run ────────────────────────────────────────────────────────────

  exec
    .command('run <name> <target>')
    .description(
      'Execute a definition by name against a target path (auto-detects type)',
    )
    .addHelpText('after', EXEC_INHERITED_HELP)
    .option(
      '-m, --model <model>',
      'Model override for all agents (alias, tier, or provider:modelId)',
    )
    .option(
      '-p, --prompt <text>',
      'Operator directive or context for the agent',
    )
    .action(
      async (
        name: string,
        target: string,
        cmdOpts: Record<string, unknown>,
        cmd: Command,
      ) => {
        const options = getMergedOptions(cmd);
        warnIfProjectInferred(options, target);
        const modelOverride = optString(cmdOpts, 'model');
        const prompt = optString(cmdOpts, 'prompt');
        const ctx = createCoreContext(options, modelOverride);

        try {
          const result = await withSpinner(
            ctx,
            {
              start: `Executing ${name} against ${target}...`,
              success: `Execution complete`,
              failure: `Execution failed`,
            },
            () => ctx.client.run(name, { target, prompt }),
          );

          if (ctx.json) {
            console.log(JSON.stringify(result, null, 2));
          } else if (result.type === 'agent') {
            console.log(formatAgentResult(result));
          } else {
            console.log(formatExecutionResult(result));
          }
        } catch (error) {
          handleCoreError(error, ctx);
        }
      },
    );

  // ── exec agent ──────────────────────────────────────────────────────────

  exec
    .command('agent <names...>')
    .description(
      'Execute one or more agent definitions (runs in parallel when multiple)',
    )
    .addHelpText('after', EXEC_INHERITED_HELP)
    .requiredOption('-t, --target <path>', 'Target directory to analyze')
    .option(
      '-m, --model <model>',
      'Model override (alias, tier, or provider:modelId)',
    )
    .option(
      '-c, --concurrency <n>',
      'Max concurrent agents for parallel execution (default: 5)',
    )
    .option('--max-tokens <n>', 'Maximum response tokens')
    .option('--max-steps <n>', 'Maximum tool loop iterations (default: 50)')
    .option('--temperature <n>', 'Generation temperature 0-1 (default: 0)')
    .option(
      '--exec-timeout <ms>',
      'Execution timeout in milliseconds (distinct from global --timeout for HTTP)',
    )
    .option('--threshold-pass <n>', 'Pass threshold score (agents)')
    .option('--threshold-warn <n>', 'Warning threshold score (agents)')
    .option(
      '--report [path]',
      'Write a publication-quality report to file (single agent only). ' +
        'If no path is given, defaults to ./<agent-name>-report-<timestamp>.md in cwd. ' +
        'Use -o/--output to override the destination explicitly.',
    )
    .option(
      '-o, --output <path>',
      'Explicit output path for --report (overrides the --report argument and the default).',
    )
    .option(
      '--features-list <path>',
      'Write structured features/recommendations to file (single agent only)',
    )
    .option(
      '-p, --prompt <text>',
      'Operator directive or context for the agent',
    )
    .action(
      async (
        names: string[],
        cmdOpts: Record<string, unknown>,
        cmd: Command,
      ) => {
        const options = getMergedOptions(cmd);
        const target: string = cmd.opts()['target'];
        warnIfProjectInferred(options, target);
        const ctx = createCoreContext(options);
        const execOpts = buildExecOptions({ ...cmdOpts, ...options });
        const prompt = optString(cmdOpts, 'prompt');
        const agentNames: string[] = names.filter(Boolean);

        // Single agent — show elapsed time during execution
        if (agentNames.length === 1) {
          const agentName = agentNames[0]!;
          // Report-mode prompt augmentation: gated INSIDE the single-agent branch
          // so it cannot leak into the multi-agent path (which neither writes a
          // report file nor benefits from the directive).
          const reportRequested = cmdOpts['report'] !== undefined;
          const effectivePrompt = applyReportModeDirective(
            prompt,
            reportRequested,
          );
          // Report mode forces no-tracking + signals the executor to disable
          // structured-output enforcement. The exclusivity is unconditional:
          // even if the operator explicitly passes --tracking, report mode wins.
          // See agent-reporting-spec-v0_1_1.md Phase 2 Formal Cause #2 and
          // Phase 4.4 for the rationale.
          let effectiveExecOpts: ExecutionOptions | undefined = execOpts;
          if (reportRequested) {
            effectiveExecOpts = {
              ...(effectiveExecOpts ?? {}),
              reportMode: true,
              trackResults: false,
            };
            if (!ctx.quiet) {
              console.error(
                'Report mode enabled — tracking disabled. ' +
                  'For tracker submission, run without --report.',
              );
            }
          }
          try {
            // Pre-execution safety check — show warning for flagged definitions
            const safetyWarnings = (options as ExecOptions).safetyWarnings;
            if (!ctx.quiet && !ctx.json && safetyWarnings !== false) {
              try {
                const details = await ctx.client.describe(agentName);
                if (details.riskProfile) {
                  const profile = details.riskProfile;
                  const sync = profile.sync as
                    | Record<string, unknown>
                    | undefined;
                  const signals = sync?.signals as
                    | Array<Record<string, unknown>>
                    | undefined;
                  const level = profile.aggregateRiskLevel as string;
                  if (
                    signals?.length &&
                    (level === 'medium' || level === 'high')
                  ) {
                    const firstSignal = signals[0]!;
                    console.error(
                      `\n  \u26A0\uFE0F  Risk signal: ${firstSignal.title as string}\n`,
                    );
                  }

                  // Runtime advisory: shell-capable agent targeting sensitive paths (R6)
                  const caps = sync?.capabilities as
                    | Record<string, unknown>
                    | undefined;
                  const tools = caps?.tools as string[] | undefined;
                  const hasShell = tools?.some((t: string) =>
                    /^bash$/i.test(t),
                  );
                  if (hasShell) {
                    const resolvedTarget = resolve(target);
                    const sensitivePatterns = [
                      /[/\\]\.ssh\b/,
                      /[/\\]\.aws\b/,
                      /[/\\]\.gnupg\b/,
                      /[/\\]\.kube\b/,
                      /[/\\]\.docker\b/,
                      /^\/etc\b/,
                      /[/\\]\.env\b/,
                    ];
                    const isSensitive = sensitivePatterns.some((p) =>
                      p.test(resolvedTarget),
                    );
                    if (isSensitive) {
                      console.error(
                        `  \u{1F6E1}\uFE0F  Advisory: shell-capable agent targeting sensitive path (${target})\n`,
                      );
                    }
                  }
                }
              } catch {
                // Non-fatal — proceed with execution even if describe fails
              }
            }

            const startTime = Date.now();
            let timer: ReturnType<typeof setInterval> | undefined;
            // Update spinner with elapsed time every 5s (long-running feedback)
            if (!ctx.quiet && !ctx.json) {
              timer = setInterval(() => {
                const elapsed = Math.round((Date.now() - startTime) / 1000);
                process.stderr.write(
                  `\r\x1b[K- Running ${agentName}... ${elapsed}s`,
                );
              }, 5000);
            }
            const result = await withSpinner(
              ctx,
              {
                start: `Running ${agentName}...`,
                success: `Agent execution complete`,
                failure: `Agent execution failed`,
              },
              () =>
                ctx.client.runAgent(
                  agentName,
                  { target, prompt: effectivePrompt },
                  effectiveExecOpts,
                ),
            ).finally(() => {
              if (timer) clearInterval(timer);
            });

            if (ctx.json) {
              console.log(JSON.stringify(result, null, 2));
            } else {
              console.log(formatAgentResult(result));
            }

            try {
              await writeReportFiles(result, cmdOpts);
            } catch (writeError) {
              const msg =
                writeError instanceof Error
                  ? writeError.message
                  : String(writeError);
              console.error(`\nWarning: Failed to write report files: ${msg}`);
            }
          } catch (error) {
            handleCoreError(error, ctx);
          }
          return;
        }

        // Multiple agents — run with concurrency limit
        const concurrencyOpt = optString(cmdOpts, 'concurrency');
        const maxConcurrency = concurrencyOpt
          ? parseIntOption(concurrencyOpt, '--concurrency')
          : 5;
        console.log(
          `Running ${agentNames.length} agents (concurrency: ${maxConcurrency}) against ${target}...\n`,
        );

        // Concurrency-limited execution pool
        const tasks = agentNames.map(
          (name) => () =>
            ctx.client
              .runAgent(name, { target, prompt }, execOpts)
              .then((result) => {
                if (!ctx.json) {
                  const marker =
                    result.decision === 'PASS' ||
                    result.decisionCategory === 'positive'
                      ? '\u2713'
                      : '\u2717';
                  const score =
                    result.score !== undefined ? ` ${result.score}` : '';
                  console.log(
                    `  ${marker} ${name}: ${result.decision}${score}`,
                  );
                }
                return { name, result };
              }),
        );
        const results: PromiseSettledResult<{
          name: string;
          result: AgentResult;
        }>[] = [];
        for (let i = 0; i < tasks.length; i += maxConcurrency) {
          const batch = tasks.slice(i, i + maxConcurrency).map((fn) => fn());
          const batchResults = await Promise.allSettled(batch);
          results.push(...batchResults);
        }

        const succeeded: AgentResult[] = [];
        const failed: { name: string; error: string }[] = [];

        for (let i = 0; i < results.length; i++) {
          const outcome = results[i]!;
          if (outcome.status === 'fulfilled') {
            succeeded.push(outcome.value.result);
          } else if (outcome.status === 'rejected') {
            const reason: unknown = outcome.reason;
            failed.push({
              name: agentNames[i] ?? 'unknown',
              error: reason instanceof Error ? reason.message : String(reason),
            });
          }
        }

        if (ctx.json) {
          console.log(JSON.stringify({ succeeded, failed }, null, 2));
        } else {
          for (const result of succeeded) {
            console.log('─'.repeat(60));
            console.log(formatAgentResult(result));
            console.log('');
          }

          if (failed.length > 0) {
            console.log('─'.repeat(60));
            console.log('Failed:');
            for (const f of failed) {
              console.log(`  ${f.name}: ${f.error}`);
            }
          }

          // Summary
          console.log('─'.repeat(60));
          const avgScore =
            succeeded.length > 0
              ? (
                  succeeded.reduce((sum, r) => sum + (r.score ?? 0), 0) /
                  succeeded.length
                ).toFixed(1)
              : '-';
          console.log(
            `\n${succeeded.length}/${agentNames.length} agents completed | Average score: ${avgScore}`,
          );
        }
      },
    );

  // ── exec command ────────────────────────────────────────────────────────

  exec
    .command('command <name> <target>')
    .addHelpText('after', EXEC_INHERITED_HELP)
    .description('Execute a saved command configuration')
    .option(
      '-m, --model <model>',
      'Model override (overrides command definition default)',
    )
    .option(
      '-p, --prompt <text>',
      'Operator directive or context for the agent',
    )
    .action(
      async (
        name: string,
        target: string,
        cmdOpts: Record<string, unknown>,
        cmd: Command,
      ) => {
        const options = getMergedOptions(cmd);
        warnIfProjectInferred(options, target);
        const ctx = createCoreContext(options);
        const modelOverride = optString(cmdOpts, 'model');
        const prompt = optString(cmdOpts, 'prompt');

        try {
          const result = await withSpinner(
            ctx,
            {
              start: `Running command ${name} against ${target}...`,
              success: `Command execution complete`,
              failure: `Command execution failed`,
            },
            () =>
              ctx.client.runCommand(
                name,
                { target, prompt },
                modelOverride ? { model: modelOverride } : undefined,
              ),
          );

          if (ctx.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatExecutionResult(result));
          }
        } catch (error) {
          handleCoreError(error, ctx);
        }
      },
    );

  // ── exec workflow ───────────────────────────────────────────────────────

  exec
    .command('workflow <name> <target>')
    .addHelpText('after', EXEC_INHERITED_HELP)
    .description('Execute a multi-phase workflow')
    .option(
      '-m, --model <model>',
      'Model override for all phases (alias, tier, or provider:modelId)',
    )
    .option(
      '-p, --prompt <text>',
      'Operator directive or context for the agent',
    )
    .action(
      async (
        name: string,
        target: string,
        cmdOpts: Record<string, unknown>,
        cmd: Command,
      ) => {
        const options = getMergedOptions(cmd);
        warnIfProjectInferred(options, target);
        const modelOverride = optString(cmdOpts, 'model');
        const prompt = optString(cmdOpts, 'prompt');
        const ctx = createCoreContext(options, modelOverride);

        try {
          const result = await withSpinner(
            ctx,
            {
              start: `Running workflow ${name} against ${target}...`,
              success: `Workflow execution complete`,
              failure: `Workflow execution failed`,
            },
            () => ctx.client.runWorkflow(name, { target, prompt }),
          );

          if (ctx.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatExecutionResult(result));
          }
        } catch (error) {
          handleCoreError(error, ctx);
        }
      },
    );

  // ── exec pipeline ──────────────────────────────────────────────────────

  exec
    .command('pipeline <name> <target>')
    .addHelpText('after', EXEC_INHERITED_HELP)
    .description('Execute a multi-stage pipeline')
    .option(
      '-m, --model <model>',
      'Model override for all stages (alias, tier, or provider:modelId)',
    )
    .option(
      '-p, --prompt <text>',
      'Operator directive or context for the agent',
    )
    .action(
      async (
        name: string,
        target: string,
        cmdOpts: Record<string, unknown>,
        cmd: Command,
      ) => {
        const options = getMergedOptions(cmd);
        warnIfProjectInferred(options, target);
        const modelOverride = optString(cmdOpts, 'model');
        const prompt = optString(cmdOpts, 'prompt');
        const ctx = createCoreContext(options, modelOverride);

        try {
          const result = await withSpinner(
            ctx,
            {
              start: `Running pipeline ${name} against ${target}...`,
              success: `Pipeline execution complete`,
              failure: `Pipeline execution failed`,
            },
            () => ctx.client.runPipeline(name, { target, prompt }),
          );

          if (ctx.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatExecutionResult(result));
          }
        } catch (error) {
          handleCoreError(error, ctx);
        }
      },
    );

  // ── exec list ───────────────────────────────────────────────────────────

  exec
    .command('list')
    .addHelpText('after', EXEC_INHERITED_HELP)
    .description('List available definitions')
    .option(
      '-t, --type <type>',
      'Filter by type (agent, command, workflow, pipeline)',
    )
    .option('-d, --domain <domain>', 'Filter by domain')
    .action(
      async (cmdOpts: { type?: string; domain?: string }, cmd: Command) => {
        const options = getMergedOptions(cmd);
        const ctx = createCoreContext(options);

        const filter: { type?: DefinitionType; domain?: string } = {};
        if (cmdOpts.type) filter.type = cmdOpts.type as DefinitionType;
        if (cmdOpts.domain) filter.domain = cmdOpts.domain;

        try {
          const items = await withSpinner(
            ctx,
            {
              start: 'Fetching definitions...',
              success: 'Definitions loaded',
              failure: 'Failed to fetch definitions',
            },
            () =>
              ctx.client.list(
                Object.keys(filter).length > 0 ? filter : undefined,
              ),
          );

          if (ctx.json) {
            console.log(JSON.stringify(items, null, 2));
          } else {
            console.log(formatDefinitionList(items));
          }
        } catch (error) {
          handleCoreError(error, ctx);
        }
      },
    );

  // ── exec describe ───────────────────────────────────────────────────────

  exec
    .command('describe <name>')
    .addHelpText('after', EXEC_INHERITED_HELP)
    .description(
      "Show a definition's metadata, decision vocabulary, and interface",
    )
    .action(
      async (name: string, _cmdOpts: Record<string, unknown>, cmd: Command) => {
        const options = getMergedOptions(cmd);
        const ctx = createCoreContext(options);

        try {
          const details = await withSpinner(
            ctx,
            {
              start: `Resolving ${name}...`,
              success: `Definition resolved`,
              failure: `Failed to resolve definition`,
            },
            () => ctx.client.describe(name),
          );

          if (ctx.json) {
            console.log(JSON.stringify(details, null, 2));
          } else {
            console.log(formatDefinitionDetails(details));
          }
        } catch (error) {
          handleCoreError(error, ctx);
        }
      },
    );
}
