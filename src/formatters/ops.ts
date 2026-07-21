/**
 * Formatters for ops-sdk types (projects, runs, issues)
 */
import type { Issue, Project, PublicApiKey, Run } from '@uluops/ops-sdk';
import { formatDisplayDate, truncate } from '../utils.js';
import { type Column, formatKeyValue, formatTable } from './table.js';

/**
 * Format a list of projects as table
 */
export function formatProjects(projects: Project[]): string {
  const columns: Column<Project>[] = [
    { header: 'NAME', accessor: 'name', width: 30 },
    { header: 'ID', accessor: (p) => p.id.slice(0, 8), width: 10 },
    {
      header: 'CREATED',
      accessor: (p) => formatDisplayDate(p.createdAt),
      width: 20,
    },
  ];
  return formatTable(projects, columns);
}

/**
 * Format a single project
 */
export function formatProject(project: Project): string {
  return formatKeyValue({
    name: project.name,
    id: project.id,
    createdAt: formatDisplayDate(project.createdAt),
    updatedAt: formatDisplayDate(project.updatedAt),
  });
}

/**
 * Format project summary
 */
export function formatProjectSummary(response: unknown): string {
  const data = response as {
    project?: Project;
    stats?: Record<string, unknown>;
  };
  const stats = (data.stats ?? data) as Record<string, unknown>;
  const project = data.project;

  const lines: string[] = [];

  if (project) {
    lines.push(`Project: ${project.name}`, '');
  }

  lines.push(
    'Issues:',
    `  Open: ${stats.openIssues ?? 0}`,
    `  Critical: ${stats.criticalIssues ?? 0}`,
    `  Total: ${stats.totalIssues ?? 0}`,
    '',
    'Runs:',
    `  Total: ${stats.totalRuns ?? 0}`,
  );

  if (stats.latestRunDate) {
    lines.push(
      `  Latest: #${stats.latestRunNumber} on ${formatDisplayDate(stats.latestRunDate as string)}`,
    );
  }

  return lines.join('\n');
}

/**
 * Format a list of runs as table
 */
export function formatRuns(
  runs: Array<{
    runNumber: number;
    workflowType: string;
    averageScore?: number | null;
    /** null = NOT_A_GATE — no gate-bearing agents on the run (ops-sdk >= 5.10.0) */
    allGatesPassed: boolean | null;
    createdAt: string;
  }>,
): string {
  const columns: Column<(typeof runs)[number]>[] = [
    {
      header: '#',
      accessor: (r) => String(r.runNumber),
      width: 5,
      align: 'right',
    },
    { header: 'WORKFLOW', accessor: 'workflowType', width: 20 },
    {
      header: 'SCORE',
      accessor: (r) => r.averageScore?.toFixed(1) ?? '-',
      width: 7,
      align: 'right',
    },
    {
      header: 'PASSED',
      accessor: (r) => (r.allGatesPassed === null ? 'N/A' : r.allGatesPassed ? 'Yes' : 'No'),
      width: 7,
    },
    {
      header: 'CREATED',
      accessor: (r) => formatDisplayDate(r.createdAt),
      width: 20,
    },
  ];
  return formatTable(runs, columns);
}

/**
 * Format a single run
 */
export function formatRun(run: Run): string {
  return formatKeyValue({
    runNumber: run.runNumber,
    id: run.id,
    workflowType: run.workflowType,
    averageScore: run.averageScore?.toFixed(1) ?? '-',
    allGatesPassed: run.allGatesPassed === null ? 'N/A' : run.allGatesPassed ? 'Yes' : 'No',
    createdAt: formatDisplayDate(run.createdAt),
  });
}

/**
 * Format a list of issues as table
 */
export function formatIssues(issues: Issue[]): string {
  const columns: Column<Issue>[] = [
    { header: 'ID', accessor: (i) => i.id.slice(0, 8), width: 10 },
    { header: 'TITLE', accessor: (i) => truncate(i.title, 40), width: 40 },
    { header: 'STATUS', accessor: 'status', width: 12 },
    { header: 'PRIORITY', accessor: 'priority', width: 10 },
    { header: 'SEVERITY', accessor: (i) => i.severity ?? '-', width: 10 },
  ];
  return formatTable(issues, columns);
}

/**
 * Format a single issue
 */
export function formatIssue(issue: Issue): string {
  return formatKeyValue({
    title: issue.title,
    id: issue.id,
    status: issue.status,
    priority: issue.priority,
    severity: issue.severity,
    agent: issue.agent,
    filePath: issue.filePath,
    lineNumber: issue.lineNumber,
    failureCode: issue.failureCode,
    category: issue.category,
    timesSeen: issue.timesSeen,
    createdAt: formatDisplayDate(issue.createdAt),
  });
}

/**
 * Format a list of API keys as table
 */
export function formatApiKeys(keys: PublicApiKey[]): string {
  const columns: Column<PublicApiKey>[] = [
    { header: 'ID', accessor: (k) => k.id.slice(0, 8), width: 10 },
    { header: 'NAME', accessor: (k) => k.name ?? '(unnamed)', width: 20 },
    {
      header: 'LAST USED',
      accessor: (k) =>
        k.lastUsedAt ? formatDisplayDate(k.lastUsedAt) : 'Never',
      width: 20,
    },
    {
      header: 'EXPIRES',
      accessor: (k) => (k.expiresAt ? formatDisplayDate(k.expiresAt) : 'Never'),
      width: 20,
    },
  ];
  return formatTable(keys, columns);
}
