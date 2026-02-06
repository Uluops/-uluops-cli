import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createOpsContext, handleOpsError } from '../../src/context.js';
import { registerAnalyticsCommands } from '../../src/commands/analytics.js';

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
  registerAnalyticsCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('analytics validators', () => {
  it('should display validator performance table', async () => {
    mockClient.analytics.getValidatorPerformance.mockResolvedValue([
      { name: 'code-validator', totalRuns: 10, averageScore: 88.5, passRate: 90 },
    ]);
    const output = captureOutput();
    await parse('analytics', 'validators');
    expect(output.stdout()).toContain('code-validator');
    expect(output.stdout()).toContain('88.5');
    expect(output.stdout()).toContain('90%');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.analytics.getValidatorPerformance.mockResolvedValue([]);
    const output = captureOutput();
    await parse('analytics', 'validators');
    expect(output.stdout()).toContain('No validator data');
    output.restore();
  });

  it('should output JSON in json mode', async () => {
    const data = [{ name: 'test-validator', totalRuns: 5, averageScore: 80, passRate: 100 }];
    mockClient.analytics.getValidatorPerformance.mockResolvedValue(data);
    mockedCreateOpsContext.mockReturnValue(
      createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'], json: true })
    );
    const output = captureOutput();
    await parse('analytics', 'validators');
    const parsed = JSON.parse(output.stdout());
    expect(parsed[0].name).toBe('test-validator');
    output.restore();
  });
});

describe('analytics reliability', () => {
  it('should display reliability stats', async () => {
    mockClient.analytics.getValidatorReliability.mockResolvedValue({
      validators: [
        { name: 'code-validator', falsePositiveRate: 5.2, resolutionRate: 85.0, reliabilityScore: 92.3 },
      ],
    });
    const output = captureOutput();
    await parse('analytics', 'reliability');
    expect(output.stdout()).toContain('code-validator');
    expect(output.stdout()).toContain('5.2%');
    output.restore();
  });
});

describe('analytics hotspots', () => {
  it('should display file hotspots', async () => {
    mockClient.analytics.getFileHotspots.mockResolvedValue([
      { filePath: 'src/index.ts', issueCount: 12, totalIssues: 12 },
    ]);
    const output = captureOutput();
    await parse('analytics', 'hotspots');
    expect(output.stdout()).toContain('src/index.ts');
    output.restore();
  });
});

describe('analytics burndown', () => {
  it('should display burndown trends', async () => {
    mockClient.analytics.getBurndown.mockResolvedValue({
      trends: {
        STR: { trend: 'improving', netChange: -3 },
        SEM: { trend: 'stable', netChange: 0 },
      },
      timeSeries: [{ date: '2025-01-15' }],
    });
    const output = captureOutput();
    await parse('analytics', 'burndown');
    expect(output.stdout()).toContain('STR');
    expect(output.stdout()).toContain('improving');
    output.restore();
  });
});

describe('analytics velocity', () => {
  it('should display velocity metrics', async () => {
    mockClient.analytics.getVelocity.mockResolvedValue({
      items: [{ failureCode: 'STR-OMI', velocityPercent: 25, alert: false }],
      summary: { improving: ['SEM-VAL'], stable: ['PRA-SEC'], degrading: [] },
    });
    const output = captureOutput();
    await parse('analytics', 'velocity');
    expect(output.stdout()).toContain('STR-OMI');
    expect(output.stdout()).toContain('+25%');
    output.restore();
  });
});

describe('analytics resolution', () => {
  it('should display resolution rates table', async () => {
    mockClient.analytics.getResolutionRates.mockResolvedValue([
      { project: 'my-proj', resolvedIssues: 15, totalIssues: 20, resolutionRate: 75.0 },
    ]);
    const output = captureOutput();
    await parse('analytics', 'resolution');
    expect(output.stdout()).toContain('my-proj');
    expect(output.stdout()).toContain('75.0%');
    output.restore();
  });
});

describe('analytics taxonomy', () => {
  it('should display taxonomy distribution', async () => {
    mockClient.analytics.getTaxonomyDistribution.mockResolvedValue([
      { domain: 'SEM', mode: 'VAL', count: 15 },
      { domain: 'STR', mode: 'OMI', count: 8 },
    ]);
    const output = captureOutput();
    await parse('analytics', 'taxonomy');
    expect(output.stdout()).toContain('SEM');
    expect(output.stdout()).toContain('VAL');
    expect(output.stdout()).toContain('15');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.analytics.getTaxonomyDistribution.mockResolvedValue([]);
    const output = captureOutput();
    await parse('analytics', 'taxonomy');
    expect(output.stdout()).toContain('No taxonomy data');
    output.restore();
  });
});

describe('analytics full-taxonomy', () => {
  it('should display full taxonomy breakdown', async () => {
    mockClient.analytics.getFullTaxonomy.mockResolvedValue({
      data: {
        byDomain: [{ domain: 'SEM', count: 20 }],
        bySeverity: [{ severity: 'high', count: 10 }],
      },
      computedAt: '2025-06-15T10:00:00Z',
    });
    const output = captureOutput();
    await parse('analytics', 'full-taxonomy');
    expect(output.stdout()).toContain('Full Taxonomy Analytics');
    expect(output.stdout()).toContain('SEM');
    expect(output.stdout()).toContain('20');
    output.restore();
  });
});

describe('analytics trends', () => {
  it('should display trend summary', async () => {
    mockClient.analytics.getTrendSummary.mockResolvedValue([
      { metric: 'open_issues', current: 10, previous: 15, change: -5, changePercent: -33.3, trend: 'improving' },
      { metric: 'resolution_rate', current: 87, previous: 75, change: 12, changePercent: 16.0, trend: 'improving' },
    ]);
    const output = captureOutput();
    await parse('analytics', 'trends');
    expect(output.stdout()).toContain('open_issues');
    expect(output.stdout()).toContain('improving');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.analytics.getTrendSummary.mockResolvedValue([]);
    const output = captureOutput();
    await parse('analytics', 'trends');
    expect(output.stdout()).toContain('No trend data');
    output.restore();
  });
});
