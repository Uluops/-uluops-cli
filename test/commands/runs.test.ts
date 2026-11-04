import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsCliContext } from '../../src/context.js';
import { captureOutput } from '../helpers/capture.js';
import {
  createMockOpsClient,
  createMockOpsContext,
} from '../helpers/command-harness.js';
import { createRun } from '../helpers/mock-factories.js';

vi.mock('../../src/context.js');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() =>
      JSON.stringify({
        project: 'test-proj',
        workflowType: 'ship',
        agents: [{ name: 'code-validator', score: 85, status: 'PASS' }],
      }),
    ),
  };
});

import { existsSync, readFileSync } from 'node:fs';
import { registerRunCommands } from '../../src/commands/runs.js';
import { createOpsContext, handleOpsError } from '../../src/context.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);

type MockClient = ReturnType<typeof createMockOpsClient>;
let mockClient: MockClient;

beforeEach(() => {
  mockClient = createMockOpsClient();
  mockedCreateOpsContext.mockReturnValue(
    createMockOpsContext({
      client: mockClient as unknown as OpsCliContext['client'],
    }),
  );
  mockedHandleOpsError.mockImplementation((error) => {
    throw error;
  });
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerRunCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('runs list', () => {
  it('should display runs table', async () => {
    mockClient.runs.listByProject.mockResolvedValue({
      total: 0,
      data: [
        createRun({ runNumber: 5, workflowType: 'ship', averageScore: 92.3 }),
      ],
    });
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith(
      'my-proj',
      expect.any(Object),
    );
    expect(output.stdout()).toContain('ship');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.runs.listByProject.mockResolvedValue({ total: 0, data: [] });
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj');
    expect(output.stdout()).toContain('No runs found');
    output.restore();
  });

  it('should pass workflow filter', async () => {
    mockClient.runs.listByProject.mockResolvedValue({ total: 0, data: [] });
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj', '--workflow', 'ship');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith(
      'my-proj',
      expect.objectContaining({
        workflowType: 'ship',
      }),
    );
    output.restore();
  });
});

describe('runs get', () => {
  it('should fetch run by ID', async () => {
    mockClient.runs.get.mockResolvedValue(createRun({ runNumber: 3 }));
    const output = captureOutput();
    await parse('runs', 'get', 'run-uuid-123');
    expect(mockClient.runs.get).toHaveBeenCalledWith('run-uuid-123');
    expect(output.stdout()).toContain('Run Number: 3');
    output.restore();
  });
});

describe('runs latest', () => {
  it('should fetch latest run', async () => {
    mockClient.runs.getLatest.mockResolvedValue(createRun({ runNumber: 10 }));
    const output = captureOutput();
    await parse('runs', 'latest', 'my-proj');
    expect(mockClient.runs.getLatest).toHaveBeenCalledWith(
      'my-proj',
      undefined,
    );
    expect(output.stdout()).toContain('Run Number: 10');
    output.restore();
  });
});

describe('runs details', () => {
  it('should display detailed run info', async () => {
    mockClient.runs.getDetails.mockResolvedValue({
      run: createRun({
        runNumber: 5,
        workflowType: 'ship',
        averageScore: 88.5,
        allGatesPassed: true,
      }),
      agents: [
        { name: 'code-validator', score: 90, maxScore: 100, decision: 'PASS' },
      ],
      recommendations: [
        {
          title: 'Add error handling',
          priority: 'suggested',
          severity: 'medium',
          agent: 'code-validator',
        },
      ],
    });
    const output = captureOutput();
    await parse('runs', 'details', 'my-proj');
    expect(output.stdout()).toContain('Run #5');
    expect(output.stdout()).toContain('code-validator');
    expect(output.stdout()).toContain('Add error handling');
    output.restore();
  });
});

describe('runs diff', () => {
  it('should compare two runs', async () => {
    mockClient.runs.diff.mockResolvedValue({
      fixed: [{ title: 'Fixed bug' }],
      new: [{ title: 'New issue' }],
      unchanged: [{ title: 'Still there' }],
    });
    const output = captureOutput();
    await parse('runs', 'diff', 'my-proj', '--base', '1', '--compare', '2');
    expect(mockClient.runs.diff).toHaveBeenCalledWith({
      project: 'my-proj',
      baseRun: 1,
      compareRun: 2,
    });
    expect(output.stdout()).toContain('Fixed bug');
    expect(output.stdout()).toContain('New issue');
    expect(output.stdout()).toContain('Unchanged: 1');
    output.restore();
  });
});

describe('runs save', () => {
  it('should save run from file', async () => {
    mockClient.runs.save.mockResolvedValue({
      run: createRun({ runNumber: 7 }),
      correlation: { newIssues: 2, recurringIssues: 1, regressions: 0 },
      deduplicated: false,
    });
    const output = captureOutput();
    await parse('runs', 'save', '--file', '/tmp/run.json');
    expect(mockClient.runs.save).toHaveBeenCalled();
    expect(output.stdout()).toContain('Run #7 saved');
    // Where it landed (spec 2.4 / F-6): the API's orgSlug, else the resolved org,
    // else "personal" — beside the base URL because a slug is server-relative.
    expect(output.stdout()).toMatch(
      /Org: personal\s+\(personal\)\s+·\s+http:\/\/localhost:3100\/api\/v1/,
    );
    output.restore();
  });

  it('prints the org the API answered with, and flags a disagreement with the flag', async () => {
    mockedCreateOpsContext.mockReturnValue(
      createMockOpsContext({
        client: mockClient as unknown as OpsCliContext['client'],
        org: 'acme',
        orgSource: 'explicit',
      }),
    );
    mockClient.runs.save.mockResolvedValue({
      run: { ...createRun({ runNumber: 8 }), orgSlug: 'ulu-labs' },
      correlation: { newIssues: 0, recurringIssues: 0, regressions: 0 },
      deduplicated: false,
    });
    const output = captureOutput();
    await parse('runs', 'save', '--file', '/tmp/run.json');
    expect(output.stdout()).toContain(
      'Org: ulu-labs  (explicit, API answered differently)',
    );
    output.restore();
  });
});

describe('runs save: analysis rejections (analysis-never-loses-the-run R3)', () => {
  it('prints the rejection line when the server rejected an agent analysis', async () => {
    mockClient.runs.save.mockResolvedValue({
      run: createRun({ runNumber: 9 }),
      correlation: { newIssues: 0, recurringIssues: 0, regressions: 0 },
      deduplicated: false,
      analysisWrite: {
        recordMode: 'initial',
        supersededRecords: 0,
        supersededSummaries: 0,
        createdRecords: 1,
        createdSummaries: 1,
        rejected: [
          {
            agentName: 'agent-h',
            reason: 'entry_invalid',
            recordsRejected: 1,
            summariesRejected: 1,
            detail: { issues: [], issuesTotal: 1 },
          },
        ],
      },
    });
    const output = captureOutput();
    await parse('runs', 'save', '--file', '/tmp/run.json');
    const out = output.stdout();
    output.restore();
    expect(out).toContain('Run #9 saved successfully');
    expect(out).toContain(
      'Analysis rejected for agent-h: entry_invalid (1 record, 1 summary)',
    );
    expect(out).toContain('The run is saved, but not the analysis above');
    // The repair command names this run: project from the input, number from the echo.
    expect(out).toContain('`ulu runs update test-proj -n 9 --file <analysis.json>`');
  });

  it('--json keeps stdout the JSON payload and puts the rejection lines on stderr', async () => {
    mockedCreateOpsContext.mockReturnValue(
      createMockOpsContext({
        client: mockClient as unknown as OpsCliContext['client'],
        json: true,
      }),
    );
    mockClient.runs.save.mockResolvedValue({
      run: createRun({ runNumber: 9 }),
      correlation: { newIssues: 0, recurringIssues: 0, regressions: 0 },
      deduplicated: false,
      analysisWrite: {
        recordMode: 'initial',
        supersededRecords: 0,
        supersededSummaries: 0,
        createdRecords: 0,
        createdSummaries: 0,
        rejected: [
          {
            agentName: 'agent-h',
            reason: 'entry_invalid',
            recordsRejected: 1,
            summariesRejected: 1,
            detail: { issues: [], issuesTotal: 1 },
          },
        ],
      },
    });
    const output = captureOutput();
    await parse('runs', 'save', '--file', '/tmp/run.json');
    const out = output.stdout();
    const err = output.stderr();
    output.restore();
    expect(JSON.parse(out).analysisWrite.rejected[0].agentName).toBe('agent-h');
    expect(err).toContain('Analysis rejected for agent-h');
  });

  it('prints no rejection line for a clean save or one without analysisWrite', async () => {
    for (const analysisWrite of [
      undefined,
      {
        recordMode: 'initial',
        supersededRecords: 0,
        supersededSummaries: 0,
        createdRecords: 2,
        createdSummaries: 1,
        rejected: [],
      },
    ]) {
      mockClient.runs.save.mockResolvedValue({
        run: createRun({ runNumber: 10 }),
        correlation: { newIssues: 0, recurringIssues: 0, regressions: 0 },
        deduplicated: false,
        ...(analysisWrite && { analysisWrite }),
      });
      const output = captureOutput();
      await parse('runs', 'save', '--file', '/tmp/run.json');
      const out = output.stdout();
      output.restore();
      expect(out).toContain('Run #10 saved successfully');
      expect(out).not.toContain('Analysis rejected');
    }
  });
});

describe('runs archive', () => {
  it('should archive runs with --keep-last', async () => {
    mockClient.runs.archive.mockResolvedValue({ archived: 5 });
    const output = captureOutput();
    await parse('runs', 'archive', 'my-proj', '--keep-last', '3');
    expect(mockClient.runs.archive).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'my-proj',
        keepLast: 3,
      }),
    );
    expect(output.stdout()).toContain('Archived 5 runs');
    output.restore();
  });
});

