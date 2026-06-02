import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import type { CoreCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createCoreContext, handleCoreError } from '../../src/context.js';
import {
  registerExecCommands,
  resolveReportPath,
  applyReportModeDirective,
  warnIfProjectInferred,
  REPORT_MODE_DIRECTIVE,
} from '../../src/commands/exec.js';
import type { GlobalOptions, CoreExecOptions } from '../../src/context.js';

type ExecOpts = GlobalOptions &
  CoreExecOptions & { safetyWarnings?: boolean };

function baseOpts(overrides: Partial<ExecOpts> = {}): ExecOpts {
  return overrides as ExecOpts;
}
import { resolve as resolvePath } from 'node:path';
import type { AgentResult } from '@uluops/core';

const mockedCreateCoreContext = vi.mocked(createCoreContext);
const mockedHandleCoreError = vi.mocked(handleCoreError);

function createMockCoreClient() {
  return {
    run: vi.fn(),
    runAgent: vi.fn(),
    runCommand: vi.fn(),
    runWorkflow: vi.fn(),
    runPipeline: vi.fn(),
    list: vi.fn(),
    describe: vi.fn(),
  };
}

type MockClient = ReturnType<typeof createMockCoreClient>;
let mockClient: MockClient;
let output: ReturnType<typeof captureOutput>;

beforeEach(() => {
  mockClient = createMockCoreClient();
  mockedCreateCoreContext.mockReturnValue({
    client: mockClient as unknown as CoreCliContext['client'],
    json: false,
    debug: false,
    quiet: true,
  });
  mockedHandleCoreError.mockImplementation((error) => { throw error; });
  output = captureOutput();
});

afterEach(() => {
  output.restore();
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerExecCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

// ── Agent result fixture ─────────────────────────────────────────────────

function createAgentResult(overrides: Record<string, unknown> = {}) {
  return {
    type: 'agent',
    name: 'code-validator',
    version: '1.0.0',
    agentType: 'validator',
    decision: 'PASS',
    score: 85,
    maxScore: 100,
    threshold: 70,
    durationMs: 5000,
    dashboardUrl: null,
    categories: [],
    recommendations: [],
    metrics: {
      model: 'claude-sonnet-4-5',
      inputTokens: 1000,
      outputTokens: 500,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalEffectiveTokens: 1500,
    },
    ...overrides,
  };
}

function createExecutionResult(overrides: Record<string, unknown> = {}) {
  return {
    type: 'command',
    name: 'my-command',
    version: '1.0.0',
    decision: 'PASS',
    score: 90,
    durationMs: 3000,
    dashboardUrl: null,
    recommendations: [],
    metrics: {
      model: 'claude-sonnet-4-5',
      inputTokens: 800,
      outputTokens: 400,
      cacheCreationTokens: 0,
      cacheReadTokens: 0,
      totalEffectiveTokens: 1200,
    },
    ...overrides,
  };
}

// ── exec run ─────────────────────────────────────────────────────────────

describe('exec run', () => {
  it('executes a definition by name and displays formatted result', async () => {
    mockClient.run.mockResolvedValue(createAgentResult());
    await parse('exec', 'run', 'code-validator', './src');
    expect(mockClient.run).toHaveBeenCalledWith('code-validator', { target: './src', prompt: undefined });
    expect(output.stdout()).toContain('code-validator');
  });

  it('displays JSON output when context is json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    const result = createAgentResult();
    mockClient.run.mockResolvedValue(result);
    await parse('exec', 'run', 'code-validator', './src');
    expect(output.stdout()).toContain('"name": "code-validator"');
  });

  it('formats execution results for non-agent types', async () => {
    mockClient.run.mockResolvedValue(createExecutionResult({ type: 'workflow' }));
    await parse('exec', 'run', 'my-workflow', './src');
    expect(output.stdout()).toContain('my-command');
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Network failed');
    mockClient.run.mockRejectedValue(err);
    await expect(parse('exec', 'run', 'code-validator', './src')).rejects.toThrow('Network failed');
    expect(mockedHandleCoreError).toHaveBeenCalledWith(err, expect.any(Object));
  });
});

// ── exec agent ───────────────────────────────────────────────────────────

describe('exec agent', () => {
  it('executes an agent and displays formatted result', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', '-t', './src', 'code-validator');
    expect(mockClient.runAgent).toHaveBeenCalledWith('code-validator', { target: './src', prompt: undefined }, undefined);
    expect(output.stdout()).toContain('Score: 85/100');
  });

  it('passes model option to execution options', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', '-t', './src', 'code-validator', '--model', 'haiku');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      { target: './src', prompt: undefined },
      expect.objectContaining({ model: 'haiku' })
    );
  });

  it('passes threshold options', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', '-t', './src', 'code-validator', '--threshold-pass', '80', '--threshold-warn', '60');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      { target: './src', prompt: undefined },
      expect.objectContaining({
        thresholds: { pass: 80, warn: 60 },
      })
    );
  });

  it('passes max-tokens and max-steps options', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', '-t', './src', 'code-validator', '--max-tokens', '4096', '--max-steps', '25');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      { target: './src', prompt: undefined },
      expect.objectContaining({
        maxTokens: 4096,
        maxSteps: 25,
      })
    );
  });

  it('passes temperature option', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', 'agent', '-t', './src', 'code-validator', '--temperature', '0.7');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      { target: './src', prompt: undefined },
      expect.objectContaining({
        temperature: 0.7,
      })
    );
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Agent failed');
    mockClient.runAgent.mockRejectedValue(err);
    await expect(parse('exec', 'agent', '-t', './src', 'code-validator')).rejects.toThrow('Agent failed');
  });
});

