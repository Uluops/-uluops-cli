/**
 * `ulu log` rendering — the vocabulary of ulu log spec v0.1.13 §3.4, verbatim
 * (D4), and the D11 collapse.
 *
 * Rules this file enforces, each with its reason:
 * - `completed` prints **fixed** (the enum name survives only in `--json`).
 * - `reason: null` prints *no reason recorded*; `source: 'agent'` prints
 *   `by agent`, `null` prints NOTHING — `null` is unattributed, never human —
 *   on every event type including `regressed`.
 * - `counts: null` (runs saved before migration 065) prints `-` for each count,
 *   with the parenthetical on the FIRST such row of the invocation only.
 * - ASCII only. No glyphs: the CLI emits nothing it would have to strip.
 * - Fingerprint is the 12-char prefix the `issues history` picker prints.
 * - D11 collapse: within ONE fetched page, `decision` events sharing
 *   `(second, from, to, reason)` render as one line with an issue count,
 *   regardless of adjacency, at the position of the group's first event; a
 *   footer states how many decisions collapsed into how many lines. Page-local
 *   by construction — a group straddling a page boundary is two lines, two
 *   counts. `--json` is never collapsed (it is not rendered here at all).
 * - Times are rendered `YYYY-MM-DD HH:MM` in UTC — deterministic (the house
 *   `formatDisplayDate` is locale-dependent) and the clock the ledger keeps.
 */
import type {
  LogEvent,
  LogStatBody,
  OrgListEntry,
  OrgLogStat,
  ProjectLogPage,
  ProjectLogStat,
} from '@uluops/ops-sdk';

// ============================================
// helpers
// ============================================

/** `2026-09-13 14:02` in UTC; `at` is an ISO string from the API. */
export function formatLogTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** `2026-09-13` in UTC, for the rollup's date ranges. */
function formatLogDay(iso: string | null): string {
  if (iso === null) return '-';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** The status vocabulary (D4): `completed` is spoken as `fixed`; the rest as themselves. */
export function statusWord(status: string | null): string {
  if (status === null) return '(none)';
  return status === 'completed' ? 'fixed' : status;
}

/** Short forms for the one-line activity breakdown. */
const SHORT: Record<string, string> = {
  completed: 'fixed',
  deferred: 'deferred',
  wontfix: 'wontfix',
  'false-positive': 'fp',
  observation: 'obs',
  open: 'reopened', // `byStatus.open` counts transitions INTO open (§3.3) — never say "open"
  merged: 'merged',
};

const NUM = (n: number): string => n.toLocaleString('en-US');

function fingerprint12(fp: string): string {
  return fp.slice(0, 12);
}

// ============================================
// the rollup (§3.3)
// ============================================

export interface LogStatHeader {
  /** What the numbers are about — a project name or an org slug. */
  subject: string;
  /** The org line: `org: ulu-labs, workspace` — omitted when undefined. */
  orgLine?: string;
}

/**
 * Render the §3.3 body. `windowed` decides the frame label — *all time* when no
 * window was asked for, *in window* otherwise — the one place the two frames
 * are named on the page.
 */
export function formatLogStatBody(stat: LogStatBody): string[] {
  const windowed = stat.window.since !== null || stat.window.until !== null;
  const frame = windowed ? 'in window' : 'all time';
  const lines: string[] = [];

  // Examined
  const ex = stat.examined;
  const range =
    ex.runs > 0
      ? `, ${formatLogDay(ex.first)} to ${formatLogDay(ex.last)}`
      : '';
  lines.push(
    `Examined   ${NUM(ex.runs)} runs${range}, ${NUM(ex.definitions)} definitions`,
  );
  if (ex.byWorkflow.length > 0) {
    // Wrapped at ~90 columns: a project with 46 workflow types is one line otherwise.
    let row = '';
    for (const cell of ex.byWorkflow.map(
      (w) => `${w.workflowType} x${w.runs}`,
    )) {
      if (row.length > 0 && row.length + 3 + cell.length > 90) {
        lines.push(`           ${row}`);
        row = cell;
      } else {
        row = row.length === 0 ? cell : `${row}   ${cell}`;
      }
    }
    lines.push(`           ${row}`);
  }

  // Found
  lines.push(`Found      ${NUM(stat.found.issues)} findings`);

  // Decided — current status of the found issues; `withReason` in parentheses for the five non-open statuses.
  const d = stat.decided;
  const wr = d.withReason;
  const decidedParts = [
    `fixed ${NUM(d.completed)} (${NUM(wr.completed)} with reason)`,
    `deferred ${NUM(d.deferred)} (${NUM(wr.deferred)})`,
    `wontfix ${NUM(d.wontfix)} (${NUM(wr.wontfix)})`,
    `false-positive ${NUM(d['false-positive'])} (${NUM(wr['false-positive'])})`,
    `observation ${NUM(d.observation)} (${NUM(wr.observation)})`,
    `open ${NUM(d.open)}`,
  ];
  lines.push(`Decided    ${decidedParts.slice(0, 3).join(' . ')}`);
  lines.push(`           ${decidedParts.slice(3).join(' . ')}`);

  // Came back — D12, distinct issues with events beside.
  const cb = stat.cameBack;
  const last =
    cb.lastDetectedAtAllTime === null
      ? 'never'
      : `last ${formatLogDay(cb.lastDetectedAtAllTime)}, any window`;
  lines.push(
    `Came back  ${NUM(cb.detected)} caught by re-running (${NUM(cb.detectedEvents)} events; ${last}) . ${NUM(cb.reopened)} reopened by decision`,
  );

  // Activity — ledger clock.
  const a = stat.activity;
  const bs = a.byStatus;
  const breakdown = (
    [
      'completed',
      'deferred',
      'wontfix',
      'false-positive',
      'observation',
      'open',
      'merged',
    ] as const
  )
    .filter((k) => k !== 'merged' || bs.merged !== 0) // D14: `merged` only when non-zero
    .map((k) => `${SHORT[k]} ${NUM(bs[k])}`)
    .join(' . ');
  lines.push(
    `Activity   ${NUM(a.decisions)} decisions, ${frame} (${breakdown})`,
  );
  if (a.restated > 0) {
    lines.push(
      `           ${NUM(a.restated)} re-stated (same status, new reason; not shown in the log)`,
    );
  }
  lines.push(
    `           ${NUM(a.runsWithCorrelation)} runs with correlation recorded (since 2026-07-08)`,
  );
  return lines;
}

/** The project rollup page: header + body. */
export function formatProjectLogStat(
  stat: ProjectLogStat,
  header: LogStatHeader,
): string {
  const org = header.orgLine !== undefined ? `   (${header.orgLine})` : '';
  return [
    `UluOps log - ${header.subject}${org}`,
    '',
    ...formatLogStatBody(stat),
  ].join('\n');
}

// ============================================
// the stream (§3.2) with the D11 collapse
// ============================================

export interface FormatLogStreamOptions {
  /** D11 collapse on (default true); `--no-collapse` prints one line per issue. */
  collapse?: boolean;
}

export interface FormattedLogStream {
  text: string;
  /** How many `decision` events were folded, and into how many lines — for the footer. */
  collapsed: { decisions: number; lines: number };
}

const RUN_W = 9; // 'regressed' is the widest kind word
const REASON_W = 120;

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length);
}

