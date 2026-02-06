import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import { createVersionListItem, createVersionDiff } from '../helpers/mock-factories.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerVersionCommands } from '../../src/commands/versions.js';

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
  registerVersionCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('versions list', () => {
  it('should list versions for a definition', async () => {
    mockClient.versions.list.mockResolvedValue([
      createVersionListItem({ version: '1.0.0', status: 'published' }),
      createVersionListItem({ version: '1.1.0', status: 'draft' }),
    ]);
    const output = captureOutput();
    await parse('versions', 'list', 'agent', 'my-agent');
    expect(mockClient.versions.list).toHaveBeenCalledWith('agent', 'my-agent');
    expect(output.stdout()).toContain('1.0.0');
    expect(output.stdout()).toContain('1.1.0');
    output.restore();
  });

  it('should show empty message', async () => {
    mockClient.versions.list.mockResolvedValue([]);
    const output = captureOutput();
    await parse('versions', 'list', 'agent', 'my-agent');
    expect(output.stdout()).toContain('No versions found');
    output.restore();
  });
});

describe('versions diff', () => {
  it('should compare two versions', async () => {
    mockClient.versions.diff.mockResolvedValue(createVersionDiff());
    const output = captureOutput();
    await parse('versions', 'diff', 'agent', 'my-agent', '1.0.0', '1.1.0');
    expect(mockClient.versions.diff).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0', '1.1.0');
    expect(output.stdout()).toContain('1.0.0');
    expect(output.stdout()).toContain('1.1.0');
    output.restore();
  });
});
