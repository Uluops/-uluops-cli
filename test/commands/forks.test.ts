import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import { createDefinitionListItem, createDefinition } from '../helpers/mock-factories.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerForkCommands } from '../../src/commands/forks.js';

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
  registerForkCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('forks list', () => {
  it('should list forks', async () => {
    mockClient.forks.list.mockResolvedValue({
      forks: [{ definition: { type: 'agent', name: 'my-fork', version: '1.0.0', authorId: 'user-abc12345' } }],
      totalForks: 1,
    });
    const output = captureOutput();
    await parse('forks', 'list', 'agent', 'base-agent', '1.0.0');
    expect(mockClient.forks.list).toHaveBeenCalledWith('agent', 'base-agent', '1.0.0');
    expect(output.stdout()).toContain('my-fork');
    output.restore();
  });

  it('should show empty message', async () => {
    mockClient.forks.list.mockResolvedValue({ forks: [], totalForks: 0 });
    const output = captureOutput();
    await parse('forks', 'list', 'agent', 'base-agent', '1.0.0');
    expect(output.stdout()).toContain('No forks found');
    output.restore();
  });
});

describe('forks create', () => {
  it('should create a fork', async () => {
    mockClient.forks.create.mockResolvedValue({
      definition: createDefinition({ type: 'agent' as never, name: 'my-fork', version: '1.0.0' }),
    });
    const output = captureOutput();
    await parse('forks', 'create', 'agent', 'base-agent', '1.0.0', '--fork-name', 'my-fork');
    expect(mockClient.forks.create).toHaveBeenCalledWith('agent', 'base-agent', '1.0.0', expect.objectContaining({
      name: 'my-fork',
    }));
    expect(output.stdout()).toContain('my-fork');
    output.restore();
  });
});

describe('forks check', () => {
  it('should check forkability', async () => {
    mockClient.forks.isForkable.mockResolvedValue({ canFork: true });
    const output = captureOutput();
    await parse('forks', 'check', 'agent', 'base-agent', '1.0.0');
    expect(output.stdout()).toContain('Forkable: Yes');
    output.restore();
  });

  it('should show reason when not forkable', async () => {
    mockClient.forks.isForkable.mockResolvedValue({ canFork: false, reason: 'Definition is private' });
    const output = captureOutput();
    await parse('forks', 'check', 'agent', 'base-agent', '1.0.0');
    expect(output.stdout()).toContain('Forkable: No');
    expect(output.stdout()).toContain('Definition is private');
    output.restore();
  });
});

describe('forks lineage', () => {
  it('should display fork lineage', async () => {
    mockClient.forks.getAncestry.mockResolvedValue({
      current: createDefinitionListItem({ name: 'my-fork' }),
      source: createDefinitionListItem({ name: 'original' }),
      chain: [createDefinitionListItem({ name: 'intermediate' })],
    });
    const output = captureOutput();
    await parse('forks', 'lineage', 'agent', 'my-fork', '1.0.0');
    expect(output.stdout()).toContain('intermediate');
    expect(output.stdout()).toContain('my-fork');
    expect(output.stdout()).toContain('Fork Lineage');
    output.restore();
  });
});
