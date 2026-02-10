import { OpsClient, loadConfig as loadOpsConfig, OpsApiError } from '@uluops/ops-sdk';
import { RegistryClient } from '@uluops/registry-sdk';
import { RegistryApiError } from '@uluops/registry-sdk/errors';
import { loadConfig as loadRegistryConfig } from '@uluops/registry-sdk/config';
import {
  UluOpsClient,
  UluOpsError,
  ConfigurationError,
  ExecutionError,
  ModelNotFoundError,
  PreflightError,
  HashVerificationError,
  ParseError,
  ValidationError,
  WorkflowError,
  PipelineError,
  SdkApiError,
} from '@uluops/core';
import type { UluOpsConfig } from '@uluops/core';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { exitWithError, parseIntOption } from './utils.js';

/**
 * Global CLI options passed from commander
 */
export interface GlobalOptions {
  apiKey?: string;
  profile?: string;
  baseUrl?: string;
  json?: boolean;
  debug?: boolean;
  quiet?: boolean;
  timeout?: string;
}

/**
 * CLI execution context for ops commands
 */
export interface OpsCliContext {
  client: OpsClient;
  json: boolean;
  debug: boolean;
  quiet: boolean;
}

/**
 * CLI execution context for registry commands
 */
export interface RegistryCliContext {
  client: RegistryClient;
  json: boolean;
  debug: boolean;
  quiet: boolean;
}

/**
 * Options specific to exec commands
 */
export interface CoreExecOptions {
  localDefinitions?: string;
  registryUrl?: string;
  project?: string;
  tracking?: boolean;
}

/**
 * CLI execution context for core SDK commands (exec)
 */
export interface CoreCliContext {
  client: UluOpsClient;
  json: boolean;
  debug: boolean;
  quiet: boolean;
}

/**
 * Check if the stored session for a profile is expired.
 * Used to give a specific error message instead of generic "No credentials found".
 */
function isSessionExpired(profile: string): boolean {
  const credPath = join(homedir(), '.uluops', 'credentials.json');
  if (!existsSync(credPath)) return false;
  try {
    const stored = JSON.parse(readFileSync(credPath, 'utf-8'));
    const creds = stored[profile];
    if (creds?.type === 'session' && creds.expiresAt) {
      return new Date(creds.expiresAt) <= new Date();
    }
  } catch {
    // Ignore parse errors — handled elsewhere
  }
  return false;
}

/**
 * Validate that credentials exist, exiting with a helpful message if not.
 * Checks for expired sessions and provides appropriate guidance.
 */
function requireCredentials(hasCredentials: unknown, profile: string): void {
  if (hasCredentials) return;

  if (isSessionExpired(profile)) {
    exitWithError(
      `Session expired for profile "${profile}".\n` +
        'Run "ulu auth login" to re-authenticate.'
    );
  }
  exitWithError(
    'No credentials found.\n' +
      'Set ULUOPS_API_KEY environment variable, use --api-key flag,\n' +
      'or run "ulu auth login" to authenticate.'
  );
}

/**
 * Create CLI context for ops commands
 */
export function createOpsContext(options: GlobalOptions): OpsCliContext {
  const config = loadOpsConfig({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    profile: options.profile,
    debug: options.debug,
  });

  const hasCredentials =
    config.credentials.apiKey ||
    config.credentials.sessionToken ||
    (config.credentials.email && config.credentials.password);

  requireCredentials(hasCredentials, options.profile ?? 'default');

  const timeout = options.timeout ? parseIntOption(options.timeout, '--timeout') : undefined;

  let client: OpsClient;
  try {
    client = new OpsClient({
      apiKey: config.credentials.apiKey,
      sessionToken: config.credentials.sessionToken,
      email: config.credentials.email,
      password: config.credentials.password,
      baseUrl: config.baseUrl,
      debug: config.debug,
      timeout,
    });
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }

  return {
    client,
    json: options.json ?? false,
    debug: options.debug ?? false,
    quiet: options.quiet ?? false,
  };
}

/**
 * Create CLI context for registry commands
 */
