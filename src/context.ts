import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import type { ApiErrorLike, UluOpsConfig } from '@uluops/core';
import {
  ConfigurationError,
  ExecutionError,
  IntegrityError,
  // Identity-free API-error guard. The CLI used to define its own byte-identical
  // copy of this because core exposed it only on the './errors' subpath; core
  // 0.41.0 exports it from the root, so the duplicate is gone. Do NOT replace
  // this with `instanceof SdkApiError` — that is structurally always false here,
  // since registry-sdk/ops-sdk resolve a different exact sdk-core copy.
  isApiErrorLike,
  ModelNotFoundError,
  ParseError,
  PipelineError,
  PreflightError,
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
  resolveWorkspaceOrg,
  type WorkspaceOrgResolution,
  type WorkspaceOrgSource,
} from '@uluops/ops-sdk';
import { RegistryClient } from '@uluops/registry-sdk';
import { loadConfig as loadRegistryConfig } from '@uluops/registry-sdk/config';
import { RegistryApiError } from '@uluops/registry-sdk/errors';
import {
  createSecurityEventHandler,
  exitWithError,
  parseIntOption,
} from './utils.js';

/**
 * Global CLI options passed from commander
 */
export interface GlobalOptions {
  apiKey?: string;
  profile?: string;
  baseUrl?: string;
  /** `--org <slug>`: the org this invocation acts in (project-org-routing-and-rehome spec §3.4). */
  org?: string;
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
  /** Resolved base URL — printed beside the org, because an org slug is server-relative. */
  baseUrl: string;
  /** The org this invocation acts in (`undefined` = the key holder's personal org) and where it came from. */
  org: string | undefined;
  orgSource: WorkspaceOrgSource;
  /**
   * Provenance as a human reads it: `explicit` | `workspace <path>` |
   * `env (shell)` | `env-file (./.env or ~/.uluops/.env)` | `personal`. The
   * resolver's `env` collapses "my shell" and "a file in this repo" and
   * `workspace` says nothing about WHICH `.uluops.json` answered in a nested
   * checkout; the prompt before a move needs both (anxiety-reader F2/F3).
   */
  orgProvenance: string;
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

  // Org routing (spec §3.4 / D13): --org > nearest .uluops.json above cwd >
  // ULUOPS_ORG_SLUG > personal. The SDK resolves it so the MCP and this CLI
  // cannot drift; a malformed or forbidden workspace file is a loud exit here,
  // not a silently wrong org.
  const resolved = resolveOrg(options);

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
      orgSlug: resolved.org,
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
    baseUrl: config.baseUrl,
    org: resolved.org,
    orgSource: resolved.source,
    orgProvenance: describeOrgProvenance(resolved),
  };
}

/** Render where the org came from with enough detail to catch the wrong source. */
export function describeOrgProvenance(
  resolved: WorkspaceOrgResolution,
): string {
  switch (resolved.source) {
    case 'workspace':
      return resolved.path !== undefined
        ? `workspace ${resolved.path}`
        : 'workspace';
    case 'env':
      return process.env.ULU_ORG_SLUG_FROM_ENV_FILE === '1'
        ? 'env-file — ULUOPS_ORG_SLUG came from ./.env or ~/.uluops/.env, not your shell'
        : 'env (shell)';
    default:
      return resolved.source;
  }
}

/**
 * Resolve the org for this invocation through the SDK's D13 resolver, exiting
 * with the resolver's own message on a malformed or forbidden `.uluops.json`.
 */
