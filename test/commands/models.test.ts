import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import { createModel, createModelAlias, createAliasResolution } from '../helpers/mock-factories.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerModelCommands } from '../../src/commands/models.js';

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
  registerModelCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('models list', () => {
  it('should display models table', async () => {
    mockClient.models.list.mockResolvedValue({
      models: [createModel({ provider: 'anthropic', modelId: 'claude-opus-4-6' })],
    });
    const output = captureOutput();
    await parse('models', 'list');
    expect(output.stdout()).toContain('anthropic');
    expect(output.stdout()).toContain('claude-opus-4-6');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.models.list.mockResolvedValue({ models: [] });
    const output = captureOutput();
    await parse('models', 'list');
    expect(output.stdout()).toContain('No models found');
    output.restore();
  });
});

describe('models get', () => {
  it('should fetch and display model', async () => {
    mockClient.models.get.mockResolvedValue(createModel({ provider: 'anthropic', modelId: 'claude-opus-4-6' }));
    const output = captureOutput();
    await parse('models', 'get', 'anthropic', 'claude-opus-4-6');
    expect(mockClient.models.get).toHaveBeenCalledWith('anthropic', 'claude-opus-4-6');
    expect(output.stdout()).toContain('anthropic');
    output.restore();
  });
});

describe('models providers', () => {
  it('should list providers', async () => {
    mockClient.models.listProviders.mockResolvedValue({
      providers: [{ id: 'anthropic', name: 'Anthropic', status: 'active' }],
    });
    const output = captureOutput();
    await parse('models', 'providers');
    expect(output.stdout()).toContain('anthropic: Anthropic (active)');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.models.listProviders.mockResolvedValue({ providers: [] });
    const output = captureOutput();
    await parse('models', 'providers');
    expect(output.stdout()).toContain('No providers found');
    output.restore();
  });
});

describe('models aliases', () => {
  it('should display aliases table', async () => {
    mockClient.models.listAliases.mockResolvedValue({
      aliases: [createModelAlias({ alias: 'sonnet', deprecated: false })],
    });
    const output = captureOutput();
    await parse('models', 'aliases');
    expect(output.stdout()).toContain('sonnet');
    output.restore();
  });
});

describe('models resolve', () => {
  it('should resolve alias', async () => {
    mockClient.models.resolveAlias.mockResolvedValue(
      createAliasResolution({ alias: 'sonnet', target: 'anthropic/claude-sonnet-4-5' })
    );
    const output = captureOutput();
    await parse('models', 'resolve', 'sonnet');
    expect(mockClient.models.resolveAlias).toHaveBeenCalledWith('sonnet');
    expect(output.stdout()).toContain('Alias: sonnet');
    expect(output.stdout()).toContain('anthropic/claude-sonnet-4-5');
    output.restore();
  });
});

describe('error handling', () => {
  it('should delegate to handleRegistryError on failure', async () => {
    const error = new Error('Registry fail');
    mockClient.models.list.mockRejectedValue(error);
    await expect(parse('models', 'list')).rejects.toThrow('Registry fail');
    expect(mockedHandleRegistryError).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
