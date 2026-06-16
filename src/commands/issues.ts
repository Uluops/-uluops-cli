import type {
  FailureDomain,
  IssueHistoryEnvelope,
  IssueType,
  Priority,
  Severity,
  Status,
  StatusFilter,
} from '@uluops/ops-sdk';
import type { Command } from 'commander';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import { formatIssue, formatIssues } from '../formatters/ops.js';
import {
  parseIntOption,
  resolveProject,
  stripAnsi,
  truncate,
  withSpinner,
} from '../utils.js';

/**
 * Maximum chars displayed per event detail line before truncation.
 * Keeps the timeline scannable in a typical 100-120 col terminal.
 */
const MAX_EVENT_DETAIL_DISPLAY = 200;

/**
 * Render the merged history envelope to stdout. Extracted from the history
 * action callback (post-impl r2) so each branch of the action stays under
 * the readable-line ceiling. All server-controlled strings flow through
 * `stripAnsi` to neutralize CWE-116 terminal injection.
 */
function renderHistoryEnvelope(envelope: IssueHistoryEnvelope): void {
  if (envelope.events.length === 0) {
    console.log('No history');
    return;
  }

  console.log(`History (${envelope.totalEvents} events):`);
  if (envelope.truncated) {
    console.log(
      `  ⚠ Truncated to most recent ${envelope.events.length} of ${envelope.totalEvents} events`,
    );
  }

  for (const event of envelope.events) {
    const date = new Date(event.timestamp).toLocaleString();
    switch (event.type) {
      case 'status': {
        const tag = event.transitionType === 'undo' ? '[undo]' : '';
        console.log(
          `  ${date} ${tag} status: ${event.oldStatus ?? '(new)'} → ${event.newStatus}`,
        );
        if (event.revertedChangeId) {
          console.log(`    Reverts: ${event.revertedChangeId}`);
        }
        if (event.reason) {
          console.log(`    Reason: ${stripAnsi(event.reason)}`);
        }
        break;
      }
      case 'occurrence': {
        console.log(
          `  ${date} occurrence: ${stripAnsi(event.agentName)} (run ${event.runId})`,
        );
        if (event.description) {
          console.log(
            `    ${truncate(stripAnsi(event.description), MAX_EVENT_DETAIL_DISPLAY)}`,
          );
        }
        break;
      }
      case 'note': {
        const author = event.createdBy
          ? stripAnsi(event.createdBy)
          : '(anonymous)';
        console.log(
          `  ${date} note [${stripAnsi(event.noteType)}] by ${author}`,
        );
        console.log(
          `    ${truncate(stripAnsi(event.content), MAX_EVENT_DETAIL_DISPLAY)}`,
        );
        break;
      }
      default: {
        // Exhaustiveness guard (post-impl r2). If ops-sdk adds a 4th event
        // variant the union widens, `event` is no longer narrowed to `never`,
        // and tsc fails compilation — forcing a deliberate decision rather
        // than a silent passthrough.
        const _exhaustive: never = event;
        void _exhaustive;
        break;
      }
    }
  }
}

/**
 * Register issue commands
 */
