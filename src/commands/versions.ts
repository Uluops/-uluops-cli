import { Command } from 'commander';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';
import { formatVersions, formatVersionDiff } from '../formatters/registry.js';
import type { DefinitionType } from '@uluops/registry-sdk';

/**
 * Register version commands
 */
export function registerVersionCommands(program: Command): void {
  const versions = program
    .command('versions')
    .description('Manage definition versions');

  // ulu versions list <type> <name>
  versions
    .command('list <type> <name>')
    .description('List version history for a definition')
    .action(async (type: string, name: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching versions...', failure: 'Failed to fetch versions' },
          () => ctx.client.versions.list(type as DefinitionType, name)
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (!data.versions || data.versions.length === 0) {
          console.log('No versions found');
        } else {
          console.log(formatVersions(data.versions));
          console.log(`\n${data.versions.length} of ${data.totalVersions} versions`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu versions diff <type> <name> <from> <to>
  versions
    .command('diff <type> <name> <from> <to>')
    .description('Compare two versions of a definition')
    .action(async (type: string, name: string, from: string, to: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Comparing versions...', failure: 'Failed to compare versions' },
          () => ctx.client.versions.diff(type as DefinitionType, name, from, to)
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatVersionDiff(result));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
