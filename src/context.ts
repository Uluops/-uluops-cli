import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { UluOpsConfig } from '@uluops/core';
import {
  ConfigurationError,
  ExecutionError,
  IntegrityError,
  ModelNotFoundError,
  ParseError,
  PipelineError,
  PreflightError,
  SdkApiError,
  SubmissionError,
  SubscriptionRequiredError,
  UluOpsClient,
  UluOpsError,
  WorkflowError,
} from '@uluops/core';
import {
  loadConfig as loadOpsConfig,
  OpsApiError,
  OpsClient,
} from '@uluops/ops-sdk';
import { RegistryClient } from '@uluops/registry-sdk';
import { loadConfig as loadRegistryConfig } from '@uluops/registry-sdk/config';
import { RegistryApiError } from '@uluops/registry-sdk/errors';
import {
  exitWithError,
  parseIntOption,
  createSecurityEventHandler,
} from './utils.js';

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
 * Shape of the credentials object both ops-sdk and registry-sdk loaders
 * return. Kept locally so this helper has no cross-SDK dependency.
 */
interface CredentialFields {
  apiKey?: string;
  sessionToken?: string;
  email?: string;
  password?: string;
}

/**
 * Returns true if any single auth method is fully populated.
 *
 * The CLI accepts three credential modes: a bearer API key, a session token
 * from a prior login, or an email+password pair. The pair must travel
 * together — email without password (or vice versa) is not a credential.
 */
function hasCredentials(c: CredentialFields): boolean {
  return Boolean(c.apiKey || c.sessionToken || (c.email && c.password));
}

/**
 * Validate that credentials exist, exiting with a helpful message if not.
 * Checks for expired sessions and provides appropriate guidance.
 */
function requireCredentials(present: boolean, profile: string): void {
  if (present) return;

  if (isSessionExpired(profile)) {
    exitWithError(
      `Session expired for profile "${profile}".\n` +
        'Run "ulu auth login" to re-authenticate.',
    );
  }
  exitWithError(
    'No credentials found.\n' +
      'Set ULUOPS_API_KEY environment variable, use --api-key flag,\n' +
      'or run "ulu auth login" to authenticate.\n' +
      'New here? Run "ulu auth register" to create an account.',
  );
}

/**
 * Create CLI context for ops commands
 */
/** Default HTTP timeout for CLI commands (30 seconds) */
const DEFAULT_TIMEOUT_MS = 30_000;

/**
 * Default timeout for core (exec) commands (10 minutes).
 *
 * Longer than the ops/registry HTTP default because exec wraps agent execution:
 * model cold-start, multi-step tool loops, and large-target analysis all push
 * single calls well past the 30s HTTP norm. Overrides the core SDK's own 5m
 * fallback so CLI users get a single, predictable ceiling regardless of SDK
 * version.
 */
const DEFAULT_CORE_TIMEOUT_MS = 600_000;

/**
 * Create CLI context for ops commands (projects, runs, issues, analytics).
 *
 * @param options - Global flags (API key, base URL, profile, display flags).
 * @returns An OpsCliContext holding the authenticated client and display flags.
 */
