import { Command } from 'commander';
import type { DefinitionType } from '@uluops/registry-sdk';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner, readFileOption } from '../utils.js';

/**
 * Register translation commands
 */
export function registerTranslationCommands(program: Command): void {
  const translation = program
    .command('translation')
    .description('Definition translation and upgrade tools');

  // ulu translation version
  translation
    .command('version')
    .description('Get translator version info')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const info = await withSpinner(
          ctx,
          { start: 'Fetching translator version...', failure: 'Failed to fetch translator version' },
          () => ctx.client.translation.getVersion()
        );

        if (ctx.json) {
          console.log(JSON.stringify(info, null, 2));
        } else {
          console.log(`Translator version: ${info.translatorVersion}`);
          if (info.releaseDate) console.log(`Released: ${info.releaseDate}`);
          if (info.schema) console.log(`Schema: ${info.schema}`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu translation retranslate <type> <name> <version>
  translation
    .command('retranslate <type> <name> <version>')
    .description('Re-translate a definition with latest translator')
    .option('--new-version', 'Create a new patch version instead of updating in-place')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Re-translating...', success: 'Re-translation complete', failure: 'Failed to re-translate' },
          () => ctx.client.translation.retranslate(type as DefinitionType, name, version, {
            createNewVersion: options.newVersion ?? false,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Re-translated: ${result.type}/${result.name}@${result.version}`);
          if (result.translatorVersion) console.log(`Translator: ${result.translatorVersion}`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu translation upgrade <type> <name>
  translation
    .command('upgrade <type> <name>')
    .description('Upgrade a legacy YAML definition')
    .requiredOption('-f, --file <path>', 'Path to YAML file')
    .action(async (type: string, name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const yaml = readFileOption(options.file);
        const result = await withSpinner(
          ctx,
          { start: 'Upgrading definition...', success: 'Upgrade complete', failure: 'Failed to upgrade' },
          () => ctx.client.translation.upgrade(type as DefinitionType, name, { yaml })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Upgraded: ${type}/${name}@${result.version}`);
          if (result.changes && Object.keys(result.changes).length > 0) {
            console.log(`Changes: ${JSON.stringify(result.changes)}`);
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