describe('runs update', () => {
  it('should update run metadata by project and run number', async () => {
    mockClient.runs.update.mockResolvedValue(
      createRun({ runNumber: 3, averageScore: 92 }),
    );
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '--number', '3', '--score', '92');
    expect(mockClient.runs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        project: 'my-proj',
        runNumber: 3,
        averageScore: 92,
      }),
    );
    expect(output.stdout()).toContain('Run Number: 3');
    output.restore();
  });
});

describe('runs update --file (Zod-validated JSON input)', () => {
  it('accepts well-formed agent updates and forwards them', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({
        agents: [
          { name: 'code-validator', decision: 'PASS', score: 88 },
          { name: 'security-analyst', decision: 'WARN', score: 65 },
        ],
      }),
    );
    mockClient.runs.update.mockResolvedValue(
      createRun({ runNumber: 4, averageScore: 76 }),
    );
    const output = captureOutput();
    await parse(
      'runs',
      'update',
      'my-proj',
      '--number',
      '4',
      '--file',
      '/tmp/agents.json',
    );
    expect(mockClient.runs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        agents: expect.arrayContaining([
          expect.objectContaining({ name: 'code-validator' }),
        ]),
      }),
    );
    output.restore();
  });

  it('exits with a clear error when an agent entry is missing required fields', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({ agents: [{ score: 88 }] }), // missing name + decision
    );
    const output = captureOutput();
    await expect(
      parse(
        'runs',
        'update',
        'my-proj',
        '--number',
        '4',
        '--file',
        '/tmp/agents.json',
      ),
    ).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Invalid JSON input for runs update');
    output.restore();
  });

  it('exits when agents is the wrong type', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(
      JSON.stringify({ agents: 'not-an-array' }),
    );
    const output = captureOutput();
    await expect(
      parse(
        'runs',
        'update',
        'my-proj',
        '--number',
        '4',
        '--file',
        '/tmp/agents.json',
      ),
    ).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Invalid JSON input for runs update');
    output.restore();
  });

  it('skips the agents path when the JSON omits agents entirely', async () => {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify({}));
    mockClient.runs.update.mockResolvedValue(createRun({ runNumber: 4 }));
    const output = captureOutput();
    await parse(
      'runs',
      'update',
      'my-proj',
      '--number',
      '4',
      '--file',
      '/tmp/agents.json',
    );
    const call = mockClient.runs.update.mock.calls[0]?.[0];
    expect(call).not.toHaveProperty('agents');
    output.restore();
  });
});

