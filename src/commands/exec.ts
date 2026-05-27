import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { Command } from 'commander';
import { createCoreContext, handleCoreError, type GlobalOptions, type CoreExecOptions } from '../context.js';
import { withSpinner, parseIntOption, parseFloatOption } from '../utils.js';
import {
  formatAgentResult,
  formatExecutionResult,
  formatDefinitionList,
  formatDefinitionDetails,
} from '../formatters/core.js';
import type { ExecutionOptions, DefinitionType, AgentResult } from '@uluops/core';

type ExecOptions = GlobalOptions & CoreExecOptions & { noSafetyWarnings?: boolean };

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
    localDefinitions: typeof merged.localDefinitions === 'string' ? merged.localDefinitions : undefined,
    registryUrl: typeof merged.registryUrl === 'string' ? merged.registryUrl : undefined,
    project: typeof merged.project === 'string' ? merged.project : undefined,
    tracking: typeof merged.tracking === 'boolean' ? merged.tracking : undefined,
    noSafetyWarnings: typeof merged.noSafetyWarnings === 'boolean' ? merged.noSafetyWarnings : undefined,
  } as ExecOptions;
}

/** Read a string option from Commander's untyped opts record. */
function optString(opts: Record<string, unknown>, key: string): string | undefined {
  const v = opts[key];
  return typeof v === 'string' ? v : undefined;
}

/**
 * Build ExecutionOptions from CLI flags
 */
