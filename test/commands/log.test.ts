/**
 * `ulu log` — the D5 ladder (checklist Phase 4), every rung with the higher
 * rungs unset, plus the leak case (stale ULUOPS_PROJECT + correct file → file),
 * the org-only nested file (→ env → error naming the file), the stderr line
 * when env answers over a file that names no project, the 404 that names the
 * org searched and the file, `--kind` validation, `--orgs`, and the `--json`
 * byte-identity contract.
 *
 * The resolver walks from `process.cwd()`; each case chdirs into its own temp
 * tree (outside $HOME, so the walk reaches the root and a real ~/.uluops.json
 * cannot leak in — the temp dir's own file is the nearest). `createOpsContext`
 * is mocked, so the org half is fixed by the test; only the project rung is
 * exercised through the real SDK reader.
 */
import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Command } from 'commander';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsCliContext } from '../../src/context.js';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';

vi.mock('../../src/context.js');

import { registerLogCommands } from '../../src/commands/log.js';
import { createOpsContext, handleOpsError } from '../../src/context.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);

type MockClient = ReturnType<typeof createMockOpsClient>;
let mockClient: MockClient;
let root: string;
let cwdBefore: string;
let envBefore: string | undefined;

const page = { data: [], count: 0, hasMore: false };
const stat = {
  projectId: 'p',
  window: { since: null, until: null },
  examined: { runs: 1, first: '2026-01-01T00:00:00.000Z', last: '2026-01-01T00:00:00.000Z', byWorkflow: [], definitions: 1 },
  found: { issues: 0 },
  decided: { completed: 0, deferred: 0, wontfix: 0, 'false-positive': 0, observation: 0, open: 0, withReason: { completed: 0, deferred: 0, wontfix: 0, 'false-positive': 0, observation: 0 } },
  cameBack: { detected: 0, detectedEvents: 0, reopened: 0, reopenedEvents: 0, lastDetectedAtAllTime: null },
  activity: { decisions: 0, byStatus: { open: 0, completed: 0, deferred: 0, wontfix: 0, merged: 0, 'false-positive': 0, observation: 0 }, restated: 0, runsWithCorrelation: 0 },
};

beforeEach(() => {
  mockClient = createMockOpsClient();
  mockClient.projects.getLog.mockResolvedValue(page);
  mockClient.projects.getLogStat.mockResolvedValue(stat);
  mockClient.projects.list.mockResolvedValue({ data: [{ name: 'alpha' }, { name: 'beta' }], total: 2 });
  mockedCreateOpsContext.mockReturnValue(
    createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'], org: 'ulu-labs', orgSource: 'workspace', orgProvenance: 'workspace /x/.uluops.json' }),
  );
  mockedHandleOpsError.mockImplementation((error) => {
    throw error;
  });
  // realpath: on macOS mkdtemp says /var/... while process.cwd() says /private/var/...
  root = realpathSync(mkdtempSync(join(tmpdir(), 'ulu-log-')));
  cwdBefore = process.cwd();
  envBefore = process.env.ULUOPS_PROJECT;
  delete process.env.ULUOPS_PROJECT;
  process.chdir(root);
  vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`process.exit(${String(code ?? 0)})`);
  }) as never);
});

afterEach(() => {
  process.chdir(cwdBefore);
  if (envBefore === undefined) delete process.env.ULUOPS_PROJECT;
  else process.env.ULUOPS_PROJECT = envBefore;
  rmSync(root, { recursive: true, force: true });
  vi.restoreAllMocks();
});

function writeFile(dir: string, body: unknown): string {
  mkdirSync(dir, { recursive: true });
  const p = join(dir, '.uluops.json');
  writeFileSync(p, JSON.stringify(body));
  return p;
}

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerLogCommands(program);
  return program.parseAsync(['node', 'ulu', 'log', ...args]);
}

