/**
 * The tracker's per-agent analysis rejections, as terminal lines.
 *
 * Since ops-api R2 (analysis-never-loses-the-run spec §3.3) a save no longer fails because one
 * agent's analysis is invalid: the server keeps the run and rejects that agent's analysis as a
 * unit, reported in `analysisWrite.rejected[]` (ops-sdk >= 7.2.0) and mapped by core >= 0.58.0 to
 * `result.analysisRejected`. `POST /runs/validate` reports the same verdict in advance as
 * `wouldReject[]`. Before this formatter the cli printed such a save as "Run #N saved
 * successfully" with nothing else, so the missing analysis went unnoticed (spec §3.5, perverse
 * read P1).
 *
 * The one-per-rejection line is the spec's (§3.5). Under it go the server's issues for that unit,
 * because they are what the repair needs. The closing line exists because the obvious reaction to
 * "analysis rejected" is to save again, and a second save creates a second run (P2); it names the
 * repair, `ulu runs update … --file`, which since 0.45.0 carries analysis.
 */
import type { AnalysisRejection } from '@uluops/ops-sdk';
import { stripAnsi } from '../utils.js';

/** Issues printed per rejected unit; the server itself sends at most 10. */
const MAX_ISSUES_SHOWN = 5;

/**
 * Server-sourced text on one terminal line. `stripAnsi` keeps tab/newline/CR, which would let an
 * agent name break the line apart and forge the next one, so those collapse to a space here.
 */
function oneLine(value: string): string {
  return stripAnsi(value)
    .replace(/[\t\n\r]+/g, ' ')
    .trim();
}

function count(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

/**
 * The `entry_invalid` issue list, read defensively. `detail` is an open record whose shape belongs
 * to `reason` (ops-sdk types it `Record<string, unknown>`), so anything that is not the documented
 * `{ issues: [{ array, index, path, message }], issuesTotal }` shape prints nothing rather than
 * throwing: a new reason must not break a pinned reader (spec A9).
 */
function issueLines(detail: Record<string, unknown>): string[] {
  const issues = detail.issues;
  if (!Array.isArray(issues)) return [];
  const lines: string[] = [];
  for (const issue of issues.slice(0, MAX_ISSUES_SHOWN)) {
    if (issue === null || typeof issue !== 'object') continue;
    const { array, index, path, message } = issue as Record<string, unknown>;
    if (typeof message !== 'string') continue;
    let where = '';
    if (typeof array === 'string') {
      where = typeof index === 'number' ? `${array}[${index}]` : array;
    }
    if (Array.isArray(path) && path.length > 0) {
      const p = path.map((s) => String(s)).join('.');
      where = where ? `${where}.${p}` : p;
    }
    lines.push(`  ${where ? `${oneLine(where)}: ` : ''}${oneLine(message)}`);
  }
  const total =
    typeof detail.issuesTotal === 'number' ? detail.issuesTotal : issues.length;
  if (total > lines.length && lines.length > 0) {
    lines.push(
      `  … ${total - lines.length} more (--json shows the issues the server sent)`,
    );
  }
  return lines;
}

export interface AnalysisRejectionFormatOptions {
  /**
   * `saved` (default): the run exists and the analysis was not stored (`runs save`, `exec`).
   * `would`: a dry run (`runs validate`); nothing was saved.
   */
  mode?: 'saved' | 'would';
  /** Project and run number for a concrete repair command. Absent: placeholders. */
  run?: { project: string; runNumber: number };
}

/**
 * One line per rejected unit with its issues indented beneath, then one closing line. Empty when
 * nothing was rejected, or when the server did not report it (`undefined`: a pre-R2 server, a
 * tracking-off run, a replay of a run saved before R2).
 *
 * `agentName` is null for an entry that is its own unit and for the `units_omitted` row; those
 * print as "unattributed entries". `reason` is an open string (spec A9): printed, never parsed.
 */
export function formatAnalysisRejections(
  rejections: readonly AnalysisRejection[] | undefined,
  opts: AnalysisRejectionFormatOptions = {},
): string[] {
  if (!rejections || rejections.length === 0) return [];
  const would = opts.mode === 'would';
  const lines: string[] = [];
  for (const r of rejections) {
    const who =
      r.agentName == null || oneLine(r.agentName) === ''
        ? 'unattributed entries'
        : oneLine(r.agentName);
    lines.push(
      `${would ? 'Would reject analysis for' : 'Analysis rejected for'} ${who}: ${oneLine(r.reason)} (${count(r.recordsRejected, 'record', 'records')}, ${count(r.summariesRejected, 'summary', 'summaries')})`,
    );
    lines.push(...issueLines(r.detail));
  }
  if (would) {
    lines.push(
      'Nothing has been saved. A save of this input keeps the run and drops the analysis above; fix those entries first.',
    );
  } else {
    const cmd = opts.run
      ? `ulu runs update ${opts.run.project} -n ${opts.run.runNumber} --file <analysis.json>`
      : 'ulu runs update <project> -n <run number> --file <analysis.json>';
    lines.push(
      `The run is saved; submitting it again creates a second run. Repair it on the same run with \`${cmd}\`, sending each rejected agent's complete records and summary (add --preview to see the change first).`,
    );
  }
  return lines;
}
