import { type OrgAuditEntry, readRehomeAuditDetails } from '@uluops/ops-sdk';
import type { Command } from 'commander';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import { type Column, formatTable } from '../formatters/table.js';
import { formatDisplayDate, parseIntOption, withSpinner } from '../utils.js';

/**
 * One line per feed entry. A re-home row (the only class the feed carries
 * today) is described; any other org-visible row falls back to its
 * `details.action` or the platform action so nothing is silently dropped.
 */
export function describeFeedEntry(entry: OrgAuditEntry): string {
  const d = readRehomeAuditDetails(entry);
  if (d === null) {
    const inner = entry.details['action'];
    return typeof inner === 'string' ? inner : entry.action;
  }
  const incoming = d.action === 'project.rehome_in';
  const other = incoming ? d.from_org.slug : d.to_org.slug;
  const verb = incoming ? 'arrived from' : 'moved to';
  const flags = [
    d.to_personal_org ? 'personal org' : null,
    d.via_admin_path ? 'platform admin' : null,
  ].filter((f): f is string => f !== null);
  return `"${d.project_name}" ${verb} ${other}${flags.length > 0 ? ` (${flags.join(', ')})` : ''}${d.reason !== null ? ` — ${d.reason}` : ''}`;
}

/**
 * Register org commands. Reads only — org CRUD, membership and invitations
 * are dashboard surfaces. `--org` does not apply here: the org is the
 * positional argument (a path parameter server-side), not a scope header.
 */
export function registerOrgCommands(program: Command): void {
  const orgs = program
    .command('orgs')
    .description("Read an org's member-visible activity")
    .addHelpText(
      'after',
      `
Examples:
  $ ulu orgs audit-feed ulu-labs
  $ ulu orgs audit-feed ulu-labs --limit 100 --json
  $ ulu orgs audit-feed ulu-labs --cursor "<next_cursor from the previous page>"
`,
    );

  // ulu orgs audit-feed <slug>
  orgs
    .command('audit-feed <slug>')
    .description(
      "The org-visible audit feed (any member): today, projects that left the org for someone's personal org — who, when, where to, why",
    )
    .option(
      '-c, --cursor <cursor>',
      "Continue from a previous page's next cursor (opaque; pass it back verbatim)",
    )
    .option('-l, --limit <n>', 'Page size (max 200)', '50')
    .action(async (slug: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const feed = await withSpinner(
          ctx,
          {
            start: 'Fetching audit feed...',
            success: 'Audit feed fetched',
            failure: 'Failed to fetch audit feed',
          },
          () =>
            ctx.client.orgs.getVisibleAuditLog(slug, {
              limit: parseIntOption(options.limit, 'limit'),
              ...(options.cursor !== undefined
                ? { cursor: options.cursor }
                : {}),
            }),
        );

        if (ctx.json) {
          emitJson(ctx, feed, 'org.auditFeed');
          return;
        }

        const entries = feed.data.entries;
        if (entries.length === 0) {
          console.log(`No org-visible activity in ${slug}`);
          return;
        }
        const columns: Column<OrgAuditEntry>[] = [
          {
            header: 'WHEN',
            accessor: (e) => formatDisplayDate(e.createdAt),
            width: 20,
          },
          {
            header: 'ACTOR',
            accessor: (e) => (e.actorId ?? 'system').slice(0, 8),
            width: 10,
          },
          { header: 'EVENT', accessor: (e) => describeFeedEntry(e), width: 90 },
        ];
        console.log(formatTable(entries, columns));
        if (feed.hasMore && feed.nextCursor !== null) {
          console.log(
            `\nMore: ulu orgs audit-feed ${slug} --cursor "${feed.nextCursor}"`,
          );
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
