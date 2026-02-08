import { describe, it, expect } from 'vitest';
import {
  formatProjects,
  formatProject,
  formatRuns,
  formatRun,
  formatIssues,
  formatIssue,
} from '../../src/formatters/ops.js';

const mockProject = {
  id: '12345678-abcd-1234-efgh-123456789012',
  name: 'test-project',
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-16T12:00:00.000Z',
};

const mockRun = {
  id: 'run-12345678',
  projectId: '12345678-abcd-1234-efgh-123456789012',
  runNumber: 5,
  workflowType: 'post-implementation',
  averageScore: 87.5,
  allGatesPassed: true,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:30:00.000Z',
};

const mockIssue = {
  id: 'issue-12345678',
  projectId: '12345678-abcd-1234-efgh-123456789012',
  title: 'Test issue title',
  status: 'open' as const,
  priority: 'suggested' as const,
  severity: 'medium' as const,
  validator: 'code-validator',
  filePath: 'src/index.ts',
  lineNumber: 42,
  failureCode: 'SEM-VAL/H',
  category: 'quality',
  timesSeen: 3,
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
  fingerprint: 'abc123',
};

describe('formatProjects', () => {
  it('formats a list of projects as a table', () => {
    const result = formatProjects([mockProject]);
    expect(result).toContain('NAME');
    expect(result).toContain('test-project');
    expect(result).toContain('12345678');
  });

  it('returns "No data" for empty list', () => {
    expect(formatProjects([])).toBe('No data');
  });
});

describe('formatProject', () => {
  it('formats a single project', () => {
    const result = formatProject(mockProject);
    expect(result).toContain('test-project');
    expect(result).toContain('12345678-abcd-1234-efgh-123456789012');
  });
});

describe('formatRuns', () => {
  it('formats a list of runs as a table', () => {
    const result = formatRuns([mockRun]);
    expect(result).toContain('#');
    expect(result).toContain('WORKFLOW');
    expect(result).toContain('SCORE');
    expect(result).toContain('post-implementation');
    expect(result).toContain('87.5');
    expect(result).toContain('Yes');
  });

  it('handles runs with no score', () => {
    const noScore = { ...mockRun, averageScore: undefined as unknown as number };
    const result = formatRuns([noScore]);
    expect(result).toContain('-');
  });
});

describe('formatRun', () => {
  it('formats a single run', () => {
    const result = formatRun(mockRun);
    expect(result).toContain('Run Number: 5');
    expect(result).toContain('Workflow Type: post-implementation');
    expect(result).toContain('87.5');
    expect(result).toContain('Yes');
  });
});

describe('formatIssues', () => {
  it('formats a list of issues as a table', () => {
    const result = formatIssues([mockIssue]);
    expect(result).toContain('TITLE');
    expect(result).toContain('STATUS');
    expect(result).toContain('Test issue title');
    expect(result).toContain('open');
  });
});

describe('formatIssue', () => {
  it('formats a single issue', () => {
    const result = formatIssue(mockIssue);
    expect(result).toContain('Test issue title');
    expect(result).toContain('open');
    expect(result).toContain('suggested');
    expect(result).toContain('medium');
    expect(result).toContain('code-validator');
    expect(result).toContain('src/index.ts');
    expect(result).toContain('42');
    expect(result).toContain('SEM-VAL/H');
  });
});
