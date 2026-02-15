import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import type { CoreCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createCoreContext, handleCoreError } from '../../src/context.js';
import { registerExecCommands } from '../../src/commands/exec.js';

const mockedCreateCoreContext = vi.mocked(createCoreContext);
const mockedHandleCoreError = vi.mocked(handleCoreError);

function createMockCoreClient() {
  return {
    run: vi.fn(),
    runAgent: vi.fn(),
    runCommand: vi.fn(),
    runWorkflow: vi.fn(),
    list: vi.fn(),
    describe: vi.fn(),
  };
}

type MockClient = ReturnType<typeof createMockCoreClient>;
let mockClient: MockClient;
let output: ReturnType<typeof captureOutput>;

beforeEach(() => {
  mockClient = createMockCoreClient();
  mockedCreateCoreContext.mockReturnValue({
    client: mockClient as unknown as CoreCliContext['client'],
    json: false,
    debug: false,
    quiet: true,
  });
  mockedHandleCoreError.mockImplementation((error) => { throw error; });
  output = captureOutput();
});

afterEach(() => {
  output.restore();
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerExecCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

// ── Agent result fixture ─────────────────────────────────────────────────

function createAgentResult(overrides: Record<string, unknown> = {}) {
  return {
    type: 'agent',
    name: 'code-validator',
    version: '1.0.0',
    agentType: 'validator',
    decision: 'PASS',
    score: 85,
    maxScore: 100,
    threshold: 70,
    durationMs: 5000,
    dashboardUrl: null,
    categories: [],
    recommendations: [],
    metrics: {
      model: 'claude-sonnet-4-5',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalEffectiveTokens: 1500,
    },
    ...overrides,
  };
}

function createExecutionResult(overrides: Record<string, unknown> = {}) {
  return {
    type: 'command',
    name: 'my-command',
    version: '1.0.0',
    decision: 'PASS',
    score: 90,
    durationMs: 3000,
    dashboardUrl: null,
    recommendations: [],
    metrics: {
      model: 'claude-sonnet-4-5',
      inputTokens: 800,
      outputTokens: 400,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalEffectiveTokens: 1200,
    },
    ...overrides,
  };
}

// ── exec run ─────────────────────────────────────────────────────────────

describe('exec run', () => {
  it('executes a definition by name and displays formatted result', async () => {
    mockClient.run.mockResolvedValue(createAgentResult());
    await parse('exec', 'run', 'code-validator', './src');
    expect(mockClient.run).toHaveBeenCalledWith('code-validator', { target: './src' });
    expect(output.stdout()).toContain('code-validator');
  });

  it('displays JSON output when context is json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    const result = createAgentResult();
    mockClient.run.mockResolvedValue(result);
    await parse('exec', 'run', 'code-validator', './src');
    expect(output.stdout()).toContain('"name": "code-validator"');
  });

  it('formats execution results for non-agent types', async () => {
    mockClient.run.mockResolvedValue(createExecutionResult({ type: 'workflow' }));
    await parse('exec', 'run', 'my-workflow', './src');
    expect(output.stdout()).toContain('my-command');
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Network failed');
    mockClient.run.mockRejectedValue(err);
    await expect(parse('exec', 'run', 'code-validator', './src')).rejects.toThrow('Network failed');
    expect(mockedHandleCoreError).toHaveBeenCalledWith(err, expect.any(Object));
  });
});

// ── exec agent ───────────────────────────────────────────────────────────

describe('exec agent', () => {
  it('executes an agent and displays formatted result', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', 'code-validator', './src');
    expect(mockClient.runAgent).toHaveBeenCalledWith('code-validator', './src', undefined);
    expect(output.stdout()).toContain('Score: 85/100');
  });

  it('passes model option to execution options', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', 'code-validator', './src', '--model', 'haiku');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      './src',
      expect.objectContaining({ model: 'haiku' })
    );
  });

  it('passes threshold options', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', 'code-validator', './src', '--threshold-pass', '80', '--threshold-warn', '60');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      './src',
      expect.objectContaining({
        thresholds: { pass: 80, warn: 60 },
      })
    );
  });

  it('passes max-tokens and max-steps options', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', 'code-validator', './src', '--max-tokens', '4096', '--max-steps', '25');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      './src',
      expect.objectContaining({
        maxTokens: 4096,
        maxSteps: 25,
      })
    );
  });

  it('passes temperature option', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', 'code-validator', './src', '--temperature', '0.7');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      './src',
      expect.objectContaining({
        temperature: 0.7,
      })
    );
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Agent failed');
    mockClient.runAgent.mockRejectedValue(err);
    await expect(parse('exec', 'agent', 'code-validator', './src')).rejects.toThrow('Agent failed');
  });
});

