import { describe, it, expect, beforeEach } from 'vitest';
import {
  formatProjects,
  formatProject,
  formatProjectSummary,
  formatRuns,
  formatRun,
  formatIssues,
  formatIssue,
  formatApiKeys,
} from '../../src/formatters/ops.js';
import {
  createProject,
  createRun,
  createIssue,
  createPublicApiKey,
  resetIds,
} from '../helpers/mock-factories.js';

beforeEach(() => {
  resetIds();
});

describe('formatProjects', () => {
  it('should return "No data" for empty array', () => {
    expect(formatProjects([])).toBe('No data');
  });

  it('should render table with NAME, ID, CREATED headers', () => {
    const result = formatProjects([createProject({ name: 'my-project' })]);
    expect(result).toContain('NAME');
    expect(result).toContain('ID');
    expect(result).toContain('CREATED');
    expect(result).toContain('my-project');
  });

  it('should truncate IDs to 8 chars', () => {
    const project = createProject();
    const result = formatProjects([project]);
    expect(result).toContain(project.id.slice(0, 8));
  });
});

describe('formatProject', () => {
  it('should display project fields as key-value', () => {
    const project = createProject({ name: 'alpha' });
    const result = formatProject(project);
    expect(result).toContain('Name: alpha');
    expect(result).toContain('Id: ' + project.id);
  });
});

describe('formatProjectSummary', () => {
  it('should display issue and run counts', () => {
    const result = formatProjectSummary({
      project: createProject({ name: 'my-proj' }),
      stats: { openIssues: 5, criticalIssues: 1, totalIssues: 20, totalRuns: 8 },
    });
    expect(result).toContain('Project: my-proj');
    expect(result).toContain('Open: 5');
    expect(result).toContain('Critical: 1');
    expect(result).toContain('Total: 20');
    expect(result).toContain('Total: 8');
  });

  it('should handle missing project', () => {
    const result = formatProjectSummary({
      stats: { openIssues: 0, criticalIssues: 0, totalIssues: 0, totalRuns: 0 },
    });
    expect(result).not.toContain('Project:');
    expect(result).toContain('Open: 0');
  });

  it('should display latestRunDate when present', () => {
    const result = formatProjectSummary({
      stats: { openIssues: 0, criticalIssues: 0, totalIssues: 0, totalRuns: 3, latestRunNumber: 3, latestRunDate: '2025-01-15T10:00:00Z' },
    });
    expect(result).toContain('Latest: #3');
  });
});

describe('formatRuns', () => {
  it('should return "No data" for empty array', () => {
    expect(formatRuns([])).toBe('No data');
  });

  it('should render table with run columns', () => {
    const result = formatRuns([createRun({ runNumber: 5, workflowType: 'ship', averageScore: 92.3, allGatesPassed: true })]);
    expect(result).toContain('#');
    expect(result).toContain('WORKFLOW');
    expect(result).toContain('SCORE');
    expect(result).toContain('PASSED');
    expect(result).toContain('5');
    expect(result).toContain('ship');
    expect(result).toContain('92.3');
    expect(result).toContain('Yes');
  });

  it('should show "-" for null averageScore', () => {
    const result = formatRuns([createRun({ averageScore: null })]);
    expect(result).toContain('-');
  });
});

describe('formatRun', () => {
  it('should display all run fields as key-value', () => {
    const run = createRun({ runNumber: 3, workflowType: 'post-implementation', allGatesPassed: false });
    const result = formatRun(run);
    expect(result).toContain('Run Number: 3');
    expect(result).toContain('Workflow Type: post-implementation');
    expect(result).toContain('All Gates Passed: No');
  });
});

describe('formatIssues', () => {
  it('should return "No data" for empty array', () => {
    expect(formatIssues([])).toBe('No data');
  });

  it('should render table with issue columns', () => {
    const result = formatIssues([
      createIssue({ title: 'Missing error handling', status: 'open', priority: 'critical', severity: 'high' }),
    ]);
    expect(result).toContain('TITLE');
    expect(result).toContain('STATUS');
    expect(result).toContain('PRIORITY');
    expect(result).toContain('SEVERITY');
    expect(result).toContain('Missing error handling');
    expect(result).toContain('open');
    expect(result).toContain('critical');
    expect(result).toContain('high');
  });

  it('should show "-" for null severity', () => {
    const result = formatIssues([createIssue({ severity: null })]);
    expect(result).toContain('-');
  });
});

describe('formatIssue', () => {
  it('should display all issue fields as key-value', () => {
    const issue = createIssue({
      title: 'Bug report',
      validator: 'code-validator',
      filePath: 'src/index.ts',
      lineNumber: 42,
      timesSeen: 5,
    });
    const result = formatIssue(issue);
    expect(result).toContain('Title: Bug report');
    expect(result).toContain('Validator: code-validator');
    expect(result).toContain('File Path: src/index.ts');
    expect(result).toContain('Line Number: 42');
    expect(result).toContain('Times Seen: 5');
  });
});

describe('formatApiKeys', () => {
  it('should return "No data" for empty array', () => {
    expect(formatApiKeys([])).toBe('No data');
  });

  it('should render table with key columns', () => {
    const result = formatApiKeys([createPublicApiKey({ name: 'prod-key' })]);
    expect(result).toContain('NAME');
    expect(result).toContain('LAST USED');
    expect(result).toContain('EXPIRES');
    expect(result).toContain('prod-key');
  });

  it('should show "(unnamed)" for null name', () => {
    const result = formatApiKeys([createPublicApiKey({ name: null })]);
    expect(result).toContain('(unnamed)');
  });

  it('should show "Never" for null dates', () => {
    const result = formatApiKeys([createPublicApiKey({ lastUsedAt: null, expiresAt: null })]);
    const neverCount = (result.match(/Never/g) || []).length;
    expect(neverCount).toBe(2);
  });
});
