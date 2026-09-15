/**
 * `ulu log` rendering acceptance (checklist Phase 4): the §3.4 vocabulary and
 * the D11 collapse, on a fixture that carries every case the spec names —
 * all three event types, a NULL-count run, a NULL-reason decision, a
 * regression with an unresolvable run, TWO INTERLEAVED 25-row bursts in one
 * second (must collapse to one line each), and a status-mixed burst (must
 * split by `from`). The expected text is written out, not snapshotted, so a
 * reviewer reads the render against the spec. Two controls at the end:
 * changing `fixed` back to `completed` must fail, and `collapse: false` must
 * change the line count.
 */
import { describe, expect, it } from 'vitest';
import type {
  LogDecisionEvent,
  LogEvent,
  OrgListEntry,
  OrgLogStat,
  ProjectLogPage,
  ProjectLogStat,
} from '@uluops/ops-sdk';
import {
  formatLogFooter,
  formatLogStream,
  formatLogTime,
  formatOrgLogStats,
  formatProjectLogStat,
  statusWord,
} from '../../src/formatters/log.js';

const decision = (
  i: number,
  at: string,
  from: string | null,
  to: string,
  reason: string | null,
  source: 'agent' | null = null,
): LogDecisionEvent => ({
  type: 'decision',
  issueId: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
  fingerprint: `${i.toString(16).padStart(12, 'f')}rest`,
  title: `issue ${i}`,
  from,
  to,
  reason,
  source,
  at,
  seq: 1000 + i,
});

function fixture(): ProjectLogPage {
  const events: LogEvent[] = [];
  events.push({
    type: 'run',
    runNumber: 47,
    at: '2026-09-13T14:02:00.000Z',
    workflowType: 'security-audit',
    definitionType: 'agent',
    definitionName: 'security-analyst',
    definitionVersion: '1.4.0',
    averageScore: 82,
    allGatesPassed: true,
    counts: { new: 3, recurring: 1, regressions: 1, observed: 0 },
    agents: ['security-analyst', 'a', 'b'],
  });
  events.push({
    type: 'regression',
    issueId: '00000000-0000-4000-8000-000000000001',
    fingerprint: '9c1e4d7b20aa0000',
    title: 'SQL string concat in export',
    viaRunNumber: 47,
    source: 'agent',
    at: '2026-09-13T14:02:00.400Z',
    seq: 900,
  });
  events.push(decision(1, '2026-09-13T14:20:00.100Z', 'open', 'deferred', 'after the auth migration'));
  events.push(decision(2, '2026-09-13T14:20:00.200Z', 'wontfix', 'open', 'Reverted - file is still needed'));
  events.push(decision(3, '2026-09-13T14:21:00.000Z', 'open', 'wontfix', null, 'agent'));
  // Two INTERLEAVED bursts in ONE second: 25 completed<-open (no reason) and 25 observation<-open "triage".
  for (let i = 0; i < 25; i++) {
    events.push(decision(100 + i, `2026-06-15T10:00:00.${String(i * 2).padStart(3, '0')}Z`, 'open', 'completed', null));
    events.push(decision(200 + i, `2026-06-15T10:00:00.${String(i * 2 + 1).padStart(3, '0')}Z`, 'open', 'observation', 'triage'));
  }
  // A status-mixed select-all in one second: 3 from open, 2 from deferred, all -> completed, same reason.
  events.push(decision(301, '2026-06-01T09:00:00.000Z', 'open', 'completed', 'sweep'));
  events.push(decision(302, '2026-06-01T09:00:00.001Z', 'deferred', 'completed', 'sweep'));
  events.push(decision(303, '2026-06-01T09:00:00.002Z', 'open', 'completed', 'sweep'));
  events.push(decision(304, '2026-06-01T09:00:00.003Z', 'deferred', 'completed', 'sweep'));
  events.push(decision(305, '2026-06-01T09:00:00.004Z', 'open', 'completed', 'sweep'));
  // A regression whose run is unresolvable, unattributed.
  events.push({
    type: 'regression',
    issueId: '00000000-0000-4000-8000-000000000002',
    fingerprint: '0b7e5c3a91dd0000',
    title: 'Race in cache',
    viaRunNumber: null,
    source: null,
    at: '2026-05-04T08:00:00.000Z',
    seq: 500,
  });
  // A NULL-count run (pre-065), then another so the parenthetical prints ONCE.
  events.push({
    type: 'run',
    runNumber: 46,
    at: '2026-05-01T09:40:00.000Z',
    workflowType: 'code-validate',
    definitionType: 'agent',
    definitionName: 'code-validator',
    definitionVersion: '1.11.0',
    averageScore: 91,
    allGatesPassed: true,
    counts: null,
    agents: ['code-validator'],
  });
  events.push({
    type: 'run',
    runNumber: 45,
    at: '2026-04-01T09:40:00.000Z',
    workflowType: 'ship',
    definitionType: null,
    definitionName: null,
    definitionVersion: null,
    averageScore: null,
    allGatesPassed: null,
    counts: null,
    agents: [],
  });
  return { data: events, count: events.length, hasMore: true, nextCursor: 'CURSOR' };
}

