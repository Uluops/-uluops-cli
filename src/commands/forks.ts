import { Command } from 'commander';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner, asFlexibleResponse } from '../utils.js';
import type { DefinitionType } from '@uluops/registry-sdk';

/**
 * Register fork commands
 */
export function registerForkCommands(program: Command): void {
  const forks = program
    .command('forks')
    .description('Manage definition forks');

  // ulu forks list <type> <name> <version>
  forks
    .command('list <type> <name> <version>')
    .description('List forks of a definition')
    .action(async (type: string, name: string, version: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Fetching forks...', failure: 'Failed to fetch forks' },
          () => ctx.client.forks.list(type as DefinitionType, name, version)
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          if (result.forks.length === 0) {
            console.log('No forks found');
          } else {
            for (const entry of result.forks) {
              const d = entry.definition;
              if (d) {
                console.log(`  ${d.type}/${d.name}@${d.version} (${d.authorId.slice(0, 8)})`);
              }
            }
            console.log(`\n${result.totalForks} fork(s)`);
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu forks create <type> <name> <version>
  forks
    .command('create <type> <name> <version>')
    .description('Fork a definition')
    .requiredOption('-n, --fork-name <name>', 'Name for the forked definition')
    .option('--visibility <visibility>', 'Visibility (public|private)', 'private')
    .option('--display-name <name>', 'Display name for the fork')
    .option('--description <text>', 'Description for the fork')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Forking definition...', success: 'Definition forked', failure: 'Failed to fork definition' },
          () => ctx.client.forks.create(type as DefinitionType, name, version, {
            name: options.forkName,
            visibility: options.visibility,
            displayName: options.displayName,
            description: options.description,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Forked as: ${result.definition.type}/${result.definition.name}@${result.definition.version}`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu forks check <type> <name> <version>
  forks
    .command('check <type> <name> <version>')
    .description('Check if a definition can be forked')
    .action(async (type: string, name: string, version: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Checking...', failure: 'Failed to check forkability' },
          () => ctx.client.forks.isForkable(type as DefinitionType, name, version)
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Forkable: ${result.canFork ? 'Yes' : 'No'}`);
          if (result.reason) {
            console.log(`Reason: ${result.reason}`);
          }
          if (result.requiresSubscription) {
            console.log('Note: Requires a subscription upgrade');
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu forks lineage <type> <name> <version>
  forks
    .command('lineage <type> <name> <version>')
    .description('Show fork lineage chain')
    .action(async (type: string, name: string, version: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Fetching lineage...', failure: 'Failed to fetch lineage' },
          () => ctx.client.forks.getAncestry(type as DefinitionType, name, version)
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          // API may return { isFork, fork, source } or { chain, current, source }
          const lineage = asFlexibleResponse(result);
          if (result.chain) {
            console.log('Fork Lineage:');
            for (const item of result.chain) {
              console.log(`  ${item.type}/${item.name}@${item.version} (${item.status})`);
            }
            if (result.current) {
              console.log(`  -> ${result.current.type}/${result.current.name}@${result.current.version} (current)`);
            }
          } else if (lineage.isFork) {
            console.log('Fork Lineage:');
            const src = lineage.source as { type: string; name: string; version: string } | undefined;
            if (src) {
              console.log(`  Source: ${src.type}/${src.name}@${src.version}`);
            }
            console.log(`  -> ${type}/${name}@${version} (current fork)`);
            const fork = lineage.fork as { forkedAt?: string } | undefined;
            if (fork?.forkedAt) {
              console.log(`\n  Forked at: ${new Date(fork.forkedAt).toLocaleString()}`);
            }
          } else {
            console.log('This definition is not a fork');
          }
          if (result.source && !result.chain) {
            console.log(`\nOriginal source: ${result.source.type}/${result.source.name}@${result.source.version}`);
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
