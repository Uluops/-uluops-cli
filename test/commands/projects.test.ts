import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import { createProject } from '../helpers/mock-factories.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createOpsContext, handleOpsError } from '../../src/context.js';
import { registerProjectCommands } from '../../src/commands/projects.js';

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
  registerProjectCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('projects list', () => {
  it('should display projects table', async () => {
    mockClient.projects.list.mockResolvedValue([createProject({ name: 'my-proj' })]);
    const output = captureOutput();
    await parse('projects', 'list');
    expect(mockClient.projects.list).toHaveBeenCalled();
    expect(output.stdout()).toContain('my-proj');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.projects.list.mockResolvedValue([]);
    const output = captureOutput();
    await parse('projects', 'list');
    expect(output.stdout()).toContain('No projects found');
    output.restore();
  });

  it('should output JSON in json mode', async () => {
    mockClient.projects.list.mockResolvedValue([createProject({ name: 'json-proj' })]);
    mockedCreateOpsContext.mockReturnValue(
      createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'], json: true })
    );
    const output = captureOutput();
    await parse('projects', 'list');
    const parsed = JSON.parse(output.stdout());
    expect(parsed[0].name).toBe('json-proj');
    output.restore();
  });
});

describe('projects get', () => {
  it('should fetch and display project', async () => {
    mockClient.projects.get.mockResolvedValue(createProject({ name: 'alpha' }));
    const output = captureOutput();
    await parse('projects', 'get', 'alpha');
    expect(mockClient.projects.get).toHaveBeenCalledWith('alpha');
    expect(output.stdout()).toContain('Name: alpha');
    output.restore();
  });
});

describe('projects create', () => {
  it('should create project', async () => {
    mockClient.projects.create.mockResolvedValue(createProject({ name: 'new-proj' }));
    const output = captureOutput();
    await parse('projects', 'create', 'new-proj');
    expect(mockClient.projects.create).toHaveBeenCalledWith({ name: 'new-proj' });
    expect(output.stdout()).toContain('Name: new-proj');
    output.restore();
  });
});

describe('projects delete', () => {
  it('should cancel without --yes in non-interactive mode', async () => {
    const output = captureOutput();
    await expect(parse('projects', 'delete', 'my-proj')).rejects.toThrow('process.exit(0)');
    expect(output.stdout()).toContain('Cancelled');
    output.restore();
  });

  it('should soft-delete with --yes', async () => {
    mockClient.projects.softDelete.mockResolvedValue(undefined);
    const output = captureOutput();
    await parse('projects', 'delete', 'my-proj', '--yes');
    expect(mockClient.projects.softDelete).toHaveBeenCalledWith('my-proj', {
      confirm: true,
      confirmationPhrase: 'my-proj',
    });
    output.restore();
  });

  it('should hard-delete with --yes --force', async () => {
    mockClient.projects.delete.mockResolvedValue(undefined);
    await parse('projects', 'delete', 'my-proj', '--yes', '--force');
    expect(mockClient.projects.delete).toHaveBeenCalledWith('my-proj', {
      confirm: true,
      confirmationPhrase: 'my-proj',
    });
  });
});

describe('projects restore', () => {
  it('should restore project', async () => {
    mockClient.projects.restore.mockResolvedValue(createProject({ name: 'restored' }));
    const output = captureOutput();
    await parse('projects', 'restore', 'restored');
    expect(mockClient.projects.restore).toHaveBeenCalledWith('restored');
    expect(output.stdout()).toContain('Name: restored');
    output.restore();
  });
});

describe('projects summary', () => {
  it('should display project summary', async () => {
    mockClient.projects.getSummary.mockResolvedValue({
      project: createProject({ name: 'my-proj' }),
      stats: { openIssues: 5, criticalIssues: 1, totalIssues: 20, totalRuns: 8 },
    });
    const output = captureOutput();
    await parse('projects', 'summary', 'my-proj');
    expect(mockClient.projects.getSummary).toHaveBeenCalledWith('my-proj');
    expect(output.stdout()).toContain('Open: 5');
    output.restore();
  });
});

describe('projects trends', () => {
  it('should pass --days option', async () => {
    mockClient.projects.getTrends.mockResolvedValue({
      days: 14,
      daily: [
        { date: '2025-01-15', total: 5, new: 2, resolved: 1 },
      ],
    });
    const output = captureOutput();
    await parse('projects', 'trends', 'my-proj', '--days', '14');
    expect(mockClient.projects.getTrends).toHaveBeenCalledWith('my-proj', { days: 14 });
    expect(output.stdout()).toContain('2025-01-15');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.projects.getTrends.mockResolvedValue({ days: 30, daily: [] });
    const output = captureOutput();
    await parse('projects', 'trends', 'my-proj');
    expect(output.stdout()).toContain('No trend data');
    output.restore();
  });
});

describe('projects rename', () => {
  it('should rename a project', async () => {
    mockClient.projects.rename.mockResolvedValue(createProject({ name: 'new-name' }));
    const output = captureOutput();
    await parse('projects', 'rename', 'old-name', '--new-name', 'new-name');
    expect(mockClient.projects.rename).toHaveBeenCalledWith({ oldName: 'old-name', newName: 'new-name' });
    expect(output.stdout()).toContain('old-name');
    expect(output.stdout()).toContain('new-name');
    output.restore();
  });
});

describe('projects bulk-update-issues', () => {
  it('should batch update issue statuses', async () => {
    mockClient.projects.bulkUpdateIssueStatus.mockResolvedValue({
      updated: 2,
      failed: [],
    });
    const output = captureOutput();
    await parse('projects', 'bulk-update-issues', 'my-proj', '--ids', 'issue-1,issue-2', '--status', 'completed', '--reason', 'Fixed in v2');
    expect(mockClient.projects.bulkUpdateIssueStatus).toHaveBeenCalledWith('my-proj', [
      { issueId: 'issue-1', status: 'completed', reason: 'Fixed in v2' },
      { issueId: 'issue-2', status: 'completed', reason: 'Fixed in v2' },
    ]);
    expect(output.stdout()).toContain('Updated 2 issues');
    output.restore();
  });
});

describe('projects merge-issues', () => {
  it('should merge duplicate issues', async () => {
    mockClient.projects.mergeIssues.mockResolvedValue({
      targetIssueId: 'target-id-1234',
      mergedCount: 2,
      migratedOccurrences: 5,
    });
    const output = captureOutput();
    await parse('projects', 'merge-issues', 'my-proj', '--target', 'target-id-1234', '--sources', 'src-1,src-2');
    expect(mockClient.projects.mergeIssues).toHaveBeenCalledWith('my-proj', {
      targetIssueId: 'target-id-1234',
      sourceIssueIds: ['src-1', 'src-2'],
      strategy: 'keep_target',
    });
    expect(output.stdout()).toContain('Merged 2 issues');
    expect(output.stdout()).toContain('5 occurrences');
    output.restore();
  });
});

describe('error handling', () => {
  it('should delegate to handleOpsError on failure', async () => {
    const error = new Error('API fail');
    mockClient.projects.list.mockRejectedValue(error);
    await expect(parse('projects', 'list')).rejects.toThrow('API fail');
    expect(mockedHandleOpsError).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
