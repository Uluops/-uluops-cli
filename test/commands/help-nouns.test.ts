import { Command, type Option } from 'commander';
import { describe, expect, it } from 'vitest';
import { registerAnalyticsCommands } from '../../src/commands/analytics.js';
import { registerAuthCommands } from '../../src/commands/auth.js';
import { registerCompletionCommands } from '../../src/commands/completion.js';
import { registerDefinitionCommands } from '../../src/commands/definitions.js';
import { registerDepsCommands } from '../../src/commands/deps.js';
import { registerExecCommands } from '../../src/commands/exec.js';
import { registerExecutionCommands } from '../../src/commands/executions.js';
import { registerForkCommands } from '../../src/commands/forks.js';
import { registerIssueCommands } from '../../src/commands/issues.js';
import { registerLanguageCommands } from '../../src/commands/languages.js';
import { registerLogCommands } from '../../src/commands/log.js';
import { registerModelCommands } from '../../src/commands/models.js';
import { registerOrgCommands } from '../../src/commands/orgs.js';
import { registerProjectCommands } from '../../src/commands/projects.js';
import { registerRunCommands } from '../../src/commands/runs.js';
import { registerTaxonomyCommands } from '../../src/commands/taxonomy.js';
import { registerTranslationCommands } from '../../src/commands/translation.js';
import { registerVersionCommands } from '../../src/commands/versions.js';

/**
 * Help text uses the product's nouns (runs, findings, issues, decisions), not
 * "validation", a category the product retired. Source: brand/marketing/
 * agent-read-surface-census-2026-11-20.md (E1-E6).
 */
function buildProgram(): Command {
  const program = new Command();
  for (const register of [
    registerAuthCommands,
    registerProjectCommands,
    registerOrgCommands,
    registerLogCommands,
    registerRunCommands,
    registerIssueCommands,
    registerAnalyticsCommands,
    registerTaxonomyCommands,
    registerDefinitionCommands,
    registerVersionCommands,
    registerDepsCommands,
    registerForkCommands,
    registerModelCommands,
    registerExecutionCommands,
    registerTranslationCommands,
    registerLanguageCommands,
    registerExecCommands,
    registerCompletionCommands,
  ]) {
    register(program);
  }
  return program;
}

function find(root: Command, path: string[]): Command {
  let cur = root;
  for (const name of path) {
    const next = cur.commands.find((c) => c.name() === name);
    if (!next) throw new Error(`no command ${path.join(' ')}`);
    cur = next;
  }
  return cur;
}

function collect(cmd: Command, trail: string[] = []): [string, string][] {
  const out: [string, string][] = [];
  const here = [...trail, cmd.name()].join(' ');
  out.push([here, cmd.description()]);
  for (const o of cmd.options as Option[]) {
    out.push([`${here} ${o.flags}`, o.description]);
  }
  for (const c of cmd.commands) out.push(...collect(c, [...trail, cmd.name()]));
  return out;
}

// Legitimate uses of the word: these describe a schema dry-run, not a product category.
const ALLOWED = new Set<string>([
  // none found at time of writing; add `<path>` here with a reason if one appears
]);

describe('help text nouns', () => {
  const program = buildProgram();

  it('uses the new descriptions', () => {
    expect(find(program, ['runs']).description()).toBe(
      'Manage runs and the findings they produced',
    );
    expect(find(program, ['runs', 'details']).description()).toBe(
      'Get detailed run information including agents and findings',
    );
    expect(find(program, ['runs', 'save']).description()).toBe(
      'Save a run and its findings',
    );
    expect(find(program, ['issues']).description()).toBe(
      'Manage issues: findings tracked across runs, and the decisions on them',
    );
    expect(find(program, ['analytics']).description()).toBe(
      'View analytics for runs, findings and issues',
    );
    const opt = (find(program, ['exec']).options as Option[]).find(
      (o) => o.long === '--no-tracking',
    );
    expect(opt?.description).toBe('Do not save the run to the tracker');
  });

  it('no command or option description says "validation"', () => {
    const all = collect(program);
    expect(all.length).toBeGreaterThan(100);
    const hits = all
      .filter(([, d]) => /\bvalidation\b/i.test(d ?? ''))
      .filter(([p]) => !ALLOWED.has(p))
      .map(([p, d]) => `${p}: ${d}`);
    expect(hits).toEqual([]);
  });

  it('exec inherited-options help block says the same as the option', () => {
    const exec = find(program, ['exec']);
    const sub =
      exec.commands.find((c) => c.name() === 'describe') ?? exec.commands[0];
    let text = '';
    sub.configureOutput({
      writeOut: (s) => {
        text += s;
      },
    });
    sub.outputHelp();
    expect(text).toContain('--no-tracking');
    expect(text).not.toMatch(/\bvalidation\b/i);
    expect(text).toContain('Do not save the run to the tracker');
  });
});
