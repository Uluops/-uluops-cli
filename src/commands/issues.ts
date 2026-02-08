import { Command } from 'commander';
import { createOpsContext, handleOpsError, type GlobalOptions } from '../context.js';
import { withSpinner } from '../utils.js';
import { formatIssues, formatIssue } from '../formatters/ops.js';
import type { Status, Priority, Severity, FailureDomain, IssueType } from '@uluops/ops-sdk';

/**
 * Register issue commands
 */
export function registerIssueCommands(program: Command): void {
  const issues = program
    .command('issues')
    .description('Manage validation issues');

  // ulu issues list <project>
  issues
    .command('list <project>')
    .description('List issues for a project')
    .option('-s, --status <status>', 'Filter by status (open, completed, deferred, wontfix)')
    .option('-p, --priority <priority>', 'Filter by priority (critical, suggested, backlog)')
    .option('--severity <severity>', 'Filter by severity (critical, high, medium, low, info)')
    .option('-v, --validator <name>', 'Filter by validator')
    .option('-d, --domain <domain>', 'Filter by failure domain (STR, SEM, PRA, EPI)')
    .option('-l, --limit <number>', 'Maximum number of issues', '50')
    .option('--include-resolved', 'Include resolved issues')
    .action(async (project: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching issues...', failure: 'Failed to fetch issues' },
          () => ctx.client.issues.listByProject(project, {
            status: options.status as Status | undefined,
            priority: options.priority as Priority | undefined,
            severity: options.severity as Severity | undefined,
            validator: options.validator,
            failureDomain: options.domain as FailureDomain | undefined,
            limit: parseInt(options.limit, 10),
            includeResolved: options.includeResolved,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No issues found');
        } else {
          console.log(formatIssues(data));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues get <id>
  issues
    .command('get <id>')
    .description('Get issue details')
    .option('--full', 'Include occurrences and notes')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        if (options.full) {
          const details = await withSpinner(
            ctx,
            { start: 'Fetching issue...', failure: 'Failed to fetch issue' },
            () => ctx.client.issues.getDetails(id)
          );

          if (ctx.json) {
            console.log(JSON.stringify(details, null, 2));
          } else {
            console.log(formatIssue(details.issue));

            if (details.occurrences.length > 0) {
              console.log(`\nOccurrences (${details.occurrences.length}):`);
              for (const occ of details.occurrences.slice(0, 5)) {
                console.log(`  - ${occ.validator} at ${occ.filePath ?? '(no file)'}${occ.lineNumber ? `:${occ.lineNumber}` : ''}`);
              }
              if (details.occurrences.length > 5) {
                console.log(`  ... and ${details.occurrences.length - 5} more`);
              }
            }

            if (details.notes.length > 0) {
              console.log(`\nNotes (${details.notes.length}):`);
              for (const note of details.notes) {
                console.log(`  [${note.noteType}] ${note.content.slice(0, 100)}${note.content.length > 100 ? '...' : ''}`);
              }
            }

            if (details.statusHistory.length > 0) {
              console.log(`\nStatus History (${details.statusHistory.length} changes)`);
            }
          }
        } else {
          const issue = await withSpinner(
            ctx,
            { start: 'Fetching issue...', failure: 'Failed to fetch issue' },
            () => ctx.client.issues.get(id)
          );

          if (ctx.json) {
            console.log(JSON.stringify(issue, null, 2));
          } else {
            console.log(formatIssue(issue));
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues search
  issues
    .command('search')
    .description('Search issues across projects')
    .requiredOption('--query <text>', 'Search query')
    .option('-p, --projects <names>', 'Filter by project names (comma-separated)')
    .option('-s, --status <status>', 'Filter by status')
    .option('--priority <priority>', 'Filter by priority')
    .option('-l, --limit <number>', 'Maximum number of results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Searching...', failure: 'Search failed' },
          () => ctx.client.issues.search({
            query: options.query,
            projects: options.projects?.split(','),
            status: options.status as Status | undefined,
            priority: options.priority as Priority | undefined,
            limit: parseInt(options.limit, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No issues found');
        } else {
          console.log(formatIssues(data));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues update <id>
  issues
    .command('update <id>')
    .description('Update issue status')
    .requiredOption('-s, --status <status>', 'New status (open, completed, deferred, wontfix)')
    .option('-r, --reason <text>', 'Reason for status change')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          { start: 'Updating issue...', success: 'Issue updated', failure: 'Failed to update issue' },
          () => ctx.client.issues.updateStatus(id, {
            status: options.status as Status,
            reason: options.reason,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(`Issue ${id.slice(0, 8)} status changed to: ${issue.status}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues close <id>
  issues
    .command('close <id>')
    .description('Close an issue (mark as completed)')
    .option('-r, --reason <text>', 'Reason for closing')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          { start: 'Closing issue...', success: 'Issue closed', failure: 'Failed to close issue' },
          () => ctx.client.issues.updateStatus(id, {
            status: 'completed',
            reason: options.reason ?? 'Closed via CLI',
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(`Issue ${id.slice(0, 8)} closed`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues add-note <id>
  issues
    .command('add-note <id>')
    .description('Add a note to an issue')
    .requiredOption('-m, --message <text>', 'Note content')
    .option('-t, --type <type>', 'Note type (context, resolution, blocker)', 'context')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const note = await withSpinner(
          ctx,
          { start: 'Adding note...', success: 'Note added', failure: 'Failed to add note' },
          () => ctx.client.issues.addNote(id, {
            content: options.message,
            noteType: options.type as 'context' | 'resolution' | 'blocker',
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(note, null, 2));
        } else {
          console.log(`Note added to issue ${id.slice(0, 8)}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues history <id>
  issues
    .command('history <id>')
    .description('Show issue status history')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const history = await withSpinner(
          ctx,
          { start: 'Fetching history...', failure: 'Failed to fetch history' },
          () => ctx.client.issues.getHistory(id)
        );

        if (ctx.json) {
          console.log(JSON.stringify(history, null, 2));
        } else if (history.length === 0) {
          console.log('No status history');
        } else {
          console.log('Status History:');
          for (const entry of history) {
            const date = new Date(entry.changedAt).toLocaleString();
            console.log(`  ${date}: ${entry.oldStatus ?? '(new)'} → ${entry.newStatus}`);
            if (entry.reason) {
              console.log(`    Reason: ${entry.reason}`);
            }
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues undo <id>
  issues
    .command('undo <id>')
    .description('Undo the last status change')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          { start: 'Undoing change...', success: 'Change undone', failure: 'Failed to undo change' },
          () => ctx.client.issues.undoLastChange(id)
        );

        if (ctx.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(`Issue ${id.slice(0, 8)} restored to: ${issue.status}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues create
  issues
    .command('create')
    .description('Create a user-submitted issue')
    .requiredOption('-p, --project <name>', 'Project name')
    .requiredOption('-t, --title <text>', 'Issue title')
    .requiredOption('--priority <priority>', 'Priority (critical, suggested, backlog)')
    .option('--severity <severity>', 'Severity (critical, high, medium, low, info)')
    .option('-v, --validator <name>', 'Validator name')
    .option('--category <category>', 'Issue category')
    .option('--description <text>', 'Detailed description')
    .option('--file-path <path>', 'File path where issue was found')
    .option('--line <number>', 'Line number in file')
    .option('--failure-code <code>', 'Failure code (e.g., SEM-VAL/H)')
    .option('--domain <domain>', 'Failure domain (STR, SEM, PRA, EPI)')
    .option('--type <type>', 'Issue type (bug, feature, refactor, config, docs, infra, security, test)')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          { start: 'Creating issue...', success: 'Issue created', failure: 'Failed to create issue' },
          () => ctx.client.issues.create({
            project: options.project,
            title: options.title,
            priority: options.priority as Priority,
            severity: options.severity as Severity | undefined,
            validator: options.validator,
            category: options.category,
            description: options.description,
            filePath: options.filePath,
            lineNumber: options.line ? parseInt(options.line, 10) : undefined,
            failureCode: options.failureCode,
            failureDomain: options.domain as FailureDomain | undefined,
            type: options.type as IssueType | undefined,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(formatIssue(issue));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues edit <id>
  issues
    .command('edit <id>')
    .description('Edit issue metadata')
    .option('-t, --title <text>', 'New title')
    .option('--severity <severity>', 'New severity (critical, high, medium, low, info)')
    .option('--priority <priority>', 'New priority (critical, suggested, backlog)')
    .option('--category <category>', 'New category')
    .option('--file-path <path>', 'New file path')
    .option('--line <number>', 'New line number')
    .option('--failure-code <code>', 'New failure code')
    .option('--domain <domain>', 'New failure domain (STR, SEM, PRA, EPI)')
    .option('--type <type>', 'New issue type')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      const input: Record<string, unknown> = {};
      if (options.title !== undefined) input.title = options.title;
      if (options.severity !== undefined) input.severity = options.severity;
      if (options.priority !== undefined) input.priority = options.priority;
      if (options.category !== undefined) input.category = options.category;
      if (options.filePath !== undefined) input.filePath = options.filePath;
      if (options.line !== undefined) input.lineNumber = parseInt(options.line, 10);
      if (options.failureCode !== undefined) input.failureCode = options.failureCode;
      if (options.domain !== undefined) input.failureDomain = options.domain;
      if (options.type !== undefined) input.type = options.type;

      if (Object.keys(input).length === 0) {
        console.error('Error: At least one field to edit is required');
        process.exit(1);
      }

      try {
        const issue = await withSpinner(
          ctx,
          { start: 'Updating issue...', success: 'Issue updated', failure: 'Failed to update issue' },
          () => ctx.client.issues.edit(id, input)
        );

        if (ctx.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(formatIssue(issue));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues restore <id>
  issues
    .command('restore <id>')
    .description('Restore a soft-deleted issue')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          { start: 'Restoring issue...', success: 'Issue restored', failure: 'Failed to restore issue' },
          () => ctx.client.issues.restore(id)
        );

        if (ctx.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(`Issue ${id.slice(0, 8)} restored (status: ${issue.status})`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues bulk-update
  issues
    .command('bulk-update')
    .description('Bulk update issue statuses')
    .requiredOption('-s, --status <status>', 'New status (open, completed, deferred, wontfix)')
    .requiredOption('-i, --ids <ids>', 'Comma-separated issue IDs')
    .option('-r, --reason <text>', 'Reason for status change')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      const ids = (options.ids as string).split(',').map((id: string) => id.trim()).filter(Boolean);
      if (ids.length === 0) {
        console.error('Error: At least one issue ID is required');
        process.exit(1);
      }

      const updates = ids.map((id: string) => ({
        issueId: id,
        status: options.status as Status,
        reason: options.reason,
      }));

      try {
        const results = await withSpinner(
          ctx,
          { start: `Updating ${ids.length} issues...`, success: 'Issues updated', failure: 'Failed to update issues' },
          () => ctx.client.issues.bulkUpdateStatus(updates)
        );

        if (ctx.json) {
          console.log(JSON.stringify(results, null, 2));
        } else {
          console.log(`Updated ${results.length} issues to: ${options.status}`);
          for (const r of results) {
            console.log(`  ${r.id.slice(0, 8)}: ${r.previousStatus} → ${r.newStatus}`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues by-fingerprint <fingerprint>
  issues
    .command('by-fingerprint <fingerprint>')
    .description('Get issue by fingerprint')
    .requiredOption('-p, --project <name>', 'Project name')
    .action(async (fingerprint: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          { start: 'Fetching issue...', failure: 'Failed to fetch issue' },
          () => ctx.client.issues.getByFingerprint(fingerprint, options.project)
        );

        if (ctx.json) {
          console.log(JSON.stringify(issue, null, 2));
        } else {
          console.log(formatIssue(issue));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues update-by-fingerprint <fingerprint>
  issues
    .command('update-by-fingerprint <fingerprint>')
    .description('Update issue status by fingerprint')
    .requiredOption('-p, --project <name>', 'Project name')
    .requiredOption('-s, --status <status>', 'New status (open, completed, deferred, wontfix)')
    .option('-r, --reason <text>', 'Reason for status change')
    .action(async (fingerprint: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Updating issue...', success: 'Issue updated', failure: 'Failed to update issue' },
          () => ctx.client.issues.updateStatusByFingerprint(fingerprint, options.project, {
            status: options.status as Status,
            reason: options.reason,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Issue ${result.id.slice(0, 8)}: ${result.previousStatus} → ${result.newStatus}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