// ── runs validate / runs update: analysis (0.46.0) ───────────────────────

const AGENT_H_REJECTION = {
  agentName: 'agent-h',
  reason: 'entry_invalid',
  recordsRejected: 1,
  summariesRejected: 1,
  detail: {
    issues: [
      {
        array: 'records',
        index: 1,
        path: ['data'],
        code: 'custom',
        message: 'analysis blob exceeds 8 levels of nesting',
      },
    ],
    issuesTotal: 1,
  },
};

describe('runs validate: same input defaults as save', () => {
  it('sends recommendations: [] when the input has none, as runs save does', async () => {
    mockClient.runs.validate.mockResolvedValue({
      wouldCreate: true,
      wouldUpdate: false,
      wouldRegress: false,
      validationErrors: [],
    });
    const output = captureOutput();
    await parse('runs', 'validate', '--file', '/tmp/run.json');
    output.restore();
    expect(mockClient.runs.validate.mock.calls[0]?.[0]).toMatchObject({
      recommendations: [],
    });
  });
});

describe('runs validate: analysis a save would reject', () => {
  it('prints each wouldReject entry with its issues, and says nothing was saved', async () => {
    mockClient.runs.validate.mockResolvedValue({
      wouldCreate: true,
      wouldUpdate: false,
      wouldRegress: false,
      validationErrors: [],
      wouldReject: [AGENT_H_REJECTION],
    });
    const output = captureOutput();
    await parse('runs', 'validate', '--file', '/tmp/run.json');
    const out = output.stdout();
    output.restore();
    expect(out).toContain(
      'Would reject analysis for agent-h: entry_invalid (1 record, 1 summary)',
    );
    expect(out).toContain('records[1].data: analysis blob exceeds 8 levels of nesting');
    expect(out).toContain('Nothing has been saved.');
  });

  it('prints no analysis section when nothing would be rejected', async () => {
    for (const wouldReject of [undefined, []]) {
      mockClient.runs.validate.mockResolvedValue({
        wouldCreate: true,
        wouldUpdate: false,
        wouldRegress: false,
        validationErrors: [],
        ...(wouldReject && { wouldReject }),
      });
      const output = captureOutput();
      await parse('runs', 'validate', '--file', '/tmp/run.json');
      const out = output.stdout();
      output.restore();
      expect(out).toContain('Validation Preview:');
      expect(out).not.toContain('Would reject');
    }
  });
});

