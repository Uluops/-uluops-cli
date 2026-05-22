import { Command } from 'commander';
import { createOpsContext, handleOpsError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';

/**
 * Register taxonomy commands
 */
export function registerTaxonomyCommands(program: Command): void {
  const taxonomy = program
    .command('taxonomy')
    .description('Inspect the failure taxonomy schema')
    .addHelpText('after', `
Examples:
  $ ulu taxonomy get
  $ ulu taxonomy get --json
`);

  // ulu taxonomy get
  taxonomy
    .command('get')
    .description('Display the failure taxonomy schema (domains, severity codes, statuses)')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const schema = await withSpinner(
          ctx,
          { start: 'Fetching taxonomy...', failure: 'Failed to fetch taxonomy' },
          () => ctx.client.taxonomy.get()
        );

        if (ctx.json) {
          console.log(JSON.stringify(schema, null, 2));
        } else {
          console.log('Failure Domains:');
          for (const domain of schema.domains) {
            console.log(`  ${domain.code} - ${domain.name}`);
            console.log(`    ${domain.description}`);
            for (const mode of domain.modes) {
              console.log(`      ${mode.code} - ${mode.name}`);
            }
          }

          console.log('\nSeverities:');
          for (const sev of schema.severities) {
            console.log(`  ${sev.code} - ${sev.name} (weight: ${sev.weight})`);
          }

          console.log(`\nFailure Code Pattern: ${schema.failureCodePattern.pattern}`);
          console.log(`Priorities: ${schema.priorities.join(', ')}`);
          console.log(`Statuses: ${schema.statuses.join(', ')}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