export function createRegistryContext(options: GlobalOptions): RegistryCliContext {
  // Load ops config to get authBaseUrl (ops API URL for login/refresh)
  const opsConfig = loadOpsConfig({
    baseUrl: options.baseUrl,
    profile: options.profile,
    debug: options.debug,
  });

  const config = loadRegistryConfig({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    authBaseUrl: opsConfig.baseUrl,
    profile: options.profile,
    debug: options.debug,
  });

  const hasCredentials =
    config.credentials.apiKey ||
    config.credentials.sessionToken ||
    (config.credentials.email && config.credentials.password);

  requireCredentials(hasCredentials, options.profile ?? 'default');

  const timeout = options.timeout ? parseIntOption(options.timeout, '--timeout') : undefined;

  let client: RegistryClient;
  try {
    client = new RegistryClient({
      apiKey: config.credentials.apiKey,
      email: config.credentials.email,
      password: config.credentials.password,
      sessionToken: config.credentials.sessionToken,
      baseUrl: config.baseUrl,
      authBaseUrl: config.authBaseUrl,
      debug: config.debug,
      timeout,
    });
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }

  return {
    client,
    json: options.json ?? false,
    debug: options.debug ?? false,
    quiet: options.quiet ?? false,
  };
}

/**
 * Create context without requiring credentials (for commands like login)
 */
export function createUnauthenticatedContext(options: GlobalOptions): { baseUrl: string; json: boolean; debug: boolean; quiet: boolean } {
  const config = loadOpsConfig({
    baseUrl: options.baseUrl,
    profile: options.profile,
    debug: options.debug,
  });

  return {
    baseUrl: config.baseUrl,
    json: options.json ?? false,
    debug: options.debug ?? false,
    quiet: options.quiet ?? false,
  };
}

/**
 * Create CLI context for core SDK commands (exec)
 */
export function createCoreContext(options: GlobalOptions & CoreExecOptions): CoreCliContext {
  // Resolve API key from global options or env
  const opsConfig = loadOpsConfig({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    profile: options.profile,
    debug: options.debug,
  });

  const apiKey = opsConfig.credentials.apiKey ?? options.apiKey;
  if (!apiKey) {
    requireCredentials(false, options.profile ?? 'default');
  }

  const config: UluOpsConfig = {
    apiKey,
    localDefinitions: options.localDefinitions,
    trackingEnabled: options.tracking,
    defaultProject: options.project,
  };

  if (options.registryUrl) {
    config.registryUrl = options.registryUrl;
  }

  const timeout = options.timeout ? parseIntOption(options.timeout, '--timeout') : undefined;
  if (timeout) {
    config.timeout = timeout;
  }

  let client: UluOpsClient;
  try {
    client = new UluOpsClient(config);
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }

  return {
    client,
    json: options.json ?? false,
    debug: options.debug ?? false,
    quiet: options.quiet ?? false,
  };
}

/**
 * Hint overrides for domain-specific error messages
 */
interface ErrorHintOverrides {
  unauthorized?: string;
  notFound?: string;
  validation?: string;
}

/**
 * Print error details with contextual hints based on status code/error code.
 * Shared logic for both ops and registry error handlers.
 */
function printApiErrorDetails(
  error: { message: string; code?: string; statusCode?: number; details?: unknown; requestId?: string; toJSON(): unknown },
  ctx: { json: boolean; debug: boolean },
  hints: ErrorHintOverrides = {}
): void {
  if (ctx.json) {
    console.error(JSON.stringify(error.toJSON(), null, 2));
  } else {
    console.error(`Error: ${error.message}`);

    if (error.code === 'UNAUTHORIZED' || error.statusCode === 401) {
      console.error('\nHint: Your credentials may be invalid or expired.');
      console.error(hints.unauthorized ?? 'Run "ulu auth login" or check your ULUOPS_API_KEY.');
    } else if (error.code === 'NOT_FOUND' || error.statusCode === 404) {
      console.error(`\nHint: ${hints.notFound ?? 'The resource was not found. Check the name or ID.'}`);
    } else if (error.code === 'VALIDATION_ERROR' || error.statusCode === 400) {
      console.error(`\nHint: ${hints.validation ?? 'Invalid input. Check the command arguments.'}`);
    } else if (error.code === 'RATE_LIMITED' || error.statusCode === 429) {
      console.error('\nHint: Rate limited. Wait a moment and try again.');
    } else if (error.code === 'SERVICE_UNAVAILABLE' || error.statusCode === 503) {
      const retryAfter = (error.details as Record<string, unknown>)?.retryAfter;
      if (retryAfter) {
        console.error(`\nHint: Service unavailable. Try again in ${retryAfter} seconds.`);
      } else {
        console.error('\nHint: Service unavailable. Try again in a few moments.');
      }
    }

    if (ctx.debug && error.details) {
      console.error('\nDetails:', JSON.stringify(error.details, null, 2));
    }

    if (error.requestId) {
      console.error(`\nRequest ID: ${error.requestId}`);
    }
  }
}

