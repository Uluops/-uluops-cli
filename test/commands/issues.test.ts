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
  it('should display status history', async () => {
    mockClient.issues.getHistory.mockResolvedValue([
      { changedAt: '2025-01-15T10:00:00Z', oldStatus: 'open', newStatus: 'completed', reason: 'Fixed' },
    ]);
    const output = captureOutput();
    await parse('issues', 'history', 'abc-123');
    expect(output.stdout()).toContain('Status History');
    expect(output.stdout()).toContain('Reason: Fixed');
    output.restore();
  });

  it('should show empty history message', async () => {
    mockClient.issues.getHistory.mockResolvedValue([]);
    const output = captureOutput();
    await parse('issues', 'history', 'abc-123');
    expect(output.stdout()).toContain('No status history');
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
