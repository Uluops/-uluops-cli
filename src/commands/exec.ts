import { Command } from 'commander';
import { createCoreContext, handleCoreError, type GlobalOptions, type CoreExecOptions } from '../context.js';
import { withSpinner, parseIntOption, parseFloatOption } from '../utils.js';
import {
  formatAgentResult,
  formatExecutionResult,
  formatDefinitionList,
  formatDefinitionDetails,
} from '../formatters/core.js';
import type { ExecutionOptions, DefinitionType } from '@uluops/core';

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
    .command('agent <name> <target>')
    .description('Execute an agent definition directly')
    .option('-m, --model <model>', 'Model override (alias, tier, or provider:modelId)')
    .option('--max-tokens <n>', 'Maximum response tokens')
    .option('--max-steps <n>', 'Maximum tool loop iterations (default: 50)')
    .option('--temperature <n>', 'Generation temperature 0-1 (default: 0)')
    .option('--timeout <ms>', 'Execution timeout in milliseconds')
    .option('--threshold-pass <n>', 'Pass threshold score (agents)')
    .option('--threshold-warn <n>', 'Warning threshold score (agents)')
    .action(async (name: string, target: string, cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);
      const execOpts = buildExecOptions({ ...cmdOpts, ...options });

      try {
        const result = await withSpinner(ctx, {
          start: `Running agent ${name} against ${target}...`,
          success: `Agent execution complete`,
          failure: `Agent execution failed`,
        }, () => ctx.client.runAgent(name, target, execOpts));

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatAgentResult(result));
        }
      } catch (error) {
        handleCoreError(error, ctx);
      }
    });

  // ── exec command ────────────────────────────────────────────────────────

  exec
    .command('command <name> <target>')
    .description('Execute a saved command configuration')
    .action(async (name: string, target: string, _cmdOpts: Record<string, unknown>, cmd: Command) => {
      const options = getMergedOptions(cmd);
      const ctx = createCoreContext(options);

      try {
        const result = await withSpinner(ctx, {
          start: `Running command ${name} against ${target}...`,
          success: `Command execution complete`,
          failure: `Command execution failed`,
        }, () => ctx.client.runCommand(name, { target }));

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
