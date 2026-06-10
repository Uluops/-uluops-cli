#!/usr/bin/env node
// Load .env files early so all SDK contexts see them
import { loadEnvFiles } from '@uluops/ops-sdk';
import { Command } from 'commander';
import { registerAnalyticsCommands } from './commands/analytics.js';
// Ops commands
import { registerAuthCommands } from './commands/auth.js';
// Infrastructure commands
import { registerCompletionCommands } from './commands/completion.js';
// Registry commands
import { registerDefinitionCommands } from './commands/definitions.js';
import { registerDepsCommands } from './commands/deps.js';
// Core SDK commands
import { registerExecCommands } from './commands/exec.js';
import { registerExecutionCommands } from './commands/executions.js';
import { registerForkCommands } from './commands/forks.js';
import { registerIssueCommands } from './commands/issues.js';
import { registerLanguageCommands } from './commands/languages.js';
import { registerModelCommands } from './commands/models.js';
import { registerProjectCommands } from './commands/projects.js';
import { registerRunCommands } from './commands/runs.js';
import { registerTaxonomyCommands } from './commands/taxonomy.js';
import { registerTranslationCommands } from './commands/translation.js';
import { registerVersionCommands } from './commands/versions.js';
import { getCliVersion } from './version.js';

loadEnvFiles();

// Handle EPIPE gracefully (e.g., piping to head, or broken pipe)
process.stdout.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});
process.stderr.on('error', (err) => {
  if (err.code === 'EPIPE') process.exit(0);
  throw err;
});

// Handle SIGINT/SIGTERM gracefully (e.g., Ctrl-C during long-running exec)
process.on('SIGINT', () => {
  console.error('\nInterrupted');
  process.exit(130);
});
process.on('SIGTERM', () => {
  process.exit(143);
});

// Global unhandled rejection handler (defense-in-depth)
process.on('unhandledRejection', (reason) => {
  // Honor both the --debug flag and ULUOPS_DEBUG env: captive CI that cannot
  // re-run to add the flag can set the env once and still get the stack.
  const debug =
    process.argv.includes('--debug') || process.env['ULUOPS_DEBUG'] === 'true';
  // Always surface the error message — it is the one actionable line a captive
  // caller (CI, agent harness) gets, and they often cannot reproduce to add
  // --debug. Only the full stack is gated behind debug mode.
  const message = reason instanceof Error ? reason.message : String(reason);
  console.error(`Error: ${message || 'An unexpected error occurred.'}`);
  if (debug && reason instanceof Error && reason.stack) {
    console.error('\nStack trace:', reason.stack);
  } else if (!debug) {
    console.error('Run with --debug (or ULUOPS_DEBUG=true) for more details.');
  }
  process.exit(1);
});

const version = getCliVersion();

// Opt into the versioned --json envelope (additive; default --json shape is
// unchanged). A convenience alias for `ULU_JSON_SCHEMA=1`; emitJson reads the
// env var as the single source of truth, so set it before any command parses.
if (process.argv.includes('--json-envelope')) {
  process.env['ULU_JSON_SCHEMA'] = '1';
}

const program = new Command();

program
  .name('ulu')
  .description('UluOps CLI - validation tracking and registry management')
  .version(version, '-V, --version', 'Output the version number')
  .option('--api-key <key>', 'API key (overrides environment variable)')
  .option('--profile <name>', 'Config profile to use', 'default')
  .option('--base-url <url>', 'API base URL')
  .option(
    '--timeout <ms>',
    'Request timeout in milliseconds (default: 30000 for ops/registry, 600000 for exec)',
  )
  .option('--json', 'Output in JSON format for scripting')
  .option(
    '--json-envelope',
    'Wrap --json output in a versioned envelope ({ schema, cliVersion, kind, schemaVersion, data }); same as ULU_JSON_SCHEMA=1',
  )
  .option('--debug', 'Enable debug output')
  .option('-q, --quiet', 'Suppress spinners and non-essential output')
  .showHelpAfterError(true);

// Ops commands
registerAuthCommands(program);
registerProjectCommands(program);
registerRunCommands(program);
registerIssueCommands(program);
registerAnalyticsCommands(program);

registerTaxonomyCommands(program);

// Registry commands
registerDefinitionCommands(program);
registerVersionCommands(program);
registerDepsCommands(program);
registerForkCommands(program);
registerModelCommands(program);
registerExecutionCommands(program);
registerTranslationCommands(program);
registerLanguageCommands(program);

// Core SDK commands
registerExecCommands(program);

// Infrastructure commands
registerCompletionCommands(program);

// Default action when no command is provided
program.action(() => {
  program.help();
});

// Parse and execute
program.parse();
