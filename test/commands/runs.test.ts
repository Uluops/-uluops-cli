import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import { createRun } from '../helpers/mock-factories.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({
      project: 'test-proj',
      workflowType: 'ship',
      validators: [{ name: 'code-validator', score: 85, status: 'PASS' }],
    })),
  };
});

import { createOpsContext, handleOpsError } from '../../src/context.js';
import { registerRunCommands } from '../../src/commands/runs.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);

type MockClient = ReturnType<typeof createMockOpsClient>;
let mockClient: MockClient;

beforeEach(() => {
  mockClient = createMockOpsClient();
  mockedCreateOpsContext.mockReturnValue(
    createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'] })
  );
  mockedHandleOpsError.mockImplementation((error) => { throw error; });
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerRunCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('runs list', () => {
  it('should display runs table', async () => {
    mockClient.runs.listByProject.mockResolvedValue([
      createRun({ runNumber: 5, workflowType: 'ship', averageScore: 92.3 }),
    ]);
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith('my-proj', expect.any(Object));
    expect(output.stdout()).toContain('ship');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.runs.listByProject.mockResolvedValue([]);
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj');
    expect(output.stdout()).toContain('No runs found');
    output.restore();
  });

  it('should pass workflow filter', async () => {
    mockClient.runs.listByProject.mockResolvedValue([]);
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj', '--workflow', 'ship');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith('my-proj', expect.objectContaining({
      workflowType: 'ship',
    }));
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
    expect(mockClient.runs.getLatest).toHaveBeenCalledWith('my-proj', undefined);
    expect(output.stdout()).toContain('Run Number: 10');
    output.restore();
  });
});

describe('runs details', () => {
  it('should display detailed run info', async () => {
    mockClient.runs.getDetails.mockResolvedValue({
      run: createRun({ runNumber: 5, workflowType: 'ship', averageScore: 88.5, allGatesPassed: true }),
      validators: [{ name: 'code-validator', score: 90, maxScore: 100, status: 'PASS' }],
      recommendations: [
        { title: 'Add error handling', priority: 'suggested', severity: 'medium', validator: 'code-validator', correlation: 'new' },
      ],
    });
    const output = captureOutput();
    await parse('runs', 'details', 'my-proj');
    expect(output.stdout()).toContain('Run #5');
    expect(output.stdout()).toContain('code-validator');
    expect(output.stdout()).toContain('Add error handling');
    expect(output.stdout()).toContain('[NEW]');
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
    output.restore();
  });
});

describe('runs archive', () => {
  it('should archive runs with --keep-last', async () => {
    mockClient.runs.archive.mockResolvedValue({ archivedCount: 5 });
    const output = captureOutput();
    await parse('runs', 'archive', 'my-proj', '--keep-last', '3');
    expect(mockClient.runs.archive).toHaveBeenCalledWith(expect.objectContaining({
      project: 'my-proj',
      keepLast: 3,
    }));
    expect(output.stdout()).toContain('Archived 5 runs');
    output.restore();
  });
});

describe('runs update', () => {
  it('should update run metadata by project and run number', async () => {
    mockClient.runs.update.mockResolvedValue(createRun({ runNumber: 3, averageScore: 92 }));
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '--number', '3', '--score', '92');
    expect(mockClient.runs.update).toHaveBeenCalledWith(expect.objectContaining({
      project: 'my-proj',
      runNumber: 3,
      averageScore: 92,
    }));
    expect(output.stdout()).toContain('Run Number: 3');
    output.restore();
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
});

describe('runs list with numeric options', () => {
  it('should pass limit option as number', async () => {
    mockClient.runs.listByProject.mockResolvedValue([]);
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj', '--limit', '5');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith('my-proj', expect.objectContaining({
      limit: 5,
    }));
    output.restore();
  });

  it('should use default limit when not specified', async () => {
    mockClient.runs.listByProject.mockResolvedValue([]);
    const output = captureOutput();
    await parse('runs', 'list', 'my-proj');
    expect(mockClient.runs.listByProject).toHaveBeenCalledWith('my-proj', expect.objectContaining({
      limit: 20,
    }));
    output.restore();
  });
});

describe('runs archive with boundary values', () => {
  it('should pass keep-last as number', async () => {
    mockClient.runs.archive.mockResolvedValue({ archivedCount: 0 });
    const output = captureOutput();
    await parse('runs', 'archive', 'my-proj', '--keep-last', '1');
    expect(mockClient.runs.archive).toHaveBeenCalledWith(expect.objectContaining({
      keepLast: 1,
    }));
    output.restore();
  });

  it('should pass before-run as number', async () => {
    mockClient.runs.archive.mockResolvedValue({ archivedCount: 3 });
    const output = captureOutput();
    await parse('runs', 'archive', 'my-proj', '--before-run', '10');
    expect(mockClient.runs.archive).toHaveBeenCalledWith(expect.objectContaining({
      beforeRunNumber: 10,
    }));
    output.restore();
  });
});

describe('runs update with numeric options', () => {
  it('should parse score as float', async () => {
    mockClient.runs.update.mockResolvedValue(createRun({ runNumber: 1, averageScore: 85.5 }));
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '--number', '1', '--score', '85.5');
    expect(mockClient.runs.update).toHaveBeenCalledWith(expect.objectContaining({
      averageScore: 85.5,
    }));
    output.restore();
  });

  it('should handle score of 0', async () => {
    mockClient.runs.update.mockResolvedValue(createRun({ runNumber: 1, averageScore: 0 }));
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '--number', '1', '--score', '0');
    expect(mockClient.runs.update).toHaveBeenCalledWith(expect.objectContaining({
      averageScore: 0,
    }));
    output.restore();
  });

  it('should handle score of 100', async () => {
    mockClient.runs.update.mockResolvedValue(createRun({ runNumber: 1, averageScore: 100 }));
    const output = captureOutput();
    await parse('runs', 'update', 'my-proj', '--number', '1', '--score', '100');
    expect(mockClient.runs.update).toHaveBeenCalledWith(expect.objectContaining({
      averageScore: 100,
    }));
    output.restore();
  });
});

describe('error handling', () => {
  it('should delegate to handleOpsError on failure', async () => {
    const error = new Error('API fail');
    mockClient.runs.listByProject.mockRejectedValue(error);
    await expect(parse('runs', 'list', 'my-proj')).rejects.toThrow('API fail');
    expect(mockedHandleOpsError).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
