import { type OrgAuditEntry, readRehomeAuditDetails } from '@uluops/ops-sdk';
import type { Command } from 'commander';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import { type Column, formatTable } from '../formatters/table.js';
import {
  formatDisplayDate,
  parseIntOption,
  stripAnsi,
  withSpinner,
} from '../utils.js';

/**
 * Remote free text → one terminal line. `stripAnsi` is this CLI's boundary
 * rule for anything sourced from a response; here it matters more than usual
 * because the feed is by construction written by one org member and read by
 * another (an admin's `--reason` renders on the owner's terminal). Newlines
 * are flattened so a value cannot split the table row (code-auditor, 2026-09-15).
 */
function safeText(value: string): string {
  return stripAnsi(value).replace(/\r?\n/g, ' ');
}

/**
 * One line per feed entry. A re-home row (the only class the feed carries
 * today) is described; any other org-visible row falls back to its
 * `details.action` or the platform action so nothing is silently dropped.
 */
export function describeFeedEntry(entry: OrgAuditEntry): string {
  const d = readRehomeAuditDetails(entry);
  if (d === null) {
    const inner = entry.details['action'];
    return safeText(typeof inner === 'string' ? inner : entry.action);
  }
  const incoming = d.action === 'project.rehome_in';
  const other = safeText(incoming ? d.from_org.slug : d.to_org.slug);
  const verb = incoming ? 'arrived from' : 'moved to';
  const flags = [
    d.to_personal_org ? 'personal org' : null,
    d.via_admin_path ? 'platform admin' : null,
  ].filter((f): f is string => f !== null);
  return `"${safeText(d.project_name)}" ${verb} ${other}${flags.length > 0 ? ` (${flags.join(', ')})` : ''}${d.reason !== null ? ` — ${safeText(d.reason)}` : ''}`;
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
    .option(
      '-l, --limit <n>',
      'Page size, 1–100 (the API answers 400 outside that range)',
      '50',
    )
    .action(async (slug: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      // Client-side range check: the API's OrgVisibleAuditLogQuery is
      // .min(1).max(100) and returns 400 (with the generic "check your
      // arguments" hint) rather than clamping — say the range here.
      const limit = parseIntOption(options.limit, '--limit');
      if (limit < 1 || limit > 100) {
        handleOpsError(
          new Error(`--limit must be between 1 and 100 (got ${limit})`),
          ctx,
        );
      }

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
              limit,
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
