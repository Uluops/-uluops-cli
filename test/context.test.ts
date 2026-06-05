import { describe, it, expect, vi, beforeEach } from 'vitest';
import { captureOutput } from './helpers/capture.js';

// Mock node:fs to prevent isSessionExpired from reading real credentials
vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    existsSync: vi.fn(() => false),
    readFileSync: actual.readFileSync,
  };
});

// Mock the SDK modules — factories cannot reference outer variables (hoisted)
vi.mock('@uluops/ops-sdk', () => {
  class OpsApiError extends Error {
    constructor(
      public statusCode: number,
      message: string,
      public code: string = 'UNKNOWN',
      public details?: Record<string, unknown>,
      public requestId?: string
    ) {
      super(message);
      this.name = 'OpsApiError';
    }
    toJSON() {
      return { name: this.name, message: this.message, statusCode: this.statusCode, code: this.code, details: this.details, requestId: this.requestId };
    }
  }
  return {
    OpsClient: vi.fn().mockReturnValue({}),
    loadConfig: vi.fn(),
    OpsApiError,
  };
});

vi.mock('@uluops/registry-sdk', () => ({
  RegistryClient: vi.fn().mockReturnValue({}),
}));

vi.mock('@uluops/registry-sdk/errors', () => {
  class RegistryApiError extends Error {
    constructor(
      public statusCode: number,
      message: string,
      public code: string = 'UNKNOWN',
      public details?: Record<string, unknown>,
      public requestId?: string
    ) {
      super(message);
      this.name = 'RegistryApiError';
    }
    toJSON() {
      return { name: this.name, message: this.message, statusCode: this.statusCode, code: this.code };
    }
  }
  return { RegistryApiError };
});

vi.mock('@uluops/registry-sdk/config', () => ({
  loadConfig: vi.fn(),
}));

vi.mock('@uluops/core', () => {
  class SdkApiError extends Error {
    constructor(
      public statusCode: number,
      message: string,
      public code: string = 'UNKNOWN',
      public details?: Record<string, unknown>,
      public requestId?: string
    ) {
      super(message);
      this.name = 'SdkApiError';
    }
    toJSON() {
      return { name: this.name, message: this.message, statusCode: this.statusCode, code: this.code, details: this.details, requestId: this.requestId };
    }
  }
  class UluOpsError extends Error { constructor(message: string) { super(message); this.name = 'UluOpsError'; } }
  class ConfigurationError extends UluOpsError { constructor(message: string) { super(message); this.name = 'ConfigurationError'; } }
  class ModelNotFoundError extends UluOpsError { constructor(message: string) { super(message); this.name = 'ModelNotFoundError'; } }
  class PreflightError extends UluOpsError {
    check = 'target-exists';
    details?: Record<string, unknown>;
    constructor(message: string, check?: string, details?: Record<string, unknown>) {
      super(message);
      this.name = 'PreflightError';
      if (check) this.check = check;
      this.details = details;
    }
  }
  class ParseError extends UluOpsError {
    contentPreview?: string;
    constructor(message: string, contentPreview?: string) { super(message); this.name = 'ParseError'; this.contentPreview = contentPreview; }
  }
  class SubmissionError extends UluOpsError {
    code?: string;
    constructor(message: string, code?: string) { super(message); this.name = 'SubmissionError'; this.code = code; }
  }
  class ExecutionError extends UluOpsError {
    partialResult?: unknown;
    constructor(message: string, partialResult?: unknown) { super(message); this.name = 'ExecutionError'; this.partialResult = partialResult; }
  }
  class WorkflowError extends UluOpsError {
    context?: { partialResult?: unknown };
    constructor(message: string, context?: { partialResult?: unknown }) { super(message); this.name = 'WorkflowError'; this.context = context; }
  }
  class PipelineError extends UluOpsError { constructor(message: string) { super(message); this.name = 'PipelineError'; } }
  class SubscriptionRequiredError extends UluOpsError {
    definition?: { name: string; displayName?: string };
    requiredTier: string;
    currentTier: string;
    constructor(message: string, opts?: { definition?: { name: string; displayName?: string }; requiredTier?: string; currentTier?: string }) {
      super(message);
      this.name = 'SubscriptionRequiredError';
      this.definition = opts?.definition;
      this.requiredTier = opts?.requiredTier ?? 'pro';
      this.currentTier = opts?.currentTier ?? 'free';
    }
    trackedUpgradeUrl(source: string) { return `https://uluops.ai/upgrade?source=${source}`; }
    toJSON() { return { error: this.message, requiredTier: this.requiredTier, currentTier: this.currentTier }; }
  }

  return {
    UluOpsClient: vi.fn().mockReturnValue({}),
    UluOpsError, SdkApiError, ConfigurationError, ModelNotFoundError,
    PreflightError, ParseError, SubmissionError,
    ExecutionError, WorkflowError, PipelineError, SubscriptionRequiredError,
  };
});