// ── exec command ─────────────────────────────────────────────────────────

describe('exec command', () => {
  it('executes a command and displays formatted result', async () => {
    mockClient.runCommand.mockResolvedValue(createExecutionResult());
    await parse('exec', 'command', 'my-command', './src');
    expect(mockClient.runCommand).toHaveBeenCalledWith('my-command', { target: './src' });
    expect(output.stdout()).toContain('my-command');
  });

  it('displays JSON output in json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    mockClient.runCommand.mockResolvedValue(createExecutionResult());
    await parse('exec', 'command', 'my-command', './src');
    expect(output.stdout()).toContain('"name": "my-command"');
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Command failed');
    mockClient.runCommand.mockRejectedValue(err);
    await expect(parse('exec', 'command', 'my-command', './src')).rejects.toThrow('Command failed');
  });
});

// ── exec workflow ────────────────────────────────────────────────────────

describe('exec workflow', () => {
  it('executes a workflow and displays formatted result', async () => {
    mockClient.runWorkflow.mockResolvedValue(createExecutionResult({ type: 'workflow', name: 'ship' }));
    await parse('exec', 'workflow', 'ship', './src');
    expect(mockClient.runWorkflow).toHaveBeenCalledWith('ship', { target: './src' });
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Workflow failed');
    mockClient.runWorkflow.mockRejectedValue(err);
    await expect(parse('exec', 'workflow', 'ship', './src')).rejects.toThrow('Workflow failed');
  });
});

// ── exec list ────────────────────────────────────────────────────────────

describe('exec list', () => {
  it('lists all definitions', async () => {
    mockClient.list.mockResolvedValue([
      { name: 'code-validator', type: 'agent', version: '1.0.0', domain: 'validation', description: 'Validates code' },
    ]);
    await parse('exec', 'list');
    expect(mockClient.list).toHaveBeenCalledWith(undefined);
    expect(output.stdout()).toContain('code-validator');
  });

  it('filters by type', async () => {
    mockClient.list.mockResolvedValue([]);
    await parse('exec', 'list', '--type', 'agent');
    expect(mockClient.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent' }));
  });

  it('filters by domain', async () => {
    mockClient.list.mockResolvedValue([]);
    await parse('exec', 'list', '--domain', 'security');
    expect(mockClient.list).toHaveBeenCalledWith(expect.objectContaining({ domain: 'security' }));
  });

  it('shows empty message when no definitions found', async () => {
    mockClient.list.mockResolvedValue([]);
    await parse('exec', 'list');
    expect(output.stdout()).toContain('No definitions found');
  });

  it('displays JSON output in json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    const items = [{ name: 'test', type: 'agent', version: '1.0.0', domain: 'test', description: 'Test' }];
    mockClient.list.mockResolvedValue(items);
    await parse('exec', 'list');
    expect(output.stdout()).toContain('"name": "test"');
  });
});

// ── exec describe ────────────────────────────────────────────────────────

describe('exec describe', () => {
  it('describes a definition and displays details', async () => {
    mockClient.describe.mockResolvedValue({
      type: 'agent',
      name: 'code-validator',
      version: '1.0.0',
      hash: 'abc123',
      interface: { input: 'directory', output: 'json' },
    });
    await parse('exec', 'describe', 'code-validator');
    expect(mockClient.describe).toHaveBeenCalledWith('code-validator');
    expect(output.stdout()).toContain('code-validator');
    expect(output.stdout()).toContain('abc123');
  });

  it('displays JSON output in json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    mockClient.describe.mockResolvedValue({
      type: 'agent',
      name: 'code-validator',
      version: '1.0.0',
      hash: 'abc123',
      interface: {},
    });
    await parse('exec', 'describe', 'code-validator');
    expect(output.stdout()).toContain('"hash": "abc123"');
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Not found');
    mockClient.describe.mockRejectedValue(err);
    await expect(parse('exec', 'describe', 'unknown')).rejects.toThrow('Not found');
  });
});

// ── Parent options ───────────────────────────────────────────────────────

describe('parent options', () => {
  it('passes --no-tracking to disable result submission', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', '--no-tracking', 'agent', 'code-validator', './src');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      './src',
      expect.objectContaining({ trackResults: false })
    );
  });

  it('passes --project option', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', '--project', 'my-proj', 'agent', 'code-validator', './src');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      './src',
      expect.objectContaining({ project: 'my-proj' })
    );
  });
});
