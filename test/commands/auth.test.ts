import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import { createPublicApiKey } from '../helpers/mock-factories.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');
const mockLogin = vi.fn();
const mockLogout = vi.fn();
vi.mock('@uluops/ops-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uluops/ops-sdk')>();
  return {
    ...actual,
    OpsClient: vi.fn().mockImplementation(() => ({
      login: mockLogin,
      logout: mockLogout,
    })),
    loadConfig: vi.fn().mockReturnValue({ baseUrl: 'http://localhost:3100', debug: false, credentials: {} }),
  };
});
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    renameSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => true),
    readFileSync: vi.fn(() => JSON.stringify({ default: { type: 'session', sessionToken: 'tok123' } })),
  };
});
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(() => '/tmp/test-home') };
});

import { createOpsContext, createUnauthenticatedContext, handleOpsError } from '../../src/context.js';
import { registerAuthCommands } from '../../src/commands/auth.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedCreateUnauthContext = vi.mocked(createUnauthenticatedContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);

type MockClient = ReturnType<typeof createMockOpsClient>;
let mockClient: MockClient;

beforeEach(() => {
  mockClient = createMockOpsClient();
  mockedCreateOpsContext.mockReturnValue(
    createMockOpsContext({ client: mockClient as unknown as OpsCliContext['client'] })
  );
  mockedCreateUnauthContext.mockReturnValue({
    baseUrl: 'http://localhost:3100',
    json: false,
    debug: false,
    quiet: true,
  } as ReturnType<typeof createUnauthenticatedContext>);
  mockedHandleOpsError.mockImplementation((error) => { throw error; });
  mockLogin.mockReset();
  mockLogout.mockReset().mockResolvedValue({ sessionsRevoked: 2 });
});

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  registerAuthCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

describe('auth login', () => {
  it('should require email and password', async () => {
    await expect(parse('auth', 'login')).rejects.toThrow('process.exit(1)');
  });

  it('should login and save credentials', async () => {
    mockLogin.mockResolvedValue({
      user: { email: 'test@example.com' },
      sessionToken: 'test-token',
      expiresAt: '2025-12-31T00:00:00Z',
    });
    const output = captureOutput();
    await parse('auth', 'login', '--email', 'test@example.com', '--password', 'secret');
    expect(mockLogin).toHaveBeenCalledWith('test@example.com', 'secret');
    expect(output.stdout()).toContain('Credentials saved');
    output.restore();
  });
});

describe('auth logout', () => {
  it('should logout, revoke sessions, and remove local credentials', async () => {
    const output = captureOutput();
    await parse('auth', 'logout');
    expect(output.stdout()).toContain('Revoked 2 server session(s)');
    expect(output.stdout()).toContain('Removed local credentials');
    output.restore();
  });
});

describe('auth whoami', () => {
  it('should display user info', async () => {
    mockClient.auth.getMe.mockResolvedValue({
      email: 'user@example.com',
      role: 'developer',
      subscriptionTier: 'pro',
      username: 'testuser',
    });
    const output = captureOutput();
    await parse('auth', 'whoami');
    expect(output.stdout()).toContain('Email: user@example.com');
    expect(output.stdout()).toContain('Role: developer');
    expect(output.stdout()).toContain('Username: testuser');
    output.restore();
  });
});

describe('auth api-keys list', () => {
  it('should display API keys table', async () => {
    mockClient.auth.listApiKeys.mockResolvedValue([
      createPublicApiKey({ name: 'prod-key' }),
    ]);
    const output = captureOutput();
    await parse('auth', 'api-keys', 'list');
    expect(output.stdout()).toContain('prod-key');
    output.restore();
  });

  it('should show message when empty', async () => {
    mockClient.auth.listApiKeys.mockResolvedValue([]);
    const output = captureOutput();
    await parse('auth', 'api-keys', 'list');
    expect(output.stdout()).toContain('No API keys found');
    output.restore();
  });
});

