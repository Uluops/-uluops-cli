import { writeFile } from 'node:fs/promises';
import type { DefinitionType } from '@uluops/registry-sdk';
import { type Command, Option } from 'commander';
import {
  createRegistryContext,
  type GlobalOptions,
  handleRegistryError,
} from '../context.js';
import {
  formatDefinition,
  formatDefinitions,
  formatValidationResult,
} from '../formatters/registry.js';
import {
  confirmOrExit,
  parseIntOption,
  readFileOption,
  resolveDefinitionType,
  withSpinner,
} from '../utils.js';

/**
 * Register definition commands
 */
export function registerDefinitionCommands(program: Command): void {
  const defs = program
    .command('definitions')
    .alias('def')
    .description('Manage agent, command, workflow, and pipeline definitions')
    .addHelpText(
      'after',
      `
Examples:
  $ ulu def list --type agent
  $ ulu def get agent code-validator
  $ ulu def get agent code-validator 1.2.0 --rendered
  $ ulu def get agent code-validator --rendered --target opencode
  $ ulu def get agent code-validator --rendered --target gemini -m gemini-2.5-pro
  $ ulu def publish agent code-validator 1.2.0
  $ ulu def search "security" --type agent
`,
    );

  const renderProfileOption = new Option(
    '--render-profile <profile>',
    'Render profile for agent definitions',
  ).choices(['core', 'uluops-full']);

  const targetOption = new Option(
    '--target <harness>',
    'Target harness for rendering (default: claude-code)',
  ).choices([
    'claude-code',
    'claude',
    'opencode',
    'oc',
    'codex',
    'gemini-cli',
    'gemini',
  ]);

  const targetModelOption = new Option(
    '-m, --model <model>',
    'Model override for target harness envelope',
  );

  // ulu definitions list
  defs
    .command('list')
    .description(
      'List definitions with optional type, status, and domain filters',
    )
    .option(
      '-t, --type <type>',
      'Filter by type (agent|command|workflow|pipeline)',
    )
    .option(
      '-s, --status <status>',
      'Filter by status (draft|published|deprecated|archived)',
    )
    .option('-d, --domain <domain>', 'Filter by domain')
    .option(
      '-v, --visibility <visibility>',
      'Filter by visibility (public|private)',
    )
    .option('-l, --limit <number>', 'Limit results', '50')
    .option('-o, --offset <number>', 'Offset for pagination', '0')
    .option('--search <query>', 'Search by name or description')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          {
            start: 'Fetching definitions...',
            failure: 'Failed to fetch definitions',
          },
          () =>
            ctx.client.definitions.list({
              type: options.type as DefinitionType | undefined,
              status: options.status,
              domain: options.domain,
              visibility: options.visibility,
              limit: parseIntOption(options.limit, '--limit'),
              offset: parseIntOption(options.offset, '--offset'),
              search: options.search,
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else if (!result.definitions || result.definitions.length === 0) {
          console.log('No definitions found');
        } else {
          console.log(formatDefinitions(result.definitions));
          console.log(
            `\nShowing ${result.definitions.length} of ${result.total} definitions`,
          );
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu definitions get <type> <name> [version]
  defs
    .command('get <type> <name> [version]')
    .description('Get a definition by type, name, and optional version')
    .option('--yaml', 'Output raw YAML')
    .option('--rendered', 'Output rendered markdown only')
    .option(
      '-o, --output <path>',
      'Write rendered output to file instead of stdout',
    )
    .option('--include-runtime', 'Include runtime markdown')
    .addOption(renderProfileOption)
    .addOption(targetOption)
    .addOption(targetModelOption)
    .action(
      async (
        type: string,
        name: string,
        version: string | undefined,
        options,
        cmd,
      ) => {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        const ctx = createRegistryContext(globalOpts);

        try {
          if (options.rendered) {
            // Fetch rendered markdown only (replaces ulu render get)
            const renderProfile = options.renderProfile as
              | 'core'
              | 'uluops-full'
              | undefined;
            const target = options.target as string | undefined;
            const model = options.model as string | undefined;
            const renderOpts: Record<string, string> = {};
            if (renderProfile) renderOpts.renderProfile = renderProfile;
            if (target) renderOpts.target = target;
            if (model) renderOpts.model = model;
            const result = await withSpinner(
              ctx,
              {
                start: `Rendering${target ? ` for ${target}` : ''}...`,
                failure: 'Failed to render definition',
              },
              () =>
                ctx.client.render.get(
                  type as DefinitionType,
                  name,
                  version ?? 'latest',
                  Object.keys(renderOpts).length > 0 ? renderOpts : undefined,
                ),
            );

            if (options.output) {
              await writeFile(options.output, result.markdown, 'utf-8');
              console.log(`Written to ${options.output}`);
            } else if (ctx.json) {
              console.log(JSON.stringify(result, null, 2));
            } else {
              console.log(result.markdown);
            }
          } else {
            const def = await withSpinner(
              ctx,
              {
                start: 'Fetching definition...',
                failure: 'Failed to fetch definition',
              },
              () =>
                ctx.client.definitions.get(
                  type as DefinitionType,
                  name,
                  version,
                  {
                    includeYaml: options.yaml,
                    includeRuntime: options.includeRuntime,
                  },
                ),
            );

            if (ctx.json) {
              console.log(JSON.stringify(def, null, 2));
            } else if (options.yaml) {
              console.log(def.yaml);
            } else {
              console.log(formatDefinition(def));
            }
          }
        } catch (error) {
          handleRegistryError(error, ctx);
        }
      },
    );

  // ulu definitions create <type> <name>
  defs
    .command('create <type> <name>')
    .description('Create a new definition')
    .requiredOption('-f, --file <path>', 'Path to YAML file')
    .option(
      '--visibility <visibility>',
      'Visibility (public|private)',
      'private',
    )
    .action(async (type: string, name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const yaml = readFileOption(options.file);

        const def = await withSpinner(
          ctx,
          {
            start: 'Creating definition...',
            success: 'Definition created',
            failure: 'Failed to create definition',
          },
          () =>
            ctx.client.definitions.create(type as DefinitionType, name, {
              yaml,
              visibility: options.visibility,
            }),
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
    .description(
      'Update a definition (use --change-type to create a new version from a published one)',
    )
    .option('-f, --file <path>', 'Path to YAML file')
    .option('--visibility <visibility>', 'Visibility (public|private)')
    .option('--display-name <name>', 'Display name')
    .option('--description <desc>', 'Description')
    .option(
      '--change-type <changeType>',
      'Version bump type: major, minor, or patch (creates new version from published)',
    )
    .action(
      async (type: string, name: string, version: string, options, cmd) => {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        const ctx = createRegistryContext(globalOpts);

        try {
          const yaml = options.file ? readFileOption(options.file) : undefined;

          const def = await withSpinner(
            ctx,
            {
              start: 'Updating definition...',
              success: 'Definition updated',
              failure: 'Failed to update definition',
            },
            () =>
              ctx.client.definitions.update(
                type as DefinitionType,
                name,
                version,
                {
                  yaml,
                  visibility: options.visibility,
                  displayName: options.displayName,
                  description: options.description,
                  changeType: options.changeType,
                },
              ),
          );

          if (ctx.json) {
            console.log(JSON.stringify(def, null, 2));
          } else {
            console.log(formatDefinition(def));
          }
        } catch (error) {
          handleRegistryError(error, ctx);
        }
      },
    );

  // ulu definitions publish <type> <name> <version>
  defs
    .command('publish <type> <name> <version>')
    .description(
      'Publish a draft definition to make it available for execution',
    )
    .action(async (type: string, name: string, version: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          {
            start: 'Publishing definition...',
            success: 'Definition published',
            failure: 'Failed to publish definition',
          },
          () =>
            ctx.client.definitions.publish(
              type as DefinitionType,
              name,
              version,
            ),
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(formatDefinition(result.definition));
          if (result.warnings.length > 0) {
            console.log('\nWarnings:');
            for (const w of result.warnings) {
              console.log(`  [${w.code}] ${w.message}`);
            }
          }
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
    .action(
      async (type: string, name: string, version: string, options, cmd) => {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        const ctx = createRegistryContext(globalOpts);

        try {
          const def = await withSpinner(
            ctx,
            {
              start: 'Deprecating definition...',
              success: 'Definition deprecated',
              failure: 'Failed to deprecate definition',
            },
            () =>
              ctx.client.definitions.deprecate(
                type as DefinitionType,
                name,
                version,
                {
                  reason: options.reason,
                  successor: options.successor,
                },
              ),
          );

          if (ctx.json) {
            console.log(JSON.stringify(def, null, 2));
          } else {
            console.log(formatDefinition(def));
          }
        } catch (error) {
          handleRegistryError(error, ctx);
        }
      },
    );

  // ulu definitions validate [type] --file <path>
  // ulu definitions validate --file my-agent.agent.yaml   (type inferred)
  // ulu definitions validate agent --file my-agent.yaml   (type explicit)
  defs
    .command('validate [type]')
    .description(
      'Validate YAML without creating a definition (type auto-detected from filename)',
    )
    .requiredOption('-f, --file <path>', 'Path to YAML file')
    .action(async (typeArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);
      const type = resolveDefinitionType(typeArg, options.file);

      try {
        const yaml = readFileOption(options.file);

        const result = await withSpinner(
          ctx,
          { start: 'Validating...', failure: 'Validation failed' },
          () => ctx.client.validation.validate(type as DefinitionType, yaml),
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

  // ulu definitions render [type] --file <path>
  // ulu definitions render --file my-agent.agent.yaml   (type inferred)
  // ulu definitions render agent --file my-agent.yaml   (type explicit)
  defs
    .command('render [type]')
    .description(
      'Render YAML as markdown preview (type auto-detected from filename)',
    )
    .requiredOption('-f, --file <path>', 'Path to YAML file')
    .option(
      '-o, --output <path>',
      'Write rendered output to file instead of stdout',
    )
    .addOption(renderProfileOption)
    .action(async (typeArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);
      const type = resolveDefinitionType(typeArg, options.file);

      try {
        const yaml = readFileOption(options.file);
        const renderProfile = options.renderProfile as
          | 'core'
          | 'uluops-full'
          | undefined;

        const result = await withSpinner(
          ctx,
          {
            start: 'Rendering preview...',
            failure: 'Failed to render preview',
          },
          () =>
            ctx.client.render.preview(type as DefinitionType, {
              yaml,
              ...(renderProfile && { renderProfile }),
            }),
        );

        if (options.output) {
          await writeFile(options.output, result.markdown, 'utf-8');
          console.log(`Written to ${options.output}`);
        } else if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.markdown);
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
    .action(
      async (type: string, name: string, version: string, options, cmd) => {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        const ctx = createRegistryContext(globalOpts);

        // Confirm deletion (fails closed in non-interactive contexts)
        await confirmOrExit(
          `Delete definition ${type}/${name}@${version}?`,
          options.yes,
        );

        try {
          await withSpinner(
            ctx,
            {
              start: 'Deleting definition...',
              success: 'Definition deleted',
              failure: 'Failed to delete definition',
            },
            () =>
              ctx.client.definitions.delete(
                type as DefinitionType,
                name,
                version,
              ),
          );

          if (ctx.json) {
            console.log(
              JSON.stringify({ success: true, type, name, version }, null, 2),
            );
          }
        } catch (error) {
          handleRegistryError(error, ctx);
        }
      },
    );
}
