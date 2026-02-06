import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';
import { formatDefinitions, formatDefinition, formatValidationResult } from '../formatters/registry.js';
import type { DefinitionType } from '@uluops/registry-sdk';

/**
 * Register definition commands
 */
export function registerDefinitionCommands(program: Command): void {
  const defs = program
    .command('definitions')
    .alias('def')
    .description('Manage workflow definitions');

  // ulu definitions list
  defs
    .command('list')
    .description('List definitions')
    .option('-t, --type <type>', 'Filter by type (agent|command|workflow|pipeline)')
    .option('-s, --status <status>', 'Filter by status (draft|published|deprecated)')
    .option('-d, --domain <domain>', 'Filter by domain')
    .option('-v, --visibility <visibility>', 'Filter by visibility (public|private)')
    .option('-l, --limit <number>', 'Limit results', '50')
    .option('-o, --offset <number>', 'Offset for pagination', '0')
    .option('--search <query>', 'Search by name or description')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Fetching definitions...', failure: 'Failed to fetch definitions' },
          () => ctx.client.definitions.list({
            type: options.type as DefinitionType | undefined,
            status: options.status,
            domain: options.domain,
            visibility: options.visibility,
            limit: parseInt(options.limit, 10),
            offset: parseInt(options.offset, 10),
            search: options.search,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (result.items.length === 0) {
          console.log('No definitions found');
        } else {
          console.log(formatDefinitions(result.items));
          console.log(`\nShowing ${result.items.length} of ${result.total} definitions`);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions get <type> <name> [version]
  defs
    .command('get <type> <name> [version]')
    .description('Get a definition')
    .option('--yaml', 'Output raw YAML')
    .option('--include-runtime', 'Include runtime markdown')
    .action(async (type: string, name: string, version: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const def = await withSpinner(
          ctx,
          { start: 'Fetching definition...', failure: 'Failed to fetch definition' },
          () => ctx.client.definitions.get(
            type as DefinitionType,
            name,
            version,
            { includeYaml: options.yaml, includeRuntime: options.includeRuntime }
          )
        );

        if (ctx.json) {
          console.log(JSON.stringify(def, null, 2));
        } else if (options.yaml) {
          console.log(def.yaml);
        } else {
          console.log(formatDefinition(def));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions create <type> <name>
  defs
    .command('create <type> <name>')
    .description('Create a new definition')
    .requiredOption('-f, --file <path>', 'Path to YAML file')
    .option('--visibility <visibility>', 'Visibility (public|private)', 'private')
    .action(async (type: string, name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const yaml = readFileSync(options.file, 'utf-8');

        const def = await withSpinner(
          ctx,
          { start: 'Creating definition...', success: 'Definition created', failure: 'Failed to create definition' },
          () => ctx.client.definitions.create(type as DefinitionType, name, {
            yaml,
            visibility: options.visibility,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(def, null, 2));
        } else {
          console.log(formatDefinition(def));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions update <type> <name> <version>
  defs
    .command('update <type> <name> <version>')
    .description('Update a draft definition')
    .option('-f, --file <path>', 'Path to YAML file')
    .option('--visibility <visibility>', 'Visibility (public|private)')
    .option('--display-name <name>', 'Display name')
    .option('--description <desc>', 'Description')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const yaml = options.file ? readFileSync(options.file, 'utf-8') : undefined;

        const def = await withSpinner(
          ctx,
          { start: 'Updating definition...', success: 'Definition updated', failure: 'Failed to update definition' },
          () => ctx.client.definitions.update(type as DefinitionType, name, version, {
            yaml,
            visibility: options.visibility,
            displayName: options.displayName,
            description: options.description,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(def, null, 2));
        } else {
          console.log(formatDefinition(def));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions publish <type> <name> <version>
  defs
    .command('publish <type> <name> <version>')
    .description('Publish a definition')
    .action(async (type: string, name: string, version: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const def = await withSpinner(
          ctx,
          { start: 'Publishing definition...', success: 'Definition published', failure: 'Failed to publish definition' },
          () => ctx.client.definitions.publish(type as DefinitionType, name, version)
        );

        if (ctx.json) {
          console.log(JSON.stringify(def, null, 2));
        } else {
          console.log(formatDefinition(def));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions deprecate <type> <name> <version>
  defs
    .command('deprecate <type> <name> <version>')
    .description('Deprecate a published definition')
    .requiredOption('-r, --reason <reason>', 'Deprecation reason')
    .option('--successor <ref>', 'Successor definition reference')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const def = await withSpinner(
          ctx,
          { start: 'Deprecating definition...', success: 'Definition deprecated', failure: 'Failed to deprecate definition' },
          () => ctx.client.definitions.deprecate(type as DefinitionType, name, version, {
            reason: options.reason,
            successor: options.successor,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(def, null, 2));
        } else {
          console.log(formatDefinition(def));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions validate <type>
  defs
    .command('validate <type>')
    .description('Validate YAML without creating a definition')
    .requiredOption('-f, --file <path>', 'Path to YAML file')
    .action(async (type: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const yaml = readFileSync(options.file, 'utf-8');

        const result = await withSpinner(
          ctx,
          { start: 'Validating...', failure: 'Validation failed' },
          () => ctx.client.validation.validate(type as DefinitionType, yaml)
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatValidationResult(result));
        }

        if (!result.valid) {
          process.exit(1);
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions delete <type> <name> <version>
  defs
    .command('delete <type> <name> <version>')
    .description('Delete a definition')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      // Confirm deletion
      if (!options.yes) {
        console.log(`\nThis will delete: ${type}/${name}@${version}`);
        console.log('To confirm, run again with --yes flag');
        process.exit(0);
      }

      try {
        await withSpinner(
          ctx,
          { start: 'Deleting definition...', success: 'Definition deleted', failure: 'Failed to delete definition' },
          () => ctx.client.definitions.delete(type as DefinitionType, name, version)
        );

        if (ctx.json) {
          console.log(JSON.stringify({ success: true, type, name, version }, null, 2));
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
