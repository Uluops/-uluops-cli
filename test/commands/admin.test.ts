import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');

import { createOpsContext, handleOpsError } from '../../src/context.js';
import { registerAdminCommands } from '../../src/commands/admin.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);

type MockClient = ReturnType<typeof createMockOpsClient>;
let mockClient: MockClient;

beforeEach(() => {
  mockClient = createMockOpsClient();
  mockedCreateOpsContext.mockReturnValue(
    createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'] })
  );
  mockedHandleOpsError.mockImplementation((error) => { throw error; });
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerAdminCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('admin stats', () => {
  it('should display admin statistics', async () => {
    mockClient.admin.getStats.mockResolvedValue({
      totalUsers: 42,
      activeUsers: 30,
      totalSessions: 15,
      totalApiKeys: 8,
    });
    const output = captureOutput();
    await parse('admin', 'stats');
    expect(output.stdout()).toContain('Admin Statistics');
    expect(output.stdout()).toContain('42');
    expect(output.stdout()).toContain('30');
    output.restore();
  });
});

describe('admin users list', () => {
  it('should display users table', async () => {
    mockClient.admin.listUsers.mockResolvedValue({
      users: [{
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'admin@example.com',
        role: 'admin',
        subscriptionTier: 'pro',
        isActive: true,
      }],
      pagination: { page: 1, totalPages: 1, total: 1 },
    });
    const output = captureOutput();
    await parse('admin', 'users', 'list');
    expect(output.stdout()).toContain('admin@example.com');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.admin.listUsers.mockResolvedValue({
      users: [],
      pagination: { page: 1, totalPages: 0, total: 0 },
    });
    const output = captureOutput();
    await parse('admin', 'users', 'list');
    expect(output.stdout()).toContain('No users found');
    output.restore();
  });
});

describe('admin users get', () => {
  it('should display user details', async () => {
    mockClient.admin.getUser.mockResolvedValue({
      user: {
        id: 'user-123',
        email: 'dev@example.com',
        role: 'developer',
        subscriptionTier: 'free',
        isActive: true,
        createdAt: '2025-01-01T00:00:00Z',
      },
      stats: { sessionCount: 3, apiKeyCount: 1, lastLoginAt: '2025-01-15T10:00:00Z' },
    });
    const output = captureOutput();
    await parse('admin', 'users', 'get', 'user-123');
    expect(output.stdout()).toContain('dev@example.com');
    expect(output.stdout()).toContain('developer');
    output.restore();
  });
});

describe('admin users create', () => {
  it('should create user', async () => {
    mockClient.admin.createUser.mockResolvedValue({
      user: { id: 'new-user', email: 'new@example.com' },
      temporaryPassword: 'temp-pass-123',
    });
    const output = captureOutput();
    await parse('admin', 'users', 'create', '--email', 'new@example.com');
    expect(output.stdout()).toContain('new@example.com');
    expect(output.stdout()).toContain('temp-pass-123');
    output.restore();
  });
});

describe('admin users deactivate', () => {
  it('should deactivate user', async () => {
    mockClient.admin.deactivateUser.mockResolvedValue({
      user: { email: 'deactivated@example.com' },
    });
    const output = captureOutput();
    await parse('admin', 'users', 'deactivate', 'user-123');
    expect(mockClient.admin.deactivateUser).toHaveBeenCalledWith('user-123');
    expect(output.stdout()).toContain('deactivated');
    output.restore();
  });
});

describe('admin sessions list', () => {
  it('should display sessions table', async () => {
    mockClient.admin.listSessions.mockResolvedValue({
      sessions: [{
        id: '550e8400-e29b-41d4-a716-446655440000',
        userEmail: 'user@example.com',
        ipAddress: '192.168.1.1',
        createdAt: '2025-01-15T10:00:00Z',
      }],
      pagination: { page: 1, totalPages: 1, total: 1 },
    });
    const output = captureOutput();
    await parse('admin', 'sessions', 'list');
    expect(output.stdout()).toContain('user@example.com');
    expect(output.stdout()).toContain('192.168.1.1');
    output.restore();
  });
});

describe('admin sessions terminate', () => {
  it('should terminate session', async () => {
    mockClient.admin.terminateSession.mockResolvedValue({ message: 'Session terminated' });
    const output = captureOutput();
    await parse('admin', 'sessions', 'terminate', 'session-123');
    expect(mockClient.admin.terminateSession).toHaveBeenCalledWith('session-123');
    expect(output.stdout()).toContain('Session terminated');
    output.restore();
  });
});

describe('admin users bulk-deactivate', () => {
  it('should bulk deactivate users', async () => {
    mockClient.admin.bulkDeactivate.mockResolvedValue({ succeeded: 3, failed: 0 });
    const output = captureOutput();
    await parse('admin', 'users', 'bulk-deactivate', '--ids', 'user-1,user-2,user-3');
    expect(mockClient.admin.bulkDeactivate).toHaveBeenCalledWith(['user-1', 'user-2', 'user-3']);
    expect(output.stdout()).toContain('Deactivated');
    expect(output.stdout()).toContain('3 succeeded');
    output.restore();
  });
});

describe('admin keys list', () => {
  it('should display admin API keys table', async () => {
    mockClient.admin.listKeys.mockResolvedValue({
      keys: [{
        id: '550e8400-e29b-41d4-a716-446655440000',
        name: 'admin-key',
        userEmail: 'admin@example.com',
        lastUsedAt: null,
      }],
      pagination: { page: 1, totalPages: 1, total: 1 },
    });
    const output = captureOutput();
    await parse('admin', 'keys', 'list');
    expect(output.stdout()).toContain('admin-key');
    expect(output.stdout()).toContain('admin@example.com');
    output.restore();
  });
});
