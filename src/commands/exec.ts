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

type ExecOptions = GlobalOptions & CoreExecOptions;

/**
 * Get merged options from the exec parent command and the subcommand
 */
function getMergedOptions(cmd: Command): ExecOptions {
  // Commander nests parent options — walk up to get them
  const parentOpts = cmd.parent?.opts() ?? {};
  const grandParentOpts = cmd.parent?.parent?.opts() ?? {};
  return { ...grandParentOpts, ...parentOpts, ...cmd.opts() } as ExecOptions;
}

/**
 * Build ExecutionOptions from CLI flags
 */
function buildExecOptions(opts: Record<string, unknown>): ExecutionOptions | undefined {
  const execOpts: ExecutionOptions = {};
  let hasOptions = false;

  if (opts.model) {
    execOpts.model = opts.model as string;
    hasOptions = true;
  }
  if (opts.maxTokens) {
    execOpts.maxTokens = parseIntOption(opts.maxTokens as string, '--max-tokens');
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
  if (opts.project) {
    execOpts.project = opts.project as string;
    hasOptions = true;
  }
  if (opts.tracking === false) {
    execOpts.trackResults = false;
    hasOptions = true;
  }
  if (opts.temperature !== undefined) {
    execOpts.temperature = parseFloatOption(opts.temperature as string, '--temperature');
    hasOptions = true;
  }
  if (opts.maxSteps) {
    execOpts.maxSteps = parseIntOption(opts.maxSteps as string, '--max-steps');
    hasOptions = true;
  }
  if (opts.timeout) {
    execOpts.timeoutMs = parseIntOption(opts.timeout as string, '--timeout');
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
    .description('Execute agents, commands, and workflows via @uluops/core SDK')
    .option('--local-definitions <dir>', 'Local YAML definitions directory')
    .option('--registry-url <url>', 'Override registry URL')
    .option('--project <name>', 'Project name for result tracking')
    .option('--no-tracking', 'Disable validation service submission');

  // ── exec run ────────────────────────────────────────────────────────────

  exec
    .command('run <name> <target>')
    .description('Execute a definition (auto-detects type)')
    .action(async (name: string, target: string, _cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);

      try {
        const result = await withSpinner(ctx, {
          start: `Executing ${name} against ${target}...`,
          success: `Execution complete`,
          failure: `Execution failed`,
        }, () => ctx.client.run(name, { target }));

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
    .option('--max-tokens <n>', 'Maximum response tokens')
    .option('--max-steps <n>', 'Maximum tool loop iterations (default: 50)')
    .option('--temperature <n>', 'Generation temperature 0-1 (default: 0)')
    .option('--timeout <ms>', 'Execution timeout in milliseconds')
    .option('--threshold-pass <n>', 'Pass threshold score (agents)')
    .option('--threshold-warn <n>', 'Warning threshold score (agents)')
    .option('--report <path>', 'Write raw agent output report to file (single agent only)')
    .option('--features-list <path>', 'Write structured features/recommendations to file (single agent only)')
    .action(async (names: string[], cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);
      const execOpts = buildExecOptions({ ...cmdOpts, ...options });
      const target: string = cmd.opts()['target'];
      const agentNames: string[] = names.filter(Boolean);

      // Single agent — original behavior
      if (agentNames.length === 1) {
        const agentName = agentNames[0]!;
        try {
          const result = await withSpinner(ctx, {
            start: `Running agent ${agentName} against ${target}...`,
            success: `Agent execution complete`,
            failure: `Agent execution failed`,
          }, () => ctx.client.runAgent(agentName, target, execOpts));

          if (ctx.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            console.log(formatAgentResult(result));
          }

          await writeReportFiles(result, cmdOpts);
        } catch (error) {
          handleCoreError(error, ctx);
        }
        return;
      }

      // Multiple agents — run in parallel
      console.log(`Running ${agentNames.length} agents in parallel against ${target}...\n`);

      const results = await Promise.allSettled(
        agentNames.map(name =>
          ctx.client.runAgent(name, target, execOpts)
            .then(result => ({ name, result }))
        ),
      );

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
    .action(async (name: string, target: string, cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);
      const modelOverride = cmdOpts['model'] as string | undefined;

      try {
        const result = await withSpinner(ctx, {
          start: `Running command ${name} against ${target}...`,
          success: `Command execution complete`,
          failure: `Command execution failed`,
        }, () => ctx.client.runCommand(name, { target }, modelOverride ? { model: modelOverride } : undefined));

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
    .action(async (name: string, target: string, _cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);

      try {
        const result = await withSpinner(ctx, {
          start: `Running workflow ${name} against ${target}...`,
          success: `Workflow execution complete`,
          failure: `Workflow execution failed`,
        }, () => ctx.client.runWorkflow(name, { target }));

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatExecutionResult(result));
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
    .description('Inspect a definition\'s metadata and interface')
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
