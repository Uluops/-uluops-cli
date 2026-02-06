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
  it('should prompt without --yes', async () => {
    const output = captureOutput();
    await expect(parse('projects', 'delete', 'my-proj')).rejects.toThrow('process.exit(0)');
    expect(output.stdout()).toContain('soft-delete');
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
    mockClient.projects.getTrends.mockResolvedValue([
      { date: '2025-01-15', openIssues: 5, newIssues: 2, resolvedIssues: 1 },
    ]);
    const output = captureOutput();
    await parse('projects', 'trends', 'my-proj', '--days', '14');
    expect(mockClient.projects.getTrends).toHaveBeenCalledWith('my-proj', { days: 14 });
    expect(output.stdout()).toContain('2025-01-15');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.projects.getTrends.mockResolvedValue([]);
    const output = captureOutput();
    await parse('projects', 'trends', 'my-proj');
    expect(output.stdout()).toContain('No trend data');
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
