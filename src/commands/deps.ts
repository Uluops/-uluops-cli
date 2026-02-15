import { Command } from 'commander';
import { createRegistryContext, handleRegistryError, type GlobalOptions } from '../context.js';
import { withSpinner, parseIntOption, asFlexibleResponse } from '../utils.js';
import type { DefinitionType } from '@uluops/registry-sdk';

/**
 * Register dependency commands
 */
export function registerDepsCommands(program: Command): void {
  const deps = program
    .command('deps')
    .description('Inspect definition dependencies');

  // ulu deps get <type> <name> <version>
  deps
    .command('get <type> <name> <version>')
    .description('Show dependency graph for a definition')
    .option('-d, --max-depth <number>', 'Maximum traversal depth')
    .action(async (type: string, name: string, version: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const graph = await withSpinner(
          ctx,
          { start: 'Fetching dependencies...', failure: 'Failed to fetch dependencies' },
          () => ctx.client.dependencies.get(
            type as DefinitionType,
            name,
            version,
            options.maxDepth ? { maxDepth: parseIntOption(options.maxDepth, '--max-depth') } : undefined
          )
        );

        if (ctx.json) {
          console.log(JSON.stringify(graph, null, 2));
        } else {
          // API may return { graph, flat, totalCount } or { nodes, edges }
          const data = asFlexibleResponse(graph);
          const nodes = (data.nodes ?? data.flat ?? []) as Array<{ type: string; name: string; version: string; status: string }>;
          const edges = (data.edges ?? []) as unknown[];
          console.log(`Dependencies for ${type}/${name}@${version}:`);
          console.log(`  Dependencies: ${(data.totalCount as number) ?? nodes.length}`);
          if (edges.length > 0) {
            console.log(`  Edges: ${edges.length}`);
          }
          if (graph.cycleDetected) {
            console.log('  WARNING: Circular dependency detected!');
            if (graph.cycles) {
              for (const cycle of graph.cycles) {
                console.log(`    ${cycle.join(' -> ')}`);
              }
            }
          }
          if (nodes.length === 0) {
            console.log('\n  No dependencies');
          } else {
            console.log('');
            for (const node of nodes) {
              console.log(`  ${node.type}/${node.name}@${node.version} (${node.status})`);
            }
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });

  // ulu deps dependents <type> <name> <version>
  deps
    .command('dependents <type> <name> <version>')
    .description('Show definitions that depend on this one')
    .action(async (type: string, name: string, version: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const graph = await withSpinner(
          ctx,
          { start: 'Fetching dependents...', failure: 'Failed to fetch dependents' },
          () => ctx.client.dependencies.getDependents(type as DefinitionType, name, version)
        );

        if (ctx.json) {
          console.log(JSON.stringify(graph, null, 2));
        } else {
          const depData = asFlexibleResponse(graph);
          const nodes = (depData.nodes ?? depData.flat ?? []) as Array<{ type: string; name: string; version: string; status: string }>;
          if (nodes.length === 0) {
            console.log('No dependents found');
          } else {
            console.log(`Dependents of ${type}/${name}@${version}:`);
            for (const node of nodes) {
              console.log(`  ${node.type}/${node.name}@${node.version} (${node.status})`);
            }
          }
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}
