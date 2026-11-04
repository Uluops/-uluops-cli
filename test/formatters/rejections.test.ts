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
    expect(lines[2]).toMatch(/^The run is saved; submitting it again creates a second run\./);
    expect(lines[2]).toContain('update_run');
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
});