// ── exec command ─────────────────────────────────────────────────────────

describe('exec command', () => {
  it('executes a command and displays formatted result', async () => {
    mockClient.runCommand.mockResolvedValue(createExecutionResult());
    await parse('exec', 'command', 'my-command', './src');
    expect(mockClient.runCommand).toHaveBeenCalledWith('my-command', { target: './src', prompt: undefined }, undefined);
    expect(output.stdout()).toContain('my-command');
  });

  it('displays JSON output in json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    mockClient.runCommand.mockResolvedValue(createExecutionResult());
    await parse('exec', 'command', 'my-command', './src');
    expect(output.stdout()).toContain('"name": "my-command"');
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Command failed');
    mockClient.runCommand.mockRejectedValue(err);
    await expect(parse('exec', 'command', 'my-command', './src')).rejects.toThrow('Command failed');
  });
});

// ── exec workflow ────────────────────────────────────────────────────────

describe('exec workflow', () => {
  it('executes a workflow and displays formatted result', async () => {
    mockClient.runWorkflow.mockResolvedValue(createExecutionResult({ type: 'workflow', name: 'ship' }));
    await parse('exec', 'workflow', 'ship', './src');
    expect(mockClient.runWorkflow).toHaveBeenCalledWith('ship', { target: './src', prompt: undefined });
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Workflow failed');
    mockClient.runWorkflow.mockRejectedValue(err);
    await expect(parse('exec', 'workflow', 'ship', './src')).rejects.toThrow('Workflow failed');
  });
});

// ── exec pipeline ────────────────────────────────────────────────────────