/**
 * Handle ops errors consistently
 */
export function handleOpsError(error: unknown, ctx: Pick<OpsCliContext, 'json' | 'debug'>): never {
  if (error instanceof OpsApiError) {
    printApiErrorDetails(error, ctx);
    process.exit(1);
  }

  handleGenericError(error, ctx);
}

/**
 * Handle registry errors consistently
 */
export function handleRegistryError(error: unknown, ctx: Pick<RegistryCliContext, 'json' | 'debug'>): never {
  if (error instanceof RegistryApiError) {
    printApiErrorDetails(error, ctx, {
      unauthorized: 'Check your ULUOPS_API_KEY or session token.',
      notFound: 'The resource was not found. Check the type, name, and version.',
      validation: 'Invalid input. Check the command arguments or YAML file.',
    });
    process.exit(1);
  }

  handleGenericError(error, ctx);
}

/**
 * Handle core SDK errors consistently
 */
export function handleCoreError(error: unknown, ctx: Pick<CoreCliContext, 'json' | 'debug'>): never {
  if (error instanceof SdkApiError) {
    printApiErrorDetails(
      error as unknown as { message: string; code?: string; statusCode?: number; details?: unknown; requestId?: string; toJSON(): unknown },
      ctx,
      {
        unauthorized: 'Check your ULUOPS_API_KEY environment variable.',
        notFound: 'The definition was not found. Check the name and version.',
        validation: 'Invalid request. Check the command arguments.',
      },
    );
    process.exit(1);
  }

  if (error instanceof ConfigurationError) {
    console.error(`Error: ${error.message}`);
    console.error('\nHint: Check ULUOPS_API_KEY and ANTHROPIC_API_KEY environment variables.');
    process.exit(1);
  }

  if (error instanceof ModelNotFoundError) {
    console.error(`Error: ${error.message}`);
    console.error('\nHint: Use --model with a known alias (haiku, sonnet, opus) or provider:modelId format.');
    process.exit(1);
  }

  if (error instanceof PreflightError) {
    console.error(`Error: Pre-flight check "${error.check}" failed: ${error.message}`);
    if (ctx.debug && error.details) {
      console.error('\nDetails:', JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }

  if (error instanceof HashVerificationError) {
    console.error(`Error: ${error.message}`);
    console.error('\nHint: Definition integrity check failed. Use --local-definitions or re-fetch from registry.');
    process.exit(1);
  }

  if (error instanceof ParseError) {
    console.error(`Error: ${error.message}`);
    if (ctx.debug) {
      console.error('\nContent preview:', error.contentPreview);
    } else {
      console.error('\nHint: Run with --debug to see the raw output that failed to parse.');
    }
    process.exit(1);
  }

  if (error instanceof ValidationError) {
    console.error(`Error: ${error.message}`);
    if (error.code) {
      console.error(`\nValidation error code: ${error.code}`);
    }
    process.exit(1);
  }

  if (error instanceof ExecutionError) {
    console.error(`Error: ${error.message}`);
    console.error('\nHint: Check that the target path exists and the agent definition is valid.');
    if (ctx.debug && error.partialResult) {
      console.error('\nPartial result:', JSON.stringify(error.partialResult, null, 2));
    }
    process.exit(1);
  }

  if (error instanceof WorkflowError) {
    console.error(`Error: ${error.message}`);
    if (ctx.debug && error.context?.partialResult) {
      console.error('\nPartial result:', JSON.stringify(error.context.partialResult, null, 2));
    }
    process.exit(1);
  }

  if (error instanceof PipelineError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  if (error instanceof UluOpsError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  handleGenericError(error, ctx);
}

/**
 * Handle generic/network errors
 */
function handleGenericError(error: unknown, ctx: { json: boolean; debug: boolean }): never {
  if (ctx.json) {
    console.error(JSON.stringify({ error: String(error) }));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);

    if (message.includes('ECONNREFUSED') || message.includes('network')) {
      console.error('\nHint: Cannot connect to the API. Check if the server is running.');
    }

    if (ctx.debug && error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }

  process.exit(1);
}
