import { Command, Option } from 'commander';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner, readFileOption } from '../utils.js';
import type { DefinitionType } from '@uluops/registry-sdk';

/**
 * Register render commands
 */
export function registerRenderCommands(program: Command): void {
  const render = program
    .command('render')
    .description('Render definitions as markdown');

  const renderProfileOption = new Option(
    '--render-profile <profile>',
    'Render profile for agent definitions'
  ).choices(['core', 'uluops-full']);

  // ulu render get <type> <name> <version>
  render
    .command('get <type> <name> <version>')
    .description('Get rendered markdown for a published definition')
    .addOption(renderProfileOption)
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const renderProfile = options.renderProfile as 'core' | 'uluops-full' | undefined;
        const result = await withSpinner(
          ctx,
          { start: 'Rendering...', failure: 'Failed to render definition' },
          () => ctx.client.render.get(type as DefinitionType, name, version, renderProfile ? { renderProfile } : undefined)
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.markdown);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu render preview <type>
  render
    .command('preview <type>')
    .description('Preview YAML as rendered markdown')
    .requiredOption('-f, --file <path>', 'Path to YAML file')
    .addOption(renderProfileOption)
    .action(async (type: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const yaml = readFileOption(options.file);
        const renderProfile = options.renderProfile as 'core' | 'uluops-full' | undefined;

        const result = await withSpinner(
          ctx,
          { start: 'Rendering preview...', failure: 'Failed to render preview' },
          () => ctx.client.render.preview(type as DefinitionType, { yaml, ...(renderProfile && { renderProfile }) })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.markdown);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
