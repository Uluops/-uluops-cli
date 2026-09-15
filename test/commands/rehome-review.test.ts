/**
 * Pre-publish review fold for 0.30.0 (anxiety-reader 84 / code-auditor 95 /
 * dx-validator 86 / docs-validator 85, 2026-09-15). Each case names the finding.
 */

import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsCliContext } from '../../src/context.js';
import { captureOutput } from '../helpers/capture.js';
import {
  createMockOpsClient,
  createMockOpsContext,
} from '../helpers/command-harness.js';

vi.mock('../../src/context.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/context.js')>();
  return { ...actual, createOpsContext: vi.fn(), handleOpsError: vi.fn() };
});
vi.mock('../../src/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/utils.js')>();
  return { ...actual, confirmOrExit: vi.fn(async () => undefined) };
});

import {
  describeFeedEntry,
  registerOrgCommands,
} from '../../src/commands/orgs.js';
import { registerProjectCommands } from '../../src/commands/projects.js';
import {
  createOpsContext,
  describeOrgProvenance,
  handleOpsError,
} from '../../src/context.js';
import { confirmOrExit } from '../../src/utils.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);
const mockedConfirm = vi.mocked(confirmOrExit);
let mockClient: ReturnType<typeof createMockOpsClient>;

beforeEach(() => {
  mockClient = createMockOpsClient();
  mockedCreateOpsContext.mockReturnValue(
    createMockOpsContext({
      client: mockClient as unknown as OpsCliContext['client'],
      org: 'acme',
      orgSource: 'workspace',
      orgProvenance: 'workspace /Users/x/uluops/.uluops.json',
    }),
  );
  mockedHandleOpsError.mockImplementation((error) => {
    throw error;
  });
  mockedConfirm.mockClear();
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerProjectCommands(program);
  registerOrgCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

const moved = {
  id: 'p1',
  name: 'billing',
  ownerId: 'u',
  createdAt: '2026-09-15T00:00:00Z',
  updatedAt: '2026-09-15T00:00:00Z',
  orgId: 'b',
  rehome: {
    from_org: { id: 'a', slug: 'acme' },
    to_org: { id: 'b', slug: 'ulu-labs' },
    audit_ids: [],
  },
};

describe('projects rehome — prompt and provenance (anxiety F2/F4/F9)', () => {
  it('the confirmation names BOTH orgs, the source file, and the base URL; the success line repeats them', async () => {
    mockClient.projects.rehome.mockResolvedValue(moved);
    const out = captureOutput();
    await parse('projects', 'rehome', 'billing', '--to', 'ulu-labs');
    expect(mockedConfirm).toHaveBeenCalledTimes(1);
    const prompt = String(mockedConfirm.mock.calls[0]?.[0]);
    expect(prompt).toContain(
      'from org acme (workspace /Users/x/uluops/.uluops.json)',
    );
    expect(prompt).toContain('to org ulu-labs');
    expect(prompt).toContain('at http://localhost:3100/api/v1');
    expect(out.stdout()).toContain(
      'at http://localhost:3100/api/v1 [source: workspace /Users/x/uluops/.uluops.json]',
    );
    out.restore();
  });

  it('--to personal is refused with the real-slug hint before any prompt or request (code-auditor)', async () => {
    const out = captureOutput();
    await expect(
      parse('projects', 'rehome', 'billing', '--to', 'personal'),
    ).rejects.toThrow(/"personal" is not a slug/);
    expect(mockedConfirm).not.toHaveBeenCalled();
    expect(mockClient.projects.rehome).not.toHaveBeenCalled();
    out.restore();
  });
});

describe('describeOrgProvenance (anxiety F2/F3)', () => {
  it('workspace carries the file path; env distinguishes shell from env-file', () => {
    expect(
      describeOrgProvenance({
        org: 'acme',
        source: 'workspace',
        path: '/r/.uluops.json',
      }),
    ).toBe('workspace /r/.uluops.json');
    const prev = process.env.ULU_ORG_SLUG_FROM_ENV_FILE;
    delete process.env.ULU_ORG_SLUG_FROM_ENV_FILE;
    expect(describeOrgProvenance({ org: 'acme', source: 'env' })).toBe(
      'env (shell)',
    );
    process.env.ULU_ORG_SLUG_FROM_ENV_FILE = '1';
    expect(describeOrgProvenance({ org: 'acme', source: 'env' })).toMatch(
      /env-file/,
    );
    if (prev === undefined) delete process.env.ULU_ORG_SLUG_FROM_ENV_FILE;
    else process.env.ULU_ORG_SLUG_FROM_ENV_FILE = prev;
    expect(describeOrgProvenance({ org: undefined, source: 'personal' })).toBe(
      'personal',
    );
  });
});

describe('orgs audit-feed — remote text and --limit (code-auditor)', () => {
  it('strips ANSI/OSC/control bytes and flattens newlines in reason, project name and the fallback action', () => {
    const ESC = String.fromCharCode(27);
    const hostile = {
      id: 'e',
      actorId: null,
      action: 'org.updated',
      createdAt: '2026-09-15T10:00:00.000Z',
      details: {
        source: 'project_rehome',
        action: 'project.rehome_out',
        project_id: 'p',
        project_name: `bill${ESC}[2Jing`,
        from_org: { id: 'a', slug: 'acme' },
        to_org: { id: 'p', slug: 'me' },
        actor: 'u',
        reason: `line1\nline2 ${ESC}]0;pwned end`,
        via_admin_path: false,
        to_personal_org: true,
        visibility: 'org',
      },
    };
    const line = describeFeedEntry(hostile);
    expect(line).toBe(
      '"billing" moved to me (personal org) — line1 line2  end',
    );
    expect(line).not.toContain(ESC);
    expect(line).not.toContain('\n');
    expect(
      describeFeedEntry({
        id: 'e',
        actorId: null,
        action: 'org.updated',
        createdAt: '2026-09-15T10:00:00.000Z',
        details: { action: `x${ESC}[31m.y` },
      }),
    ).toBe('x.y');
  });

  it('--limit outside 1–100 is refused client-side with the range (the API 400s, it does not clamp)', async () => {
    const out = captureOutput();
    await expect(
      parse('orgs', 'audit-feed', 'acme', '--limit', '200'),
    ).rejects.toThrow(/between 1 and 100 \(got 200\)/);
    await expect(
      parse('orgs', 'audit-feed', 'acme', '--limit', '0'),
    ).rejects.toThrow(/between 1 and 100/);
    expect(mockClient.orgs.getVisibleAuditLog).not.toHaveBeenCalled();
    out.restore();
  });
});