describe('formatLogStream — §3.4 vocabulary + D11 collapse', () => {
  it('renders the fixture exactly as the spec says', () => {
    const page = fixture();
    const { text, collapsed } = formatLogStream(page);
    const lines = text.split('\n');
    expect(lines).toEqual([
      'run #47   2026-09-13 14:02   security-audit   security-analyst@1.4.0 +2   score 82, gates ok',
      '          new 3 . recurring 1 . regression 1',
      'regressed 2026-09-13 14:02   9c1e4d7b20aa  "SQL string concat in export"   via run #47   by agent',
      'decided   2026-09-13 14:20   fffffffffff1  deferred <- open     "after the auth migration"',
      'decided   2026-09-13 14:20   fffffffffff2  open <- wontfix      "Reverted - file is still needed"',
      'decided   2026-09-13 14:21   fffffffffff3  wontfix <- open      no reason recorded   by agent',
      // the two interleaved bursts: one line each, at the position of each group's FIRST event
      'decided   2026-06-15 10:00   25 issues     fixed <- open        no reason recorded',
      'decided   2026-06-15 10:00   25 issues     observation <- open  "triage"',
      // the status-mixed sweep splits by `from`: 3 from open, 2 from deferred
      'decided   2026-06-01 09:00   3 issues      fixed <- open        "sweep"',
      'decided   2026-06-01 09:00   2 issues      fixed <- deferred    "sweep"',
      'regressed 2026-05-04 08:00   0b7e5c3a91dd  "Race in cache"   via run ?',
      'run #46   2026-05-01 09:40   code-validate   code-validator@1.11.0   score 91, gates ok',
      '          new - . recurring - . regression -    (run saved before counts were recorded)',
      'run #45   2026-04-01 09:40   ship   -   score -, gates -',
      '          new - . recurring - . regression -',
    ]);
    expect(collapsed).toEqual({ decisions: 55, lines: 4 });
    expect(formatLogFooter(page, collapsed)).toBe(
      '63 events shown; 55 decisions collapsed into 4 lines (--no-collapse to expand); more: --cursor CURSOR',
    );
    // ASCII only — nothing the CLI would strip.
    // biome-ignore lint/suspicious/noControlCharactersInRegex: the point is to catch non-ASCII bytes
    expect(text).toMatch(/^[\x20-\x7e\n]*$/);
  });

  it('CONTROL: the render fails if `fixed` reverts to `completed`, and --no-collapse changes the line count', () => {
    const page = fixture();
    const collapsed = formatLogStream(page).text;
    expect(collapsed).toContain('fixed <- open');
    expect(collapsed).not.toMatch(/\bcompleted <-/); // the enum name never reaches the page
    expect(statusWord('completed')).toBe('fixed');
    // Were statusWord ever to return the enum name, the exact-lines assertion above fails on 4 lines.
    expect(statusWord('completed')).not.toBe('completed');

    const expanded = formatLogStream(page, { collapse: false });
    expect(expanded.collapsed).toEqual({ decisions: 0, lines: 0 });
    expect(expanded.text.split('\n').length).toBe(collapsed.split('\n').length + 55 - 4);
    expect(expanded.text).toContain('ffffffffff64  fixed <- open'); // issue 100 rendered individually
    expect(formatLogFooter(page, expanded.collapsed)).toBe('63 events shown; more: --cursor CURSOR');
  });

  it('collapse is page-local: the same group on a second page is a second line with its own count', () => {
    const page2: ProjectLogPage = {
      data: [decision(900, '2026-06-15T10:00:00.900Z', 'open', 'completed', null), decision(901, '2026-06-15T10:00:00.901Z', 'open', 'completed', null)],
      count: 2,
      hasMore: false,
    };
    const r = formatLogStream(page2);
    expect(r.text).toBe('decided   2026-06-15 10:00   2 issues      fixed <- open        no reason recorded');
    expect(formatLogFooter(page2, r.collapsed)).toBe('2 events shown; 2 decisions collapsed into 1 line (--no-collapse to expand)');
  });

  it('a long reason is cut at 120 chars with "..." (full text is in --json); never rendered as "no reason recorded"', () => {
    const long = 'x'.repeat(200);
    const r = formatLogStream({ data: [decision(1, '2026-01-01T00:00:00.000Z', 'open', 'completed', long)], count: 1, hasMore: false });
    expect(r.text).toContain(`"${'x'.repeat(117)}..."`);
    expect(r.text).not.toContain('no reason recorded');
    const exact = 'y'.repeat(120);
    expect(formatLogStream({ data: [decision(2, '2026-01-01T00:00:00.000Z', 'open', 'completed', exact)], count: 1, hasMore: false }).text).toContain(`"${exact}"`);
  });

  it('formatLogTime is UTC and deterministic', () => {
    expect(formatLogTime('2026-09-13T23:59:59.999Z')).toBe('2026-09-13 23:59');
    expect(formatLogTime('not a date')).toBe('not a date');
  });
});

