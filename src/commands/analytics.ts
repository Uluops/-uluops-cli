import { Command } from 'commander';
import { createOpsContext, handleOpsError, type GlobalOptions } from '../context.js';
import { withSpinner, getFlexibleProperty } from '../utils.js';
import { formatTable, type Column } from '../formatters/table.js';

/**
 * Register analytics commands
 */
export function registerAnalyticsCommands(program: Command): void {
  const analytics = program
    .command('analytics')
    .description('View validation analytics and metrics');

  // ulu analytics validators
  analytics
    .command('validators')
    .description('Get validator performance metrics')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '30')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching validator performance...', failure: 'Failed to fetch validator performance' },
          () => ctx.client.analytics.getValidatorPerformance({
            project: options.project,
            days: parseInt(options.days, 10),
            limit: parseInt(options.limit, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No validator data found');
        } else {
          const columns: Column<(typeof data)[0]>[] = [
            { header: 'VALIDATOR', accessor: 'name', width: 25 },
            { header: 'RUNS', accessor: (v) => String(v.totalRuns), width: 8, align: 'right' },
            { header: 'AVG SCORE', accessor: (v) => {
              const score = getFlexibleProperty(v, 'averageScore', v.avgScore);
              return score?.toFixed(1) ?? '-';
            }, width: 10, align: 'right' },
            { header: 'PASS RATE', accessor: (v) => `${v.passRate.toFixed(0)}%`, width: 10, align: 'right' },
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
    .description('Get validator reliability statistics')
    .option('-v, --validator <name>', 'Filter by validator')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '90')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching reliability stats...', failure: 'Failed to fetch reliability stats' },
          () => ctx.client.analytics.getValidatorReliability({
            validator: options.validator,
            project: options.project,
            days: parseInt(options.days, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.validators.length === 0) {
          console.log('No reliability data found');
        } else {
          const columns: Column<(typeof data.validators)[0]>[] = [
            { header: 'VALIDATOR', accessor: 'name', width: 25 },
            { header: 'FALSE POS', accessor: (v) => {
              const rate = getFlexibleProperty(v, 'falsePositiveRate', null as number | null);
              return `${rate?.toFixed(1) ?? '-'}%`;
            }, width: 10, align: 'right' },
            { header: 'RESOLUTION', accessor: (v) => {
              const rate = getFlexibleProperty(v, 'resolutionRate', null as number | null);
              return `${rate?.toFixed(1) ?? '-'}%`;
            }, width: 12, align: 'right' },
            { header: 'RELIABILITY', accessor: (v) => {
              const score = getFlexibleProperty(v, 'reliabilityScore', null as number | null);
              return score?.toFixed(1) ?? '-';
            }, width: 12, align: 'right' },
          ];
          console.log(formatTable(data.validators, columns));
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
          { start: 'Fetching file hotspots...', failure: 'Failed to fetch hotspots' },
          () => ctx.client.analytics.getFileHotspots({
            project: options.project,
            days: parseInt(options.days, 10),
            limit: parseInt(options.limit, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No hotspots found');
        } else {
          const columns: Column<(typeof data)[0]>[] = [
            { header: 'FILE', accessor: (h) => truncatePath(h.filePath, 45), width: 45 },
            { header: 'ISSUES', accessor: (h) => {
              const count = getFlexibleProperty(h, 'issueCount', h.totalIssues ?? 0);
              return String(count);
            }, width: 8, align: 'right' },
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
    .option('-g, --granularity <level>', 'Time granularity (daily, weekly)', 'daily')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching burndown data...', failure: 'Failed to fetch burndown' },
          () => ctx.client.analytics.getBurndown({
            project: options.project,
            days: parseInt(options.days, 10),
            granularity: options.granularity as 'daily' | 'weekly',
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Burndown by Failure Domain:\n');

          if (data.trends) {
            for (const domain of ['STR', 'SEM', 'PRA', 'EPI'] as const) {
              const trend = data.trends[domain];
              if (trend) {
                const arrow = trend.trend === 'improving' ? '↓' : trend.trend === 'degrading' ? '↑' : '→';
                console.log(`  ${domain}: ${trend.netChange >= 0 ? '+' : ''}${trend.netChange} (${arrow} ${trend.trend})`);
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
          { start: 'Fetching velocity metrics...', failure: 'Failed to fetch velocity' },
          () => ctx.client.analytics.getVelocity({
            project: options.project,
            days: parseInt(options.days, 10),
            alertThreshold: parseFloat(options.threshold),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Velocity by Failure Mode:\n');

          if (data.items && data.items.length > 0) {
            for (const item of data.items.slice(0, 10)) {
              const alert = item.alert ? ' ⚠️' : '';
              const velocity = item.velocityPercent >= 0 ? `+${item.velocityPercent.toFixed(0)}%` : `${item.velocityPercent.toFixed(0)}%`;
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
          { start: 'Fetching discovery timeline...', failure: 'Failed to fetch discovery data' },
          () => ctx.client.analytics.getDiscovery({
            project: options.project,
            days: parseInt(options.days, 10),
            groupBy: options.groupBy as 'day' | 'week' | 'month',
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Issue Discovery:\n');

          if (data.summary) {
            console.log(`  Total new: ${data.summary.totalNew}`);
            console.log(`  Total recurring: ${data.summary.totalRecurring}`);
            if (data.summary.newToRecurringRatio !== null) {
              console.log(`  New:Recurring ratio: ${data.summary.newToRecurringRatio.toFixed(2)}`);
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
    .description('Get validator-taxonomy coverage matrix')
    .option('-p, --project <name>', 'Filter by project')
    .option('-d, --days <number>', 'Time window in days', '90')
    .option('-m, --min-issues <number>', 'Minimum issues for inclusion', '5')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching validator matrix...', failure: 'Failed to fetch validator matrix' },
          () => ctx.client.analytics.getValidatorMatrix({
            project: options.project,
            days: parseInt(options.days, 10),
            minIssues: parseInt(options.minIssues, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log('Validator-Taxonomy Coverage:\n');

          if (data.analysis) {
            if (data.analysis.blindSpots.length > 0) {
              console.log(`  Blind spots: ${data.analysis.blindSpots.length} validators missing domains`);
            }

            if (data.analysis.singlePoints.length > 0) {
              console.log(`  Single points of failure: ${data.analysis.singlePoints.length}`);
            }

            if (data.analysis.highOverlap.length > 0) {
              console.log(`  High overlap (3+ validators): ${data.analysis.highOverlap.length}`);
            }
          }

          if (data.matrix && data.matrix.length > 0) {
            console.log(`\nMatrix: ${data.matrix.length} validators analyzed`);
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
          { start: 'Fetching resolution rates...', failure: 'Failed to fetch resolution rates' },
          () => ctx.client.analytics.getResolutionRates({
            days: parseInt(options.days, 10),
            limit: parseInt(options.limit, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.length === 0) {
          console.log('No resolution data found');
        } else {
          const columns: Column<(typeof data)[0]>[] = [
            { header: 'PROJECT', accessor: 'project', width: 25 },
            { header: 'RESOLVED', accessor: (r) => String(r.resolvedIssues), width: 10, align: 'right' },
            { header: 'TOTAL', accessor: (r) => String(r.totalIssues), width: 8, align: 'right' },
            { header: 'RATE', accessor: (r) => `${r.resolutionRate.toFixed(1)}%`, width: 8, align: 'right' },
          ];
          console.log(formatTable(data, columns));
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
