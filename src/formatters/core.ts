/**
 * Formatters for @uluops/core SDK types (agent results, execution results, definitions)
 */
import type {
  AgentResult,
  DefinitionSummary,
  DefinitionType,
  ExecutionResult,
  Recommendation,
  TrackingError,
} from '@uluops/core';
import { truncate } from '../utils.js';
import { type Column, formatKeyValue, formatTable } from './table.js';

/**
 * Render a single-line tracking-failure notice. The run itself succeeded — only
 * recording it to the tracker failed — so this is a non-fatal notice, not an error.
 * Surfaces an upgrade link for cap/tier failures (PROJECT_LIMIT/SUBSCRIPTION_REQUIRED).
 */
function formatTrackingError(err: TrackingError): string {
  const upgradeCodes = new Set(['PROJECT_LIMIT', 'SUBSCRIPTION_REQUIRED']);
  const upgradeUrl =
    err.code !== undefined &&
    upgradeCodes.has(err.code) &&
    typeof err.details?.upgradeUrl === 'string'
      ? (err.details.upgradeUrl as string)
      : undefined;
  return `Run not recorded: ${err.message}${upgradeUrl ? ` — upgrade: ${upgradeUrl}` : ''}`;
}

/**
 * Format an agent execution result.
 *
 * @param opts.verbose - when true, list the run's degradation markers (code + detail).
 *   The completeness badge is always shown when the run is not `complete`.
 */
export function formatAgentResult(
  result: AgentResult,
  opts?: { verbose?: boolean },
): string {
  const lines: string[] = [];

  // Header. Surface completeness alongside the decision only when the run did
  // not fully complete its work — a clean run stays uncluttered.
  lines.push(`Agent: ${result.name} v${result.version}`);
  if (result.completeness && result.completeness !== 'complete') {
    lines.push(
      `Decision: ${result.decision}  ·  Completeness: ${result.completeness.toUpperCase()}`,
    );
  } else {
    lines.push(`Decision: ${result.decision}`);
  }

  if (result.score != null) {
    lines.push(`Score: ${result.score}/${result.maxScore ?? '—'}`);
    if (result.threshold !== undefined) {
      lines.push(`Threshold: ${result.threshold}`);
    }
  }

  lines.push(`Duration: ${formatDuration(result.durationMs)}`);
  lines.push(`Model: ${result.metrics.model}`);

  if (result.dashboardUrl) {
    lines.push(`Dashboard: ${result.dashboardUrl}`);
  }
  if (result.trackingError) {
    lines.push(formatTrackingError(result.trackingError));
  }

  // Categories (validators only)
  if (result.categories && result.categories.length > 0) {
    lines.push('');
    lines.push('Categories:');
    const catColumns: Column<{
      name: string;
      score: number | null;
      maxScore: number | null;
      findings: number;
    }>[] = [
      { header: 'CATEGORY', accessor: 'name', width: 30 },
      {
        header: 'SCORE',
        accessor: (c: { score: number | null; maxScore: number | null }) =>
          c.score == null ? '—' : `${c.score}/${c.maxScore ?? '—'}`,
        width: 10,
        align: 'right',
      },
      {
        header: 'FINDINGS',
        accessor: (c: { findings: number }) => String(c.findings),
        width: 10,
        align: 'right',
      },
    ];
    const catData = result.categories.map((c) => ({
      name: c.name,
      score: c.score,
      maxScore: c.maxScore,
      findings: c.findings.length,
    }));
    lines.push(formatTable(catData, catColumns));
  }

  // Recommendations
  if (result.recommendations.length > 0) {
    lines.push('');
    lines.push(formatRecommendations(result.recommendations));
  }

  // Degradation markers (why the run is partial/failed) — verbose only.
  if (
    opts?.verbose &&
    result.degradationMarkers &&
    result.degradationMarkers.length > 0
  ) {
    lines.push('');
    lines.push('Degradations:');
    for (const marker of result.degradationMarkers) {
      const sev = marker.severity.toUpperCase();
      lines.push(
        `  - [${sev}] ${marker.code}${marker.detail ? ` — ${marker.detail}` : ''}`,
      );
    }
  }

  // Token usage
  lines.push('');
  lines.push('Token Usage:');
  lines.push(`  Input: ${result.metrics.inputTokens.toLocaleString()}`);
  lines.push(`  Output: ${result.metrics.outputTokens.toLocaleString()}`);
  if (result.metrics.cacheCreationTokens) {
    lines.push(
      `  Cache write: ${result.metrics.cacheCreationTokens.toLocaleString()}`,
    );
  }
  if (result.metrics.cacheReadTokens) {
    lines.push(
      `  Cache read: ${result.metrics.cacheReadTokens.toLocaleString()}`,
    );
  }
  lines.push(
    `  Total effective: ${result.metrics.totalEffectiveTokens.toLocaleString()}`,
  );
  if (result.metrics.costUsd !== undefined) {
    lines.push(`  Estimated cost: $${result.metrics.costUsd.toFixed(4)}`);
  }

  return lines.join('\n');
}