describe('runs update: analysis repair', () => {
  const FIX = {
    analysis_records: [
      {
        agent_name: 'agent-h',
        record_type: 'probe',
        record_id: 'h-1',
        title: 'fixed',
        data: { note: 'flat now' },
      },
    ],
    analysis_summary: [{ agent_name: 'agent-h', decision: 'PASS' }],
  };
  const EMPTY_PLAN = {
    preview: true,
    recordMode: 'replace',
    byAgent: {
      'agent-h': {
        wouldSupersedeRecords: 0,
        wouldSupersedeSummaries: 0,
        wouldCreateRecords: 1,
        wouldCreateSummaries: 1,
        wouldRetireRecordIds: [],
      },
    },
  };
  const ECHO = {
    run: createRun({ runNumber: 9 }),
    analysisWrite: {
      recordMode: 'replace',
      createdRecords: 1,
      createdSummaries: 1,
      supersededRecords: 0,
      supersededSummaries: 0,
    },
  };
  function updateWith(json: unknown, ...flags: string[]) {
    vi.mocked(readFileSync).mockReturnValueOnce(JSON.stringify(json));
    return parse('runs', 'update', 'my-proj', '-n', '9', '--file', '/tmp/fix.json', ...flags);
  }

  it('sends a runs-save-shaped file (snake_case) as camelCase analysis and prints the echo', async () => {
    mockClient.runs.previewUpdate.mockResolvedValue(EMPTY_PLAN);
    mockClient.runs.updateWithEcho.mockResolvedValue(ECHO);
    const output = captureOutput();
    await updateWith(FIX);
    const out = output.stdout();
    output.restore();
    const sent = mockClient.runs.updateWithEcho.mock.calls[0]?.[0];
    expect(sent).toMatchObject({
      project: 'my-proj',
      runNumber: 9,
      analysisRecords: [
        { agentName: 'agent-h', recordType: 'probe', recordId: 'h-1', data: { note: 'flat now' } },
      ],
      analysisSummary: [{ agentName: 'agent-h', decision: 'PASS' }],
    });
    expect(mockClient.runs.update).not.toHaveBeenCalled();
    expect(out).toContain(
      'Analysis (replace): created 1 records, 1 summaries; superseded 0 records, 0 summaries',
    );
  });

  it('refuses a replace write that would retire records, and writes nothing', async () => {
    mockClient.runs.previewUpdate.mockResolvedValue({
      ...EMPTY_PLAN,
      byAgent: {
        'agent-h': { ...EMPTY_PLAN.byAgent['agent-h'], wouldRetireRecordIds: ['h-2', 'h-3'] },
      },
    });
    const output = captureOutput();
    await expect(updateWith(FIX)).rejects.toThrow('process.exit(1)');
    const err = output.stderr();
    output.restore();
    expect(err).toContain('would retire records of these agents that the file leaves out');
    expect(err).toContain('agent-h: h-2, h-3');
    expect(err).toContain('--record-mode merge: supersedes only the record_ids sent');
    expect(err).toContain('Nothing was written.');
    expect(mockClient.runs.updateWithEcho).not.toHaveBeenCalled();
  });

  it('--allow-retire writes a replace update that retires records, and names what it retired', async () => {
    mockClient.runs.previewUpdate.mockResolvedValue({
      ...EMPTY_PLAN,
      byAgent: {
        'agent-h': { ...EMPTY_PLAN.byAgent['agent-h'], wouldRetireRecordIds: ['h-2'] },
      },
    });
    mockClient.runs.updateWithEcho.mockResolvedValue(ECHO);
    const output = captureOutput();
    await updateWith(FIX, '--allow-retire');
    const out = output.stdout();
    output.restore();
    expect(mockClient.runs.previewUpdate).toHaveBeenCalledTimes(1);
    expect(mockClient.runs.updateWithEcho).toHaveBeenCalledTimes(1);
    expect(out).toContain('Retired (--allow-retire):');
    expect(out).toContain('agent-h: h-2');
  });

  it('-y and --yes are not accepted on runs update (no reflexive bypass of the retire check)', async () => {
    for (const flag of ['-y', '--yes']) {
      const output = captureOutput();
      // No --file: commander refuses the unknown flag before any read, so a queued file mock
      // would leak into the next test.
      await expect(parse('runs', 'update', 'my-proj', '-n', '9', flag)).rejects.toThrow();
      output.restore();
    }
    expect(mockClient.runs.updateWithEcho).not.toHaveBeenCalled();
  });

  it('merge mode is previewed too (the SDK checks the echoed mode before writing), then writes', async () => {
    mockClient.runs.previewUpdate.mockResolvedValue({ ...EMPTY_PLAN, recordMode: 'merge' });
    mockClient.runs.updateWithEcho.mockResolvedValue({
      ...ECHO,
      analysisWrite: { ...ECHO.analysisWrite, recordMode: 'merge' },
    });
    const output = captureOutput();
    await updateWith(FIX, '--record-mode', 'merge');
    output.restore();
    expect(mockClient.runs.previewUpdate.mock.calls[0]?.[0]).toMatchObject({
      recordWriteMode: 'merge',
    });
    expect(mockClient.runs.updateWithEcho.mock.calls[0]?.[0]).toMatchObject({
      recordWriteMode: 'merge',
    });
  });

  it('--preview prints the plan, including record ids it would retire, and writes nothing', async () => {
    mockClient.runs.previewUpdate.mockResolvedValue({
      ...EMPTY_PLAN,
      byAgent: {
        'agent-h': { ...EMPTY_PLAN.byAgent['agent-h'], wouldRetireRecordIds: ['h-2'] },
      },
    });
    const output = captureOutput();
    await updateWith(FIX, '--preview');
    const out = output.stdout();
    output.restore();
    expect(out).toContain('Update preview (record mode: replace) — nothing written');
    expect(out).toContain('agent-h: create 1 records, 1 summaries; supersede 0 records, 0 summaries; retire 1 records');
    expect(out).toContain('retire: h-2');
    expect(mockClient.runs.updateWithEcho).not.toHaveBeenCalled();
    expect(mockClient.runs.update).not.toHaveBeenCalled();
  });

  it('--preview refuses non-analysis fields and an input without analysis', async () => {
    let output = captureOutput();
    await expect(updateWith(FIX, '--preview', '--score', '80')).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('--preview shows analysis writes only');
    output.restore();
    output = captureOutput();
    await expect(updateWith({}, '--preview')).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('--preview needs analysis_records or analysis_summary in --file');
    output.restore();
    expect(mockClient.runs.previewUpdate).not.toHaveBeenCalled();
  });

  it('refuses a record mode without records (the server would 400)', async () => {
    const output = captureOutput();
    await expect(
      updateWith({ analysis_summary: FIX.analysis_summary }, '--record-mode', 'merge'),
    ).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('needs analysis_records');
    output.restore();
    await expect(updateWith(FIX, '--record-mode', 'upsert')).rejects.toThrow('process.exit(1)');
  });

  it('refuses more than 100 records before sending', async () => {
    const many = Array.from({ length: 101 }, (_, i) => ({ ...FIX.analysis_records[0], record_id: `r-${i}` }));
    const output = captureOutput();
    await expect(updateWith({ analysis_records: many })).rejects.toThrow('process.exit(1)');
    const err = output.stderr();
    expect(err).toContain('Invalid JSON input for runs update');
    expect(err).toContain('at most 100 analysis_records per update');
    expect(err).not.toContain('"code"'); // a sentence, not a raw Zod issue dump
    output.restore();
  });

  it('on AnalysisEchoMismatchError says the write landed and not to retry', async () => {
    const { AnalysisEchoMismatchError } = await import('@uluops/ops-sdk');
    mockClient.runs.previewUpdate.mockResolvedValue(EMPTY_PLAN);
    mockClient.runs.updateWithEcho.mockRejectedValue(
      new AnalysisEchoMismatchError('mismatch', {
        reason: 'mode-mismatch',
        expectedRecordMode: 'replace',
        actualRecordMode: 'merge',
        run: null,
        analysisWrite: null,
      }),
    );
    const output = captureOutput();
    // Exit 5, not 1: "applied, do not retry" must be tellable from "refused" by a script.
    await expect(updateWith(FIX)).rejects.toThrow('process.exit(5)');
    const err = output.stderr();
    output.restore();
    expect(err).toContain('The update was applied');
    expect(err).toContain('Do not run it again');
    expect(err).toContain('ulu runs details my-proj -n 9');
    expect(err).toContain('mismatch'); // the SDK's own message is printed, not paraphrased
  });

  it('a preview-mode-mismatch from the pre-write preview says nothing was written, and does not write', async () => {
    const { AnalysisEchoMismatchError } = await import('@uluops/ops-sdk');
    mockClient.runs.previewUpdate.mockRejectedValue(
      new AnalysisEchoMismatchError('preview mismatch', {
        reason: 'preview-mode-mismatch',
        expectedRecordMode: 'merge',
        actualRecordMode: 'replace',
        run: null,
        analysisWrite: null,
      }),
    );
    for (const flags of [['--record-mode', 'merge'], ['--record-mode', 'merge', '--preview']]) {
      const output = captureOutput();
      await expect(updateWith(FIX, ...flags)).rejects.toThrow('process.exit(1)');
      const err = output.stderr();
      output.restore();
      expect(err).toContain('Nothing was written');
      expect(err).not.toContain('was applied');
    }
    expect(mockClient.runs.updateWithEcho).not.toHaveBeenCalled();
  });

  it('--json: a refusal is a JSON error on stderr with the ids', async () => {
    mockedCreateOpsContext.mockReturnValue(
      createMockOpsContext({
        client: mockClient as unknown as OpsCliContext['client'],
        json: true,
      }),
    );
    mockClient.runs.previewUpdate.mockResolvedValue({
      ...EMPTY_PLAN,
      byAgent: {
        'agent-h': { ...EMPTY_PLAN.byAgent['agent-h'], wouldRetireRecordIds: ['h-2'] },
      },
    });
    const output = captureOutput();
    await expect(updateWith(FIX)).rejects.toThrow('process.exit(1)');
    const err = JSON.parse(output.stderr());
    output.restore();
    expect(err).toMatchObject({
      code: 'WOULD_RETIRE_RECORDS',
      applied: false,
      wouldRetireRecordIds: { 'agent-h': ['h-2'] },
    });
    expect(mockClient.runs.updateWithEcho).not.toHaveBeenCalled();
  });

  it('a metadata-only update keeps the 0.44.0 path (runs.update, no preview)', async () => {
    mockClient.runs.update.mockResolvedValue(createRun({ runNumber: 9 }));
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '-n', '9', '--score', '80');
    output.restore();
    expect(mockClient.runs.update).toHaveBeenCalledTimes(1);
    expect(mockClient.runs.updateWithEcho).not.toHaveBeenCalled();
    expect(mockClient.runs.previewUpdate).not.toHaveBeenCalled();
  });
});

