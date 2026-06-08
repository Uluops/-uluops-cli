import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import { createIssue } from '../helpers/mock-factories.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createOpsContext, handleOpsError } from '../../src/context.js';
import { registerIssueCommands } from '../../src/commands/issues.js';

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
  registerIssueCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('issues list', () => {
  it('should display issues table', async () => {
    mockClient.issues.listByProject.mockResolvedValue([
      createIssue({ title: 'Missing handler', status: 'open', priority: 'critical' }),
    ]);
    const output = captureOutput();
    await parse('issues', 'list', 'my-proj');
    expect(mockClient.issues.listByProject).toHaveBeenCalledWith('my-proj', expect.any(Object));
    expect(output.stdout()).toContain('Missing handler');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.issues.listByProject.mockResolvedValue([]);
    const output = captureOutput();
    await parse('issues', 'list', 'my-proj');
    expect(output.stdout()).toContain('No issues found');
    output.restore();
  });

  it('should pass filter options', async () => {
    mockClient.issues.listByProject.mockResolvedValue([]);
    const output = captureOutput();
    await parse('issues', 'list', 'my-proj', '--status', 'open', '--priority', 'critical', '--limit', '10');
    expect(mockClient.issues.listByProject).toHaveBeenCalledWith('my-proj', expect.objectContaining({
      status: 'open',
      priority: 'critical',
      limit: 10,
    }));
    output.restore();
  });
});

describe('issues get', () => {
  it('should fetch and display issue', async () => {
    mockClient.issues.get.mockResolvedValue(createIssue({ title: 'Bug report' }));
    const output = captureOutput();
    await parse('issues', 'get', 'abc-123');
    expect(mockClient.issues.get).toHaveBeenCalledWith('abc-123');
    expect(output.stdout()).toContain('Title: Bug report');
    output.restore();
  });

  it('should fetch full details with --full', async () => {
    mockClient.issues.getDetails.mockResolvedValue({
      issue: createIssue({ title: 'Detailed bug' }),
      occurrences: [{ validator: 'code-validator', filePath: 'src/index.ts', lineNumber: 42 }],
      notes: [{ noteType: 'context', content: 'This is a note about the issue' }],
      statusHistory: [{ changedAt: '2025-01-15T10:00:00Z', oldStatus: 'open', newStatus: 'completed' }],
    });
    const output = captureOutput();
    await parse('issues', 'get', 'abc-123', '--full');
    expect(mockClient.issues.getDetails).toHaveBeenCalledWith('abc-123');
    expect(output.stdout()).toContain('Detailed bug');
    expect(output.stdout()).toContain('Occurrences (1)');
    expect(output.stdout()).toContain('Notes (1)');
    output.restore();
  });
});

describe('issues search', () => {
  it('should search across projects', async () => {
    mockClient.issues.search.mockResolvedValue([createIssue({ title: 'Found issue' })]);
    const output = captureOutput();
    await parse('issues', 'search', '--query', 'error handling');
    expect(mockClient.issues.search).toHaveBeenCalledWith(expect.objectContaining({
      query: 'error handling',
    }));
    expect(output.stdout()).toContain('Found issue');
    output.restore();
  });
});

describe('issues update', () => {
  it('should update issue status', async () => {
    mockClient.issues.updateStatus.mockResolvedValue({ ...createIssue(), status: 'completed' });
    const output = captureOutput();
    await parse('issues', 'update', 'abc-123', '--status', 'completed', '--reason', 'Fixed');
    expect(mockClient.issues.updateStatus).toHaveBeenCalledWith('abc-123', {
      status: 'completed',
      reason: 'Fixed',
    });
    expect(output.stdout()).toContain('status changed to: completed');
    output.restore();
  });
});

describe('issues close', () => {
  it('should close issue with default reason', async () => {
    mockClient.issues.updateStatus.mockResolvedValue({ ...createIssue(), status: 'completed' });
    const output = captureOutput();
    await parse('issues', 'close', 'abc-123');
    expect(mockClient.issues.updateStatus).toHaveBeenCalledWith('abc-123', {
      status: 'completed',
      reason: 'Closed via CLI',
    });
    expect(output.stdout()).toContain('closed');
    output.restore();
  });
});

describe('issues add-note', () => {
  it('should add note to issue', async () => {
    mockClient.issues.addNote.mockResolvedValue({ id: 'note-1', content: 'hello' });
    const output = captureOutput();
    await parse('issues', 'add-note', 'abc-123', '--message', 'This is important');
    expect(mockClient.issues.addNote).toHaveBeenCalledWith('abc-123', {
      content: 'This is important',
      noteType: 'context',
    });
    expect(output.stdout()).toContain('Note added');
    output.restore();
  });
});