describe('exec pipeline', () => {
  it('executes a pipeline and displays formatted result', async () => {
    mockClient.runPipeline.mockResolvedValue(
      createExecutionResult({ type: 'pipeline', name: 'foundations' }),
    );
    await parse('exec', 'pipeline', 'foundations', './src');
    expect(mockClient.runPipeline).toHaveBeenCalledWith('foundations', {
      target: './src',
      prompt: undefined,
    });
  });

  it('passes the operator prompt through', async () => {
    mockClient.runPipeline.mockResolvedValue(
      createExecutionResult({ type: 'pipeline', name: 'foundations' }),
    );
    await parse(
      'exec',
      'pipeline',
      'foundations',
      './src',
      '--prompt',
      'focus on security',
    );
    expect(mockClient.runPipeline).toHaveBeenCalledWith('foundations', {
      target: './src',
      prompt: 'focus on security',
    });
  });

  it('emits JSON in json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    const result = createExecutionResult({ type: 'pipeline', name: 'foundations' });
    mockClient.runPipeline.mockResolvedValue(result);
    await parse('exec', 'pipeline', 'foundations', './src');
    expect(output.stdout()).toContain('"name": "foundations"');
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Pipeline failed');
    mockClient.runPipeline.mockRejectedValue(err);
    await expect(
      parse('exec', 'pipeline', 'foundations', './src'),
    ).rejects.toThrow('Pipeline failed');
  });
});

// ── project-inference warning ────────────────────────────────────────────

describe('warnIfProjectInferred', () => {
  const originalEnv = process.env['ULUOPS_PROJECT'];

  afterEach(() => {
    if (originalEnv === undefined) delete process.env['ULUOPS_PROJECT'];
    else process.env['ULUOPS_PROJECT'] = originalEnv;
  });

  it('warns with the inferred basename when --project is omitted', () => {
    delete process.env['ULUOPS_PROJECT'];
    warnIfProjectInferred(baseOpts(), './src');
    expect(output.stderr()).toContain('No --project specified');
    expect(output.stderr()).toContain('"src"');
  });

  it('stays silent when --project is provided', () => {
    delete process.env['ULUOPS_PROJECT'];
    warnIfProjectInferred(baseOpts({ project: 'my-proj' }), './src');
    expect(output.stderr()).not.toContain('No --project specified');
  });

  it('stays silent when --no-tracking is set', () => {
    delete process.env['ULUOPS_PROJECT'];
    warnIfProjectInferred(baseOpts({ tracking: false }), './src');
    expect(output.stderr()).not.toContain('No --project specified');
  });

  it('stays silent when ULUOPS_PROJECT env is set', () => {
    process.env['ULUOPS_PROJECT'] = 'env-proj';
    warnIfProjectInferred(baseOpts(), './src');
    expect(output.stderr()).not.toContain('No --project specified');
  });

  it('stays silent in quiet mode', () => {
    delete process.env['ULUOPS_PROJECT'];
    warnIfProjectInferred(baseOpts({ quiet: true }), './src');
    expect(output.stderr()).not.toContain('No --project specified');
  });

  it('stays silent in json mode (machine-readable streams must stay clean)', () => {
    delete process.env['ULUOPS_PROJECT'];
    warnIfProjectInferred(baseOpts({ json: true }), './src');
    expect(output.stderr()).not.toContain('No --project specified');
  });

  it('stays silent when target is missing', () => {
    delete process.env['ULUOPS_PROJECT'];
    warnIfProjectInferred(baseOpts(), undefined);
    expect(output.stderr()).not.toContain('No --project specified');
  });
});

// ── exec list ────────────────────────────────────────────────────────────

describe('exec list', () => {
  it('lists all definitions', async () => {
    mockClient.list.mockResolvedValue([
      { name: 'code-validator', type: 'agent', version: '1.0.0', domain: 'validation', description: 'Validates code' },
    ]);
    await parse('exec', 'list');
    expect(mockClient.list).toHaveBeenCalledWith(undefined);
    expect(output.stdout()).toContain('code-validator');
  });

  it('filters by type', async () => {
    mockClient.list.mockResolvedValue([]);
    await parse('exec', 'list', '--type', 'agent');
    expect(mockClient.list).toHaveBeenCalledWith(expect.objectContaining({ type: 'agent' }));
  });

  it('filters by domain', async () => {
    mockClient.list.mockResolvedValue([]);
    await parse('exec', 'list', '--domain', 'security');
    expect(mockClient.list).toHaveBeenCalledWith(expect.objectContaining({ domain: 'security' }));
  });

  it('shows empty message when no definitions found', async () => {
    mockClient.list.mockResolvedValue([]);
    await parse('exec', 'list');
    expect(output.stdout()).toContain('No definitions found');
  });

  it('displays JSON output in json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    const items = [{ name: 'test', type: 'agent', version: '1.0.0', domain: 'test', description: 'Test' }];
    mockClient.list.mockResolvedValue(items);
    await parse('exec', 'list');
    expect(output.stdout()).toContain('"name": "test"');
  });
});