/**
 * Format a generic execution result (commands, workflows)
 */
export function formatExecutionResult(result: ExecutionResult): string {
  const lines: string[] = [];

  lines.push(`${capitalize(result.type)}: ${result.name} v${result.version}`);
  lines.push(`Decision: ${result.decision}`);
  if (result.score !== undefined) {
    lines.push(`Score: ${result.score}/100`);
  }
  lines.push(`Duration: ${formatDuration(result.durationMs)}`);

  if (result.dashboardUrl) {
    lines.push(`Dashboard: ${result.dashboardUrl}`);
  }
  if (result.trackingError) {
    lines.push(formatTrackingError(result.trackingError));
  }

  if (result.recommendations.length > 0) {
    lines.push('');
    lines.push(formatRecommendations(result.recommendations));
  }

  lines.push('');
  lines.push('Token Usage:');
  lines.push(`  Input: ${result.metrics.inputTokens.toLocaleString()}`);
  lines.push(`  Output: ${result.metrics.outputTokens.toLocaleString()}`);
  if (result.metrics.cacheCreationTokens) {
    lines.push(
      `  Cache write: ${result.metrics.cacheCreationTokens.toLocaleString()}`,
    );
  }
  if (result.metrics.cacheReadTokens) {
    lines.push(
      `  Cache read: ${result.metrics.cacheReadTokens.toLocaleString()}`,
    );
  }
  lines.push(
    `  Total effective: ${result.metrics.totalEffectiveTokens.toLocaleString()}`,
  );
  if (result.metrics.costUsd !== undefined) {
    lines.push(`  Estimated cost: $${result.metrics.costUsd.toFixed(4)}`);
  }

  return lines.join('\n');
}

/**
 * Format recommendations grouped by priority
 */
export function formatRecommendations(recs: Recommendation[]): string {
  if (recs.length === 0) return 'No recommendations.';

  const lines: string[] = [];
  const byPriority = groupBy(recs, (r) => r.priority);

  for (const priority of ['critical', 'suggested', 'backlog'] as const) {
    const group = byPriority[priority];
    if (!group || group.length === 0) continue;

    lines.push(`${capitalize(priority)} (${group.length}):`);
    for (const rec of group) {
      const location = rec.filePath
        ? rec.lineNumber
          ? ` ${rec.filePath}:${rec.lineNumber}`
          : ` ${rec.filePath}`
        : '';
      lines.push(`  - ${rec.title}${location}`);
      if (rec.description) {
        lines.push(`    ${truncate(rec.description, 80)}`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Format a list of definitions as a table
 */
export function formatDefinitionList(items: DefinitionSummary[]): string {
  if (items.length === 0) return 'No definitions found.';

  const columns: Column<DefinitionSummary>[] = [
    { header: 'NAME', accessor: 'name', width: 30 },
    { header: 'TYPE', accessor: 'type', width: 10 },
    { header: 'VERSION', accessor: 'version', width: 10 },
    { header: 'DOMAIN', accessor: 'domain', width: 12 },
    {
      header: 'DESCRIPTION',
      accessor: (d) => truncate(d.description, 40),
      width: 42,
    },
  ];
  return formatTable(items, columns);
}

/**
 * Format definition details from describe()
 */
export function formatDefinitionDetails(details: {
  type: DefinitionType;
  name: string;
  version: string;
  hash: string;
  interface: unknown;
}): string {
  const lines: string[] = [];

  lines.push(
    formatKeyValue({
      Name: details.name,
      Type: details.type,
      Version: details.version,
      Hash: details.hash,
    }),
  );

  if (details.interface && typeof details.interface === 'object') {
    lines.push('');
    lines.push('Interface:');
    lines.push(formatKeyValue(details.interface as Record<string, unknown>, 2));
  }

  return lines.join('\n');
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = ((ms % 60_000) / 1000).toFixed(0);
  return `${mins}m ${secs}s`;
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function groupBy<T>(items: T[], key: (item: T) => string): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const k = key(item);
    groups[k] ??= [];
    groups[k].push(item);
  }
  return groups;
}