describe('ulu log — project resolution (D5)', () => {
  it('rung 1: --project wins over the positional and over the file', async () => {
    writeFile(root, { org: 'ulu-labs', project: 'from-file' });
    const out = captureOutput();
    await parse('positional', '-p', 'flagged');
    out.restore();
    expect(mockClient.projects.getLog).toHaveBeenCalledWith('flagged', expect.anything());
  });

  it('rung 2: the positional wins over the file', async () => {
    writeFile(root, { org: 'ulu-labs', project: 'from-file' });
    const out = captureOutput();
    await parse('positional');
    out.restore();
    expect(mockClient.projects.getLog).toHaveBeenCalledWith('positional', expect.anything());
  });

  it('rung 3: the nearest file answers; the leak case — a stale ULUOPS_PROJECT does NOT win over the file', async () => {
    const deep = join(root, 'packages', 'x');
    writeFile(root, { org: 'ulu-labs', project: 'from-file' });
    mkdirSync(deep, { recursive: true });
    process.chdir(deep);
    process.env.ULUOPS_PROJECT = 'stale-export';
    const out = captureOutput();
    await parse();
    out.restore();
    expect(mockClient.projects.getLog).toHaveBeenCalledWith('from-file', expect.anything());
    expect(out.errors.join('\n')).not.toContain('ULUOPS_PROJECT');
  });

  it('rung 4: env answers when the file names org but no project — and says so on stderr, naming the file', async () => {
    const p = writeFile(root, { org: 'ulu-labs' });
    process.env.ULUOPS_PROJECT = 'from-env';
    const out = captureOutput();
    await parse();
    out.restore();
    expect(mockClient.projects.getLog).toHaveBeenCalledWith('from-env', expect.anything());
    expect(out.errors.join('\n')).toContain(`project from ULUOPS_PROJECT; nearest .uluops.json (${p}) names no project`);
  });

  it('rung 4 without a file: env answers silently', async () => {
    process.env.ULUOPS_PROJECT = 'from-env';
    const out = captureOutput();
    await parse();
    out.restore();
    expect(mockClient.projects.getLog).toHaveBeenCalledWith('from-env', expect.anything());
    expect(out.errors.join('\n')).toBe('');
  });

  it('rung 5: nothing answers → error naming the file (org but no project) and listing the org\'s projects', async () => {
    const p = writeFile(root, { org: 'ulu-labs' });
    const out = captureOutput();
    await expect(parse()).rejects.toThrow('process.exit(1)');
    out.restore();
    const err = out.errors.join('\n');
    expect(err).toContain(`nearest .uluops.json (${p}) names org but no project`);
    expect(err).toContain('Projects in org ulu-labs: alpha, beta');
    expect(mockClient.projects.getLog).not.toHaveBeenCalled();
  });

  it('org-only NESTED file under an outer {org, project}: nearest wins → project undefined → env → error naming the nested file', async () => {
    writeFile(root, { org: 'b', project: 'outer' });
    const inner = join(root, 'inner');
    const p = writeFile(inner, { org: 'personal' });
    process.chdir(inner);
    const out = captureOutput();
    await expect(parse()).rejects.toThrow('process.exit(1)');
    out.restore();
    expect(out.errors.join('\n')).toContain(`(${p}) names org but no project`);
    expect(mockClient.projects.getLog).not.toHaveBeenCalled();

    // and with env set, the nested file still does not yield the OUTER project — env answers, stderr names the nested file
    process.env.ULUOPS_PROJECT = 'from-env';
    const out2 = captureOutput();
    await parse();
    out2.restore();
    expect(mockClient.projects.getLog).toHaveBeenCalledWith('from-env', expect.anything());
    expect(out2.errors.join('\n')).toContain(`(${p}) names no project`);
  });

  it('the reader\'s refusals stop the ladder with the reader\'s message: project without org, and an unknown key', async () => {
    writeFile(root, { project: 'y' });
    process.env.ULUOPS_PROJECT = 'from-env'; // must NOT be reached
    const out = captureOutput();
    await expect(parse()).rejects.toThrow('process.exit(1)');
    out.restore();
    expect(out.errors.join('\n')).toContain('"project" requires "org"; use "personal" for no org');
    expect(mockClient.projects.getLog).not.toHaveBeenCalled();

    writeFile(root, { org: 'x', project: 'y', baseUrl: 'http://evil' });
    const out2 = captureOutput();
    await expect(parse()).rejects.toThrow('process.exit(1)');
    out2.restore();
    expect(out2.errors.join('\n')).toContain('found "baseUrl"');
  });

  it('a 404 names the org searched and the file the project came from', async () => {
    const p = writeFile(root, { org: 'ulu-labs', project: 'ghost' });
    const { NotFoundError } = await import('@uluops/ops-sdk');
    mockClient.projects.getLog.mockRejectedValue(new NotFoundError('Project not found'));
    const out = captureOutput();
    await expect(parse()).rejects.toThrow('process.exit(1)');
    out.restore();
    expect(out.errors.join('\n')).toContain(`project 'ghost' not found in org ulu-labs, from ${p}`);
  });
});