function buildExecOptions(opts: Record<string, unknown>): ExecutionOptions | undefined {
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
    execOpts.thresholds = { ...execOpts.thresholds, pass: Number(opts.thresholdPass) };
    hasOptions = true;
  }
  if (opts.thresholdWarn !== undefined) {
    execOpts.thresholds = { ...execOpts.thresholds, warn: Number(opts.thresholdWarn) };
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
 * Write agent report and/or features list files if CLI flags are set.
 */
async function writeReportFiles(result: AgentResult, opts: Record<string, unknown>): Promise<void> {
  if (opts.report && typeof opts.report === 'string') {
    const reportPath = resolve(opts.report as string);
    if (result.rawOutput) {
      await mkdir(dirname(reportPath), { recursive: true });
      await writeFile(reportPath, result.rawOutput, 'utf-8');
      console.log(`Report written to ${reportPath}`);
    } else {
      console.log('No raw output available to write (agent may have hit step limit)');
    }
  }

  if (opts.featuresList && typeof opts.featuresList === 'string') {
    const featuresPath = resolve(opts.featuresList as string);
    const features = {
      agent: result.name,
      version: result.version,
      decision: result.decision,
      score: result.agentType === 'validator' ? (result as { score: number }).score : undefined,
      maxScore: result.agentType === 'validator' ? (result as { maxScore: number }).maxScore : undefined,
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
    .option('--no-safety-warnings', 'Suppress risk warnings and runtime advisories')
    .addHelpText('after', `
Examples:
  $ ulu exec agent code-validator ./src
  $ ulu exec agent code-validator ./src --model sonnet --project my-project
  $ ulu exec workflow ship ./src
  $ ulu exec pipeline foundations ./src
  $ ulu exec describe code-validator
`);

  // ── exec run ────────────────────────────────────────────────────────────

  exec
    .command('run <name> <target>')
    .description('Execute a definition by name against a target path (auto-detects type)')
    .option('-m, --model <model>', 'Model override for all agents (alias, tier, or provider:modelId)')
    .option('-p, --prompt <text>', 'Operator directive or context for the agent')
    .action(async (name: string, target: string, cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const modelOverride = cmdOpts['model'] as string | undefined;
      const prompt = cmdOpts['prompt'] as string | undefined;
      const ctx = createCoreContext(options, modelOverride);

      try {
        const result = await withSpinner(ctx, {
          start: `Executing ${name} against ${target}...`,
          success: `Execution complete`,
          failure: `Execution failed`,
        }, () => ctx.client.run(name, { target, prompt }));

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
    });

  // ── exec agent ──────────────────────────────────────────────────────────

  exec
    .command('agent <names...>')
    .description('Execute one or more agent definitions (runs in parallel when multiple)')
    .requiredOption('-t, --target <path>', 'Target directory to analyze')
    .option('-m, --model <model>', 'Model override (alias, tier, or provider:modelId)')
    .option('-c, --concurrency <n>', 'Max concurrent agents for parallel execution (default: 5)')
    .option('--max-tokens <n>', 'Maximum response tokens')
    .option('--max-steps <n>', 'Maximum tool loop iterations (default: 50)')
    .option('--temperature <n>', 'Generation temperature 0-1 (default: 0)')
    .option('--exec-timeout <ms>', 'Execution timeout in milliseconds (distinct from global --timeout for HTTP)')
    .option('--threshold-pass <n>', 'Pass threshold score (agents)')
    .option('--threshold-warn <n>', 'Warning threshold score (agents)')
    .option('--report <path>', 'Write raw agent output report to file (single agent only)')
    .option('--features-list <path>', 'Write structured features/recommendations to file (single agent only)')
    .option('-p, --prompt <text>', 'Operator directive or context for the agent')
    .action(async (names: string[], cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);
      const execOpts = buildExecOptions({ ...cmdOpts, ...options });
      const target: string = cmd.opts()['target'];
      const prompt = cmdOpts['prompt'] as string | undefined;
      const agentNames: string[] = names.filter(Boolean);

      // Single agent — show elapsed time during execution
      if (agentNames.length === 1) {
        const agentName = agentNames[0]!;
        try {
          // Pre-execution safety check — show warning for flagged definitions
          const suppressWarnings = (options as ExecOptions).noSafetyWarnings;
          if (!ctx.quiet && !ctx.json && !suppressWarnings) {
            try {
              const details = await ctx.client.describe(agentName);
              if (details.riskProfile) {
                const profile = details.riskProfile;
                const sync = profile.sync as Record<string, unknown> | undefined;
                const signals = sync?.signals as Array<Record<string, unknown>> | undefined;
                const level = profile.aggregateRiskLevel as string;
                if (signals?.length && (level === 'medium' || level === 'high')) {
                  const firstSignal = signals[0]!;
                  console.error(`\n  \u26A0\uFE0F  Risk signal: ${firstSignal.title as string}\n`);
                }

                // Runtime advisory: shell-capable agent targeting sensitive paths (R6)
                const caps = sync?.capabilities as Record<string, unknown> | undefined;
                const tools = caps?.tools as string[] | undefined;
                const hasShell = tools?.some((t: string) => /^bash$/i.test(t));
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
                  const isSensitive = sensitivePatterns.some((p) => p.test(resolvedTarget));
                  if (isSensitive) {
                    console.error(`  \u{1F6E1}\uFE0F  Advisory: shell-capable agent targeting sensitive path (${target})\n`);
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
              process.stderr.write(`\r\x1b[K- Running ${agentName}... ${elapsed}s`);
            }, 5000);
          }
          const result = await withSpinner(ctx, {
            start: `Running ${agentName}...`,
            success: `Agent execution complete`,
            failure: `Agent execution failed`,
          }, () => ctx.client.runAgent(agentName, { target, prompt }, execOpts)).finally(() => {
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
            const msg = writeError instanceof Error ? writeError.message : String(writeError);
            console.error(`\nWarning: Failed to write report files: ${msg}`);
          }
        } catch (error) {
          handleCoreError(error, ctx);
        }
        return;
      }

      // Multiple agents — run with concurrency limit
      const maxConcurrency = cmdOpts['concurrency']
        ? parseIntOption(cmdOpts['concurrency'] as string, '--concurrency')
        : 5;
      console.log(`Running ${agentNames.length} agents (concurrency: ${maxConcurrency}) against ${target}...\n`);

      // Concurrency-limited execution pool
      const tasks = agentNames.map(name => () =>
        ctx.client.runAgent(name, { target, prompt }, execOpts)
          .then(result => {
            if (!ctx.json) {
              const marker = result.decision === 'PASS' || result.decisionCategory === 'positive' ? '\u2713' : '\u2717';
              const score = result.score !== undefined ? ` ${result.score}` : '';
              console.log(`  ${marker} ${name}: ${result.decision}${score}`);
            }
            return { name, result };
          })
      );
      const results: PromiseSettledResult<{ name: string; result: AgentResult }>[] = [];
      for (let i = 0; i < tasks.length; i += maxConcurrency) {
        const batch = tasks.slice(i, i + maxConcurrency).map(fn => fn());
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
          failed.push({ name: agentNames[i] ?? 'unknown', error: reason instanceof Error ? reason.message : String(reason) });
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
        const avgScore = succeeded.length > 0
          ? (succeeded.reduce((sum, r) => sum + (r.score ?? 0), 0) / succeeded.length).toFixed(1)
          : '-';
        console.log(`\n${succeeded.length}/${agentNames.length} agents completed | Average score: ${avgScore}`);
      }
    });

  // ── exec command ────────────────────────────────────────────────────────

  exec
    .command('command <name> <target>')
    .description('Execute a saved command configuration')
    .option('-m, --model <model>', 'Model override (overrides command definition default)')
    .option('-p, --prompt <text>', 'Operator directive or context for the agent')
    .action(async (name: string, target: string, cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);
      const modelOverride = cmdOpts['model'] as string | undefined;
      const prompt = cmdOpts['prompt'] as string | undefined;

      try {
        const result = await withSpinner(ctx, {
          start: `Running command ${name} against ${target}...`,
          success: `Command execution complete`,
          failure: `Command execution failed`,
        }, () => ctx.client.runCommand(name, { target, prompt }, modelOverride ? { model: modelOverride } : undefined));

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatExecutionResult(result));
        }
      } catch (error) {
        handleCoreError(error, ctx);
      }
    });

  // ── exec workflow ───────────────────────────────────────────────────────

  exec
    .command('workflow <name> <target>')
    .description('Execute a multi-phase workflow')
    .option('-m, --model <model>', 'Model override for all phases (alias, tier, or provider:modelId)')
    .option('-p, --prompt <text>', 'Operator directive or context for the agent')
    .action(async (name: string, target: string, cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const modelOverride = cmdOpts['model'] as string | undefined;
      const prompt = cmdOpts['prompt'] as string | undefined;
      const ctx = createCoreContext(options, modelOverride);

      try {
        const result = await withSpinner(ctx, {
          start: `Running workflow ${name} against ${target}...`,
          success: `Workflow execution complete`,
          failure: `Workflow execution failed`,
        }, () => ctx.client.runWorkflow(name, { target, prompt }));

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatExecutionResult(result));
        }
      } catch (error) {
        handleCoreError(error, ctx);
      }
    });

  // ── exec pipeline ──────────────────────────────────────────────────────

  exec
    .command('pipeline <name> <target>')
    .description('Execute a multi-stage pipeline')
    .option('-m, --model <model>', 'Model override for all stages (alias, tier, or provider:modelId)')
    .option('-p, --prompt <text>', 'Operator directive or context for the agent')
    .action(async (name: string, target: string, cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const modelOverride = cmdOpts['model'] as string | undefined;
      const prompt = cmdOpts['prompt'] as string | undefined;
      const ctx = createCoreContext(options, modelOverride);

      try {
        const result = await withSpinner(ctx, {
          start: `Running pipeline ${name} against ${target}...`,
          success: `Pipeline execution complete`,
          failure: `Pipeline execution failed`,
        }, () => (ctx.client as unknown as { runPipeline: typeof ctx.client.run }).runPipeline(name, { target, prompt }));

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatExecutionResult(result as import('@uluops/core').ExecutionResult));
        }
      } catch (error) {
        handleCoreError(error, ctx);
      }
    });

  // ── exec list ───────────────────────────────────────────────────────────

  exec
    .command('list')
    .description('List available definitions')
    .option('-t, --type <type>', 'Filter by type (agent, command, workflow, pipeline)')
    .option('-d, --domain <domain>', 'Filter by domain')
    .action(async (cmdOpts: { type?: string; domain?: string }, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);

      const filter: { type?: DefinitionType; domain?: string } = {};
      if (cmdOpts.type) filter.type = cmdOpts.type as DefinitionType;
      if (cmdOpts.domain) filter.domain = cmdOpts.domain;

      try {
        const items = await withSpinner(ctx, {
          start: 'Fetching definitions...',
          success: 'Definitions loaded',
          failure: 'Failed to fetch definitions',
        }, () => ctx.client.list(Object.keys(filter).length > 0 ? filter : undefined));

        if (ctx.json) {
          console.log(JSON.stringify(items, null, 2));
        } else {
          console.log(formatDefinitionList(items));
        }
      } catch (error) {
        handleCoreError(error, ctx);
      }
    });

  // ── exec describe ───────────────────────────────────────────────────────

  exec
    .command('describe <name>')
    .description('Show a definition\'s metadata, decision vocabulary, and interface')
    .action(async (name: string, _cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);

      try {
        const details = await withSpinner(ctx, {
          start: `Resolving ${name}...`,
          success: `Definition resolved`,
          failure: `Failed to resolve definition`,
        }, () => ctx.client.describe(name));

        if (ctx.json) {
          console.log(JSON.stringify(details, null, 2));
        } else {
          console.log(formatDefinitionDetails(details));
        }
      } catch (error) {
        handleCoreError(error, ctx);
      }
    });
}
