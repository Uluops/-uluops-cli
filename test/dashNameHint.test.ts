import { describe, it, expect } from 'vitest';
import { Command } from 'commander';
import { dashNameHint } from '../src/dashNameHint.js';

describe('dashNameHint', () => {
  it('suggests the "--" form for a dash-prefixed project name', () => {
    const hint = dashNameHint("error: unknown option '-uluops-cli'\n", ['log', '-uluops-cli']);
    expect(hint).toContain('ulu log -- -uluops-cli');
    expect(hint).toContain('--project=-uluops-cli');
  });

  it('keeps the other arguments and flags in the suggestion', () => {
    const hint = dashNameHint("error: unknown option '-uluops-core'\n", ['log', '--stat', '-uluops-core']);
    expect(hint).toContain('ulu log --stat -- -uluops-core');
  });

  it('CONTROL — a genuine unknown short option gets no hint', () => {
    expect(dashNameHint("error: unknown option '-x'\n", ['log', '-x'])).toBeUndefined();
  });

  it('CONTROL — a mistyped long option gets no hint', () => {
    expect(dashNameHint("error: unknown option '--stats'\n", ['log', '--stats'])).toBeUndefined();
  });

  it('CONTROL — other errors get no hint', () => {
    expect(dashNameHint("error: missing required argument 'name'\n", ['def', 'get'])).toBeUndefined();
  });

  it('CONTROL — no hint when the user already used "--"', () => {
    expect(dashNameHint("error: unknown option '-uluops-cli'\n", ['log', '-uluops-cli', '--'])).toBeUndefined();
  });

  it("integrates with commander's error output (the real message shape)", () => {
    let written = '';
    const program = new Command();
    program.exitOverride().configureOutput({
      writeErr: (s) => { written += s; },
      outputError: (s, write) => { write(s); const h = dashNameHint(s, ['log', '-uluops-cli']); if (h) write(h); },
    });
    program.command('log [project]').action(() => {});
    expect(() => program.parse(['node', 'ulu', 'log', '-uluops-cli'])).toThrow();
    expect(written).toContain("unknown option '-uluops-cli'");
    expect(written).toContain('ulu log -- -uluops-cli');
  });
});