// ── exec describe ────────────────────────────────────────────────────────

describe('exec describe', () => {
  it('describes a definition and displays details', async () => {
    mockClient.describe.mockResolvedValue({
      type: 'agent',
      name: 'code-validator',
      version: '1.0.0',
      hash: 'abc123',
      interface: { input: 'directory', output: 'json' },
    });
    await parse('exec', 'describe', 'code-validator');
    expect(mockClient.describe).toHaveBeenCalledWith('code-validator');
    expect(output.stdout()).toContain('code-validator');
    expect(output.stdout()).toContain('abc123');
  });

  it('displays JSON output in json mode', async () => {
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: true,
      debug: false,
      quiet: true,
    });
    mockClient.describe.mockResolvedValue({
      type: 'agent',
      name: 'code-validator',
      version: '1.0.0',
      hash: 'abc123',
      interface: {},
    });
    await parse('exec', 'describe', 'code-validator');
    expect(output.stdout()).toContain('"hash": "abc123"');
  });

  it('delegates errors to handleCoreError', async () => {
    const err = new Error('Not found');
    mockClient.describe.mockRejectedValue(err);
    await expect(parse('exec', 'describe', 'unknown')).rejects.toThrow('Not found');
  });
});

// ── Safety warnings ─────────────────────────────────────────────────────

describe('exec agent safety warnings', () => {
  beforeEach(() => {
    // Non-quiet, non-json context so safety warnings are shown
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: false,
      debug: false,
      quiet: false,
    });
  });

  it('shows risk warning for medium/high definitions', async () => {
    mockClient.describe.mockResolvedValue({
      name: 'risky-agent',
      riskProfile: {
        sync: {
          signals: [{ title: 'Prompt contains shell exploitation pattern' }],
        },
        aggregateRiskLevel: 'high',
      },
    });
    mockClient.runAgent.mockResolvedValue(createAgentResult({ name: 'risky-agent' }));
    await parse('exec', 'agent', '-t', './src', 'risky-agent');
    expect(output.stderr()).toContain('Risk signal');
    expect(output.stderr()).toContain('shell exploitation');
  });

  it('shows no warning for clean definitions', async () => {
    mockClient.describe.mockResolvedValue({
      name: 'clean-agent',
      riskProfile: {
        sync: { signals: [] },
        aggregateRiskLevel: 'none',
      },
    });
    mockClient.runAgent.mockResolvedValue(createAgentResult({ name: 'clean-agent' }));
    await parse('exec', 'agent', '-t', './src', 'clean-agent');
    expect(output.stderr()).not.toContain('Risk signal');
  });

  it('shows runtime advisory for shell-capable agent targeting sensitive path', async () => {
    mockClient.describe.mockResolvedValue({
      name: 'shell-agent',
      riskProfile: {
        sync: {
          signals: [],
          capabilities: { tools: ['bash', 'read'] },
        },
        aggregateRiskLevel: 'none',
      },
    });
    mockClient.runAgent.mockResolvedValue(createAgentResult({ name: 'shell-agent' }));
    await parse('exec', 'agent', '-t', '/Users/me/.ssh', 'shell-agent');
    expect(output.stderr()).toContain('Advisory');
    expect(output.stderr()).toContain('sensitive path');
  });

  it('shows no advisory for shell-capable agent targeting normal path', async () => {
    mockClient.describe.mockResolvedValue({
      name: 'shell-agent',
      riskProfile: {
        sync: {
          signals: [],
          capabilities: { tools: ['bash', 'read'] },
        },
        aggregateRiskLevel: 'none',
      },
    });
    mockClient.runAgent.mockResolvedValue(createAgentResult({ name: 'shell-agent' }));
    await parse('exec', 'agent', '-t', './src', 'shell-agent');
    expect(output.stderr()).not.toContain('Advisory');
  });

  it('--no-safety-warnings suppresses both risk warning and advisory', async () => {
    mockClient.describe.mockResolvedValue({
      name: 'risky-shell-agent',
      riskProfile: {
        sync: {
          signals: [{ title: 'Prompt contains injection' }],
          capabilities: { tools: ['bash'] },
        },
        aggregateRiskLevel: 'high',
      },
    });
    mockClient.runAgent.mockResolvedValue(createAgentResult({ name: 'risky-shell-agent' }));
    await parse('exec', '--no-safety-warnings', 'agent', '-t', '/Users/me/.ssh', 'risky-shell-agent');
    expect(output.stderr()).not.toContain('Risk signal');
    expect(output.stderr()).not.toContain('Advisory');
  });
});

