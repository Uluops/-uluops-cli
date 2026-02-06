import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Command } from 'commander';
import { captureOutput } from '../helpers/capture.js';

// Mock fs and os before imports
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: vi.fn(() => '{}'),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
  };
});
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: vi.fn(() => '/tmp/test-home') };
});

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { registerConfigCommands } from '../../src/commands/config.js';

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);

function parse(...args: string[]) {
  const program = new Command();
  program.exitOverride();
  program.option('--profile <name>', 'Profile', 'default');
  program.option('--json', 'JSON output');
  registerConfigCommands(program);
  return program.parseAsync(['node', 'ulu', ...args]);
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedExistsSync.mockReturnValue(false);
});

describe('config list', () => {
  it('should show default profile when no config exists', async () => {
    const output = captureOutput();
    await parse('config', 'list');
    expect(output.stdout()).toContain('Profile: default');
    expect(output.stdout()).toContain('opsBaseUrl');
    expect(output.stdout()).toContain('(not set)');
    output.restore();
  });

  it('should show stored config values', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      _active: 'default',
      default: { opsBaseUrl: 'http://prod:3100/api/v1', debug: true },
    }));
    const output = captureOutput();
    await parse('config', 'list');
    expect(output.stdout()).toContain('http://prod:3100/api/v1');
    expect(output.stdout()).toContain('debug: true');
    output.restore();
  });

  it('should show env overrides', async () => {
    process.env.ULUOPS_BASE_URL = 'http://env-url:3100';
    const output = captureOutput();
    await parse('config', 'list');
    expect(output.stdout()).toContain('http://env-url:3100');
    expect(output.stdout()).toContain('(env)');
    output.restore();
    delete process.env.ULUOPS_BASE_URL;
  });
});

describe('config get', () => {
  it('should return a stored value', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      _active: 'default',
      default: { opsBaseUrl: 'http://myhost:3100' },
    }));
    const output = captureOutput();
    await parse('config', 'get', 'opsBaseUrl');
    expect(output.stdout().trim()).toBe('http://myhost:3100');
    output.restore();
  });

  it('should reject unknown keys', async () => {
    await expect(parse('config', 'get', 'invalidKey')).rejects.toThrow('process.exit(1)');
  });
});

describe('config set', () => {
  it('should write value to profiles file', async () => {
    mockedExistsSync.mockReturnValue(false);
    await parse('config', 'set', 'opsBaseUrl', 'http://new:3100');
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('profiles.json'),
      expect.stringContaining('"opsBaseUrl": "http://new:3100"')
    );
  });

  it('should coerce boolean values', async () => {
    await parse('config', 'set', 'debug', 'true');
    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      expect.stringContaining('profiles.json'),
      expect.stringContaining('"debug": true')
    );
  });

  it('should reject unknown keys', async () => {
    await expect(parse('config', 'set', 'badKey', 'value')).rejects.toThrow('process.exit(1)');
  });
});

describe('config unset', () => {
  it('should remove a key from the profile', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      _active: 'default',
      default: { opsBaseUrl: 'http://old:3100', debug: true },
    }));
    const output = captureOutput();
    await parse('config', 'unset', 'opsBaseUrl');
    expect(output.stdout()).toContain('Unset opsBaseUrl');
    // Should have written without opsBaseUrl
    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).not.toContain('opsBaseUrl');
    expect(written).toContain('debug');
    output.restore();
  });
});

describe('config profiles', () => {
  it('should list profiles with active marker', async () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify({
      _active: 'production',
      default: { opsBaseUrl: 'http://localhost:3100' },
      production: { opsBaseUrl: 'https://api.uluops.com' },
    }));
    const output = captureOutput();
    await parse('config', 'profiles');
    expect(output.stdout()).toContain('default');
    expect(output.stdout()).toContain('production *');
    output.restore();
  });

  it('should show message when no profiles', async () => {
    const output = captureOutput();
    await parse('config', 'profiles');
    expect(output.stdout()).toContain('No profiles configured');
    output.restore();
  });
});

describe('config use', () => {
  it('should switch active profile', async () => {
    const output = captureOutput();
    await parse('config', 'use', 'staging');
    expect(output.stdout()).toContain('Switched to profile: staging');
    const written = mockedWriteFileSync.mock.calls[0][1] as string;
    expect(written).toContain('"_active": "staging"');
    output.restore();
  });
});

describe('config path', () => {
  it('should show file paths', async () => {
    const output = captureOutput();
    await parse('config', 'path');
    expect(output.stdout()).toContain('profiles.json');
    expect(output.stdout()).toContain('credentials.json');
    expect(output.stdout()).toContain('.env');
    output.restore();
  });
});