// Import after mocks are set up
import { OpsClient, loadConfig as loadOpsConfig, OpsApiError } from '@uluops/ops-sdk';
import { RegistryClient } from '@uluops/registry-sdk';
import { RegistryApiError } from '@uluops/registry-sdk/errors';
import { loadConfig as loadRegistryConfig } from '@uluops/registry-sdk/config';
import {
  UluOpsClient,
  SdkApiError, ConfigurationError, ModelNotFoundError, PreflightError,
  ParseError, SubmissionError as CoreSubmissionError,
  ExecutionError, WorkflowError, PipelineError, UluOpsError,
  SubscriptionRequiredError,
} from '@uluops/core';
import {
  createOpsContext,
  createRegistryContext,
  createCoreContext,
  createUnauthenticatedContext,
  handleOpsError,
  handleRegistryError,
  handleCoreError,
} from '../src/context.js';

const mockedLoadOpsConfig = vi.mocked(loadOpsConfig);
const mockedLoadRegistryConfig = vi.mocked(loadRegistryConfig);
const mockedOpsClient = vi.mocked(OpsClient);
const mockedRegistryClient = vi.mocked(RegistryClient);
const mockedUluOpsClient = vi.mocked(UluOpsClient);

beforeEach(() => {
  vi.clearAllMocks();
});

describe('createOpsContext', () => {
  it('should return context with correct flags', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadOpsConfig>);

    const ctx = createOpsContext({ json: true, debug: true, quiet: true });
    expect(ctx.json).toBe(true);
    expect(ctx.debug).toBe(true);
    expect(ctx.quiet).toBe(true);
  });

  it('should create client with API key credentials', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_my-key' },
    } as ReturnType<typeof loadOpsConfig>);

    createOpsContext({});
    expect(mockedOpsClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiKey: 'ulr_my-key' })
    );
  });

  it('should exit when no credentials found', () => {
    const output = captureOutput();
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadOpsConfig>);

    expect(() => createOpsContext({})).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('No credentials found');
    output.restore();
  });

  it('should accept sessionToken as credentials', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { sessionToken: 'jwt-token' },
    } as ReturnType<typeof loadOpsConfig>);

    createOpsContext({});
    expect(mockedOpsClient).toHaveBeenCalledWith(
      expect.objectContaining({ sessionToken: 'jwt-token' })
    );
  });

  it('should accept email+password as credentials', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { email: 'test@example.com', password: 'secret' },
    } as ReturnType<typeof loadOpsConfig>);

    createOpsContext({});
    expect(mockedOpsClient).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'test@example.com', password: 'secret' })
    );
  });

  it('should pass timeout to client when provided', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadOpsConfig>);

    createOpsContext({ timeout: '60000' });
    expect(mockedOpsClient).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 60000 })
    );
  });

  it('should use default timeout (30s) when not provided', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadOpsConfig>);

    createOpsContext({});
    expect(mockedOpsClient).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 30000 })
    );
  });
});

describe('createRegistryContext', () => {
  it('should return context with client', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadOpsConfig>);
    mockedLoadRegistryConfig.mockReturnValue({
      baseUrl: 'http://localhost:3200',
      authBaseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadRegistryConfig>);

    const ctx = createRegistryContext({ json: true });
    expect(ctx.json).toBe(true);
    expect(ctx.client).toBeDefined();
  });

  it('should exit when no credentials found', () => {
    const output = captureOutput();
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadOpsConfig>);
    mockedLoadRegistryConfig.mockReturnValue({
      baseUrl: 'http://localhost:3200',
      authBaseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadRegistryConfig>);

    expect(() => createRegistryContext({})).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('No credentials found');
    output.restore();
  });

  it('should pass timeout to client when provided', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadOpsConfig>);
    mockedLoadRegistryConfig.mockReturnValue({
      baseUrl: 'http://localhost:3200',
      authBaseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadRegistryConfig>);

    createRegistryContext({ timeout: '45000' });
    expect(mockedRegistryClient).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 45000 })
    );
  });

  it('should use default timeout (30s) when not provided', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadOpsConfig>);
    mockedLoadRegistryConfig.mockReturnValue({
      baseUrl: 'http://localhost:3200',
      authBaseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadRegistryConfig>);

    createRegistryContext({});
    expect(mockedRegistryClient).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 30000 })
    );
  });
});