function resolveOrg(
  options: Pick<GlobalOptions, 'org'>,
): WorkspaceOrgResolution {
  try {
    return resolveWorkspaceOrg({
      explicit: options.org,
      cwd: process.cwd(),
      env: process.env,
    });
  } catch (error) {
    exitWithError(error instanceof Error ? error.message : String(error));
  }
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

  const thinkingBudgetEnv = process.env.ULUOPS_THINKING_BUDGET;
  const thinkingBudget = thinkingBudgetEnv
    ? parseInt(thinkingBudgetEnv, 10)
    : undefined;
  // Org routing (spec §3.5): `ulu exec` resolves the org the same way the ops
  // commands do (--org > .uluops.json > ULUOPS_ORG_SLUG) and hands it to core,
  // so the two writers a CLI user can reach agree. Core resolves env itself,
  // but only the CLI knows the checkout.
  const resolvedOrg = resolveOrg(options);
  const config: UluOpsConfig = {
    apiKey,
    localDefinitions: options.localDefinitions,
    trackingEnabled: options.tracking,
    defaultProject: options.project,
    submissionUrl: process.env.ULUOPS_SUBMISSION_URL ?? opsConfig.baseUrl,
    ...(resolvedOrg.org !== undefined ? { orgSlug: resolvedOrg.org } : {}),
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
/**
 * Core's `ApiErrorLike` is the MINIMUM structural contract shared by every SDK copy —
 * `statusCode` + `message`, the two fields the guard actually tests. Individual SDK errors
 * additionally carry `details` and a `toJSON()` serializer, which this CLI reads when
 * present.
 *
 * Both are declared OPTIONAL here. The CLI's previous local copy of this interface declared
 * `toJSON(): unknown` as REQUIRED, which was never true of every error reaching this path —
 * the guard only ever checked `statusCode` and `message`, so a serializer-less error
 * satisfied the type while being unable to honour it. Optional + a call-site guard is the
 * honest shape.
 */
interface DetailedApiError extends ApiErrorLike {
  details?: unknown;
  toJSON?(): unknown;
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

/** Typed exec subcommand invocation per definition type, for the
 *  ambiguous-name hint. `exec agent` takes its target via -t; the others
 *  take it positionally. The typed subcommands ARE the disambiguation
 *  mechanism — `exec run` deliberately has no --type flag (it would just
 *  duplicate them), so the hint must name commands that actually exist. */
const EXEC_SUBCOMMAND_SHAPE: Record<string, (name: string) => string> = {
  agent: (n) => `ulu exec agent ${n} -t <target>`,
  command: (n) => `ulu exec command ${n} <target>`,
  workflow: (n) => `ulu exec workflow ${n} <target>`,
  pipeline: (n) => `ulu exec pipeline ${n} <target>`,
};

function extractAmbiguousTypes(message: string): {
  name: string;
  types: string[];
} {
  const match =
    /multiple definitions named "?([^"]+?)"? found \(([^)]+)\)/i.exec(message);
  if (!match?.[2]) return { name: '<name>', types: [] };
  return {
    name: match[1] ?? '<name>',
    types: match[2]
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter((t) => VALID_DEFINITION_TYPES.has(t)),
  };
}

/**
 * 400/409s that carry a business `details.reason` (project re-home, spec
 * §4.4/§4.7). Looked up with `Object.hasOwn` — `reason` is server text.
 */
const BUSINESS_REASON_HINTS: Record<string, string> = {
  same_org:
    'The project is already in that org — nothing to do. It is not an error in your arguments. (Note: this answer comes from the ADMIN path; a member-path re-run after a finished move answers 404 instead, because the lookup is in the SOURCE org where the project no longer is.)',
  project_has_no_org:
    'This project row has no org (pre-org legacy data) and cannot be moved as-is; an operator must repair the row first.',
  project_soft_deleted:
    'The project is soft-deleted. Restore it in its current org ("ulu projects restore") before moving it.',
  name_collision:
    'A live project with this name already exists in the target org. Rename one of them first ("ulu projects rename"), or choose a different target.',
  soft_deleted_conflict:
    'A soft-deleted project with this name exists in the target org and still owns the name. Restore or hard-delete it there first.',
  rehomed_away_conflict:
    'Another project reserved this name in the target org by moving away from it. Rename first, or choose a different target.',
  export_in_progress:
    'An export job holds one of the two orgs. Wait for it to finish, then retry.',
  moved_during_request:
    'The project changed org while this request waited. Re-read it ("ulu projects get") to see where it is now; retry at most once.',
  deadlock_retry:
    'The database chose this request as a deadlock victim; nothing was applied. Retry once.',
  concurrent_modification:
    'The project was modified concurrently; nothing was applied. Re-read it, then retry once.',
};

function businessReasonHint(reason: string): string | undefined {
  return Object.hasOwn(BUSINESS_REASON_HINTS, reason)
    ? BUSINESS_REASON_HINTS[reason]
    : undefined;
}

function printApiErrorDetails(
  error: DetailedApiError,
  ctx: { json: boolean; debug: boolean },
  hints: ErrorHintOverrides = {},
): void {
  if (ctx.json) {
    // toJSON is optional — fall back to the fields we know exist rather than crashing
    // the error printer itself, which would replace a useful message with a TypeError.
    const payload =
      typeof error.toJSON === 'function'
        ? error.toJSON()
        : {
            statusCode: error.statusCode,
            message: error.message,
            code: error.code,
            requestId: error.requestId,
          };
    console.error(JSON.stringify(payload, null, 2));
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
    } else if (
      typeof (error.details as Record<string, unknown> | undefined)?.reason ===
        'string' &&
      (error.statusCode === 400 || error.statusCode === 409)
    ) {
      // A 400/409 carrying a business `reason` is a decision, not a malformed
      // argument — "check the command arguments" would send the user back to
      // --help for a call that was well-formed. Re-home's `same_org` is the
      // one that matters (it means "already there"); the 409 reasons were
      // documented as hinted and were not (three lenses, 2026-09-15).
      const reason = String((error.details as Record<string, unknown>).reason);
      console.error(
        `\nHint: ${businessReasonHint(reason) ?? `The server refused this for reason "${reason}" — the arguments were well-formed; the state does not allow it.`}`,
      );
    } else if (error.code === 'VALIDATION_ERROR' || error.statusCode === 400) {
      console.error(
        `\nHint: ${hints.validation ?? 'Invalid input. Check the command arguments, or run the command with --help to see valid options and values.'}`,
      );
    } else if (error.code === 'PROJECT_LIMIT') {
      // Not a subscription gate: the TARGET org of a move (or the org of a
      // create) is at its project cap. The upgrade box below fired on the bare
      // 402 and suggested the wrong fix (dx-validator, 2026-09-15).
      console.error(
        '\nHint: The destination org has reached its project limit. Free a slot there, choose a different org, or have its owner raise the tier. Nothing was applied.',
      );
    } else if (error.code === 'PROJECT_REHOMED' || error.statusCode === 410) {
      const target = (
        error.details as { target_org?: { slug?: string } } | undefined
      )?.target_org?.slug;
      console.error(
        `\nHint: This project was moved to another org${target ? ` (${target})` : ''}; the old address is a tombstone. Re-run the same command with --org ${target ?? '<that org>'}. Do not create a new project under the old name here.`,
      );
    } else if (error.code === 'SESSION_REQUIRED') {
      console.error(
        '\nHint: This action needs a signed-in session, not an API key. Run "ulu auth login" and retry; never mint another key to get past it.',
      );
    } else if (error.code === 'INSUFFICIENT_ORG_ROLE') {
      console.error(
        '\nHint: Your role in that org is below what this action needs. Do NOT retry without --org — that would act on your personal org, not fall back. Ask the org admin for the role.',
      );
    } else if (error.code === 'ORG_ACCESS_DENIED') {
      console.error(
        '\nHint: You are not a member of that org, or your key is bound to a different one. For "projects rehome" this is usually the TARGET (--to): you need admin/owner there, and a personal org can only receive its own owner\'s projects. Do NOT retry without --org.',
      );
    } else if (error.code === 'INSUFFICIENT_ROLE') {
      console.error(
        '\nHint: This is a platform-admin action; your account does not have that role.',
      );
    } else if (error.code === 'SUBSCRIPTION_REQUIRED') {
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
        `${`│  Subscription required${requiredTier ? `: ${requiredTier} tier or higher` : ''}`.padEnd(
          50,
        )}│`,
      );
      console.error('│                                                 │');
      if (trackedUrl) {
        console.error(`${`│  Upgrade: ${trackedUrl}`.padEnd(50)}│`);
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
        `${`│  Upgrade to ${error.requiredTier} to access this content`.padEnd(
          50,
        )}│`,
      );
      console.error('│                                                 │');
      if (trackedUrl) {
        console.error(`${`│  ${trackedUrl}`.padEnd(50)}│`);
      }
      console.error('└─────────────────────────────────────────────────┘');
    }
    process.exit(1);
  }

  if (isApiErrorLike(error)) {
    printApiErrorDetails(error, ctx, {
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
      const { name, types } = extractAmbiguousTypes(error.message);
      if (types.length > 0) {
        console.error(
          '\nHint: The name matches multiple definition types — run it with the typed subcommand:',
        );
        for (const type of types) {
          const shape = EXEC_SUBCOMMAND_SHAPE[type];
          if (shape) console.error(`  ${shape(name)}`);
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
