import { Command } from 'commander';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OpsCliContext } from '../../src/context.js';
import { captureOutput } from '../helpers/capture.js';
import {
  createMockOpsClient,
  createMockOpsContext,
} from '../helpers/command-harness.js';

vi.mock('../../src/context.js');

import {
  describeFeedEntry,
  registerOrgCommands,
} from '../../src/commands/orgs.js';
import { createOpsContext, handleOpsError } from '../../src/context.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);

type MockClient = ReturnType<typeof createMockOpsClient>;
let mockClient: MockClient;

beforeEach(() => {
  mockClient = createMockOpsClient();
  mockedCreateOpsContext.mockReturnValue(
    createMockOpsContext({
      client: mockClient as unknown as OpsCliContext['client'],
    }),
  );
  mockedHandleOpsError.mockImplementation((error) => {
    throw error;
  });
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerOrgCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

const rehomeOut = {
  id: 'e1',
  actorId: 'c12204a2-76d2-4ead-b549-8a29d3884c03',
  action: 'org.updated',
  createdAt: '2026-09-15T10:00:00.000Z',
  details: {
    source: 'project_rehome',
    action: 'project.rehome_out',
    project_id: 'p1',
    project_name: 'billing',
    from_org: { id: 'a', slug: 'acme' },
    to_org: { id: 'p', slug: 'alexself2' },
    actor: 'u1',
    reason: 'moving out',
    via_admin_path: false,
    to_personal_org: true,
    visibility: 'org',
  },
};
const other = {
  id: 'e2',
  actorId: null,
  action: 'org.updated',
  createdAt: '2026-09-15T09:00:00.000Z',
  details: { visibility: 'org', action: 'something.else' },
};

describe('orgs audit-feed', () => {
  it('fetches the named org with the default limit and renders one line per entry', async () => {
    mockClient.orgs.getVisibleAuditLog.mockResolvedValue({
      data: { entries: [rehomeOut, other] },
      count: 2,
      hasMore: false,
      nextCursor: null,
    });
    const output = captureOutput();
    await parse('orgs', 'audit-feed', 'acme');
    expect(mockClient.orgs.getVisibleAuditLog).toHaveBeenCalledWith('acme', {
      limit: 50,
    });
    expect(output.stdout()).toContain(
      '"billing" moved to alexself2 (personal org) — moving out',
    );
    expect(output.stdout()).toContain('something.else');
    expect(output.stdout()).toContain('system'); // null actor renders as system
    expect(output.stdout()).not.toContain('More:');
    output.restore();
  });

  it('passes --cursor/--limit through and prints the continuation command when there is more', async () => {
    mockClient.orgs.getVisibleAuditLog.mockResolvedValue({
      data: { entries: [rehomeOut] },
      count: 1,
      hasMore: true,
      nextCursor: '2026-09-15T10:00:00.000Z|e1',
    });
    const output = captureOutput();
    await parse('orgs', 'audit-feed', 'acme', '--cursor', 'c0', '--limit', '1');
    expect(mockClient.orgs.getVisibleAuditLog).toHaveBeenCalledWith('acme', {
      limit: 1,
      cursor: 'c0',
    });
    expect(output.stdout()).toContain('--cursor "2026-09-15T10:00:00.000Z|e1"');
    output.restore();
  });

  it('prints an empty message and emits the raw envelope in json mode', async () => {
    mockClient.orgs.getVisibleAuditLog.mockResolvedValue({
      data: { entries: [] },
      count: 0,
      hasMore: false,
      nextCursor: null,
    });
    const output = captureOutput();
    await parse('orgs', 'audit-feed', 'acme');
    expect(output.stdout()).toContain('No org-visible activity in acme');
    output.restore();

    mockedCreateOpsContext.mockReturnValue(
      createMockOpsContext({
        client: mockClient as unknown as OpsCliContext['client'],
        json: true,
      }),
    );
    const out2 = captureOutput();
    await parse('orgs', 'audit-feed', 'acme');
    expect(JSON.parse(out2.stdout()).count).toBe(0);
    out2.restore();
  });

  it('routes errors through handleOpsError', async () => {
    const error = new Error('API fail');
    mockClient.orgs.getVisibleAuditLog.mockRejectedValue(error);
    await expect(parse('orgs', 'audit-feed', 'acme')).rejects.toThrow(
      'API fail',
    );
    expect(mockedHandleOpsError).toHaveBeenCalledWith(
      error,
      expect.any(Object),
    );
  });
});

describe('describeFeedEntry', () => {
  it('reads direction from details.action and marks the admin path', () => {
    const incoming = {
      ...rehomeOut,
      details: {
        ...rehomeOut.details,
        action: 'project.rehome_in',
        via_admin_path: true,
        to_personal_org: false,
        reason: null,
      },
    };
    expect(describeFeedEntry(incoming)).toBe(
      '"billing" arrived from acme (platform admin)',
    );
    expect(describeFeedEntry(other)).toBe('something.else');
    expect(describeFeedEntry({ ...other, details: {} })).toBe('org.updated');
  });
});