describe('runs delete', () => {
  it('should delete a run with --yes', async () => {
    mockClient.runs.delete.mockResolvedValue(undefined);
    const output = captureOutput();
    await parse('runs', 'delete', 'run-uuid-123', '--yes');
    expect(mockClient.runs.delete).toHaveBeenCalledWith('run-uuid-123');
    output.restore();
  });

  it('should fail closed (exit 1) without --yes in non-interactive mode', async () => {
    const output = captureOutput();
    await expect(parse('runs', 'delete', 'run-uuid-123')).rejects.toThrow(
      'process.exit(1)',
    );
    expect(output.stderr()).toContain('not an interactive terminal');
    expect(mockClient.runs.delete).not.toHaveBeenCalled();
    output.restore();
  });
});

describe('runs list with numeric options', () => {
  it('should pass limit option as number', async () => {
    mockClient.runs.listByProject.mockResolvedValue({ total: 0, data: [] });
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj', '--limit', '5');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith(
      'my-proj',
      expect.objectContaining({
        limit: 5,
      }),
    );
    output.restore();
  });

  it('should use default limit when not specified', async () => {
    mockClient.runs.listByProject.mockResolvedValue({ total: 0, data: [] });
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith(
      'my-proj',
      expect.objectContaining({
        limit: 20,
      }),
    );
    output.restore();
  });
});

