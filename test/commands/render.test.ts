import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(() => 'name: test\nversion: 1.0.0'),
  };
});

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerRenderCommands } from '../../src/commands/render.js';

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
  registerRenderCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('render get', () => {
  it('should display rendered markdown', async () => {
    mockClient.render.get.mockResolvedValue({ markdown: '# My Agent\n\nDescription here.' });
    const output = captureOutput();
    await parse('render', 'get', 'agent', 'my-agent', '1.0.0');
    expect(mockClient.render.get).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0');
    expect(output.stdout()).toContain('# My Agent');
    output.restore();
  });
});

describe('render preview', () => {
  it('should preview YAML as markdown', async () => {
    mockClient.render.preview.mockResolvedValue({ markdown: '# Preview Output' });
    const output = captureOutput();
    await parse('render', 'preview', 'agent', '--file', '/tmp/test.yaml');
    expect(mockClient.render.preview).toHaveBeenCalledWith('agent', { yaml: 'name: test\nversion: 1.0.0' });
    expect(output.stdout()).toContain('# Preview Output');
    output.restore();
  });
});
