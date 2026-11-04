/**
 * The tracker's per-agent analysis rejections, as terminal lines.
 *
 * Since ops-api R2 (analysis-never-loses-the-run spec §3.3) a save no longer fails because one
 * agent's analysis is invalid: the server keeps the run and rejects that agent's analysis as a
 * unit, reported in `analysisWrite.rejected[]` (ops-sdk >= 7.2.0) and mapped by core >= 0.58.0 to
 * `result.analysisRejected`. Before this formatter the cli printed such a save as
 * "Run #N saved successfully" with nothing else, so the missing analysis went unnoticed (spec
 * §3.5, perverse read P1).
 *
 * The one-per-rejection line is the spec's (§3.5). The closing line exists because the obvious
 * reaction to "analysis rejected" is to save again, and a second save creates a second run (P2).
 * The cli has no repair command of its own: `ulu runs update` takes agent metadata only, not
 * analysis. So the line points at the two writers that can repair a run, ops-mcp `update_run` and
 * ops-sdk `runs.update`.
 */
import type { AnalysisRejection } from '@uluops/ops-sdk';
import { stripAnsi } from '../utils.js';

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
 * One line per rejected unit, then one line saying the run is saved. Empty when nothing was
 * rejected, or when the server did not report it (`undefined`: a pre-R2 server, a tracking-off
 * run, a replay of a run saved before R2).
 *
 * `agentName` is null for an entry that is its own unit and for the `units_omitted` row; those
 * print as "unattributed entries". `reason` is an open string (spec A9): printed, never parsed.
 */
export function formatAnalysisRejections(
  rejections: readonly AnalysisRejection[] | undefined,
): string[] {
  if (!rejections || rejections.length === 0) return [];
  const lines = rejections.map((r) => {
    const who =
      r.agentName == null || oneLine(r.agentName) === ''
        ? 'unattributed entries'
        : oneLine(r.agentName);
    return `Analysis rejected for ${who}: ${oneLine(r.reason)} (${count(r.recordsRejected, 'record', 'records')}, ${count(r.summariesRejected, 'summary', 'summaries')})`;
  });
  lines.push(
    "The run is saved; submitting it again creates a second run. Repair the analysis on this run with update_run (ops-mcp) or runs.update (ops-sdk), sending each rejected agent's complete records and summary.",
  );
  return lines;
}