describe('runs archive with boundary values', () => {
  it('should pass keep-last as number', async () => {
    mockClient.runs.archive.mockResolvedValue({ archivedCount: 0 });
    const output = captureOutput();
    await parse('runs', 'archive', 'my-proj', '--keep-last', '1');
    expect(mockClient.runs.archive).toHaveBeenCalledWith(
      expect.objectContaining({
        keepLast: 1,
      }),
    );
    output.restore();
  });

  it('should pass before-run as number', async () => {
    mockClient.runs.archive.mockResolvedValue({ archivedCount: 3 });
    const output = captureOutput();
    await parse('runs', 'archive', 'my-proj', '--before-run', '10');
    expect(mockClient.runs.archive).toHaveBeenCalledWith(
      expect.objectContaining({
        beforeRunNumber: 10,
      }),
    );
    output.restore();
  });
});

describe('runs update with numeric options', () => {
  it('should parse score as float', async () => {
    mockClient.runs.update.mockResolvedValue(
      createRun({ runNumber: 1, averageScore: 85.5 }),
    );
    const output = captureOutput();
    await parse(
      'runs',
      'update',
      'my-proj',
      '--number',
      '1',
      '--score',
      '85.5',
    );
    expect(mockClient.runs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        averageScore: 85.5,
      }),
    );
    output.restore();
  });

  it('should handle score of 0', async () => {
    mockClient.runs.update.mockResolvedValue(
      createRun({ runNumber: 1, averageScore: 0 }),
    );
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '--number', '1', '--score', '0');
    expect(mockClient.runs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        averageScore: 0,
      }),
    );
    output.restore();
  });

  it('should handle score of 100', async () => {
    mockClient.runs.update.mockResolvedValue(
      createRun({ runNumber: 1, averageScore: 100 }),
    );
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '--number', '1', '--score', '100');
    expect(mockClient.runs.update).toHaveBeenCalledWith(
      expect.objectContaining({
        averageScore: 100,
      }),
    );
    output.restore();
  });
});

