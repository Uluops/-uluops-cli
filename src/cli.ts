#!/usr/bin/env node
import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Ops commands
import { registerAuthCommands } from './commands/auth.js';
import { registerProjectCommands } from './commands/projects.js';
import { registerRunCommands } from './commands/runs.js';
import { registerIssueCommands } from './commands/issues.js';
import { registerAnalyticsCommands } from './commands/analytics.js';

import { registerTaxonomyCommands } from './commands/taxonomy.js';

// Registry commands
import { registerDefinitionCommands } from './commands/definitions.js';
import { registerVersionCommands } from './commands/versions.js';
import { registerDepsCommands } from './commands/deps.js';
import { registerForkCommands } from './commands/forks.js';
import { registerModelCommands } from './commands/models.js';
import { registerExecutionCommands } from './commands/executions.js';
import { registerTranslationCommands } from './commands/translation.js';

// Core SDK commands
import { registerExecCommands } from './commands/exec.js';

// Infrastructure commands
import { registerCompletionCommands } from './commands/completion.js';

// Load .env files early so all SDK contexts see them
import { loadEnvFiles } from '@uluops/ops-sdk';
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
  const debug = process.argv.includes('--debug');
  console.error('Error: An unexpected error occurred.');
  if (debug && reason instanceof Error && reason.stack) {
    console.error('\nStack trace:', reason.stack);
  } else if (!debug) {
    console.error('Run with --debug for more details.');
  }
  process.exit(1);
});

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
let version = '0.0.0';
try {
  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  version = packageJson.version;
} catch {
  // Broken install — use fallback version
}

const program = new Command();

program
  .name('ulu')
  .description('UluOps CLI - validation tracking and registry management')
  .version(version, '-V, --version', 'Output the version number')
  .option('--api-key <key>', 'API key (overrides environment variable)')
  .option('--profile <name>', 'Config profile to use', 'default')
  .option('--base-url <url>', 'API base URL')
  .option('--timeout <ms>', 'Request timeout in milliseconds (default: 30000)')
  .option('--json', 'Output in JSON format for scripting')
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
