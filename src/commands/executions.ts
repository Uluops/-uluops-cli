import { Command } from 'commander';
import type { DefinitionType } from '@uluops/registry-sdk';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner, parseIntOption } from '../utils.js';

/**
 * Register execution commands
 */
export function registerExecutionCommands(program: Command): void {
  const executions = program
    .command('executions')
    .description('Track definition execution metrics');

  // ulu executions record <type> <name> <version>
  executions
    .command('record <type> <name> <version>')
    .description('Record an execution of a definition')
    .requiredOption('-s, --source <source>', 'Execution source identifier')
    .option('--run-id <id>', 'Run ID for idempotency')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Recording execution...', success: 'Execution recorded', failure: 'Failed to record execution' },
          () => ctx.client.executions.record(type as DefinitionType, name, version, {
            source: options.source,
            runId: options.runId,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Execution recorded for ${type}/${name}@${version}`);
          console.log(`Count: ${result.executionCount}`);
          if (result.duplicate) console.log('(duplicate execution)');
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu executions stats <type> <name> <version>
  executions
    .command('stats <type> <name> <version>')
    .description('Get execution statistics')
    .option('-w, --window <minutes>', 'Time window in minutes (1-10080)', '60')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const stats = await withSpinner(
          ctx,
          { start: 'Fetching execution stats...', failure: 'Failed to fetch stats' },
          () => ctx.client.executions.getStats(type as DefinitionType, name, version, parseIntOption(options.window, '--window'))
        );

        if (ctx.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log(`Execution stats for ${type}/${name}@${version}:\n`);
          console.log(`  Total: ${stats.totalCount}`);
          console.log(`  Recent: ${stats.recentCount}`);
          console.log(`  Window: ${stats.windowMinutes} minutes`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
