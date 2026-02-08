import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockRegistryClient, createMockRegistryContext } from '../helpers/command-harness.js';
import { createDefinition } from '../helpers/mock-factories.js';
import type { RegistryCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    readFileSync: vi.fn(() => 'name: test-agent\nversion: 1.0.0\n'),
  };
});

import { createRegistryContext, handleRegistryError } from '../../src/context.js';
import { registerTranslationCommands } from '../../src/commands/translation.js';

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
  registerTranslationCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('translation version', () => {
  it('should display translator version', async () => {
    mockClient.translation.getVersion.mockResolvedValue({
      translatorVersion: '2.1.0',
      releaseDate: '2025-06-01',
      schema: 'v1.2.0',
    });
    const output = captureOutput();
    await parse('translation', 'version');
    expect(output.stdout()).toContain('2.1.0');
    expect(output.stdout()).toContain('v1.2.0');
    output.restore();
  });
});

describe('translation retranslate', () => {
  it('should retranslate definition', async () => {
    const def = createDefinition({ name: 'my-agent', version: '1.0.1', translatorVersion: '2.1.0' });
    mockClient.translation.retranslate.mockResolvedValue(def);
    const output = captureOutput();
    await parse('translation', 'retranslate', 'agent', 'my-agent', '1.0.0');
    expect(mockClient.translation.retranslate).toHaveBeenCalledWith('agent', 'my-agent', '1.0.0', {
      createNewVersion: false,
    });
    expect(output.stdout()).toContain('Re-translated');
    output.restore();
  });
});

describe('translation upgrade', () => {
  it('should upgrade legacy YAML', async () => {
    mockClient.translation.upgrade.mockResolvedValue({
      definition: createDefinition({ name: 'test-agent' }),
      version: '2.0.0',
      changes: { schema: 'v1.0.0 → v1.2.0' },
    });
    const output = captureOutput();
    await parse('translation', 'upgrade', 'agent', 'test-agent', '--file', '/tmp/legacy.yaml');
    expect(mockClient.translation.upgrade).toHaveBeenCalledWith('agent', 'test-agent', {
      yaml: 'name: test-agent\nversion: 1.0.0\n',
    });
    expect(output.stdout()).toContain('Upgraded');
    expect(output.stdout()).toContain('2.0.0');
    output.restore();
  });
});
