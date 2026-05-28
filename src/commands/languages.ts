import { Command } from 'commander';
import { writeFile } from 'node:fs/promises';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';

/**
 * Register language commands
 */
export function registerLanguageCommands(program: Command): void {
  const lang = program
    .command('languages')
    .alias('lang')
    .description('Definition language schemas (ADL, CDL, WDL, PDL)')
    .addHelpText('after', `
Examples:
  $ ulu lang                     # List all languages
  $ ulu lang adl                 # Get ADL with full JSON Schema
  $ ulu lang adl --json          # JSON output
  $ ulu lang adl -o adl.json     # Write schema to file
`);

  // ulu lang (no subcommand = list)
  lang
    .argument('[id]', 'Language ID (adl, cdl, wdl, pdl)')
    .option('-o, --output <path>', 'Write JSON Schema to file')
    .action(async (id: string | undefined, options: { output?: string }, cmd: Command) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        if (!id) {
          // List all languages
          const result = await withSpinner(
            ctx,
            { start: 'Fetching languages...', failure: 'Failed to fetch languages' },
            () => ctx.client.languages.list()
          );

          if (ctx.json) {
            console.log(JSON.stringify(result, null, 2));
          } else {
            for (const lang of result.languages) {
              console.log(`  ${lang.abbreviation.padEnd(5)} v${lang.currentVersion.padEnd(8)} ${lang.displayName}`);
            }
            console.log(`\n${result.total} languages`);
          }
        } else {
          // Get specific language with schema
          const language = await withSpinner(
            ctx,
            { start: `Fetching ${id.toUpperCase()}...`, failure: `Failed to fetch ${id}` },
            () => ctx.client.languages.get(id)
          );

          if (options.output) {
            await writeFile(options.output, JSON.stringify(language.schema.content, null, 2), 'utf-8');
            console.log(`${language.abbreviation} v${language.currentVersion} schema written to ${options.output}`);
          } else if (ctx.json) {
            console.log(JSON.stringify(language, null, 2));
          } else {
            console.log(`  ${language.displayName} (${language.abbreviation})`);
            console.log(`  Version:  ${language.currentVersion}`);
            console.log(`  Type:     ${language.definitionType}`);
            console.log(`  Status:   ${language.status}`);
            console.log(`  Schema:   ${language.schema.title}`);
            console.log(`  URL:      ${language.schema.schemaUrl}`);
            console.log(`\n  Use --json for full schema content or -o <file> to save.`);
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
