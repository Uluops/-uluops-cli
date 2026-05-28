import { Command } from 'commander';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';
import { formatModels, formatModel, formatAliases, formatAliasResolution } from '../formatters/registry.js';
import type { ModelTier, ModelStatus } from '@uluops/registry-sdk';

/**
 * Register model commands
 */
export function registerModelCommands(program: Command): void {
  const models = program
    .command('models')
    .description('Browse the model catalog')
    .addHelpText('after', `
Examples:
  $ ulu models list
  $ ulu models list --provider anthropic --tier premium
  $ ulu models get anthropic claude-sonnet-4-6-20250514
  $ ulu models resolve sonnet
  $ ulu models aliases
  $ ulu models providers
`);

  // ulu models list
  models
    .command('list')
    .description('List available models')
    .option('-p, --provider <provider>', 'Filter by provider')
    .option('-t, --tier <tier>', 'Filter by tier (free|standard|premium)')
    .option('-s, --status <status>', 'Filter by status (available|deprecated|preview)')
    .option('-c, --capability <cap>', 'Filter by capability (vision|tools|streaming|extendedThinking)')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Fetching models...', failure: 'Failed to fetch models' },
          () => ctx.client.models.list({
            provider: options.provider,
            tier: options.tier as ModelTier | undefined,
            status: options.status as ModelStatus | undefined,
            capability: options.capability,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.models.length === 0) {
          console.log('No models found');
        } else {
          console.log(formatModels(result.models));
          console.log(`\n${result.models.length} models`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu models get <provider> <model-id>
  models
    .command('get <provider> <modelId>')
    .description('Get model details by provider and model ID')
    .action(async (provider: string, modelId: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const model = await withSpinner(
          ctx,
          { start: 'Fetching model...', failure: 'Failed to fetch model' },
          () => ctx.client.models.get(provider, modelId)
        );

        if (ctx.json) {
          console.log(JSON.stringify(model, null, 2));
        } else {
          console.log(formatModel(model));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu models providers
  models
    .command('providers')
    .description('List model providers')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Fetching providers...', failure: 'Failed to fetch providers' },
          () => ctx.client.models.listProviders()
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.providers.length === 0) {
          console.log('No providers found');
        } else {
          for (const provider of result.providers) {
            console.log(`${provider.id}: ${provider.name} (${provider.status})`);
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu models aliases
  models
    .command('aliases')
    .description('List model aliases')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Fetching aliases...', failure: 'Failed to fetch aliases' },
          () => ctx.client.models.listAliases()
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.aliases.length === 0) {
          console.log('No aliases found');
        } else {
          console.log(formatAliases(result.aliases));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu models resolve <alias>
  models
    .command('resolve <alias>')
    .description('Resolve a model alias (e.g. sonnet → anthropic/claude-sonnet-4-6-...)')
    .action(async (alias: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const resolution = await withSpinner(
          ctx,
          { start: 'Resolving alias...', failure: 'Failed to resolve alias' },
          () => ctx.client.models.resolveAlias(alias)
        );

        if (ctx.json) {
          console.log(JSON.stringify(resolution, null, 2));
        } else {
          console.log(formatAliasResolution(resolution));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

}