const statBody: Omit<ProjectLogStat, 'projectId'> = {
  window: { since: null, until: null },
  examined: {
    runs: 47,
    first: '2026-01-12T00:00:00.000Z',
    last: '2026-09-13T00:00:00.000Z',
    byWorkflow: [
      { workflowType: 'security-audit', runs: 6 },
      { workflowType: 'ship', runs: 12 },
      { workflowType: 'code-validate', runs: 21 },
      { workflowType: 'prompt-audit', runs: 8 },
    ],
    definitions: 9,
  },
  found: { issues: 41 },
  decided: {
    completed: 24,
    deferred: 6,
    wontfix: 3,
    'false-positive': 2,
    observation: 3,
    open: 3,
    withReason: { completed: 22, deferred: 6, wontfix: 3, 'false-positive': 2, observation: 2 },
  },
  cameBack: { detected: 2, detectedEvents: 3, reopened: 4, reopenedEvents: 4, lastDetectedAtAllTime: '2026-05-04T00:00:00.000Z' },
  activity: {
    decisions: 122,
    byStatus: { completed: 90, deferred: 12, wontfix: 9, 'false-positive': 4, observation: 3, open: 4, merged: 0 },
    restated: 7,
    runsWithCorrelation: 47,
  },
};

describe('formatProjectLogStat — §3.3 as §3.4 renders it', () => {
  it('renders the spec example, with the frames named and `merged` omitted when 0', () => {
    const text = formatProjectLogStat({ projectId: 'p', ...statBody }, { subject: 'ops-uluops-api', orgLine: 'org: ulu-labs, workspace' });
    expect(text.split('\n')).toEqual([
      'UluOps log - ops-uluops-api   (org: ulu-labs, workspace)',
      '',
      'Examined   47 runs, 2026-01-12 to 2026-09-13, 9 definitions',
      '           security-audit x6   ship x12   code-validate x21   prompt-audit x8',
      'Found      41 findings',
      'Decided    fixed 24 (22 with reason) . deferred 6 (6) . wontfix 3 (3)',
      '           false-positive 2 (2) . observation 3 (2) . open 3',
      'Came back  2 caught by re-running (3 events; last 2026-05-04, any window) . 4 reopened by decision',
      'Activity   122 decisions, all time (fixed 90 . deferred 12 . wontfix 9 . fp 4 . obs 3 . reopened 4)',
      '           7 re-stated (same status, new reason; not shown in the log)',
      '           47 runs with correlation recorded (since 2026-07-08)',
    ]);
  });

  it('wraps the byWorkflow line at ~90 columns, continuation lines indented', () => {
    const many = Array.from({ length: 12 }, (_, i) => ({ workflowType: `workflow-number-${i}`, runs: i + 1 }));
    const text = formatProjectLogStat({ projectId: 'p', ...statBody, examined: { ...statBody.examined, byWorkflow: many } }, { subject: 'p' });
    const wf = text.split('\n').filter((l) => l.includes('workflow-number-'));
    expect(wf.length).toBeGreaterThan(1);
    for (const l of wf) {
      expect(l.startsWith('           ')).toBe(true);
      expect(l.length).toBeLessThanOrEqual(11 + 90 + 24); // one cell may overhang the fold
    }
    expect(wf.join(' ')).toContain('workflow-number-11 x12');
  });

  it('a window says "in window"; a non-zero merged shows; an empty project says never', () => {
    const windowed = formatProjectLogStat(
      {
        projectId: 'p',
        ...statBody,
        window: { since: '2026-01-01T00:00:00.000Z', until: null },
        activity: { ...statBody.activity, byStatus: { ...statBody.activity.byStatus, merged: 1 }, restated: 0 },
        cameBack: { ...statBody.cameBack, lastDetectedAtAllTime: null },
      },
      { subject: 'p' },
    );
    expect(windowed).toContain('decisions, in window (');
    expect(windowed).toContain('reopened 4 . merged 1)');
    expect(windowed).toContain('(3 events; never)');
    expect(windowed).not.toContain('re-stated');
    expect(windowed.split('\n')[0]).toBe('UluOps log - p');
  });
});

