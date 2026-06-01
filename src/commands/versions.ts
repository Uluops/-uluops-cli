import type {
  DefinitionType,
  VersionDiff,
  VersionDiffSummary,
} from '@uluops/registry-sdk';
import type { Command } from 'commander';
import {
  createRegistryContext,
  type GlobalOptions,
  handleRegistryError,
} from '../context.js';
import { formatVersionDiff, formatVersions } from '../formatters/registry.js';
import { withSpinner } from '../utils.js';

/**
 * Register version commands
 */
export function registerVersionCommands(program: Command): void {
  const versions = program
    .command('versions')
    .description('Manage definition versions')
    .addHelpText(
      'after',
      `
Examples:
  $ ulu versions list agent code-validator
  $ ulu versions diff agent code-validator 1.0.0 1.1.0
`,
    );

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
          {
            start: 'Fetching versions...',
            failure: 'Failed to fetch versions',
          },
          () => ctx.client.versions.list(type as DefinitionType, name),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (!data.versions || data.versions.length === 0) {
          console.log('No versions found');
        } else {
          console.log(formatVersions(data.versions));
          console.log(`\n${data.versions.length} versions`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu versions diff <type> <name> <from> <to>
  versions
    .command('diff <type> <name> <from> <to>')
    .description(
      'Compare two versions of a definition (shows field-level changes)',
    )
    .action(
      async (type: string, name: string, from: string, to: string, _, cmd) => {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        const ctx = createRegistryContext(globalOpts);

        try {
          const result = await withSpinner(
            ctx,
            {
              start: 'Comparing versions...',
              failure: 'Failed to compare versions',
            },
            () =>
              ctx.client.versions.diff(type as DefinitionType, name, from, to),
          );

          if (ctx.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            if ('fromYaml' in result || 'sectionsModified' in result) {
              console.log(
                formatVersionDiff(result as VersionDiff | VersionDiffSummary),
              );
            } else {
              console.log(JSON.stringify(result, null, 2));
            }
          }
        } catch (error) {
          handleRegistryError(error, ctx);
        }
      },
    );
}
