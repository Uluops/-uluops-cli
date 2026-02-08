import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerDepsCommands } from '../../src/commands/deps.js';

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
  registerDepsCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('deps get', () => {
  it('should display dependency graph', async () => {
    mockClient.dependencies.get.mockResolvedValue({
      nodes: [
        { id: '1', type: 'agent', name: 'dep-agent', version: '1.0.0', status: 'published' },
      ],
      edges: [{ from: 'root', to: '1', type: 'depends_on' }],
      cycleDetected: false,
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'my-wf', '1.0.0');
    expect(mockClient.dependencies.get).toHaveBeenCalledWith('workflow', 'my-wf', '1.0.0', undefined);
    expect(output.stdout()).toContain('dep-agent');
    expect(output.stdout()).toContain('Dependencies: 1');
    output.restore();
  });

  it('should warn about cycles', async () => {
    mockClient.dependencies.get.mockResolvedValue({
      nodes: [],
      edges: [],
      cycleDetected: true,
      cycles: [['a', 'b', 'a']],
    });
    const output = captureOutput();
    await parse('deps', 'get', 'workflow', 'my-wf', '1.0.0');
    expect(output.stdout()).toContain('Circular dependency');
    output.restore();
  });
});

describe('deps dependents', () => {
  it('should list dependents', async () => {
    mockClient.dependencies.getDependents.mockResolvedValue({
      nodes: [
        { id: '1', type: 'workflow', name: 'consumer-wf', version: '2.0.0', status: 'published' },
      ],
      edges: [],
      cycleDetected: false,
    });
    const output = captureOutput();
    await parse('deps', 'dependents', 'agent', 'my-agent', '1.0.0');
    expect(mockClient.dependencies.getDependents).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0');
    expect(output.stdout()).toContain('consumer-wf');
    output.restore();
  });

  it('should show empty message', async () => {
    mockClient.dependencies.getDependents.mockResolvedValue({ nodes: [], edges: [], cycleDetected: false });
    const output = captureOutput();
    await parse('deps', 'dependents', 'agent', 'my-agent', '1.0.0');
    expect(output.stdout()).toContain('No dependents found');
    output.restore();
  });
});
