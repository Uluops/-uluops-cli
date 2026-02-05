import { Command } from 'commander';
import { createOpsContext, handleOpsError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';
import {
  formatProjects,
  formatProject,
  formatProjectSummary,
} from '../formatters/ops.js';

/**
 * Register project commands
 */
export function registerProjectCommands(program: Command): void {
  const projects = program
    .command('projects')
    .description('Manage projects');

  // ulu projects list
  projects
    .command('list')
    .description('List all projects')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching projects...', failure: 'Failed to fetch projects' },
          () => ctx.client.projects.list()
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No projects found');
        } else {
          console.log(formatProjects(data));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects get <name>
  projects
    .command('get <name>')
    .description('Get project details')
    .action(async (name: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const project = await withSpinner(
          ctx,
          { start: 'Fetching project...', failure: 'Failed to fetch project' },
          () => ctx.client.projects.get(name)
        );

        if (ctx.json) {
          console.log(JSON.stringify(project, null, 2));
        } else {
          console.log(formatProject(project));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects create <name>
  projects
    .command('create <name>')
    .description('Create a new project')
    .action(async (name: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const project = await withSpinner(
          ctx,
          { start: 'Creating project...', success: 'Project created', failure: 'Failed to create project' },
          () => ctx.client.projects.create({ name })
        );

        if (ctx.json) {
          console.log(JSON.stringify(project, null, 2));
        } else {
          console.log(formatProject(project));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects delete <name>
  projects
    .command('delete <name>')
    .description('Delete a project')
    .option('--force', 'Hard delete (permanent, cannot be restored)')
    .option('-y, --yes', 'Skip confirmation prompt')
    .action(async (name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      // Confirm deletion
      if (!options.yes) {
        console.log(`\nThis will ${options.force ? 'permanently delete' : 'soft-delete'} project: ${name}`);
        console.log('To confirm, run again with --yes flag');
        process.exit(0);
      }

      try {
        if (options.force) {
          await withSpinner(
            ctx,
            { start: 'Deleting project...', success: 'Project permanently deleted', failure: 'Failed to delete project' },
            () => ctx.client.projects.delete(name, { confirm: true, confirmationPhrase: name })
          );
        } else {
          await withSpinner(
            ctx,
            { start: 'Deleting project...', success: 'Project soft-deleted', failure: 'Failed to delete project' },
            () => ctx.client.projects.softDelete(name, { confirm: true, confirmationPhrase: name })
          );
        }

        if (ctx.json) {
          console.log(JSON.stringify({ success: true, name, hardDelete: !!options.force }, null, 2));
        } else if (!options.force) {
          console.log('Use "ulu projects restore" to recover this project');
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects restore <name>
  projects
    .command('restore <name>')
    .description('Restore a soft-deleted project')
    .action(async (name: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const project = await withSpinner(
          ctx,
          { start: 'Restoring project...', success: 'Project restored', failure: 'Failed to restore project' },
          () => ctx.client.projects.restore(name)
        );

        if (ctx.json) {
          console.log(JSON.stringify(project, null, 2));
        } else {
          console.log(formatProject(project));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects summary <name>
  projects
    .command('summary <name>')
    .description('Get project summary with issue counts and latest run')
    .action(async (name: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const summary = await withSpinner(
          ctx,
          { start: 'Fetching summary...', failure: 'Failed to fetch summary' },
          () => ctx.client.projects.getSummary(name)
        );

        if (ctx.json) {
          console.log(JSON.stringify(summary, null, 2));
        } else {
          console.log(formatProjectSummary(summary));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects trends <name>
  projects
    .command('trends <name>')
    .description('Get project issue trends over time')
    .option('-d, --days <number>', 'Number of days to include', '30')
    .action(async (name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const trends = await withSpinner(
          ctx,
          { start: 'Fetching trends...', failure: 'Failed to fetch trends' },
          () => ctx.client.projects.getTrends(name, { days: parseInt(options.days, 10) })
        );

        if (ctx.json) {
          console.log(JSON.stringify(trends, null, 2));
        } else if (trends.length === 0) {
          console.log('No trend data available');
        } else {
          console.log(`Issue trends for ${name} (last ${options.days} days):\n`);
          for (const point of trends.slice(-10)) {
            const bar = '#'.repeat(Math.min(point.openIssues, 50));
            console.log(`${point.date}: ${bar} ${point.openIssues} open (+${point.newIssues} new, -${point.resolvedIssues} resolved)`);
          }
          if (trends.length > 10) {
            console.log(`\n... showing last 10 of ${trends.length} data points`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