describe('createUnauthenticatedContext', () => {
  it('should return baseUrl and flags without credential check', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadOpsConfig>);

    const ctx = createUnauthenticatedContext({ json: true, quiet: true });
    expect(ctx.baseUrl).toBe('http://localhost:3100');
    expect(ctx.json).toBe(true);
    expect(ctx.quiet).toBe(true);
  });
});

describe('createCoreContext', () => {
  it('should pass timeout to client when provided', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadOpsConfig>);

    createCoreContext({ timeout: '30000' });
    expect(mockedUluOpsClient).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 30000 })
    );
  });

  it('should use default timeout (10m) when not provided', () => {
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: { apiKey: 'ulr_test-key' },
    } as ReturnType<typeof loadOpsConfig>);

    createCoreContext({});
    expect(mockedUluOpsClient).toHaveBeenCalledWith(
      expect.objectContaining({ timeout: 600_000 })
    );
  });

  it('should exit when no API key found', () => {
    const output = captureOutput();
    mockedLoadOpsConfig.mockReturnValue({
      baseUrl: 'http://localhost:3100',
      debug: false,
      credentials: {},
    } as ReturnType<typeof loadOpsConfig>);

    expect(() => createCoreContext({})).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('No credentials found');
    output.restore();
  });
});

describe('handleOpsError', () => {
  it('should show error message and exit', () => {
    const output = captureOutput();
    const error = new OpsApiError(400, 'Bad request', 'VALIDATION_ERROR');

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Error: Bad request');
    output.restore();
  });

  it('should show JSON in json mode', () => {
    const output = captureOutput();
    const error = new OpsApiError(400, 'Bad request', 'VALIDATION_ERROR');

    expect(() => handleOpsError(error, { json: true, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('"statusCode": 400');
    output.restore();
  });

  it('should show auth hint for 401', () => {
    const output = captureOutput();
    const error = new OpsApiError(401, 'Unauthorized', 'UNAUTHORIZED');

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('credentials may be invalid');
    output.restore();
  });

  it('should show not found hint for 404', () => {
    const output = captureOutput();
    const error = new OpsApiError(404, 'Not found', 'NOT_FOUND');

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('not found');
    output.restore();
  });

  it('should show rate limit hint for 429', () => {
    const output = captureOutput();
    const error = new OpsApiError(429, 'Rate limited', 'RATE_LIMITED');

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Rate limited');
    output.restore();
  });

  it('should show service unavailable hint for 503', () => {
    const output = captureOutput();
    const error = new OpsApiError(503, 'Service unavailable', 'SERVICE_UNAVAILABLE');

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Service unavailable');
    expect(output.stderr()).toContain('Try again');
    output.restore();
  });

  it('should show retry-after value for 503 when available', () => {
    const output = captureOutput();
    const error = new OpsApiError(503, 'Service unavailable', 'SERVICE_UNAVAILABLE', { retryAfter: 30 });

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Try again in 30 seconds');
    output.restore();
  });

  it('should show details in debug mode', () => {
    const output = captureOutput();
    const error = new OpsApiError(400, 'Bad request', 'VALIDATION_ERROR', { field: 'name' });

    expect(() => handleOpsError(error, { json: false, debug: true })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Details:');
    expect(output.stderr()).toContain('name');
    output.restore();
  });

  it('should show requestId when present', () => {
    const output = captureOutput();
    const error = new OpsApiError(500, 'Server error', 'INTERNAL', undefined, 'req-abc-123');

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Request ID: req-abc-123');
    output.restore();
  });

  it('should handle non-API errors with network hint', () => {
    const output = captureOutput();
    const error = new Error('ECONNREFUSED');

    expect(() => handleOpsError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('ECONNREFUSED');
    expect(output.stderr()).toContain('Cannot connect');
    output.restore();
  });

  it('should show stack trace for generic errors in debug mode', () => {
    const output = captureOutput();
    const error = new Error('Something broke');

    expect(() => handleOpsError(error, { json: false, debug: true })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Stack trace:');
    output.restore();
  });

  it('should show JSON for generic errors in json mode', () => {
    const output = captureOutput();
    const error = new Error('Boom');

    expect(() => handleOpsError(error, { json: true, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('"error"');
    output.restore();
  });
});

describe('handleRegistryError', () => {
  it('should show error message for RegistryApiError', () => {
    const output = captureOutput();
    const error = new RegistryApiError(404, 'Definition not found', 'NOT_FOUND');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Definition not found');
    output.restore();
  });

  it('should show JSON in json mode', () => {
    const output = captureOutput();
    const error = new RegistryApiError(400, 'Invalid YAML', 'VALIDATION_ERROR');

    expect(() => handleRegistryError(error, { json: true, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('"statusCode": 400');
    output.restore();
  });

  it('should fall through to generic handler for non-registry errors', () => {
    const output = captureOutput();
    const error = new Error('Network fail');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Network fail');
    output.restore();
  });

  it('should show registry-specific auth hint for 401', () => {
    const output = captureOutput();
    const error = new RegistryApiError(401, 'Unauthorized', 'UNAUTHORIZED');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('ULUOPS_API_KEY or session token');
    output.restore();
  });

  it('should show registry-specific not found hint for 404', () => {
    const output = captureOutput();
    const error = new RegistryApiError(404, 'Not found', 'NOT_FOUND');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('type, name, and version');
    output.restore();
  });

  it('should show registry-specific validation hint for 400', () => {
    const output = captureOutput();
    const error = new RegistryApiError(400, 'Bad input', 'VALIDATION_ERROR');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('YAML file');
    output.restore();
  });

  it('should show rate limit hint for 429', () => {
    const output = captureOutput();
    const error = new RegistryApiError(429, 'Too many requests', 'RATE_LIMITED');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Rate limited');
    output.restore();
  });

  it('should show service unavailable hint for 503', () => {
    const output = captureOutput();
    const error = new RegistryApiError(503, 'Service unavailable', 'SERVICE_UNAVAILABLE');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Service unavailable');
    expect(output.stderr()).toContain('Try again');
    output.restore();
  });

  it('should show retry-after value for 503 when available', () => {
    const output = captureOutput();
    const error = new RegistryApiError(503, 'Service unavailable', 'SERVICE_UNAVAILABLE', { retryAfter: 60 });

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Try again in 60 seconds');
    output.restore();
  });

  it('should show details in debug mode', () => {
    const output = captureOutput();
    const error = new RegistryApiError(400, 'Bad', 'VALIDATION_ERROR', { field: 'yaml' });

    expect(() => handleRegistryError(error, { json: false, debug: true })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Details:');
    expect(output.stderr()).toContain('yaml');
    output.restore();
  });

  it('should show requestId when present', () => {
    const output = captureOutput();
    const error = new RegistryApiError(500, 'Error', 'INTERNAL', undefined, 'req-xyz-789');

    expect(() => handleRegistryError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Request ID: req-xyz-789');
    output.restore();
  });
});

describe('handleCoreError', () => {
  it('should handle SdkApiError with core-specific hints', () => {
    const output = captureOutput();
    const error = new SdkApiError(401, 'Unauthorized', 'UNAUTHORIZED');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('ULUOPS_API_KEY');
    output.restore();
  });

  it('should handle SdkApiError 404 with definition hint', () => {
    const output = captureOutput();
    const error = new SdkApiError(404, 'Not found', 'NOT_FOUND');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('definition was not found');
    output.restore();
  });

  it('should handle SdkApiError 503 with service unavailable hint', () => {
    const output = captureOutput();
    const error = new SdkApiError(503, 'Service unavailable', 'SERVICE_UNAVAILABLE');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Service unavailable');
    expect(output.stderr()).toContain('Try again');
    output.restore();
  });

  it('should handle SdkApiError 503 with retry-after value', () => {
    const output = captureOutput();
    const error = new SdkApiError(503, 'Service unavailable', 'SERVICE_UNAVAILABLE', { retryAfter: 15 });

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Try again in 15 seconds');
    output.restore();
  });

  it('should handle ConfigurationError with auth-related hint when message mentions credentials', () => {
    const output = captureOutput();
    const error = new ConfigurationError('Missing API key');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Missing API key');
    expect(output.stderr()).toContain('ANTHROPIC_API_KEY');
    output.restore();
  });

  it('should handle ConfigurationError with disambiguation hint for ambiguous-name errors', () => {
    const output = captureOutput();
    const error = new ConfigurationError(
      'Multiple definitions named "socrates-explorer" found (agent, command). Specify type explicitly: resolve("socrates-explorer", version, "command")',
    );

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Multiple definitions named');
    expect(output.stderr()).toContain('--type');
    expect(output.stderr()).not.toContain('ANTHROPIC_API_KEY');
    output.restore();
  });

  it('should handle ConfigurationError without any hint for unrelated messages', () => {
    const output = captureOutput();
    const error = new ConfigurationError('Invalid definition name: "../etc/passwd"');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Invalid definition name');
    expect(output.stderr()).not.toContain('ANTHROPIC_API_KEY');
    expect(output.stderr()).not.toContain('--type');
    output.restore();
  });

  it('should handle ModelNotFoundError', () => {
    const output = captureOutput();
    const error = new ModelNotFoundError('Model "bad-model" not found');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('bad-model');
    expect(output.stderr()).toContain('haiku, sonnet, opus');
    output.restore();
  });

  it('should handle PreflightError', () => {
    const output = captureOutput();
    const error = new PreflightError('Target directory not found', 'target-exists');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Pre-flight check');
    expect(output.stderr()).toContain('target-exists');
    output.restore();
  });

  it('should handle PreflightError with details in debug mode', () => {
    const output = captureOutput();
    const error = new PreflightError('Check failed', 'api-key', { checked: true });

    expect(() => handleCoreError(error, { json: false, debug: true })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Details:');
    output.restore();
  });

  it('should handle ParseError with debug preview', () => {
    const output = captureOutput();
    const error = new ParseError('Failed to parse JSON', '{"broken');

    expect(() => handleCoreError(error, { json: false, debug: true })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Content preview:');
    expect(output.stderr()).toContain('{"broken');
    output.restore();
  });

  it('should handle ParseError without debug showing hint', () => {
    const output = captureOutput();
    const error = new ParseError('Failed to parse');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('--debug');
    output.restore();
  });

  it('should handle SubmissionError with code', () => {
    const output = captureOutput();
    const error = new CoreSubmissionError('Schema invalid', 'SCHEMA_ERROR');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Schema invalid');
    expect(output.stderr()).toContain('SCHEMA_ERROR');
    output.restore();
  });

  it('should handle ExecutionError', () => {
    const output = captureOutput();
    const error = new ExecutionError('Agent timed out');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Agent timed out');
    expect(output.stderr()).toContain('target path');
    output.restore();
  });

  it('should handle ExecutionError with partial result in debug', () => {
    const output = captureOutput();
    const error = new ExecutionError('Failed mid-execution', { score: 42 });

    expect(() => handleCoreError(error, { json: false, debug: true })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Partial result:');
    output.restore();
  });

  it('should handle WorkflowError', () => {
    const output = captureOutput();
    const error = new WorkflowError('Phase 2 failed');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Phase 2 failed');
    output.restore();
  });

  it('should handle PipelineError', () => {
    const output = captureOutput();
    const error = new PipelineError('Pipeline aborted');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Pipeline aborted');
    output.restore();
  });

  it('should handle generic UluOpsError', () => {
    const output = captureOutput();
    const error = new UluOpsError('Unknown SDK error');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('Unknown SDK error');
    output.restore();
  });

  it('should fall through to generic handler for non-SDK errors', () => {
    const output = captureOutput();
    const error = new Error('ECONNREFUSED');

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('ECONNREFUSED');
    output.restore();
  });

  it('should render upgrade box for SubscriptionRequiredError with definition', () => {
    const output = captureOutput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = new (SubscriptionRequiredError as any)('Subscription required', {
      definition: { name: 'code-validator', displayName: 'Code Validator' },
      requiredTier: 'professional',
      currentTier: 'free',
    });

    expect(() => handleCoreError(error, { json: false, debug: false })).toThrow('process.exit(1)');
    expect(output.stderr()).toContain('"Code Validator"');
    expect(output.stderr()).toContain('professional');
    expect(output.stderr()).toContain('Upgrade to');
    expect(output.stderr()).toContain('uluops.ai/upgrade');
    output.restore();
  });

  it('should output JSON for SubscriptionRequiredError in json mode', () => {
    const output = captureOutput();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const error = new (SubscriptionRequiredError as any)('Subscription required', {
      requiredTier: 'pro',
      currentTier: 'free',
    });

    expect(() => handleCoreError(error, { json: true, debug: false })).toThrow('process.exit(1)');
    const parsed = JSON.parse(output.stderr());
    expect(parsed.requiredTier).toBe('pro');
    expect(parsed.currentTier).toBe('free');
    output.restore();
  });
});
