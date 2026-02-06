import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';
import { createMockOpsClient, createMockOpsContext } from '../helpers/command-harness.js';
import { createPublicApiKey } from '../helpers/mock-factories.js';
import type { OpsCliContext } from '../../src/context.js';

vi.mock('../../src/context.js');
vi.mock('@uluops/ops-sdk', () => ({
  OpsClient: vi.fn(),
}));
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
  };
});
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(() => '/tmp/test-home') };
});

import { createOpsContext, createUnauthenticatedContext, handleOpsError } from '../../src/context.js';
import { OpsClient } from '@uluops/ops-sdk';
import { registerAuthCommands } from '../../src/commands/auth.js';

const mockedCreateOpsContext = vi.mocked(createOpsContext);
const mockedCreateUnauthContext = vi.mocked(createUnauthenticatedContext);
const mockedHandleOpsError = vi.mocked(handleOpsError);
const mockedOpsClient = vi.mocked(OpsClient);

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
  mockedOpsClient.mockImplementation(() => ({
    login: vi.fn().mockResolvedValue({ sessionToken: 'test-token', expiresAt: '2025-12-31T00:00:00Z' }),
  }) as any);
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
    const output = captureOutput();
    await parse('auth', 'login', '--email', 'test@example.com', '--password', 'secret');
    expect(mockedOpsClient).toHaveBeenCalled();
    expect(output.stdout()).toContain('Credentials saved');
    output.restore();
  });
});

describe('auth logout', () => {
  it('should logout and show sessions revoked', async () => {
    mockClient.logout.mockResolvedValue({ sessionsRevoked: 2 });
    const output = captureOutput();
    await parse('auth', 'logout');
    expect(mockClient.logout).toHaveBeenCalled();
    expect(output.stdout()).toContain('Revoked 2 session(s)');
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