describe('issues history', () => {
  it('renders merged envelope with status, occurrence, and note events', async () => {
    mockClient.issues.getHistory.mockResolvedValue({
      issueId: '11111111-1111-1111-1111-111111111111',
      totalEvents: 3,
      truncated: false,
      events: [
        {
          type: 'status',
          timestamp: '2026-01-15T10:00:00Z',
          oldStatus: 'completed',
          newStatus: 'open',
          reason: 'Undo of prior change',
          transitionType: 'undo',
          revertedChangeId: '22222222-2222-2222-2222-222222222222',
        },
        {
          type: 'note',
          timestamp: '2026-01-15T09:00:00Z',
          noteId: '33333333-3333-3333-3333-333333333333',
          content: 'Investigation note',
          noteType: 'investigation',
          createdBy: 'alex',
        },
        {
          type: 'occurrence',
          timestamp: '2026-01-15T08:00:00Z',
          runId: '44444444-4444-4444-4444-444444444444',
          agentName: 'aristotle-analyst',
          description: 'Telos misalignment detected',
        },
      ],
    });
    const output = captureOutput();
    await parse('issues', 'history', 'abc-123');
    const out = output.stdout();
    expect(out).toContain('History (3 events)');
    expect(out).toContain('[undo] status: completed → open');
    expect(out).toContain('Reverts: 22222222-2222-2222-2222-222222222222');
    expect(out).toContain('Reason: Undo of prior change');
    expect(out).toContain('note [investigation] by alex');
    expect(out).toContain('Investigation note');
    expect(out).toContain('occurrence: aristotle-analyst');
    expect(out).toContain('Telos misalignment detected');
    output.restore();
  });

  it('warns when envelope is truncated', async () => {
    mockClient.issues.getHistory.mockResolvedValue({
      issueId: '11111111-1111-1111-1111-111111111111',
      totalEvents: 1500,
      truncated: true,
      events: [
        {
          type: 'status',
          timestamp: '2026-01-15T10:00:00Z',
          oldStatus: 'open',
          newStatus: 'completed',
          reason: null,
          transitionType: 'change',
          revertedChangeId: null,
        },
      ],
    });
    const output = captureOutput();
    await parse('issues', 'history', 'abc-123');
    expect(output.stdout()).toContain('Truncated to most recent');
    output.restore();
  });

  it('resolves fingerprint via --project before fetching history', async () => {
    mockClient.issues.getByFingerprint.mockResolvedValue(
      createIssue({ id: '99999999-9999-9999-9999-999999999999' }),
    );
    mockClient.issues.getHistory.mockResolvedValue({
      issueId: '99999999-9999-9999-9999-999999999999',
      totalEvents: 0,
      truncated: false,
      events: [],
    });
    const output = captureOutput();
    await parse(
      'issues',
      'history',
      'fe8e8396a6167a50c7451697eabbaa7a4ebc03c8dc474931176954179c1e7308',
      '--project',
      'uluops-plans',
    );
    expect(mockClient.issues.getByFingerprint).toHaveBeenCalledWith(
      'fe8e8396a6167a50c7451697eabbaa7a4ebc03c8dc474931176954179c1e7308',
      'uluops-plans',
    );
    expect(mockClient.issues.getHistory).toHaveBeenCalledWith(
      '99999999-9999-9999-9999-999999999999',
    );
    output.restore();
  });

  it('shows empty message when no events', async () => {
    mockClient.issues.getHistory.mockResolvedValue({
      issueId: '11111111-1111-1111-1111-111111111111',
      totalEvents: 0,
      truncated: false,
      events: [],
    });
    const output = captureOutput();
    await parse('issues', 'history', 'abc-123');
    expect(output.stdout()).toContain('No history');
    output.restore();
  });
});

describe('issues undo', () => {
  it('should undo last status change', async () => {
    mockClient.issues.undoLastChange.mockResolvedValue({ ...createIssue(), status: 'open' });
    const output = captureOutput();
    await parse('issues', 'undo', 'abc-123');
    expect(mockClient.issues.undoLastChange).toHaveBeenCalledWith('abc-123');
    expect(output.stdout()).toContain('restored to: open');
    output.restore();
  });
});

describe('issues create', () => {
  it('should create a user-submitted issue', async () => {
    mockClient.issues.create.mockResolvedValue(createIssue({ title: 'Manual bug report' }));
    const output = captureOutput();
    await parse('issues', 'create', '--project', 'my-proj', '--title', 'Manual bug report', '--priority', 'critical');
    expect(mockClient.issues.create).toHaveBeenCalledWith(expect.objectContaining({
      project: 'my-proj',
      title: 'Manual bug report',
      priority: 'critical',
    }));
    expect(output.stdout()).toContain('Manual bug report');
    output.restore();
  });

  it('should pass optional fields', async () => {
    mockClient.issues.create.mockResolvedValue(createIssue());
    const output = captureOutput();
    await parse('issues', 'create', '--project', 'p', '--title', 't', '--priority', 'suggested',
      '--severity', 'high', '--agent', 'code-validator', '--file-path', 'src/foo.ts', '--line', '42');
    expect(mockClient.issues.create).toHaveBeenCalledWith(expect.objectContaining({
      severity: 'high',
      agent: 'code-validator',
      filePath: 'src/foo.ts',
      lineNumber: 42,
    }));
    output.restore();
  });
});