describe('formatOrgLogStats — §3.6', () => {
  it('one block per org: org line with totals and as-of, then a row per project', () => {
    const org: OrgListEntry = { id: 'o', name: 'Ulu Labs', slug: 'ulu-labs', isPersonal: false, role: 'owner', memberCount: 3, subscriptionTier: 'enterprise', paymentStatus: 'none', suspendedAt: null };
    const personal: OrgListEntry = { ...org, id: 'p', name: 'alexself2', slug: 'alexself2', isPersonal: true };
    const stat: OrgLogStat = {
      org: 'ulu-labs',
      computedAt: '2026-09-15T21:44:44.938Z',
      ...statBody,
      examined: { ...statBody.examined, runs: 1203 },
      found: { issues: 2847 },
      decided: { ...statBody.decided, completed: 2101 },
      cameBack: { ...statBody.cameBack, detected: 31 },
      projects: [
        { name: 'ops-uluops-api', runs: 47, issues: 41, fixed: 24, regressions: 2, lastRunAt: '2026-09-13T00:00:00.000Z' },
        { name: 'quiet', runs: 0, issues: 0, fixed: 0, regressions: 0, lastRunAt: null },
        { name: `${'n'.repeat(60)}`, runs: 1, issues: 1, fixed: 1, regressions: 1, lastRunAt: null },
      ],
      hasMoreProjects: true,
    };
    const text = formatOrgLogStats([
      { org, stat },
      { org: personal, stat: { ...stat, org: 'alexself2', projects: [], hasMoreProjects: false, examined: { ...statBody.examined, runs: 88 } } },
    ]);
    expect(text.split('\n')).toEqual([
      'ulu-labs   (owner)   3+ projects . 1,203 runs . 2,847 findings . 2,101 fixed . 31 regressions   (as of 2026-09-15 21:44 UTC)',
      `  ${'ops-uluops-api'.padEnd(48)}      47 runs .    41 findings .    24 fixed .   2 regressions`,
      `  ${'quiet'.padEnd(48)}       0 runs .     0 findings .     0 fixed .   0 regressions`,
      `  ${'n'.repeat(45)}...       1 runs .     1 findings .     1 fixed .   1 regressions`,
      '  ... more projects than the 100 shown (--json for the totals; the totals above count every project)',
      '',
      'personal (alexself2)   0 projects . 88 runs . 2,847 findings . 2,101 fixed . 31 regressions   (as of 2026-09-15 21:44 UTC)',
    ]);
  });
});
