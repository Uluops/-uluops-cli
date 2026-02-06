import { describe, it, expect, vi } from 'vitest';
import { Command } from 'commander';
import { registerCompletionCommands } from '../../src/commands/completion.js';

/**
 * Build a minimal program tree for testing completion output
 */
function buildTestProgram(): Command {
  const program = new Command();
  program.exitOverride();

  const projects = program.command('projects').description('Manage projects');
  projects.command('list').description('List all projects');
  projects.command('get').description('Get project details');

  const auth = program.command('auth').description('Authentication');
  auth.command('login').description('Login');
  auth.command('logout').description('Logout');

  registerCompletionCommands(program);
  return program;
}

function captureStdoutWrite() {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk));
    return true;
  });
  return {
    output: () => chunks.join(''),
    restore: () => spy.mockRestore(),
  };
}

function parse(program: Command, ...args: string[]) {
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('completion bash', () => {
  it('should generate bash completion script', async () => {
    const program = buildTestProgram();
    const capture = captureStdoutWrite();
    await parse(program, 'completion', 'bash');
    const script = capture.output();
    capture.restore();
    expect(script).toContain('_ulu_completions');
    expect(script).toContain('complete');
    expect(script).toContain('projects');
    expect(script).toContain('auth');
    // Should include subcommands
    expect(script).toContain('list get');
    expect(script).toContain('login logout');
  });
});

describe('completion zsh', () => {
  it('should generate zsh completion script', async () => {
    const program = buildTestProgram();
    const capture = captureStdoutWrite();
    await parse(program, 'completion', 'zsh');
    const script = capture.output();
    capture.restore();
    expect(script).toContain('#compdef ulu');
    expect(script).toContain('_ulu');
    expect(script).toContain('projects');
    expect(script).toContain('auth');
  });
});

describe('completion fish', () => {
  it('should generate fish completion script', async () => {
    const program = buildTestProgram();
    const capture = captureStdoutWrite();
    await parse(program, 'completion', 'fish');
    const script = capture.output();
    capture.restore();
    expect(script).toContain('complete -c ulu');
    expect(script).toContain('projects');
    expect(script).toContain('auth');
    expect(script).toContain('__fish_use_subcommand');
    expect(script).toContain('__fish_seen_subcommand_from');
    // Should have subcommands
    expect(script).toContain('list');
    expect(script).toContain('login');
    // Global options (fish uses -l for long options)
    expect(script).toContain('-l api-key');
    expect(script).toContain('-l json');
  });
});