describe('issues edit', () => {
  it('should edit issue metadata', async () => {
    mockClient.issues.update.mockResolvedValue(createIssue({ title: 'Updated title', severity: 'high' }));
    const output = captureOutput();
    await parse('issues', 'edit', 'abc-123', '--title', 'Updated title', '--severity', 'high');
    expect(mockClient.issues.update).toHaveBeenCalledWith('abc-123', expect.objectContaining({
      title: 'Updated title',
      severity: 'high',
    }));
    expect(output.stdout()).toContain('Updated title');
    output.restore();
  });
});

describe('issues restore', () => {
  it('should restore a soft-deleted issue', async () => {
    mockClient.issues.restore.mockResolvedValue({ ...createIssue(), status: 'open' });
    const output = captureOutput();
    await parse('issues', 'restore', 'abc-123');
    expect(mockClient.issues.restore).toHaveBeenCalledWith('abc-123');
    expect(output.stdout()).toContain('restored');
    output.restore();
  });
});

describe('issues bulk-update', () => {
  it('should bulk update issue statuses', async () => {
    mockClient.issues.bulkUpdateStatus.mockResolvedValue({
      updated: 2,
      failed: [],
    });
    const output = captureOutput();
    await parse('issues', 'bulk-update', '--ids', 'id-1,id-2', '--status', 'completed', '--reason', 'Fixed all');
    expect(mockClient.issues.bulkUpdateStatus).toHaveBeenCalledWith([
      { issueId: 'id-1', status: 'completed', reason: 'Fixed all' },
      { issueId: 'id-2', status: 'completed', reason: 'Fixed all' },
    ]);
    expect(output.stdout()).toContain('Updated 2 issues');
    output.restore();
  });
});

describe('issues by-fingerprint', () => {
  it('should fetch issue by fingerprint', async () => {
    mockClient.issues.getByFingerprint.mockResolvedValue(createIssue({ title: 'Fingerprint match' }));
    const output = captureOutput();
    await parse('issues', 'by-fingerprint', 'abc123hash', '--project', 'my-proj');
    expect(mockClient.issues.getByFingerprint).toHaveBeenCalledWith('abc123hash', 'my-proj');
    expect(output.stdout()).toContain('Fingerprint match');
    output.restore();
  });
});

describe('issues update-by-fingerprint', () => {
  it('should update issue status by fingerprint', async () => {
    mockClient.issues.updateStatusByFingerprint.mockResolvedValue({
      id: 'abc-12345678', previousStatus: 'open', newStatus: 'completed', fingerprint: 'fp', updatedAt: '2025-01-01',
    });
    const output = captureOutput();
    await parse('issues', 'update-by-fingerprint', 'abc123hash', '--project', 'my-proj', '--status', 'completed');
    expect(mockClient.issues.updateStatusByFingerprint).toHaveBeenCalledWith('abc123hash', 'my-proj', {
      status: 'completed',
      reason: undefined,
    });
    expect(output.stdout()).toContain('open');
    expect(output.stdout()).toContain('completed');
    output.restore();
  });
});

describe('error handling', () => {
  it('should delegate to handleOpsError on list failure', async () => {
    const error = new Error('API fail');
    mockClient.issues.listByProject.mockRejectedValue(error);
    await expect(parse('issues', 'list', 'my-proj')).rejects.toThrow('API fail');
    expect(mockedHandleOpsError).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('should delegate to handleOpsError on get failure', async () => {
    const error = new Error('Not found');
    mockClient.issues.get.mockRejectedValue(error);
    await expect(parse('issues', 'get', 'bad-id')).rejects.toThrow('Not found');
    expect(mockedHandleOpsError).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('should delegate to handleOpsError on update failure', async () => {
    const error = new Error('Invalid status');
    mockClient.issues.updateStatus.mockRejectedValue(error);
    await expect(parse('issues', 'update', 'abc-123', '--status', 'completed')).rejects.toThrow('Invalid status');
    expect(mockedHandleOpsError).toHaveBeenCalledWith(error, expect.any(Object));
  });

  it('should delegate to handleOpsError on create failure', async () => {
    const error = new Error('Validation failed');
    mockClient.issues.create.mockRejectedValue(error);
    await expect(parse('issues', 'create', '--project', 'p', '--title', 't', '--priority', 'critical')).rejects.toThrow('Validation failed');
    expect(mockedHandleOpsError).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