// ── Parent options ───────────────────────────────────────────────────────

describe('parent options', () => {
  it('passes --no-tracking to disable result submission', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', '--no-tracking', 'agent', '-t', './src', 'code-validator');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      { target: './src', prompt: undefined },
      expect.objectContaining({ trackResults: false })
    );
  });

  it('passes --project option', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', '--project', 'my-proj', 'agent', '-t', './src', 'code-validator');
    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'code-validator',
      { target: './src', prompt: undefined },
      expect.objectContaining({ project: 'my-proj' })
    );
  });
});

describe('resolveReportPath', () => {
  // Minimal AgentResult — only `name` is read by resolveReportPath's default
  // filename branch. Other fields cast as unknown to avoid an exhaustive mock.
  const makeResult = (name: string): AgentResult =>
    ({ name } as unknown as AgentResult);

  it('returns null when --report is not set', () => {
    expect(resolveReportPath(makeResult('any-agent'), {})).toBeNull();
  });

  it('lets --output win over a positional --report path', () => {
    const got = resolveReportPath(
      makeResult('any-agent'),
      { report: './a.md', output: './b.md' },
    );
    expect(got).toBe(resolvePath('./b.md'));
  });

  it('lets --output win over the cwd default', () => {
    const got = resolveReportPath(
      makeResult('any-agent'),
      { report: true, output: './b.md' },
    );
    expect(got).toBe(resolvePath('./b.md'));
  });

  it('uses the positional --report argument when no --output is given', () => {
    const got = resolveReportPath(
      makeResult('any-agent'),
      { report: './a.md' },
    );
    expect(got).toBe(resolvePath('./a.md'));
  });

  it('constructs a cwd-relative default with timestamp YYYYMMDDTHHmmss', () => {
    const got = resolveReportPath(
      makeResult('wittgenstein-analyst'),
      { report: true },
    );
    // Path is absolute and ends with the constructed filename.
    expect(got).toMatch(
      /\/wittgenstein-analyst-report-\d{8}T\d{6}\.md$/,
    );
    expect(got!.startsWith(process.cwd())).toBe(true);
  });

  it('sanitizes agent name to [a-zA-Z0-9_.-] in the default filename', () => {
    const got = resolveReportPath(
      makeResult('weird/name with spaces'),
      { report: true },
    );
    expect(got).toMatch(/\/weird_name_with_spaces-report-\d{8}T\d{6}\.md$/);
  });

  it('treats empty-string --output as not-set (falls through to next branch)', () => {
    const got = resolveReportPath(
      makeResult('any-agent'),
      { report: './a.md', output: '' },
    );
    expect(got).toBe(resolvePath('./a.md'));
  });
});

