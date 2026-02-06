import { Command } from 'commander';
import { createOpsContext, handleOpsError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';

/**
 * Register taxonomy commands
 */
export function registerTaxonomyCommands(program: Command): void {
  const taxonomy = program
    .command('taxonomy')
    .description('Inspect the failure taxonomy schema');

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
          for (const domain of schema.failureDomains) {
            console.log(`  ${domain.code} - ${domain.name}`);
            console.log(`    ${domain.description}`);
          }

          console.log('\nSeverity Codes:');
          for (const sev of schema.severityCodes) {
            console.log(`  ${sev.code} - ${sev.severity}: ${sev.description}`);
          }

          console.log(`\nFailure Code Pattern: ${schema.failureCodePattern}`);
          console.log(`Severities: ${schema.severities.join(', ')}`);
          console.log(`Priorities: ${schema.priorities.join(', ')}`);
          console.log(`Statuses: ${schema.statuses.join(', ')}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
