import type { Command } from 'commander';
import {
  createOpsContext,
  type GlobalOptions,
  handleOpsError,
} from '../context.js';
import { type Column, formatTable } from '../formatters/table.js';
import {
  getFlexibleProperty,
  parseFloatOption,
  parseIntOption,
  withSpinner,
} from '../utils.js';

/**
 * Register analytics commands
 */
export function registerAnalyticsCommands(program: Command): void {
  const analytics = program
    .command('analytics')
    .alias('a')
    .description('View validation analytics and metrics')
    .addHelpText(
      'after',
      `
Examples:
  $ ulu analytics agents --project ops-sdk
  $ ulu analytics hotspots --project ops-sdk --days 7
  $ ulu analytics burndown --project ops-sdk
  $ ulu analytics velocity --project ops-sdk
  $ ulu analytics matrix --project ops-sdk
  $ ulu analytics full-taxonomy --project ops-sdk
`,
    );

  // ulu analytics agents
  analytics
    .command('agents')
    .description('Get agent performance metrics')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching agent performance...',
            failure: 'Failed to fetch agent performance',
          },
          () =>
            ctx.client.analytics.getAgentPerformance({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              limit: parseIntOption(options.limit, '--limit'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No agent data found');
        } else {
          const columns: Column<(typeof data)[0]>[] = [
            { header: 'AGENT', accessor: 'name', width: 25 },
            {
              header: 'RUNS',
              accessor: (v) => String(v.totalRuns),
              width: 8,
              align: 'right',
            },
            {
              header: 'AVG SCORE',
              accessor: (v) => v.averageScore?.toFixed(1) ?? '-',
              width: 10,
              align: 'right',
            },
            {
              header: 'PASS RATE',
              accessor: (v) => `${v.passRate.toFixed(0)}%`,
              width: 10,
              align: 'right',
            },
          ];
          console.log(formatTable(data, columns));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics reliability
  analytics
    .command('reliability')
    .description('Get agent reliability statistics')
    .option('-a, --agent <name>', 'Filter by agent')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '90')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching reliability stats...',
            failure: 'Failed to fetch reliability stats',
          },
          () =>
            ctx.client.analytics.getAgentReliability({
              agent: options.agent,
              project: options.project,
              days: parseIntOption(options.days, '--days'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.agents.length === 0) {
          console.log('No reliability data found');
        } else {
          const columns: Column<(typeof data.agents)[0]>[] = [
            { header: 'AGENT', accessor: 'name', width: 25 },
            {
              header: 'FALSE POS',
              accessor: (v) => {
                const rate = getFlexibleProperty(
                  v,
                  'falsePositiveRate',
                  null as number | null,
                );
                return `${rate?.toFixed(1) ?? '-'}%`;
              },
              width: 10,
              align: 'right',
            },
            {
              header: 'RESOLUTION',
              accessor: (v) => {
                const rate = getFlexibleProperty(
                  v,
                  'resolutionRate',
                  null as number | null,
                );
                return `${rate?.toFixed(1) ?? '-'}%`;
              },
              width: 12,
              align: 'right',
            },
            {
              header: 'RELIABILITY',
              accessor: (v) => {
                const score = getFlexibleProperty(
                  v,
                  'reliabilityScore',
                  null as number | null,
                );
                return score?.toFixed(1) ?? '-';
              },
              width: 12,
              align: 'right',
            },
          ];
          console.log(formatTable(data.agents, columns));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics hotspots
  analytics
    .command('hotspots')
    .description('Get files with most issues')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching file hotspots...',
            failure: 'Failed to fetch hotspots',
          },
          () =>
            ctx.client.analytics.getFileHotspots({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              limit: parseIntOption(options.limit, '--limit'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No hotspots found');
        } else {
          const columns: Column<(typeof data)[0]>[] = [
            {
              header: 'FILE',
              accessor: (h) => truncatePath(h.filePath, 45),
              width: 45,
            },
            {
              header: 'ISSUES',
              accessor: (h) => {
                const count = getFlexibleProperty(
                  h,
                  'issueCount',
                  h.totalIssues ?? 0,
                );
                return String(count);
              },
              width: 8,
              align: 'right',
            },
          ];
          console.log(formatTable(data, columns));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics burndown
  analytics
    .command('burndown')
    .description('Get taxonomy burndown time series')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option(
      '-g, --granularity <level>',
      'Time granularity (daily, weekly)',
      'daily',
    )
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching burndown data...',
            failure: 'Failed to fetch burndown',
          },
          () =>
            ctx.client.analytics.getBurndown({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              granularity: options.granularity as 'daily' | 'weekly',
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Burndown by Failure Domain:\n');

          if (data.trends) {
            for (const domain of ['STR', 'SEM', 'PRA', 'EPI'] as const) {
              const trend = data.trends[domain];
              if (trend) {
                const arrow =
                  trend.trend === 'improving'
                    ? '↓'
                    : trend.trend === 'degrading'
                      ? '↑'
                      : '→';
                console.log(
                  `  ${domain}: ${trend.netChange >= 0 ? '+' : ''}${trend.netChange} (${arrow} ${trend.trend})`,
                );
              }
            }
          }

          if (data.timeSeries && data.timeSeries.length > 0) {
            console.log(`\nTime series: ${data.timeSeries.length} data points`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics velocity
  analytics
    .command('velocity')
    .description('Get rate of change per failure mode')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-t, --threshold <number>', 'Alert threshold percentage', '50')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching velocity metrics...',
            failure: 'Failed to fetch velocity',
          },
          () =>
            ctx.client.analytics.getVelocity({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              alertThreshold: parseFloatOption(
                options.threshold,
                '--threshold',
              ),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Velocity by Failure Mode:\n');

          if (data.items && data.items.length > 0) {
            for (const item of data.items.slice(0, 10)) {
              const alert = item.alert ? ' ⚠️' : '';
              const velocity =
                item.velocityPercent >= 0
                  ? `+${item.velocityPercent.toFixed(0)}%`
                  : `${item.velocityPercent.toFixed(0)}%`;
              console.log(`  ${item.failureCode}: ${velocity}${alert}`);
            }
            if (data.items.length > 10) {
              console.log(`  ... and ${data.items.length - 10} more`);
            }
          }

          if (data.summary) {
            console.log(`\nSummary:`);
            console.log(`  Improving: ${data.summary.improving.length}`);
            console.log(`  Stable: ${data.summary.stable.length}`);
            console.log(`  Degrading: ${data.summary.degrading.length}`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics discovery
  analytics
    .command('discovery')
    .description('Get new vs recurring issues timeline')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-g, --group-by <level>', 'Group by (day, week, month)', 'day')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching discovery timeline...',
            failure: 'Failed to fetch discovery data',
          },
          () =>
            ctx.client.analytics.getDiscovery({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              groupBy: options.groupBy as 'day' | 'week' | 'month',
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Issue Discovery:\n');

          if (data.summary) {
            console.log(`  Total new: ${data.summary.totalNew}`);
            console.log(`  Total recurring: ${data.summary.totalRecurring}`);
            if (data.summary.newToRecurringRatio !== null) {
              console.log(
                `  New:Recurring ratio: ${data.summary.newToRecurringRatio.toFixed(2)}`,
              );
            }
          }

          if (data.timeline && data.timeline.length > 0) {
            console.log(`\nTimeline: ${data.timeline.length} periods`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics matrix
  analytics
    .command('matrix')
    .description('Get agent-taxonomy coverage matrix')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '90')
    .option('-m, --min-issues <number>', 'Minimum issues for inclusion', '5')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching agent matrix...',
            failure: 'Failed to fetch agent matrix',
          },
          () =>
            ctx.client.analytics.getAgentMatrix({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              minIssues: parseIntOption(options.minIssues, '--min-issues'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Agent-Taxonomy Coverage:\n');

          if (data.analysis) {
            if (data.analysis.blindSpots.length > 0) {
              console.log(
                `  Blind spots: ${data.analysis.blindSpots.length} agents missing domains`,
              );
            }

            if (data.analysis.singlePoints.length > 0) {
              console.log(
                `  Single points of failure: ${data.analysis.singlePoints.length}`,
              );
            }

            if (data.analysis.highOverlap.length > 0) {
              console.log(
                `  High overlap (3+ agents): ${data.analysis.highOverlap.length}`,
              );
            }
          }

          if (data.matrix && data.matrix.length > 0) {
            console.log(`\nMatrix: ${data.matrix.length} agents analyzed`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics resolution
  analytics
    .command('resolution')
    .description('Get issue resolution rates by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching resolution rates...',
            failure: 'Failed to fetch resolution rates',
          },
          () =>
            ctx.client.analytics.getResolutionRates({
              days: parseIntOption(options.days, '--days'),
              limit: parseIntOption(options.limit, '--limit'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No resolution data found');
        } else {
          const columns: Column<(typeof data)[0]>[] = [
            { header: 'PROJECT', accessor: 'project', width: 25 },
            {
              header: 'RESOLVED',
              accessor: (r) => String(r.resolvedIssues),
              width: 10,
              align: 'right',
            },
            {
              header: 'TOTAL',
              accessor: (r) => String(r.totalIssues),
              width: 8,
              align: 'right',
            },
            {
              header: 'RATE',
              accessor: (r) => `${r.resolutionRate.toFixed(1)}%`,
              width: 8,
              align: 'right',
            },
          ];
          console.log(formatTable(data, columns));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
  // ulu analytics taxonomy
  analytics
    .command('taxonomy')
    .description('Get taxonomy distribution across issues')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching taxonomy distribution...',
            failure: 'Failed to fetch taxonomy distribution',
          },
          () =>
            ctx.client.analytics.getTaxonomyDistribution({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              limit: parseIntOption(options.limit, '--limit'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No taxonomy data found');
        } else {
          const columns: Column<(typeof data)[0]>[] = [
            { header: 'DOMAIN', accessor: (d) => d.domain ?? '-', width: 10 },
            {
              header: 'COUNT',
              accessor: (d) => String(d.count ?? 0),
              width: 8,
              align: 'right',
            },
            {
              header: '%',
              accessor: (d) => `${d.percentage?.toFixed(1) ?? '-'}%`,
              width: 8,
              align: 'right',
            },
          ];
          console.log(formatTable(data, columns));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics full-taxonomy
  analytics
    .command('full-taxonomy')
    .description('Get full taxonomy analytics breakdown')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          {
            start: 'Fetching full taxonomy...',
            failure: 'Failed to fetch full taxonomy',
          },
          () =>
            ctx.client.analytics.getFullTaxonomy({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              limit: parseIntOption(options.limit, '--limit'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('Full Taxonomy Analytics:\n');

          if (result.byDomain && result.byDomain.length > 0) {
            console.log('  By Domain:');
            for (const item of result.byDomain) {
              console.log(
                `    ${item.domain} (${item.label}): ${item.count} (${item.percentage.toFixed(1)}%)`,
              );
            }
          }
          if (result.bySeverity && result.bySeverity.length > 0) {
            console.log('\n  By Severity:');
            for (const item of result.bySeverity) {
              console.log(
                `    ${item.severity} (${item.label}): ${item.count} (${item.percentage.toFixed(1)}%)`,
              );
            }
          }
          if (result.topCodes && result.topCodes.length > 0) {
            console.log('\n  Top Codes:');
            for (const item of result.topCodes) {
              console.log(
                `    ${item.code}: ${item.count} (${item.percentage.toFixed(1)}%)`,
              );
            }
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu analytics trends
  analytics
    .command('trends')
    .description('Get trend summary metrics')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          {
            start: 'Fetching trend summary...',
            failure: 'Failed to fetch trend summary',
          },
          () =>
            ctx.client.analytics.getTrendSummary({
              project: options.project,
              days: parseIntOption(options.days, '--days'),
              limit: parseIntOption(options.limit, '--limit'),
            }),
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No trend data found');
        } else {
          console.log('Trend Summary:\n');
          for (const item of data) {
            console.log(
              `  ${item.period}: score ${item.averageScore?.toFixed(1) ?? '-'} | +${item.newIssues} new, -${item.resolvedIssues} resolved, ${item.regressions} regressions`,
            );
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}

/**
 * Truncate file path from the left to fit width
 */
function truncatePath(path: string, maxWidth: number): string {
  if (path.length <= maxWidth) return path;
  return '...' + path.slice(-(maxWidth - 3));
}