describe('auth api-keys create', () => {
  it('should create and display new key', async () => {
    mockClient.auth.createApiKey.mockResolvedValue({
      key: 'ulr_new-secret-key',
      apiKey: { id: 'key-123', name: 'my-key' },
    });
    const output = captureOutput();
    await parse('auth', 'api-keys', 'create', '--name', 'my-key');
    expect(output.stdout()).toContain('ulr_new-secret-key');
    expect(output.stdout()).toContain('Save this key');
    output.restore();
  });
});

describe('auth api-keys revoke', () => {
  it('should revoke API key', async () => {
    mockClient.auth.revokeApiKey.mockResolvedValue(undefined);
    const output = captureOutput();
    await parse('auth', 'api-keys', 'revoke', 'key-123');
    expect(mockClient.auth.revokeApiKey).toHaveBeenCalledWith('key-123');
    expect(output.stdout()).toContain('key-123');
    expect(output.stdout()).toContain('revoked');
    output.restore();
  });
});

describe('auth change-password', () => {
  it('should change password', async () => {
    mockClient.auth.changePassword.mockResolvedValue({ message: 'Password changed successfully' });
    const output = captureOutput();
    await parse('auth', 'change-password', '--current', 'oldpass', '--new-password', 'newpass');
    expect(mockClient.auth.changePassword).toHaveBeenCalledWith({
      currentPassword: 'oldpass',
      newPassword: 'newpass',
    });
    expect(output.stdout()).toContain('Password changed');
    output.restore();
  });
});

describe('auth profile', () => {
  it('should display profile', async () => {
    mockClient.auth.getProfile.mockResolvedValue({
      user: {
        email: 'me@example.com',
        role: 'developer',
        username: 'myuser',
        name: 'My Name',
        bio: 'A dev',
      },
    });
    const output = captureOutput();
    await parse('auth', 'profile');
    expect(output.stdout()).toContain('Email: me@example.com');
    expect(output.stdout()).toContain('Username: myuser');
    expect(output.stdout()).toContain('Name: My Name');
    output.restore();
  });
});

describe('auth update-profile', () => {
  it('should update profile fields', async () => {
    mockClient.auth.updateProfile.mockResolvedValue({
      user: { email: 'me@example.com' },
    });
    const output = captureOutput();
    await parse('auth', 'update-profile', '--username', 'newuser', '--bio', 'Updated bio');
    expect(mockClient.auth.updateProfile).toHaveBeenCalledWith(
      expect.objectContaining({ username: 'newuser', bio: 'Updated bio' })
    );
    expect(output.stdout()).toContain('Profile updated');
    output.restore();
  });

  it('should require at least one field', async () => {
    await expect(parse('auth', 'update-profile')).rejects.toThrow('process.exit(1)');
  });
});

describe('auth sessions list', () => {
  it('should list sessions', async () => {
    mockClient.auth.listSessions.mockResolvedValue([
      { id: '550e8400-e29b-41d4-a716-446655440000', ipAddress: '10.0.0.1', createdAt: '2025-01-15T10:00:00Z' },
    ]);
    const output = captureOutput();
    await parse('auth', 'sessions', 'list');
    expect(output.stdout()).toContain('Active sessions: 1');
    expect(output.stdout()).toContain('10.0.0.1');
    output.restore();
  });

  it('should show empty message', async () => {
    mockClient.auth.listSessions.mockResolvedValue([]);
    const output = captureOutput();
    await parse('auth', 'sessions', 'list');
    expect(output.stdout()).toContain('No active sessions');
    output.restore();
  });
});

describe('auth sessions revoke', () => {
  it('should revoke a session', async () => {
    mockClient.auth.revokeSession.mockResolvedValue(undefined);
    const output = captureOutput();
    await parse('auth', 'sessions', 'revoke', 'sess-123');
    expect(mockClient.auth.revokeSession).toHaveBeenCalledWith('sess-123');
    expect(output.stdout()).toContain('revoked');
    output.restore();
  });
});
