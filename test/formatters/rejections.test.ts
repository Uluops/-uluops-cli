import type { AnalysisRejection } from '@uluops/ops-sdk';
import { describe, expect, it } from 'vitest';
import { formatAnalysisRejections } from '../../src/formatters/rejections.js';

function rejection(overrides: Partial<AnalysisRejection> = {}): AnalysisRejection {
  return {
    agentName: 'agent-h',
    reason: 'entry_invalid',
    recordsRejected: 1,
    summariesRejected: 1,
    detail: { issues: [], issuesTotal: 1 },
    ...overrides,
  };
}

describe('formatAnalysisRejections', () => {
  it('prints nothing when the server reported no rejection, or did not report at all', () => {
    expect(formatAnalysisRejections(undefined)).toEqual([]);
    expect(formatAnalysisRejections([])).toEqual([]);
  });

  it('prints the spec §3.5 line per rejection, then the saved-run line', () => {
    const lines = formatAnalysisRejections([
      rejection(),
      rejection({ agentName: 'agent-k', recordsRejected: 3, summariesRejected: 0 }),
    ]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toBe(
      'Analysis rejected for agent-h: entry_invalid (1 record, 1 summary)',
    );
    expect(lines[1]).toBe(
      'Analysis rejected for agent-k: entry_invalid (3 records, 0 summaries)',
    );
    expect(lines[2]).toMatch(/^The run is saved, but not the analysis above: each rejected agent's analysis was dropped whole/);
    expect(lines[2]).toContain('Submitting again creates a second run.');
    expect(lines[2]).toContain('`ulu runs latest` can return a different run');
    expect(lines[2]).toContain(
      '`ulu runs update <project> -n <run number> --file <analysis.json>`',
    );
  });

  it('names the run in the repair command when it is known', () => {
    const lines = formatAnalysisRejections([rejection()], {
      run: { project: 'ops-sdk', runNumber: 42 },
    });
    expect(lines.at(-1)).toContain('`ulu runs update ops-sdk -n 42 --file <analysis.json>`');
  });

  it('lists the entry_invalid issues under their rejection, capped at 5', () => {
    const issues = Array.from({ length: 7 }, (_, i) => ({
      array: 'records',
      index: i,
      path: ['data', 'x'],
      code: 'custom',
      message: `bad ${i}`,
    }));
    const lines = formatAnalysisRejections([
      rejection({ detail: { issues, issuesTotal: 12 } }),
    ]);
    expect(lines[1]).toBe('  records[0].data.x: bad 0');
    expect(lines[5]).toBe('  records[4].data.x: bad 4');
    expect(lines[6]).toBe('  … 7 more (--json shows the issues the server sent)');
    expect(lines).toHaveLength(8);
  });

  it('prints no issue lines for a detail shape it does not know (a new reason)', () => {
    for (const detail of [
      { unitsOmitted: 3 },
      { issues: 'not-an-array' },
      { issues: [null, 7, { message: 42 }] },
    ]) {
      expect(formatAnalysisRejections([rejection({ detail })])).toHaveLength(2);
    }
  });

  it('would mode (runs validate) words it as a prediction and says nothing was saved', () => {
    const lines = formatAnalysisRejections([rejection()], { mode: 'would' });
    expect(lines[0]).toBe(
      'Would reject analysis for agent-h: entry_invalid (1 record, 1 summary)',
    );
    expect(lines.at(-1)).toMatch(/^Nothing has been saved\./);
    expect(lines.join('\n')).not.toContain('second run');
  });

  it('names a null agent (own-unit entry, units_omitted row) as unattributed entries', () => {
    const [line] = formatAnalysisRejections([
      rejection({ agentName: null, reason: 'units_omitted', recordsRejected: 4 }),
    ]);
    expect(line).toBe(
      'Analysis rejected for unattributed entries: units_omitted (4 records, 1 summary)',
    );
  });

  it('prints an unknown reason verbatim (reason is an open string, A9)', () => {
    const [line] = formatAnalysisRejections([rejection({ reason: 'some_future_reason' })]);
    expect(line).toContain(': some_future_reason (');
  });

  it('keeps server text on one line and strips escape sequences', () => {
    const lines = formatAnalysisRejections([
      rejection({ agentName: 'evil\nAnalysis rejected for forged\x1b[2J', reason: 'entry_\rinvalid' }),
    ]);
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe(
      'Analysis rejected for evil Analysis rejected for forged: entry_ invalid (1 record, 1 summary)',
    );
    expect(lines.join('\n')).not.toContain('\x1b');
  });

  it('names the run and drops the Dashboard-link note when the run is known', () => {
    const line = formatAnalysisRejections([rejection()], {
      run: { project: 'ops-sdk', runNumber: 42 },
    }).at(-1);
    expect(line).not.toContain('Dashboard link');
  });

  it('on a dedup replay says these are the earlier save\'s rejections and this input was not applied', () => {
    const line = formatAnalysisRejections([rejection()], {
      run: { project: 'p', runNumber: 3 },
      replay: true,
    }).at(-1);
    expect(line).toMatch(/^This save was a replay of an earlier one/);
    expect(line).toContain('this input was not applied');
    expect(line).not.toContain('creates a second run');
  });

  it('labels the units_omitted row by the count it stands for', () => {
    const [line] = formatAnalysisRejections([
      rejection({
        agentName: null,
        reason: 'units_omitted',
        recordsRejected: 9,
        summariesRejected: 2,
        detail: { unitsOmitted: 3, recordsRejected: 9, summariesRejected: 2 },
      }),
    ]);
    expect(line).toBe(
      'Analysis rejected for 3 more units, not listed (the server lists at most 20) (9 records, 2 summaries)',
    );
  });

  it('counts "more" from the issues not examined, not the malformed ones skipped', () => {
    const issues = [
      { array: 'records', index: 0, message: 'a' },
      { message: 42 },
      { array: 'records', index: 2, message: 'c' },
    ];
    const lines = formatAnalysisRejections([
      rejection({ detail: { issues, issuesTotal: 4 } }),
    ]);
    expect(lines).toContain('  … 1 more (--json shows the issues the server sent)');
  });
});