describe('applyReportModeDirective', () => {
  it('returns the prompt unchanged when report mode is not requested', () => {
    expect(applyReportModeDirective('focus on X', false)).toBe('focus on X');
    expect(applyReportModeDirective(undefined, false)).toBeUndefined();
  });

  it('returns the directive alone when report mode is requested with no operator prompt', () => {
    expect(applyReportModeDirective(undefined, true)).toBe(REPORT_MODE_DIRECTIVE);
  });

  it('prepends the directive, blank line, then operator prompt when both present', () => {
    const got = applyReportModeDirective('focus on X', true);
    expect(got!.startsWith(REPORT_MODE_DIRECTIVE)).toBe(true);
    expect(got!.endsWith('focus on X')).toBe(true);
    expect(got).toContain(`${REPORT_MODE_DIRECTIVE}\n\nfocus on X`);
  });

  // Contract pin: the discriminator marker is the load-bearing contract between
  // this directive and AnalysisSummaryExtractor.parseAnalysisBlock's regex in
  // @uluops/core. If this test breaks, either the directive was paraphrased or
  // the extractor regex was changed — fix one or the other to restore the contract.
  it('directive includes the ```json analysis discriminator (contract pin)', () => {
    expect(REPORT_MODE_DIRECTIVE).toContain('```json analysis');
  });
});

// ── v0.1.1: --report forces reportMode=true + trackResults=false ────────────
// Report mode disables AI SDK structured-output enforcement (so the directive
// can take effect) and forces tracking off (so the tracker's schema-validated
// analytics contract isn't corrupted by best-effort extraction). The exclusivity
// is unconditional — even an explicit --tracking flag is overridden. See
// agent-reporting-spec-v0_1_1.md Phase 4.4 for the rationale.

describe('--report forces reportMode + no-tracking (v0.1.1)', () => {
  // Uses the top-of-file `createAgentResult` helper (full shape including
  // categories/recommendations/metrics that the result formatter requires).

  // Note on the --tracking flag: Commander's `.option('--no-tracking', ...)`
  // pattern only registers the negation form. There is no explicit `--tracking`
  // flag; the default behavior is tracking-on. So "user explicitly passes
  // --tracking" is not a real CLI scenario. The exclusivity test is effectively
  // "report mode forces tracking off, regardless of the default-on state",
  // which is what the first test covers.

  it('--report alone → reportMode=true, trackResults=false, notice on stderr', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    // Override ctx.quiet so console.error is not muted; otherwise we cannot
    // assert on stderr from the report-mode notice.
    mockedCreateCoreContext.mockReturnValue({
      client: mockClient as unknown as CoreCliContext['client'],
      json: false,
      debug: false,
      quiet: false,
    });
    await parse('exec', 'agent', '-t', './src', 'wittgenstein-analyst', '--report');

    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'wittgenstein-analyst',
      expect.objectContaining({ target: './src' }),
      expect.objectContaining({ reportMode: true, trackResults: false }),
    );
    expect(output.stderr()).toContain('Report mode enabled');
    expect(output.stderr()).toContain('tracking disabled');
  });

  it('no --report → reportMode not forced, trackResults respects --no-tracking', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    await parse('exec', '--no-tracking', 'agent', '-t', './src', 'wittgenstein-analyst');

    const opts = mockClient.runAgent.mock.calls[0]?.[2];
    expect(opts).toEqual(
      expect.objectContaining({ trackResults: false }),
    );
    // reportMode must not be set by the CLI when --report is absent
    expect(opts?.reportMode).toBeUndefined();
    expect(output.stderr()).not.toContain('Report mode enabled');
  });

  it('--report with ctx.quiet=true → notice suppressed but flags still forced', async () => {
    mockClient.runAgent.mockResolvedValue(createAgentResult());
    // ctx.quiet=true (the default in this suite's beforeEach) gates the notice
    // off without affecting the underlying flag mutation.
    await parse('exec', 'agent', '-t', './src', 'wittgenstein-analyst', '--report');

    expect(mockClient.runAgent).toHaveBeenCalledWith(
      'wittgenstein-analyst',
      expect.anything(),
      expect.objectContaining({ reportMode: true, trackResults: false }),
    );
    expect(output.stderr()).not.toContain('Report mode enabled');
  });
});
