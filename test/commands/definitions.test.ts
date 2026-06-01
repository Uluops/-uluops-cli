import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import { createDefinitionListItem, createDefinition } from '../helpers/mock-factories.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(() => 'name: test-agent\nversion: 1.0.0\n'),
    existsSync: vi.fn(() => true),
  };
});

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerDefinitionCommands } from '../../src/commands/definitions.js';

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
  registerDefinitionCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('definitions list', () => {
  it('should display definitions table', async () => {
    mockClient.definitions.list.mockResolvedValue({
      definitions: [createDefinitionListItem({ name: 'my-validator', type: 'validator' })],
      total: 1,
    });
    const output = captureOutput();
    await parse('definitions', 'list');
    expect(output.stdout()).toContain('my-validator');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.definitions.list.mockResolvedValue({ definitions: [], total: 0 });
    const output = captureOutput();
    await parse('definitions', 'list');
    expect(output.stdout()).toContain('No definitions found');
    output.restore();
  });

  it('should pass filter options', async () => {
    mockClient.definitions.list.mockResolvedValue({ definitions: [], total: 0 });
    const output = captureOutput();
    await parse('definitions', 'list', '--type', 'agent', '--status', 'published');
    expect(mockClient.definitions.list).toHaveBeenCalledWith(expect.objectContaining({
      type: 'agent',
      status: 'published',
    }));
    output.restore();
  });
});

describe('definitions get', () => {
  it('should fetch and display definition', async () => {
    mockClient.definitions.get.mockResolvedValue(createDefinition({ name: 'code-val', displayName: 'Code Validator' }));
    const output = captureOutput();
    await parse('definitions', 'get', 'validator', 'code-val');
    expect(mockClient.definitions.get).toHaveBeenCalledWith('validator', 'code-val', undefined, expect.any(Object));
    expect(output.stdout()).toContain('Name: code-val');
    output.restore();
  });
});

describe('definitions create', () => {
  it('should create definition from file', async () => {
    mockClient.definitions.create.mockResolvedValue(createDefinition({ name: 'new-agent' }));
    const output = captureOutput();
    await parse('definitions', 'create', 'agent', 'new-agent', '--file', '/tmp/def.yaml');
    expect(mockClient.definitions.create).toHaveBeenCalledWith('agent', 'new-agent', expect.objectContaining({
      visibility: 'private',
    }));
    expect(output.stdout()).toContain('Name: new-agent');
    output.restore();
  });
});

describe('definitions publish', () => {
  it('should publish definition', async () => {
    mockClient.definitions.publish.mockResolvedValue({
      definition: createDefinition({ name: 'my-agent', status: 'published' }),
      warnings: [],
    });
    const output = captureOutput();
    await parse('definitions', 'publish', 'agent', 'my-agent', '1.0.0');
    expect(mockClient.definitions.publish).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0');
    output.restore();
  });
});

describe('definitions deprecate', () => {
  it('should deprecate definition', async () => {
    mockClient.definitions.deprecate.mockResolvedValue(createDefinition({ name: 'old-agent' }));
    const output = captureOutput();
    await parse('definitions', 'deprecate', 'agent', 'old-agent', '1.0.0', '--reason', 'Replaced by v2');
    expect(mockClient.definitions.deprecate).toHaveBeenCalledWith('agent', 'old-agent', '1.0.0', expect.objectContaining({
      reason: 'Replaced by v2',
    }));
    output.restore();
  });
});

describe('definitions delete', () => {
  it('should prompt without --yes', async () => {
    const output = captureOutput();
    await expect(
      parse('definitions', 'delete', 'agent', 'my-agent', '1.0.0')
    ).rejects.toThrow('process.exit(0)');
    expect(output.stdout()).toContain('agent/my-agent@1.0.0');
    output.restore();
  });

  it('should delete with --yes', async () => {
    mockClient.definitions.delete.mockResolvedValue(undefined);
    await parse('definitions', 'delete', 'agent', 'my-agent', '1.0.0', '--yes');
    expect(mockClient.definitions.delete).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0');
  });
});

describe('definitions validate', () => {
  it('should validate YAML and show result', async () => {
    mockClient.validation.validate.mockResolvedValue({ valid: true });
    const output = captureOutput();
    await parse('definitions', 'validate', 'agent', '--file', '/tmp/test.yaml');
    expect(mockClient.validation.validate).toHaveBeenCalledWith('agent', expect.any(String));
    expect(output.stdout()).toContain('Valid');
    output.restore();
  });
});

describe('error handling', () => {
  it('should delegate to handleRegistryError on failure', async () => {
    const error = new Error('Registry fail');
    mockClient.definitions.list.mockRejectedValue(error);
    await expect(parse('definitions', 'list')).rejects.toThrow('Registry fail');
    expect(mockedHandleRegistryError).toHaveBeenCalledWith(error, expect.any(Object));
  });
});