function runLine(
  e: Extract<LogEvent, { type: 'run' }>,
  state: { nullCountsExplained: boolean },
): string[] {
  const def =
    e.definitionName !== null
      ? `${e.definitionName}${e.definitionVersion !== null ? `@${e.definitionVersion}` : ''}`
      : '-';
  const extra = e.agents.length > 1 ? ` +${e.agents.length - 1}` : '';
  const score =
    e.averageScore === null ? 'score -' : `score ${Math.round(e.averageScore)}`;
  const gates =
    e.allGatesPassed === null
      ? 'gates -'
      : e.allGatesPassed
        ? 'gates ok'
        : 'gates FAILED';
  const head = `${pad(`run #${e.runNumber}`, RUN_W)} ${formatLogTime(e.at)}   ${e.workflowType}   ${def}${extra}   ${score}, ${gates}`;
  let counts: string;
  if (e.counts === null) {
    counts = `${' '.repeat(RUN_W + 1)}new - . recurring - . regression -`;
    if (!state.nullCountsExplained) {
      counts += '    (run saved before counts were recorded)';
      state.nullCountsExplained = true;
    }
  } else {
    counts = `${' '.repeat(RUN_W + 1)}new ${e.counts.new} . recurring ${e.counts.recurring} . regression ${e.counts.regressions}`;
  }
  return [head, counts];
}

function bySuffix(source: 'agent' | null): string {
  return source === 'agent' ? '   by agent' : '';
}

function regressedLine(e: Extract<LogEvent, { type: 'regression' }>): string {
  const via =
    e.viaRunNumber === null ? 'via run ?' : `via run #${e.viaRunNumber}`;
  return `${pad('regressed', RUN_W)} ${formatLogTime(e.at)}   ${fingerprint12(e.fingerprint)}  "${e.title}"   ${via}${bySuffix(e.source)}`;
}

function decidedLine(
  e: Extract<LogEvent, { type: 'decision' }>,
  subject: string,
): string {
  const transition = pad(`${statusWord(e.to)} <- ${statusWord(e.from)}`, 20);
  // One line per event: a long tracker reason is cut at REASON_W with "..."; the
  // full text is in --json. The cut never produces "no reason recorded" — that
  // phrase is reserved for the ledger's own silence.
  const reason =
    e.reason === null
      ? 'no reason recorded'
      : `"${e.reason.length > REASON_W ? `${e.reason.slice(0, REASON_W - 3)}...` : e.reason}"`;
  return `${pad('decided', RUN_W)} ${formatLogTime(e.at)}   ${pad(subject, 12)}  ${transition} ${reason}${bySuffix(e.source)}`;
}

