import { Command } from 'commander';
import { mkdirSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { OpsClient } from '@uluops/ops-sdk';
import {
  createOpsContext,
  createUnauthenticatedContext,
  handleOpsError,
  type GlobalOptions,
} from '../context.js';
import { withSpinner, writeFileAtomic, exitWithError } from '../utils.js';
import { formatApiKeys } from '../formatters/ops.js';

/**
 * Config file paths
 */
const CONFIG_PATHS = {
  GLOBAL_DIR: '.uluops',
  CREDENTIALS: '.uluops/credentials.json',
} as const;

/**
 * Save credentials to the credentials file
 */
function saveCredentials(
  profile: string,
  credentials: {
    type: 'api_key' | 'session';
    apiKey?: string;
    sessionToken?: string;
    expiresAt?: string;
    email?: string;
  }
): void {
  const configDir = join(homedir(), CONFIG_PATHS.GLOBAL_DIR);
  const credPath = join(homedir(), CONFIG_PATHS.CREDENTIALS);

  // Create config directory if it doesn't exist
  if (!existsSync(configDir)) {
    mkdirSync(configDir, { recursive: true });
  }

  // Load existing credentials or start fresh
  let stored: Record<string, unknown> = {};
  if (existsSync(credPath)) {
    try {
      stored = JSON.parse(readFileSync(credPath, 'utf-8'));
    } catch {
      // Start fresh if file is corrupted
    }
  }

  // Update the profile
  stored[profile] = credentials;

  // Write back atomically (write to .tmp then rename)
  writeFileAtomic(credPath, JSON.stringify(stored, null, 2));
}

/**
 * Remove credentials for a profile from the credentials file
 */
function removeCredentials(profile: string): void {
  const credPath = join(homedir(), CONFIG_PATHS.CREDENTIALS);

  if (!existsSync(credPath)) {
    return;
  }

  let stored: Record<string, unknown> = {};
  try {
    stored = JSON.parse(readFileSync(credPath, 'utf-8'));
  } catch {
    return;
  }

  delete stored[profile];
  writeFileAtomic(credPath, JSON.stringify(stored, null, 2));
}

/**
 * Register auth commands
 */
export function registerAuthCommands(program: Command): void {
  const auth = program
    .command('auth')
    .description('Authentication and credential management');

  // ulu auth login
  auth
    .command('login')
    .description('Login with email and password')
    .option('-e, --email <email>', 'Email address')
    .option('-p, --password <password>', 'Password')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createUnauthenticatedContext(globalOpts);

      if (!options.email || !options.password) {
        console.error('Error: Both --email and --password are required');
        console.error('Usage: ulu auth login --email <email> --password <password>');
        process.exit(1);
      }

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Logging in...', success: 'Login successful', failure: 'Login failed' },
          async () => {
            const client = new OpsClient({
              baseUrl: ctx.baseUrl,
            });
            return client.login(options.email, options.password);
          }
        );

        // Save credentials
        const profile = globalOpts.profile ?? 'default';
        try {
          saveCredentials(profile, {
            type: 'session',
            sessionToken: result.sessionToken,
            expiresAt: result.expiresAt,
            email: options.email,
          });
        } catch (saveError) {
          const msg = saveError instanceof Error ? saveError.message : String(saveError);
          if (msg.includes('EACCES') || msg.includes('permission denied')) {
            exitWithError(
              `Cannot save credentials: permission denied.\n` +
                'Check file permissions on ~/.uluops/credentials.json'
            );
          }
          exitWithError(`Failed to save credentials: ${msg}`);
        }

        if (ctx.json) {
          console.log(JSON.stringify({ success: true, profile }, null, 2));
        } else {
          console.log(`\nCredentials saved to profile: ${profile}`);
          console.log('You can now use other ulu commands.');
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth logout
  auth
    .command('logout')
    .description('Logout and revoke all sessions')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const profile = globalOpts.profile ?? 'default';
      const json = globalOpts.json ?? false;
      const debug = globalOpts.debug ?? false;

      // Try to revoke server-side sessions using raw client (avoid createOpsContext
      // which calls process.exit on expired sessions)
      let sessionsRevoked = 0;
      try {
        const credPath = join(homedir(), CONFIG_PATHS.CREDENTIALS);
        if (existsSync(credPath)) {
          const stored = JSON.parse(readFileSync(credPath, 'utf-8'));
          const creds = stored[profile];
          if (creds) {
            const { loadConfig: loadOpsConfig } = await import('@uluops/ops-sdk');
            const config = loadOpsConfig({ baseUrl: globalOpts.baseUrl, profile, debug: globalOpts.debug });
            const client = new OpsClient({
              apiKey: creds.type === 'api_key' ? creds.apiKey : undefined,
              sessionToken: creds.type === 'session' ? creds.sessionToken : undefined,
              baseUrl: config.baseUrl,
              debug,
            });
            const spinnerCtx = { json, debug, quiet: false };
            const result = await withSpinner(
              spinnerCtx,
              { start: 'Logging out...', success: 'Logged out', failure: 'Logout failed' },
              () => client.logout()
            );
            sessionsRevoked = result.sessionsRevoked;
          }
        }
      } catch {
        // If credentials are expired/invalid, that's fine — we still remove local creds
      }

      // Always remove local credentials for this profile
      removeCredentials(profile);

      if (json) {
        console.log(JSON.stringify({ success: true, profile, sessionsRevoked }, null, 2));
      } else {
        if (sessionsRevoked > 0) {
          console.log(`Revoked ${sessionsRevoked} server session(s)`);
        }
        console.log(`Removed local credentials for profile "${profile}"`);
      }
    });

  // ulu auth whoami
  auth
    .command('whoami')
    .description('Show current authenticated user')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const user = await withSpinner(
          ctx,
          { start: 'Fetching user info...', failure: 'Failed to fetch user info' },
          () => ctx.client.auth.getMe()
        );

        if (ctx.json) {
          console.log(JSON.stringify(user, null, 2));
        } else {
          console.log(`Email: ${user.email}`);
          console.log(`Role: ${user.role}`);
          console.log(`Tier: ${user.subscriptionTier}`);
          if (user.username) console.log(`Username: ${user.username}`);
          if (user.name) console.log(`Name: ${user.name}`);
          console.log(`Auth Type: ${ctx.client.getAuthType()}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth register
  auth
    .command('register')
    .description('Register a new account')
    .requiredOption('-e, --email <email>', 'Email address')
    .requiredOption('-p, --password <password>', 'Password')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createUnauthenticatedContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Registering...', success: 'Registration successful', failure: 'Registration failed' },
          async () => {
            const client = new OpsClient({ baseUrl: ctx.baseUrl });
            return client.auth.register({ email: options.email, password: options.password });
          }
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(`Account registered for ${options.email}`);
          console.log('You can now login with: ulu auth login');
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth forgot-password
  auth
    .command('forgot-password')
    .description('Request a password reset email')
    .requiredOption('-e, --email <email>', 'Email address')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createUnauthenticatedContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Sending reset email...', success: 'Reset email sent', failure: 'Failed to send reset email' },
          async () => {
            const client = new OpsClient({ baseUrl: ctx.baseUrl });
            return client.auth.forgotPassword(options.email);
          }
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.message);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth reset-password
  auth
    .command('reset-password')
    .description('Reset password using a token')
    .requiredOption('-t, --token <token>', 'Reset token from email')
    .requiredOption('-p, --password <password>', 'New password')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createUnauthenticatedContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Resetting password...', success: 'Password reset', failure: 'Failed to reset password' },
          async () => {
            const client = new OpsClient({ baseUrl: ctx.baseUrl });
            return client.auth.resetPassword({ token: options.token, password: options.password });
          }
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.message);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth change-password
  auth
    .command('change-password')
    .description('Change your current password')
    .requiredOption('-c, --current <password>', 'Current password')
    .requiredOption('-n, --new-password <password>', 'New password')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Changing password...', success: 'Password changed', failure: 'Failed to change password' },
          () => ctx.client.auth.changePassword({
            currentPassword: options.current,
            newPassword: options.newPassword,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log(result.message);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth profile
  auth
    .command('profile')
    .description('View your profile')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching profile...', failure: 'Failed to fetch profile' },
          () => ctx.client.auth.getProfile()
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          const u = data.user;
          console.log(`Email: ${u.email}`);
          console.log(`Role: ${u.role}`);
          if (u.username) console.log(`Username: ${u.username}`);
          if (u.name) console.log(`Name: ${u.name}`);
          if (u.bio) console.log(`Bio: ${u.bio}`);
          if (u.timezone) console.log(`Timezone: ${u.timezone}`);
          if (u.websiteUrl) console.log(`Website: ${u.websiteUrl}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth update-profile
  auth
    .command('update-profile')
    .description('Update your profile')
    .option('-u, --username <username>', 'Username')
    .option('-n, --name <name>', 'Display name')
    .option('--bio <bio>', 'Bio')
    .option('--timezone <tz>', 'Timezone')
    .option('--website <url>', 'Website URL')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      const input: Record<string, string | undefined> = {};
      if (options.username !== undefined) input.username = options.username;
      if (options.name !== undefined) input.name = options.name;
      if (options.bio !== undefined) input.bio = options.bio;
      if (options.timezone !== undefined) input.timezone = options.timezone;
      if (options.website !== undefined) input.websiteUrl = options.website;

      if (Object.keys(input).length === 0) {
        console.error('Error: At least one field must be specified');
        process.exit(1);
      }

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Updating profile...', success: 'Profile updated', failure: 'Failed to update profile' },
          () => ctx.client.auth.updateProfile(input)
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`Profile updated for ${data.user.email}`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth sessions
  const authSessions = auth
    .command('sessions')
    .description('Manage your sessions');

  // ulu auth sessions list
  authSessions
    .command('list')
    .description('List your active sessions')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const sessions = await withSpinner(
          ctx,
          { start: 'Fetching sessions...', failure: 'Failed to fetch sessions' },
          () => ctx.client.auth.listSessions()
        );

        if (ctx.json) {
          console.log(JSON.stringify(sessions, null, 2));
        } else if (sessions.length === 0) {
          console.log('No active sessions');
        } else {
          console.log(`Active sessions: ${sessions.length}\n`);
          for (const s of sessions) {
            console.log(`  ${s.id.slice(0, 8)}  ${s.ipAddress ?? '-'}  ${s.createdAt}`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth sessions revoke <id>
  authSessions
    .command('revoke <sessionId>')
    .description('Revoke a session')
    .action(async (sessionId: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        await withSpinner(
          ctx,
          { start: 'Revoking session...', success: 'Session revoked', failure: 'Failed to revoke session' },
          () => ctx.client.auth.revokeSession(sessionId)
        );

        if (ctx.json) {
          console.log(JSON.stringify({ success: true, sessionId }, null, 2));
        } else {
          console.log(`Session ${sessionId.slice(0, 8)} revoked`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth api-keys
  const apiKeys = auth
    .command('api-keys')
    .description('Manage API keys');

  // ulu auth api-keys list
  apiKeys
    .command('list')
    .description('List all API keys')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const keys = await withSpinner(
          ctx,
          { start: 'Fetching API keys...', failure: 'Failed to fetch API keys' },
          () => ctx.client.auth.listApiKeys()
        );

        if (ctx.json) {
          console.log(JSON.stringify(keys, null, 2));
        } else if (keys.length === 0) {
          console.log('No API keys found');
        } else {
          console.log(formatApiKeys(keys));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth api-keys create
  apiKeys
    .command('create')
    .description('Create a new API key')
    .option('-n, --name <name>', 'Key name (for identification)')
    .option('--expires <date>', 'Expiration date (ISO format)')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Creating API key...', success: 'API key created', failure: 'Failed to create API key' },
          () => ctx.client.auth.createApiKey({
            name: options.name,
            expiresAt: options.expires,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(result, null, 2));
        } else {
          console.log('\n' + '='.repeat(60));
          console.log('IMPORTANT: Save this key now - it will not be shown again!');
          console.log('='.repeat(60));
          console.log(`\nAPI Key: ${result.key}`);
          console.log(`Key ID: ${result.apiKey.id}`);
          if (result.apiKey.name) console.log(`Name: ${result.apiKey.name}`);
          console.log('\n' + '='.repeat(60));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu auth api-keys revoke
  apiKeys
    .command('revoke <keyId>')
    .description('Revoke an API key')
    .action(async (keyId: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        await withSpinner(
          ctx,
          { start: 'Revoking API key...', success: 'API key revoked', failure: 'Failed to revoke API key' },
          () => ctx.client.auth.revokeApiKey(keyId)
        );

        if (ctx.json) {
          console.log(JSON.stringify({ success: true, keyId }, null, 2));
        } else {
          console.log(`API key ${keyId} has been revoked`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });
}
