import type { DefinitionType, DependencyNode } from '@uluops/registry-sdk';
import type { Command } from 'commander';
import {
  createRegistryContext,
  type GlobalOptions,
  handleRegistryError,
} from '../context.js';
import { emitJson } from '../formatters/json.js';
import { parseIntOption, stripAnsi, withSpinner } from '../utils.js';

/**
 * Register dependency commands
 */
export function registerDepsCommands(program: Command): void {
  const deps = program
    .command('deps')
    .description('Inspect definition dependencies')
    .addHelpText(
      'after',
      `
Examples:
  $ ulu deps get workflow ship 1.0.0
  $ ulu deps get workflow ship 1.0.0 --max-depth 2
  $ ulu deps get workflow ship 1.0.0 --tree
  $ ulu deps dependents agent code-validator 1.0.0
`,
    );

  // ulu deps get <type> <name> <version>
  deps
    .command('get <type> <name> <version>')
    .description('Show what a definition depends on')
    .option('-d, --max-depth <number>', 'Maximum traversal depth')
    .option(
      '--tree',
      'Render the dependency graph as an indented tree instead of a flat list',
    )
    .action(
      async (type: string, name: string, version: string, options, cmd) => {
        const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
        const ctx = createRegistryContext(globalOpts);

        try {
          const envelope = await withSpinner(
            ctx,
            {
              start: 'Fetching dependencies...',
              failure: 'Failed to fetch dependencies',
            },
            () =>
              ctx.client.dependencies.get(
                type as DefinitionType,
                name,
                version,
                options.maxDepth
                  ? {
                      maxDepth: parseIntOption(options.maxDepth, '--max-depth'),
                    }
                  : undefined,
              ),
          );

          if (ctx.json) {
            emitJson(ctx, envelope, 'deps.get');
            return;
          }

          const { definition, graph, flat, totalCount, maxDepth } = envelope;
          // All server-controlled strings flow through stripAnsi to
          // neutralize CWE-116 terminal injection. See utils.ts:stripAnsi.
          console.log(
            `Dependencies for ${stripAnsi(definition.type)}/${stripAnsi(definition.name)}@${stripAnsi(definition.version)}:`,
          );
          console.log(`  Total: ${totalCount} (max depth ${maxDepth})`);

          if (totalCount === 0) {
            console.log('\n  No dependencies');
            return;
          }

          console.log('');
          if (options.tree) {
            printTree(graph, '  ');
          } else {
            for (const dep of flat) {
              const indent = '  '.repeat(dep.depth);
              console.log(
                `${indent}${stripAnsi(dep.type)}/${stripAnsi(dep.name)}@${stripAnsi(dep.version)} (depth ${dep.depth})`,
              );
            }
          }
        } catch (error) {
          handleRegistryError(error, ctx);
        }
      },
    );

  // ulu deps dependents <type> <name> <version>
  deps
    .command('dependents <type> <name> <version>')
    .description(
      'Show what depends on this definition (reverse dependency lookup)',
    )
    .action(async (type: string, name: string, version: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createRegistryContext(globalOpts);

      try {
        const envelope = await withSpinner(
          ctx,
          {
            start: 'Fetching dependents...',
            failure: 'Failed to fetch dependents',
          },
          () =>
            ctx.client.dependencies.getDependents(
              type as DefinitionType,
              name,
              version,
            ),
        );

        if (ctx.json) {
          emitJson(ctx, envelope, 'deps.dependents');
          return;
        }

        const { definition, dependents, totalCount } = envelope;
        if (totalCount === 0) {
          console.log(
            `No dependents of ${stripAnsi(definition.type)}/${stripAnsi(definition.name)}@${stripAnsi(definition.version)}`,
          );
          return;
        }
        console.log(
          `Dependents of ${stripAnsi(definition.type)}/${stripAnsi(definition.name)}@${stripAnsi(definition.version)} (${totalCount}):`,
        );
        // Removed `as Dependent[]` cast — `dependents` is already typed
        // as `Dependent[]` from DependentsResponse (post-impl r2).
        for (const dep of dependents) {
          console.log(
            `  ${stripAnsi(dep.type)}/${stripAnsi(dep.name)}@${stripAnsi(dep.version)}  ←  ${stripAnsi(dep.context)}`,
          );
        }
      } catch (error) {
        handleRegistryError(error, ctx);
      }
    });
}

// Defense-in-depth ceiling for the recursive render. The registry-sdk's
// parse-time guard (`MAX_SAFE_GRAPH_DEPTH=50` in operations/dependencies.ts)
// throws RangeError BEFORE the envelope reaches us, so this ceiling never
// fires in production today. It's here for the case where the SDK guard is
// bypassed (a mocked client in tests, a future schema change, a corrupted
// response that slips through) — the renderer is then self-governing
// instead of recursing until stack overflow. 60 > 50 so a compliant chain
// never trips this; an attack chain produces a visible "..." line instead
// of a process crash.
const MAX_RENDER_DEPTH = 60;

function printTree(node: DependencyNode, indent: string, depth = 0): void {
  if (depth > MAX_RENDER_DEPTH) {
    console.log(
      `${indent}... (truncated at depth ${String(MAX_RENDER_DEPTH)})`,
    );
    return;
  }
  const context = node.context ? `  [${stripAnsi(node.context)}]` : '';
  console.log(
    `${indent}${stripAnsi(node.type)}/${stripAnsi(node.name)}@${stripAnsi(node.version)}${context}`,
  );
  for (const child of node.dependencies) {
    printTree(child, `${indent}  `, depth + 1);
  }
}