describe('readJsonInput error paths', () => {
  it('should exit when file does not exist', async () => {
    vi.mocked(existsSync).mockReturnValueOnce(false);
    const output = captureOutput();
    await expect(
      parse('runs', 'save', '--file', '/tmp/missing.json'),
    ).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('File not found');
    expect(output.stderr()).toContain('/tmp/missing.json');
    output.restore();
  });

  it('should exit when file contains invalid JSON', async () => {
    vi.mocked(existsSync).mockReturnValueOnce(true);
    vi.mocked(readFileSync).mockReturnValueOnce('not valid json {{{');
    const output = captureOutput();
    await expect(
      parse('runs', 'save', '--file', '/tmp/bad.json'),
    ).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Invalid JSON in file');
    output.restore();
  });

  it('should exit when neither --file nor --stdin is provided', async () => {
    const output = captureOutput();
    await expect(parse('runs', 'save')).rejects.toThrow('process.exit(1)');
    expect(output.stderr()).toContain('--file or --stdin');
    output.restore();
  });
});

describe('error handling', () => {
  it('should delegate to handleOpsError on failure', async () => {
    const error = new Error('API fail');
    mockClient.runs.listByProject.mockRejectedValue(error);
    await expect(parse('runs', 'list', 'my-proj')).rejects.toThrow('API fail');
    expect(mockedHandleOpsError).toHaveBeenCalledWith(
      error,
      expect.any(Object),
    );
  });
});
