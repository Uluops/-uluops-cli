import { OpsClient, loadConfig as loadOpsConfig, OpsApiError } from '@uluops/ops-sdk';
import { RegistryClient } from '@uluops/registry-sdk';
import { RegistryApiError } from '@uluops/registry-sdk/errors';
import { loadConfig as loadRegistryConfig } from '@uluops/registry-sdk/config';
import { exitWithError } from './utils.js';

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

  if (!hasCredentials) {
    exitWithError(
      'No credentials found.\n' +
        'Set ULUOPS_API_KEY environment variable, use --api-key flag,\n' +
        'or run "ulu auth login" to authenticate.'
    );
  }

  let client: OpsClient;
  try {
    client = new OpsClient({
      apiKey: config.credentials.apiKey,
      sessionToken: config.credentials.sessionToken,
      email: config.credentials.email,
      password: config.credentials.password,
      baseUrl: config.baseUrl,
      debug: config.debug,
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

  if (!hasCredentials) {
    exitWithError(
      'No credentials found.\n' +
        'Set ULUOPS_API_KEY environment variable, use --api-key flag,\n' +
        'or run "ulu auth login" to authenticate.'
    );
  }

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
 * Handle ops errors consistently
 */
export function handleOpsError(error: unknown, ctx: Pick<OpsCliContext, 'json' | 'debug'>): never {
  if (error instanceof OpsApiError) {
    if (ctx.json) {
      console.error(JSON.stringify(error.toJSON(), null, 2));
    } else {
      console.error(`Error: ${error.message}`);

      // Provide helpful hints based on error code
      if (error.code === 'UNAUTHORIZED' || error.statusCode === 401) {
        console.error('\nHint: Your credentials may be invalid or expired.');
        console.error('Run "ulu auth login" or check your ULUOPS_API_KEY.');
      } else if (error.code === 'NOT_FOUND' || error.statusCode === 404) {
        console.error('\nHint: The resource was not found. Check the name or ID.');
      } else if (error.code === 'VALIDATION_ERROR' || error.statusCode === 400) {
        console.error('\nHint: Invalid input. Check the command arguments.');
      } else if (error.code === 'RATE_LIMITED' || error.statusCode === 429) {
        console.error('\nHint: Rate limited. Wait a moment and try again.');
      }

      if (ctx.debug && error.details) {
        console.error('\nDetails:', JSON.stringify(error.details, null, 2));
      }

      if (error.requestId) {
        console.error(`\nRequest ID: ${error.requestId}`);
      }
    }
    process.exit(1);
  }

  handleGenericError(error, ctx);
}

/**
 * Handle registry errors consistently
 */
export function handleRegistryError(error: unknown, ctx: Pick<RegistryCliContext, 'json' | 'debug'>): never {
  if (error instanceof RegistryApiError) {
    if (ctx.json) {
      console.error(JSON.stringify(error.toJSON(), null, 2));
    } else {
      console.error(`Error: ${error.message}`);

      // Provide helpful hints based on error code
      if (error.code === 'UNAUTHORIZED' || error.statusCode === 401) {
        console.error('\nHint: Your credentials may be invalid or expired.');
        console.error('Check your ULUOPS_API_KEY or session token.');
      } else if (error.code === 'NOT_FOUND' || error.statusCode === 404) {
        console.error('\nHint: The resource was not found. Check the type, name, and version.');
      } else if (error.code === 'VALIDATION_ERROR' || error.statusCode === 400) {
        console.error('\nHint: Invalid input. Check the command arguments or YAML file.');
      } else if (error.code === 'RATE_LIMITED' || error.statusCode === 429) {
        console.error('\nHint: Rate limited. Wait a moment and try again.');
      }

      if (ctx.debug && error.details) {
        console.error('\nDetails:', JSON.stringify(error.details, null, 2));
      }

      if (error.requestId) {
        console.error(`\nRequest ID: ${error.requestId}`);
      }
    }
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