export function createOpsContext(options: GlobalOptions): OpsCliContext {
  const config = loadOpsConfig({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    profile: options.profile,
    debug: options.debug,
  });

  requireCredentials(
    hasCredentials(config.credentials),
    options.profile ?? 'default',
  );

  const timeout = options.timeout
    ? parseIntOption(options.timeout, '--timeout')
    : DEFAULT_TIMEOUT_MS;

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
      onSecurityEvent: createSecurityEventHandler({
        quiet: options.quiet,
        debug: options.debug,
      }),
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
 * Create CLI context for registry commands (definitions, versions, forks, etc.).
 *
 * @param options - Global flags (API key, base URL, profile, display flags).
 * @returns A RegistryCliContext holding the authenticated client and display flags.
 */
export function createRegistryContext(
  options: GlobalOptions,
): RegistryCliContext {
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

  requireCredentials(
    hasCredentials(config.credentials),
    options.profile ?? 'default',
  );

  const timeout = options.timeout
    ? parseIntOption(options.timeout, '--timeout')
    : DEFAULT_TIMEOUT_MS;

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
      onSecurityEvent: createSecurityEventHandler({
        quiet: options.quiet,
        debug: options.debug,
      }),
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
 * Create context without requiring credentials (for commands like login).
 *
 * @param options - Global flags; credentials are not required or validated.
 * @returns The resolved base URL and display flags, with no authenticated client.
 */
export function createUnauthenticatedContext(options: GlobalOptions): {
  baseUrl: string;
  json: boolean;
  debug: boolean;
  quiet: boolean;
} {
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
 * Create CLI context for core SDK commands (exec).
 *
 * @param options - Global flags plus exec-specific options (resolves API key,
 *   base URL, profile, and timeout).
 * @param modelOverride - When provided, overrides the model resolved from the
 *   UluOps config for this execution context (e.g. the `--model` flag).
 * @returns A CoreCliContext holding the authenticated client, submission URL,
 *   and display flags used by the exec commands.
 */
export function createCoreContext(
  options: GlobalOptions & CoreExecOptions,
  modelOverride?: string,
): CoreCliContext {
  // Resolve API key from global options or env
  const opsConfig = loadOpsConfig({
    apiKey: options.apiKey,
    baseUrl: options.baseUrl,
    profile: options.profile,
    debug: options.debug,
  });

  const apiKey = opsConfig.credentials.apiKey ?? options.apiKey;
  // API key is optional when using local definitions with tracking disabled —
  // the core SDK handles this gracefully (local-only execution, no remote calls).
  const localOnly = !!options.localDefinitions && options.tracking === false;
  if (!apiKey && !localOnly) {
    requireCredentials(false, options.profile ?? 'default');
  }

  const thinkingBudgetEnv = process.env['ULUOPS_THINKING_BUDGET'];
  const thinkingBudget = thinkingBudgetEnv
    ? parseInt(thinkingBudgetEnv, 10)
    : undefined;
  const config: UluOpsConfig = {
    apiKey,
    localDefinitions: options.localDefinitions,
    trackingEnabled: options.tracking,
    defaultProject: options.project,
    submissionUrl: process.env['ULUOPS_SUBMISSION_URL'] ?? opsConfig.baseUrl,
    debug: options.debug,
    ...(thinkingBudget !== undefined && !Number.isNaN(thinkingBudget)
      ? { defaultThinkingBudget: thinkingBudget }
      : {}),
  };

  if (modelOverride) {
    config.ai = { ...config.ai, modelOverride } as typeof config.ai;
  }

  if (options.registryUrl) {
    config.registryUrl = options.registryUrl;
  }

  const timeout = options.timeout
    ? parseIntOption(options.timeout, '--timeout')
    : DEFAULT_CORE_TIMEOUT_MS;
  config.timeout = timeout;
  config.onSecurityEvent = createSecurityEventHandler({
    quiet: options.quiet,
    debug: options.debug,
  });

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
/** Common shape for API error objects from any SDK */
interface ApiErrorLike {
  message: string;
  code?: string;
  statusCode?: number;
  details?: unknown;
  requestId?: string;
  toJSON(): unknown;
}

interface ErrorHintOverrides {
  unauthorized?: string;
  notFound?: string;
  validation?: string;
}

/**
 * Print error details with contextual hints based on status code/error code.
 * Shared logic for both ops and registry error handlers.
 */
function isAuthRelatedMessage(message: string): boolean {
  return /\b(api[\s_-]?key|auth(?:entication|orization)?|credential|token|login|unauthorized|forbidden)\b/i.test(
    message,
  );
}

const VALID_DEFINITION_TYPES = new Set([
  'agent',
  'command',
  'workflow',
  'pipeline',
]);

function extractAmbiguousTypes(message: string): string[] {
  const match = /multiple definitions named .+? found \(([^)]+)\)/i.exec(
    message,
  );
  if (!match?.[1]) return [];
  return match[1]
    .split(',')
    .map((t) => t.trim().toLowerCase())
    .filter((t) => VALID_DEFINITION_TYPES.has(t));
}

function printApiErrorDetails(
  error: ApiErrorLike,
  ctx: { json: boolean; debug: boolean },
  hints: ErrorHintOverrides = {},
): void {
  if (ctx.json) {
    console.error(JSON.stringify(error.toJSON(), null, 2));
  } else {
    console.error(`Error: ${error.message}`);

    if (error.code === 'UNAUTHORIZED' || error.statusCode === 401) {
      console.error('\nHint: Your credentials may be invalid or expired.');
      console.error(
        hints.unauthorized ??
          'Run "ulu auth login" or check your ULUOPS_API_KEY.',
      );
    } else if (error.code === 'NOT_FOUND' || error.statusCode === 404) {
      console.error(
        `\nHint: ${hints.notFound ?? 'The resource was not found. Check the name or ID.'}`,
      );
    } else if (error.code === 'VALIDATION_ERROR' || error.statusCode === 400) {
      console.error(
        `\nHint: ${hints.validation ?? 'Invalid input. Check the command arguments, or run the command with --help to see valid options and values.'}`,
      );
    } else if (
      error.code === 'SUBSCRIPTION_REQUIRED' ||
      error.statusCode === 402
    ) {
      const details = error.details as Record<string, unknown> | undefined;
      const requiredTier = details?.requiredTier as string | undefined;
      const upgradeUrl = details?.upgradeUrl as string | undefined;
      const sep = upgradeUrl?.includes('?') ? '&' : '?';
      const trackedUrl = upgradeUrl
        ? `${upgradeUrl}${sep}source=cli`
        : undefined;
      console.error('');
      console.error('┌─────────────────────────────────────────────────┐');
      console.error(
        `│  Subscription required${requiredTier ? `: ${requiredTier} tier or higher` : ''}`.padEnd(
          50,
        ) + '│',
      );
      console.error('│                                                 │');
      if (trackedUrl) {
        console.error(`│  Upgrade: ${trackedUrl}`.padEnd(50) + '│');
      }
      console.error('└─────────────────────────────────────────────────┘');
    } else if (error.code === 'RATE_LIMITED' || error.statusCode === 429) {
      console.error('\nHint: Rate limited. Wait a moment and try again.');
    } else if (
      error.code === 'SERVICE_UNAVAILABLE' ||
      error.statusCode === 503
    ) {
      const retryAfter = (error.details as Record<string, unknown>)?.retryAfter;
      if (retryAfter) {
        console.error(
          `\nHint: Service unavailable. Try again in ${retryAfter} seconds.`,
        );
      } else {
        console.error(
          '\nHint: Service unavailable. Try again in a few moments.',
        );
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
 * Handle ops errors consistently.
 *
 * @param error - The thrown value to classify and report.
 * @param ctx - Display flags (`json`, `debug`) that shape error output.
 * @returns Never returns — exits the process after printing the error.
 */
export function handleOpsError(
  error: unknown,
  ctx: Pick<OpsCliContext, 'json' | 'debug'>,
): never {
  if (error instanceof OpsApiError) {
    printApiErrorDetails(error, ctx);
    process.exit(1);
  }

  handleGenericError(error, ctx);
}

/**
 * Handle registry errors consistently.
 *
 * @param error - The thrown value to classify and report.
 * @param ctx - Display flags (`json`, `debug`) that shape error output.
 * @returns Never returns — exits the process after printing the error.
 */
export function handleRegistryError(
  error: unknown,
  ctx: Pick<RegistryCliContext, 'json' | 'debug'>,
): never {
  if (error instanceof RegistryApiError) {
    printApiErrorDetails(error, ctx, {
      unauthorized: 'Check your ULUOPS_API_KEY or session token.',
      notFound:
        'The resource was not found. Check the type, name, and version.',
      validation: 'Invalid input. Check the command arguments or YAML file.',
    });
    process.exit(1);
  }

  handleGenericError(error, ctx);
}

/**
 * Handle core SDK errors consistently.
 *
 * @param error - The thrown value to classify and report.
 * @param ctx - Display flags (`json`, `debug`) that shape error output.
 * @returns Never returns — exits the process after printing the error.
 */
export function handleCoreError(
  error: unknown,
  ctx: Pick<CoreCliContext, 'json' | 'debug'>,
): never {
  if (error instanceof SubscriptionRequiredError) {
    if (ctx.json) {
      console.error(JSON.stringify(error.toJSON(), null, 2));
    } else {
      const defLabel = error.definition?.name
        ? `"${error.definition.displayName ?? error.definition.name}"`
        : 'this definition';
      const trackedUrl = error.trackedUpgradeUrl('cli');
      console.error(
        `Error: ${defLabel} requires ${error.requiredTier} tier or higher (current: ${error.currentTier})`,
      );
      console.error('');
      console.error('┌─────────────────────────────────────────────────┐');
      console.error(
        `│  Upgrade to ${error.requiredTier} to access this content`.padEnd(
          50,
        ) + '│',
      );
      console.error('│                                                 │');
      if (trackedUrl) {
        console.error(`│  ${trackedUrl}`.padEnd(50) + '│');
      }
      console.error('└─────────────────────────────────────────────────┘');
    }
    process.exit(1);
  }

  if (error instanceof SdkApiError) {
    printApiErrorDetails(error as ApiErrorLike, ctx, {
      unauthorized: 'Check your ULUOPS_API_KEY environment variable.',
      notFound: 'The definition was not found. Check the name and version.',
      validation: 'Invalid request. Check the command arguments.',
    });
    process.exit(1);
  }

  if (error instanceof ConfigurationError) {
    console.error(`Error: ${error.message}`);
    if (isAuthRelatedMessage(error.message)) {
      console.error(
        '\nHint: Check ULUOPS_API_KEY and ANTHROPIC_API_KEY environment variables.',
      );
    } else {
      const types = extractAmbiguousTypes(error.message);
      if (types.length > 0) {
        console.error('\nHint: Specify type to disambiguate. Add one of:');
        for (const type of types) {
          console.error(`  --type ${type}`);
        }
      }
    }
    process.exit(1);
  }

  if (error instanceof ModelNotFoundError) {
    console.error(`Error: ${error.message}`);
    console.error(
      '\nHint: Use --model with a known alias (haiku, sonnet, opus) or provider:modelId format.',
    );
    process.exit(1);
  }

  if (error instanceof PreflightError) {
    console.error(
      `Error: Pre-flight check "${error.check}" failed: ${error.message}`,
    );
    if (ctx.debug && error.details) {
      console.error('\nDetails:', JSON.stringify(error.details, null, 2));
    }
    process.exit(1);
  }

  if (error instanceof ParseError) {
    console.error(`Error: ${error.message}`);
    if (ctx.debug) {
      console.error('\nContent preview:', error.contentPreview);
    } else {
      console.error(
        '\nHint: Run with --debug to see the raw output that failed to parse.',
      );
    }
    process.exit(1);
  }

  if (error instanceof SubmissionError) {
    console.error(`Error: ${error.message}`);
    if (error.code) {
      console.error(`\nSubmission error code: ${error.code}`);
    }
    console.error(
      '\nHint: Retry, or pass --no-tracking to run without tracker submission.',
    );
    process.exit(1);
  }

  if (error instanceof ExecutionError) {
    console.error(`Error: ${error.message}`);
    console.error(
      '\nHint: Check that the target path exists and the agent definition is valid.',
    );
    if (ctx.debug && error.partialResult) {
      console.error(
        '\nPartial result:',
        JSON.stringify(error.partialResult, null, 2),
      );
    }
    process.exit(1);
  }

  if (error instanceof WorkflowError) {
    console.error(`Error: ${error.message}`);
    if (ctx.debug && error.context?.partialResult) {
      console.error(
        '\nPartial result:',
        JSON.stringify(error.context.partialResult, null, 2),
      );
    }
    process.exit(1);
  }

  if (error instanceof PipelineError) {
    console.error(`Error: ${error.message}`);
    process.exit(1);
  }

  // IntegrityError extends UluOpsError — must precede the generic branch.
  // Exit code 4 is distinct from 1 (usage/config) and 2 (API/runtime) so
  // scripts/CI can detect a refused execution specifically.
  if (error instanceof IntegrityError) {
    if (ctx.json) {
      console.error(JSON.stringify(error.toJSON(), null, 2));
    } else {
      console.error(`Integrity check failed — execution refused.`);
      console.error(`  ${error.message}`);
      if (error.kind === 'unavailable') {
        console.error(
          `\nThis definition has no frozen rendered prompt to verify ` +
            `(workflow/pipeline, local, or content-gated). Omit --prompt-hash for it.`,
        );
      } else {
        if (error.expected !== undefined) {
          console.error(`\n  expected (${error.kind}): ${error.expected}`);
        }
        if (error.actual !== undefined) {
          console.error(`  actual   (${error.kind}): ${error.actual}`);
        }
      }
    }
    process.exit(4);
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
function handleGenericError(
  error: unknown,
  ctx: { json: boolean; debug: boolean },
): never {
  if (ctx.json) {
    console.error(JSON.stringify({ error: String(error) }));
  } else {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Error: ${message}`);

    if (message.includes('ECONNREFUSED') || message.includes('network')) {
      console.error(
        '\nHint: Cannot connect to the API. Check if the server is running.',
      );
    }

    if (ctx.debug && error instanceof Error && error.stack) {
      console.error('\nStack trace:', error.stack);
    }
  }

  process.exit(1);
}