/** Second-precision bucket of an ISO timestamp — the D11 grouping clock. */
function secondOf(iso: string): string {
  return iso.slice(0, 19);
}

/**
 * Render one page. Collapse groups `decision` events by `(second, from, to,
 * reason)` across the WHOLE page (not adjacency); the group's line sits where
 * its first event was; `regression` and `run` events are never grouped.
 */
export function formatLogStream(
  page: ProjectLogPage,
  options: FormatLogStreamOptions = {},
): FormattedLogStream {
  const collapse = options.collapse ?? true;
  const state = { nullCountsExplained: false };
  const lines: string[] = [];
  let collapsedDecisions = 0;
  let collapsedLines = 0;

  // First pass: group decisions by key, remembering the index of each group's first event.
  const groups = new Map<
    string,
    { first: number; members: Extract<LogEvent, { type: 'decision' }>[] }
  >();
  if (collapse) {
    page.data.forEach((e, i) => {
      if (e.type !== 'decision') return;
      const key = `${secondOf(e.at)}|${e.from ?? ''}|${e.to}|${e.reason ?? ' '}`;
      const g = groups.get(key);
      if (g) g.members.push(e);
      else groups.set(key, { first: i, members: [e] });
    });
  }
  const emitted = new Set<string>();

  page.data.forEach((e, i) => {
    if (e.type === 'run') {
      lines.push(...runLine(e, state));
      return;
    }
    if (e.type === 'regression') {
      lines.push(regressedLine(e));
      return;
    }
    if (!collapse) {
      lines.push(decidedLine(e, fingerprint12(e.fingerprint)));
      return;
    }
    const key = `${secondOf(e.at)}|${e.from ?? ''}|${e.to}|${e.reason ?? ' '}`;
    const g = groups.get(key);
    if (g === undefined || g.first !== i) return; // a later member of an already-rendered group
    if (g.members.length === 1) {
      lines.push(decidedLine(e, fingerprint12(e.fingerprint)));
      return;
    }
    if (emitted.has(key)) return;
    emitted.add(key);
    collapsedDecisions += g.members.length;
    collapsedLines += 1;
    lines.push(decidedLine(e, `${g.members.length} issues`));
  });

  return {
    text: lines.join('\n'),
    collapsed: { decisions: collapsedDecisions, lines: collapsedLines },
  };
}

/** The per-page footer: events shown, collapse summary, and how to continue. */
export function formatLogFooter(
  page: ProjectLogPage,
  collapsed: { decisions: number; lines: number },
): string {
  const parts = [`${NUM(page.count)} events shown`];
  if (collapsed.lines > 0) {
    parts.push(
      `${NUM(collapsed.decisions)} decisions collapsed into ${NUM(collapsed.lines)} line${collapsed.lines === 1 ? '' : 's'} (--no-collapse to expand)`,
    );
  }
  if (page.hasMore && page.nextCursor !== undefined) {
    parts.push(`more: --cursor ${page.nextCursor}`);
  }
  return parts.join('; ');
}

// ============================================
// --orgs (§3.6)
// ============================================

/**
 * One org per block: the org line with its totals, then a row per project.
 * Column widths are computed per block so the table lines up without
 * depending on any terminal width.
 */
export function formatOrgLogStats(
  entries: { org: OrgListEntry; stat: OrgLogStat }[],
): string {
  const blocks: string[] = [];
  for (const { org, stat } of entries) {
    const who = org.isPersonal
      ? `personal (${org.slug})`
      : `${org.slug}   (${org.role})`;
    const total = `${NUM(stat.projects.length)}${stat.hasMoreProjects ? '+' : ''} projects . ${NUM(stat.examined.runs)} runs . ${NUM(stat.found.issues)} findings . ${NUM(stat.decided.completed)} fixed . ${NUM(stat.cameBack.detected)} regressions`;
    const lines = [
      `${who}   ${total}   (as of ${formatLogTime(stat.computedAt)} UTC)`,
    ];
    const NAME_W = 48;
    const nameW = Math.min(
      NAME_W,
      Math.max(4, ...stat.projects.map((p) => p.name.length)),
    );
    const name = (n: string): string =>
      n.length > NAME_W ? `${n.slice(0, NAME_W - 3)}...` : n;
    for (const p of stat.projects) {
      lines.push(
        `  ${pad(name(p.name), nameW)}   ${String(p.runs).padStart(5)} runs . ${String(p.issues).padStart(5)} findings . ${String(p.fixed).padStart(5)} fixed . ${String(p.regressions).padStart(3)} regressions`,
      );
    }
    if (stat.hasMoreProjects)
      lines.push(
        `  ... more projects than the 100 shown (--json for the totals; the totals above count every project)`,
      );
    blocks.push(lines.join('\n'));
  }
  return blocks.join('\n\n');
}
