import type { Command } from 'commander';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import {
  formatProject,
  formatProjectSummary,
  formatProjects,
} from '../formatters/ops.js';
import { confirmOrExit, parseIntOption, withSpinner } from '../utils.js';

/**
 * Register project commands
 */
export function registerProjectCommands(program: Command): void {
  const projects = program
    .command('projects')
    .alias('p')
    .description('Manage projects')
    .addHelpText(
      'after',
      `
Examples:
  $ ulu projects list
  $ ulu projects get ops-sdk
  $ ulu projects summary ops-sdk
  $ ulu projects trends ops-sdk --days 7
  $ ulu projects create my-project
  $ ulu projects delete my-project --yes
  $ ulu projects rehome my-project --to ulu-labs --org acme --reason "team took it over"
`,
    );

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
          {
            start: 'Fetching projects...',
            failure: 'Failed to fetch projects',
          },
          // ops-sdk 6.0.0 (T13): {data, total} envelope.
          () => ctx.client.projects.list().then((r) => r.data),
        );

        if (ctx.json) {
          emitJson(ctx, data, 'project.list');
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
    .description('Get project details by name or ID')
    .addHelpText(
      'after',
      `
Example:
  $ ulu projects get ops-sdk
  $ ulu projects get ff066304-...
`,
    )
    .action(async (name: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const project = await withSpinner(
          ctx,
          { start: 'Fetching project...', failure: 'Failed to fetch project' },
          () => ctx.client.projects.get(name),
        );

        if (!project || !project.id) {
          console.error('Error: Project not found');
          process.exit(1);
        }

        if (ctx.json) {
          emitJson(ctx, project, 'project.get');
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
          {
            start: 'Creating project...',
            success: 'Project created',
            failure: 'Failed to create project',
          },
          () => ctx.client.projects.create({ name }),
        );

        if (ctx.json) {
          emitJson(ctx, project, 'project.create');
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

      // Confirm deletion (fails closed in non-interactive contexts)
      const action = options.force ? 'permanently delete' : 'soft-delete';
      // Name the org and its source (run #187, trust-boundary F10): two orgs
      // holding the same project name is the spec's premise, so a prompt that
      // names only the project confirms the wrong thing. Same shape as the
      // `run save` print — org, source, base URL (a slug is server-relative).
      await confirmOrExit(
        `${action} project "${name}" in org ${ctx.org ?? 'personal'} (${ctx.orgSource}) at ${ctx.baseUrl}?`,
        options.yes,
      );

      try {
        if (options.force) {
          await withSpinner(
            ctx,
            {
              start: 'Deleting project...',
              success: 'Project permanently deleted',
              failure: 'Failed to delete project',
            },
            () =>
              ctx.client.projects.delete(name, {
                confirm: true,
                confirmationPhrase: name,
              }),
          );
        } else {
          await withSpinner(
            ctx,
            {
              start: 'Deleting project...',
              success: 'Project soft-deleted',
              failure: 'Failed to delete project',
            },
            () =>
              ctx.client.projects.softDelete(name, {
                confirm: true,
                confirmationPhrase: name,
              }),
          );
        }

        if (ctx.json) {
          emitJson(
            ctx,
            { success: true, name, hardDelete: !!options.force },
            'project.delete',
          );
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
          {
            start: 'Restoring project...',
            success: 'Project restored',
            failure: 'Failed to restore project',
          },
          () => ctx.client.projects.restore(name),
        );

        if (ctx.json) {
          emitJson(ctx, project, 'project.restore');
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
          () => ctx.client.projects.getSummary(name),
        );

        if (ctx.json) {
          emitJson(ctx, summary, 'project.summary');
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
          () =>
            ctx.client.projects.getTrends(name, {
              days: parseIntOption(options.days, '--days'),
            }),
        );

        if (ctx.json) {
          emitJson(ctx, trends, 'project.trends');
        } else if (trends.daily.length === 0) {
          console.log('No trend data available');
        } else {
          console.log(`Issue trends for ${name} (last ${trends.days} days):\n`);
          for (const point of trends.daily.slice(-10)) {
            const bar = '#'.repeat(Math.min(point.total, 50));
            console.log(
              `${point.date}: ${bar} ${point.total} total (+${point.new} new, -${point.resolved} resolved)`,
            );
          }
          if (trends.daily.length > 10) {
            console.log(
              `\n... showing last 10 of ${trends.daily.length} data points`,
            );
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects rename <name>
  projects
    .command('rename <name>')
    .description('Rename a project')
    .requiredOption('-n, --new-name <name>', 'New project name')
    .action(async (name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const project = await withSpinner(
          ctx,
          {
            start: 'Renaming project...',
            success: 'Project renamed',
            failure: 'Failed to rename project',
          },
          () =>
            ctx.client.projects.rename({
              oldName: name,
              newName: options.newName,
            }),
        );

        if (ctx.json) {
          emitJson(ctx, project, 'project.rename');
        } else {
          console.log(`Project renamed: ${name} → ${project.name}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects rehome <name> --to <org>
  projects
    .command('rehome <name>')
    .description(
      'Move a project and its whole history into another org (source = --org / workspace default / personal)',
    )
    .requiredOption(
      '-t, --to <org>',
      'Destination org slug (you must be admin/owner there; a personal org only if it is yours)',
    )
    .option(
      '-r, --reason <text>',
      'Why it is moving (≤ 500 chars; stored on the audit record)',
    )
    .option('-y, --yes', 'Skip confirmation prompt')
    .addHelpText(
      'after',
      `
The SOURCE org is the one this CLI is scoped to — \`--org <slug>\`, else the nearest .uluops.json,
else ULUOPS_ORG_SLUG (from your shell, ./.env or ~/.uluops/.env), else your personal org. The
project is looked up THERE: a work-org project without --org is looked up in that default — moved
if a same-named project lives there, otherwise a 404 — never a search. The confirmation prompt is
the one place both orgs and the source's provenance are shown BEFORE the write; \`-y\` skips it, so a
script sees them only on the success line, after the move. \`--to\` takes the target's real slug
("personal" is not a slug). After the move the old address is a 410 PROJECT_REHOMED tombstone
(an org-less write there does not fork a new project); moving back is the same command the other
way — and a re-run of THIS command after the move answers 404 (the project is no longer in the
source), not "already there".
`,
    )
    .action(async (name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      // `--org personal` is a resolver sentinel; `--to personal` would go to the
      // wire as a literal slug and 404 with "check the name" (code-auditor,
      // 2026-09-15). A personal target must be named by its real slug.
      if (String(options.to).toLowerCase() === 'personal') {
        handleOpsError(
          new Error(
            '--to takes the target org\'s real slug; "personal" is not a slug. Your personal org\'s slug is shown by "ulu auth whoami".',
          ),
          ctx,
        );
      }

      // Both orgs in the prompt, source with its provenance (the trust-boundary
      // F10 shape): a move is the one write where naming only the project
      // confirms nothing — the same name can exist in every org involved.
      // Provenance is the detailed form (which .uluops.json; shell vs env file).
      await confirmOrExit(
        `move project "${name}" from org ${ctx.org ?? 'personal'} (${ctx.orgProvenance}) to org ${options.to} at ${ctx.baseUrl}?`,
        options.yes,
      );

      try {
        const result = await withSpinner(
          ctx,
          {
            start: 'Moving project...',
            success: 'Project moved',
            failure: 'Failed to move project',
          },
          () =>
            ctx.client.projects.rehome(name, {
              targetOrg: options.to,
              ...(options.reason !== undefined
                ? { reason: options.reason }
                : {}),
            }),
        );

        if (ctx.json) {
          emitJson(ctx, result, 'project.rehome');
        } else {
          // The success line carries what the prompt carried: with `-y` this is
          // the only record a script keeps of WHERE the move landed.
          console.log(
            `Project moved: ${result.name} — ${result.rehome.from_org.slug} → ${result.rehome.to_org.slug} (id ${result.id}) at ${ctx.baseUrl} [source: ${ctx.orgProvenance}]`,
          );
          console.log(
            `The old address in ${result.rehome.from_org.slug} is now a tombstone; org-less writes there answer 410 PROJECT_REHOMED naming ${result.rehome.to_org.slug}.`,
          );
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects bulk-update-issues <name>
  projects
    .command('bulk-update-issues <name>')
    .description('Batch update issue statuses for a project')
    .requiredOption('--ids <ids>', 'Comma-separated issue IDs')
    .requiredOption(
      '-s, --status <status>',
      'New status (open, completed, deferred, wontfix)',
    )
    .option('-r, --reason <reason>', 'Reason for status change')
    .action(async (name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      const issueIds = (options.ids as string)
        .split(',')
        .map((id: string) => id.trim())
        .filter(Boolean);
      const updates = issueIds.map((id: string) => ({
        issueId: id,
        status: options.status,
        reason: options.reason,
      }));

      try {
        const results = await withSpinner(
          ctx,
          {
            start: `Updating ${updates.length} issues...`,
            success: 'Issues updated',
            failure: 'Failed to update issues',
          },
          () => ctx.client.projects.bulkUpdateIssueStatus(name, updates),
        );

        if (ctx.json) {
          emitJson(ctx, results, 'project.bulkUpdateIssues');
        } else {
          console.log(`Updated ${results.updated} issues in project ${name}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu projects merge-issues <name>
  projects
    .command('merge-issues <name>')
    .description('Merge duplicate issues into a target issue')
    .requiredOption(
      '-t, --target <id>',
      'Target issue ID (issues merge into this)',
    )
    .requiredOption('-s, --sources <ids>', 'Comma-separated source issue IDs')
    .option(
      '--strategy <strategy>',
      'Merge strategy (keep_target, keep_highest_priority)',
      'keep_target',
    )
    .action(async (name: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      const sourceIds = (options.sources as string)
        .split(',')
        .map((id: string) => id.trim())
        .filter(Boolean);

      try {
        const result = await withSpinner(
          ctx,
          {
            start: 'Merging issues...',
            success: 'Issues merged',
            failure: 'Failed to merge issues',
          },
          () =>
            ctx.client.projects.mergeIssues(name, {
              targetIssueId: options.target,
              sourceIssueIds: sourceIds,
              strategy: options.strategy as
                | 'keep_target'
                | 'keep_highest_priority',
            }),
        );

        if (ctx.json) {
          emitJson(ctx, result, 'project.mergeIssues');
        } else {
          console.log(
            `Merged ${result.mergedCount} issues into ${result.targetIssueId.slice(0, 8)}`,
          );
          console.log(`Migrated ${result.migratedOccurrences} occurrences`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
