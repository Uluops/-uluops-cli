import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createOpsContext, handleOpsError } from '../../src/context.js';
import { registerTaxonomyCommands } from '../../src/commands/taxonomy.js';

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
  registerTaxonomyCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('taxonomy get', () => {
  it('should display failure taxonomy', async () => {
    mockClient.taxonomy.get.mockResolvedValue({
      failureDomains: [
        { code: 'STR', name: 'Structural', description: 'Structure and syntax issues' },
        { code: 'SEM', name: 'Semantic', description: 'Meaning and logic issues' },
      ],
      severityCodes: [
        { code: 'C', severity: 'critical', description: 'Critical severity' },
        { code: 'H', severity: 'high', description: 'High severity' },
      ],
      failureCodePattern: '^(STR|SEM|PRA|EPI)-[A-Z]{3}/[CHMLI]$',
      severities: ['critical', 'high', 'medium', 'low', 'info'],
      priorities: ['critical', 'suggested', 'backlog'],
      statuses: ['open', 'completed', 'deferred', 'wontfix'],
    });
    const output = captureOutput();
    await parse('taxonomy', 'get');
    expect(mockClient.taxonomy.get).toHaveBeenCalled();
    expect(output.stdout()).toContain('Failure Domains');
    expect(output.stdout()).toContain('STR');
    expect(output.stdout()).toContain('Structural');
    expect(output.stdout()).toContain('Severity Codes');
    expect(output.stdout()).toContain('critical');
    output.restore();
  });
});