export function registerIssueCommands(program: Command): void {
  const issues = program
    .command('issues')
    .alias('i')
    .description('Manage validation issues')
    .addHelpText(
      'after',
      `
Examples:
  $ ulu issues list ops-sdk
  $ ulu issues list ops-sdk --status open --domain EPI
  $ ulu issues get abc12345-...
  $ ulu issues close abc12345-... --reason "Fixed in v2"
`,
    );

  // ulu issues list [project]
  issues
    .command('list <project>')
    .description('List issues for a project (defaults to open issues)')
    .option(
      '-s, --status <status>',
      'Filter by status (open, completed, deferred, wontfix, all)',
      'open',
    )
    .option('--all', 'Show all statuses (alias for --status all)')
    .option(
      '-p, --priority <priority>',
      'Filter by priority (critical, high, suggested, backlog)',
    )
    .option(
      '--severity <severity>',
      'Filter by severity (critical, high, medium, low, info)',
    )
    .option('-a, --agent <name>', 'Filter by agent')
    .option(
      '-d, --domain <domain>',
      'Filter by failure domain (STR, SEM, PRA, EPI)',
    )
    .option('-l, --limit <number>', 'Maximum number of issues', '50')
    .option('--include-resolved', 'Include resolved issues')
    .action(async (projectArg: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const project = resolveProject(projectArg);
      const ctx = createOpsContext(globalOpts);

      try {
        // `--all` is sugar for `--status all`; both pass the literal "all"
        // sentinel so the API skips the default open-only filter.
        const statusFilter =
          options.all || options.status === 'all' ? 'all' : options.status;
        const data = await withSpinner(
          ctx,
          { start: 'Fetching issues...', failure: 'Failed to fetch issues' },
          () =>
            ctx.client.issues.listByProject(project, {
              status: statusFilter as StatusFilter | undefined,
              priority: options.priority as Priority | undefined,
              severity: options.severity as Severity | undefined,
              agent: options.agent,
              failureDomain: options.domain as FailureDomain | undefined,
              limit: parseIntOption(options.limit, '--limit'),
              includeResolved: options.includeResolved,
            }),
        );

        if (ctx.json) {
          emitJson(ctx, data, 'issue.list');
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
    .description('Get issue details by ID')
    .option('--full', 'Include occurrences and notes')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        if (options.full) {
          const details = await withSpinner(
            ctx,
            { start: 'Fetching issue...', failure: 'Failed to fetch issue' },
            () => ctx.client.issues.getDetails(id),
          );

          if (ctx.json) {
            emitJson(ctx, details, 'issue.getFull');
          } else {
            console.log(formatIssue(details.issue));

            if (details.occurrences.length > 0) {
              console.log(`\nOccurrences (${details.occurrences.length}):`);
              for (const occ of details.occurrences.slice(0, 5)) {
                console.log(
                  `  - ${occ.agentName} at ${occ.filePath ?? '(no file)'}${occ.lineNumber ? `:${occ.lineNumber}` : ''}`,
                );
              }
              if (details.occurrences.length > 5) {
                console.log(`  ... and ${details.occurrences.length - 5} more`);
              }
            }

            if (details.notes.length > 0) {
              console.log(`\nNotes (${details.notes.length}):`);
              for (const note of details.notes) {
                console.log(
                  `  [${note.noteType}] ${note.content.slice(0, 100)}${note.content.length > 100 ? '...' : ''}`,
                );
              }
            }

            if (details.history && details.history.length > 0) {
              console.log(
                `\nStatus History (${details.history.length} changes)`,
              );
            }
          }
        } else {
          const issue = await withSpinner(
            ctx,
            { start: 'Fetching issue...', failure: 'Failed to fetch issue' },
            () => ctx.client.issues.get(id),
          );

          if (ctx.json) {
            emitJson(ctx, issue, 'issue.get');
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
    .option(
      '-p, --projects <names>',
      'Filter by project names (comma-separated)',
    )
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
          () =>
            ctx.client.issues.search({
              query: options.query,
              projects: options.projects?.split(','),
              status: options.status as Status | undefined,
              priority: options.priority as Priority | undefined,
              limit: parseIntOption(options.limit, '--limit'),
            }),
        );

        if (ctx.json) {
          emitJson(ctx, data, 'issue.search');
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
    .description('Update issue status (open, completed, deferred, wontfix)')
    .requiredOption(
      '-s, --status <status>',
      'New status (open, completed, deferred, wontfix)',
    )
    .option('-r, --reason <text>', 'Reason for status change')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          {
            start: 'Updating issue...',
            success: 'Issue updated',
            failure: 'Failed to update issue',
          },
          () =>
            ctx.client.issues.updateStatus(id, {
              status: options.status as Status,
              reason: options.reason,
            }),
        );

        if (ctx.json) {
          emitJson(ctx, issue, 'issue.update');
        } else {
          console.log(
            `Issue ${id.slice(0, 8)} status changed to: ${issue.status}`,
          );
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
          {
            start: 'Closing issue...',
            success: 'Issue closed',
            failure: 'Failed to close issue',
          },
          () =>
            ctx.client.issues.updateStatus(id, {
              status: 'completed',
              reason: options.reason ?? 'Closed via CLI',
            }),
        );

        if (ctx.json) {
          emitJson(ctx, issue, 'issue.close');
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
    .option(
      '-t, --type <type>',
      'Note type (context, resolution, blocker)',
      'context',
    )
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const note = await withSpinner(
          ctx,
          {
            start: 'Adding note...',
            success: 'Note added',
            failure: 'Failed to add note',
          },
          () =>
            ctx.client.issues.addNote(id, {
              content: options.message,
              noteType: options.type as 'context' | 'resolution' | 'blocker',
            }),
        );

        if (ctx.json) {
          emitJson(ctx, note, 'issue.addNote');
        } else {
          console.log(`Note added to issue ${id.slice(0, 8)}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues history [id-or-fingerprint]
  issues
    .command('history [id-or-fingerprint]')
    .description(
      'Show issue timeline. With --project alone: list recent issues as a picker. With id/fingerprint + --project: resolve fingerprint then show events. With bare id: show events directly.',
    )
    .option(
      '-p, --project <name>',
      'Project slug. Alone: lists recent issues as a picker. With a positional arg: resolves it as a fingerprint instead of an issue id.',
    )
    .option(
      '-l, --limit <number>',
      'Picker mode: max issues to list. Server returns by priority then recency, so the picker biases toward critical/high issues with recent activity.',
      '20',
    )
    .addHelpText(
      'after',
      `
Examples:
  $ ulu issues history --project ops-sdk            # picker: recent issues to pick from
  $ ulu issues history 1a2b3c4d --project ops-sdk   # resolve fingerprint prefix, then show timeline
  $ ulu issues history <issue-uuid>                 # show timeline directly by id
  $ ulu issues history --project ops-sdk --json     # picker list as JSON (kind: issue.historyList)
`,
    )
    .action(async (idOrFingerprint: string | undefined, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        // Picker mode: --project alone, no positional → list recent issues.
        if (!idOrFingerprint && options.project) {
          const limit = parseIntOption(options.limit, '--limit');
          // Named recentIssues (not `issues`) to avoid shadowing the outer
          // `issues` command builder declared at the top of this function.
          const recentIssues = await withSpinner(
            ctx,
            {
              start: 'Fetching recent activity...',
              failure: 'Failed to fetch recent activity',
            },
            () =>
              ctx.client.issues.listByProject(options.project, {
                status: 'all' as StatusFilter,
                includeResolved: true,
                limit,
              }),
          );
          const sorted = [...recentIssues].sort(
            (a, b) =>
              new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
          );
          if (ctx.json) {
            emitJson(ctx, sorted, 'issue.historyList');
            return;
          }
          if (sorted.length === 0) {
            console.log(`No issues in ${options.project}`);
            return;
          }
          console.log(
            `Recent activity in ${options.project} (top ${sorted.length} by last change):`,
          );
          for (const issue of sorted) {
            const fp = issue.fingerprint.slice(0, 8);
            const ts = new Date(issue.updatedAt)
              .toISOString()
              .replace('T', ' ')
              .slice(0, 16);
            const status = issue.status.padEnd(9);
            // Strip ANSI from server-controlled title (CWE-116 defense).
            console.log(`  ${fp}  ${ts}  ${status}  ${stripAnsi(issue.title)}`);
          }
          console.log(
            `\n↳ Drill in: ulu issues history <fingerprint> --project ${options.project}`,
          );
          return;
        }

        if (!idOrFingerprint) {
          console.error(
            'Pass an issue id or fingerprint, or use --project <slug> alone to see recent activity.',
          );
          process.exitCode = 1;
          return;
        }

        let issueId = idOrFingerprint;
        if (options.project) {
          const issue = await withSpinner(
            ctx,
            {
              start: 'Resolving fingerprint...',
              failure: 'Failed to resolve fingerprint',
            },
            () =>
              ctx.client.issues.getByFingerprint(
                idOrFingerprint,
                options.project,
              ),
          );
          issueId = issue.id;
        }

        const envelope = await withSpinner(
          ctx,
          { start: 'Fetching history...', failure: 'Failed to fetch history' },
          () => ctx.client.issues.getHistory(issueId),
        );

        if (ctx.json) {
          emitJson(ctx, envelope, 'issue.history');
          return;
        }

        renderHistoryEnvelope(envelope);
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
          {
            start: 'Undoing change...',
            success: 'Change undone',
            failure: 'Failed to undo change',
          },
          () => ctx.client.issues.undoLastChange(id),
        );

        if (ctx.json) {
          emitJson(ctx, issue, 'issue.undo');
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
    .requiredOption(
      '--priority <priority>',
      'Priority (critical, suggested, backlog)',
    )
    .option(
      '--severity <severity>',
      'Severity (critical, high, medium, low, info)',
    )
    .option('-a, --agent <name>', 'Agent name')
    .option('--category <category>', 'Issue category')
    .option('--description <text>', 'Detailed description')
    .option('--file-path <path>', 'File path where issue was found')
    .option('--line <number>', 'Line number in file')
    .option('--failure-code <code>', 'Failure code (e.g., SEM-VAL/H)')
    .option('--domain <domain>', 'Failure domain (STR, SEM, PRA, EPI)')
    .option(
      '--type <type>',
      'Issue type (bug, feature, refactor, config, docs, infra, security, test)',
    )
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const issue = await withSpinner(
          ctx,
          {
            start: 'Creating issue...',
            success: 'Issue created',
            failure: 'Failed to create issue',
          },
          () =>
            ctx.client.issues.create({
              project: options.project,
              title: options.title,
              priority: options.priority as Priority,
              severity: options.severity as Severity | undefined,
              agent: options.agent,
              category: options.category,
              description: options.description,
              filePath: options.filePath,
              lineNumber: options.line
                ? parseIntOption(options.line, '--line')
                : undefined,
              failureCode: options.failureCode,
              failureDomain: options.domain as FailureDomain | undefined,
              type: options.type as IssueType | undefined,
            }),
        );

        if (ctx.json) {
          emitJson(ctx, issue, 'issue.create');
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
    .option(
      '--severity <severity>',
      'New severity (critical, high, medium, low, info)',
    )
    .option(
      '--priority <priority>',
      'New priority (critical, suggested, backlog)',
    )
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
      if (options.line !== undefined)
        input.lineNumber = parseIntOption(options.line, '--line');
      if (options.failureCode !== undefined)
        input.failureCode = options.failureCode;
      if (options.domain !== undefined) input.failureDomain = options.domain;
      if (options.type !== undefined) input.type = options.type;

      if (Object.keys(input).length === 0) {
        console.error('Error: At least one field to edit is required');
        process.exit(1);
      }

      try {
        const issue = await withSpinner(
          ctx,
          {
            start: 'Updating issue...',
            success: 'Issue updated',
            failure: 'Failed to update issue',
          },
          () => ctx.client.issues.update(id, input),
        );

        if (ctx.json) {
          emitJson(ctx, issue, 'issue.edit');
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
          {
            start: 'Restoring issue...',
            success: 'Issue restored',
            failure: 'Failed to restore issue',
          },
          () => ctx.client.issues.restore(id),
        );

        if (ctx.json) {
          emitJson(ctx, issue, 'issue.restore');
        } else {
          console.log(
            `Issue ${id.slice(0, 8)} restored (status: ${issue.status})`,
          );
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu issues bulk-update
  issues
    .command('bulk-update')
    .description('Bulk update issue statuses')
    .requiredOption(
      '-s, --status <status>',
      'New status (open, completed, deferred, wontfix)',
    )
    .requiredOption('-i, --ids <ids>', 'Comma-separated issue IDs')
    .option('-r, --reason <text>', 'Reason for status change')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      const ids = (options.ids as string)
        .split(',')
        .map((id: string) => id.trim())
        .filter(Boolean);
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
          {
            start: `Updating ${ids.length} issues...`,
            success: 'Issues updated',
            failure: 'Failed to update issues',
          },
          () => ctx.client.issues.bulkUpdateStatus(updates),
        );

        if (ctx.json) {
          emitJson(ctx, results, 'issue.bulkUpdate');
        } else {
          console.log(
            `Updated ${results.updated} issues to: ${options.status}`,
          );
          if (results.failed.length > 0) {
            console.log(`Failed: ${results.failed.join(', ')}`);
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
          () =>
            ctx.client.issues.getByFingerprint(fingerprint, options.project),
        );

        if (ctx.json) {
          emitJson(ctx, issue, 'issue.byFingerprint');
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
    .requiredOption(
      '-s, --status <status>',
      'New status (open, completed, deferred, wontfix)',
    )
    .option('-r, --reason <text>', 'Reason for status change')
    .action(async (fingerprint: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          {
            start: 'Updating issue...',
            success: 'Issue updated',
            failure: 'Failed to update issue',
          },
          () =>
            ctx.client.issues.updateStatusByFingerprint(
              fingerprint,
              options.project,
              {
                status: options.status as Status,
                reason: options.reason,
              },
            ),
        );

        if (ctx.json) {
          emitJson(ctx, result, 'issue.updateByFingerprint');
        } else {
          console.log(
            `Issue ${result.id.slice(0, 8)}: ${result.previousStatus} → ${result.newStatus}`,
          );
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
