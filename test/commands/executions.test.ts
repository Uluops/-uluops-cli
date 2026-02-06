import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerExecutionCommands } from '../../src/commands/executions.js';

const mockedCreateRegistryContext = vi.mocked(createRegistryContext);
const mockedHandleRegistryError = vi.mocked(handleRegistryError);

type MockClient = ReturnType<typeof createMockRegistryClient>;
let mockClient: MockClient;

beforeEach(() => {
  mockClient = createMockRegistryClient();
  mockedCreateRegistryContext.mockReturnValue(
    createMockRegistryContext({ client: mockClient as unknown as RegistryCliContext['client'] })
  );
  mockedHandleRegistryError.mockImplementation((error) => { throw error; });
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerExecutionCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('executions record', () => {
  it('should record an execution', async () => {
    mockClient.executions.record.mockResolvedValue({
      recorded: true,
      duplicate: false,
      definition: { id: 'd1', type: 'agent', name: 'my-agent', version: '1.0.0' },
      executionCount: 42,
    });
    const output = captureOutput();
    await parse('executions', 'record', 'agent', 'my-agent', '1.0.0', '--source', 'claude-code');
    expect(mockClient.executions.record).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0', {
      source: 'claude-code',
      runId: undefined,
    });
    expect(output.stdout()).toContain('Execution recorded');
    expect(output.stdout()).toContain('Count: 42');
    output.restore();
  });
});

describe('executions stats', () => {
  it('should display execution stats', async () => {
    mockClient.executions.getStats.mockResolvedValue({
      totalCount: 150,
      recentCount: 25,
      windowMinutes: 60,
    });
    const output = captureOutput();
    await parse('executions', 'stats', 'agent', 'my-agent', '1.0.0');
    expect(mockClient.executions.getStats).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0', 60);
    expect(output.stdout()).toContain('Total: 150');
    expect(output.stdout()).toContain('Recent: 25');
    output.restore();
  });
});