describe('ulu log — options and output', () => {
  it('passes the window, limit, cursor, kinds, workflow, agent and include-archived through; --no-collapse is rendering-only', async () => {
    const out = captureOutput();
    await parse('alpha', '--since', '2026-09-01T00:00:00Z', '--until', '2026-09-15T00:00:00Z', '-n', '25', '--cursor', 'c1', '--kind', 'run,regression', '--workflow', 'ship', '--agent', 'code-validator', '--include-archived', '--no-collapse');
    out.restore();
    expect(mockClient.projects.getLog).toHaveBeenCalledWith('alpha', {
      since: '2026-09-01T00:00:00Z',
      until: '2026-09-15T00:00:00Z',
      limit: 25,
      cursor: 'c1',
      kind: ['run', 'regression'],
      workflowType: 'ship',
      agent: 'code-validator',
      includeArchived: true,
    });
  });

  it('rejects a bad --kind before any request', async () => {
    const out = captureOutput();
    await expect(parse('alpha', '--kind', 'run,merge')).rejects.toThrow('process.exit(1)');
    out.restore();
    expect(out.errors.join('\n')).toContain('--kind takes a comma-separated subset of run, decision, regression');
    expect(mockClient.projects.getLog).not.toHaveBeenCalled();
  });

  it('--json is byte-identical to JSON.stringify(data, null, 2) and never collapsed', async () => {
    const decisions = Array.from({ length: 3 }, (_, i) => ({
      type: 'decision', issueId: `i${i}`, fingerprint: `f${i}`, title: 't', from: 'open', to: 'completed', reason: null, source: null, at: '2026-06-15T10:00:00.000Z', seq: i,
    }));
    const p = { data: decisions, count: 3, hasMore: false };
    mockClient.projects.getLog.mockResolvedValue(p);
    mockedCreateOpsContext.mockReturnValue(createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'], json: true }));
    const out = captureOutput();
    await parse('alpha');
    out.restore();
    expect(out.logs.join('\n')).toBe(JSON.stringify(p, null, 2));
    expect(out.logs.join('\n')).not.toContain('issues'); // no collapse line
  });

  it('--stat renders the rollup with the org and project provenance on the header', async () => {
    const out = captureOutput();
    await parse('alpha', '--stat');
    out.restore();
    expect(mockClient.projects.getLogStat).toHaveBeenCalledWith('alpha', { since: undefined, until: undefined });
    expect(out.logs[0]).toContain('UluOps log - alpha   (org: ulu-labs, workspace /x/.uluops.json; project from argument)');
  });

  it('an empty page says so with the provenance instead of printing an empty footer', async () => {
    const out = captureOutput();
    await parse('alpha');
    out.restore();
    expect(out.logs.join('\n')).toBe('No events for alpha (org: ulu-labs, workspace /x/.uluops.json; project from argument)');
  });

  it('--orgs with a BOUND key: an org the key cannot read is noted on stderr and skipped, the rest render; --json carries only the readable stats', async () => {
    const { ForbiddenError } = await import('@uluops/ops-sdk');
    // The SDK's guard is `instanceof SdkApiError && code === 'ORG_ACCESS_DENIED'` — the same shape the platform answers with.
    const denied = Object.assign(new ForbiddenError('API key is scoped to a different organization'), { code: 'ORG_ACCESS_DENIED' });
    mockClient.orgs.list.mockResolvedValue([
      { id: 'a', name: 'A', slug: 'alexself2', isPersonal: true, role: 'owner', memberCount: 1, subscriptionTier: 'enterprise', paymentStatus: 'none', suspendedAt: null },
      { id: 'b', name: 'B', slug: 'ulu-labs', isPersonal: false, role: 'admin', memberCount: 3, subscriptionTier: 'enterprise', paymentStatus: 'none', suspendedAt: null },
    ]);
    const good = { ...stat, org: 'ulu-labs', computedAt: '2026-09-15T21:44:44.938Z', projects: [], hasMoreProjects: false };
    mockClient.orgs.getLogStat.mockImplementation(async (slug: string) => {
      if (slug === 'alexself2') throw denied;
      return good;
    });
    const out = captureOutput();
    await parse('--orgs');
    out.restore();
    expect(out.errors.join('\n')).toContain('not readable with this key (bound to another org): alexself2');
    expect(out.logs.join('\n')).toContain('ulu-labs   (admin)');
    expect(out.logs.join('\n')).not.toContain('alexself2');

    mockedCreateOpsContext.mockReturnValue(createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'], json: true }));
    const out2 = captureOutput();
    await parse('--orgs');
    out2.restore();
    expect(out2.logs.join('\n')).toBe(JSON.stringify([good], null, 2));
  });

  it('--orgs lists the orgs, fetches each rollup, needs no project, and --json emits the stats array', async () => {
    mockClient.orgs.list.mockResolvedValue([
      { id: 'a', name: 'A', slug: 'alexself2', isPersonal: true, role: 'owner', memberCount: 1, subscriptionTier: 'enterprise', paymentStatus: 'none', suspendedAt: null },
      { id: 'b', name: 'B', slug: 'ulu-labs', isPersonal: false, role: 'admin', memberCount: 3, subscriptionTier: 'enterprise', paymentStatus: 'none', suspendedAt: null },
    ]);
    const orgStat = (slug: string) => ({ ...stat, org: slug, computedAt: '2026-09-15T21:44:44.938Z', projects: [], hasMoreProjects: false });
    mockClient.orgs.getLogStat.mockImplementation(async (slug: string) => orgStat(slug));
    const out = captureOutput();
    await parse('--orgs', '--since', '2026-01-01T00:00:00Z');
    out.restore();
    expect(mockClient.orgs.getLogStat).toHaveBeenCalledTimes(2);
    expect(mockClient.orgs.getLogStat).toHaveBeenCalledWith('ulu-labs', { since: '2026-01-01T00:00:00Z', until: undefined });
    expect(mockClient.projects.getLog).not.toHaveBeenCalled();
    expect(out.logs.join('\n')).toContain('personal (alexself2)');
    expect(out.logs.join('\n')).toContain('ulu-labs   (admin)');

    mockedCreateOpsContext.mockReturnValue(createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'], json: true }));
    const out2 = captureOutput();
    await parse('--orgs');
    out2.restore();
    expect(out2.logs.join('\n')).toBe(JSON.stringify([orgStat('alexself2'), orgStat('ulu-labs')], null, 2));
  });
});
