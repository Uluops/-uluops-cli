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
import { registerAdminCommands } from './commands/admin.js';
import { registerTaxonomyCommands } from './commands/taxonomy.js';

// Registry commands
import { registerDefinitionCommands } from './commands/definitions.js';
import { registerVersionCommands } from './commands/versions.js';
import { registerRenderCommands } from './commands/render.js';
import { registerDepsCommands } from './commands/deps.js';
import { registerForkCommands } from './commands/forks.js';
import { registerModelCommands } from './commands/models.js';
import { registerExecutionCommands } from './commands/executions.js';
import { registerTranslationCommands } from './commands/translation.js';

// Infrastructure commands
import { registerConfigCommands } from './commands/config.js';
import { registerCompletionCommands } from './commands/completion.js';

// Get package.json for version
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJsonPath = join(__dirname, '..', 'package.json');
const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));

const program = new Command();

program
  .name('ulu')
  .description('UluOps CLI - validation tracking and registry management')
  .version(packageJson.version, '-V, --version', 'Output the version number')
  .option('--api-key <key>', 'API key (overrides environment variable)')
  .option('--profile <name>', 'Config profile to use', 'default')
  .option('--base-url <url>', 'API base URL')
  .option('--json', 'Output in JSON format for scripting')
  .option('--debug', 'Enable debug output')
  .option('-q, --quiet', 'Suppress spinners and non-essential output');

// Ops commands
registerAuthCommands(program);
registerProjectCommands(program);
registerRunCommands(program);
registerIssueCommands(program);
registerAnalyticsCommands(program);
registerAdminCommands(program);
registerTaxonomyCommands(program);

// Registry commands
registerDefinitionCommands(program);
registerVersionCommands(program);
registerRenderCommands(program);
registerDepsCommands(program);
registerForkCommands(program);
registerModelCommands(program);
registerExecutionCommands(program);
registerTranslationCommands(program);

// Infrastructure commands
registerConfigCommands(program);
registerCompletionCommands(program);

// Default action when no command is provided
program.action(() => {
  program.help();
});

// Parse and execute
program.parse();
