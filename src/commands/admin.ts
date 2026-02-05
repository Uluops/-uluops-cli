import { Command } from 'commander';
import { createOpsContext, handleOpsError, type GlobalOptions } from '../context.js';
import { withSpinner, formatDisplayDate, getFlexibleProperty } from '../utils.js';
import { formatTable, formatKeyValue, type Column } from '../formatters/table.js';
import type { UserRole, SubscriptionTier } from '@uluops/ops-sdk';

/**
 * Register admin commands
 */
export function registerAdminCommands(program: Command): void {
  const admin = program
    .command('admin')
    .description('Admin operations (requires admin role)');

  // ulu admin stats
  admin
    .command('stats')
    .description('Get admin dashboard statistics')
    .action(async (_, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const stats = await withSpinner(
          ctx,
          { start: 'Fetching admin stats...', failure: 'Failed to fetch admin stats' },
          () => ctx.client.admin.getStats()
        );

        if (ctx.json) {
          console.log(JSON.stringify(stats, null, 2));
        } else {
          console.log('Admin Statistics:\n');
          console.log(formatKeyValue({
            'Total Users': stats.totalUsers,
            'Active Users': stats.activeUsers,
            'Active Sessions': getFlexibleProperty(stats, 'activeSessions', stats.totalSessions),
            'Total API Keys': stats.totalApiKeys,
          }));
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ============================================
  // USER MANAGEMENT
  // ============================================

  const users = admin
    .command('users')
    .description('User management');

  // ulu admin users list
  users
    .command('list')
    .description('List all users')
    .option('-s, --search <text>', 'Search by email or username')
    .option('-r, --role <role>', 'Filter by role (admin, developer, publisher, viewer)')
    .option('-t, --tier <tier>', 'Filter by subscription tier')
    .option('--inactive', 'Show only inactive users')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .option('-p, --page <number>', 'Page number', '1')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching users...', failure: 'Failed to fetch users' },
          () => ctx.client.admin.listUsers({
            search: options.search,
            role: options.role as UserRole | undefined,
            subscriptionTier: options.tier as SubscriptionTier | undefined,
            isActive: options.inactive ? false : undefined,
            limit: parseInt(options.limit, 10),
            page: parseInt(options.page, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.users.length === 0) {
          console.log('No users found');
        } else {
          const columns: Column<(typeof data.users)[0]>[] = [
            { header: 'ID', accessor: (u) => u.id.slice(0, 8), width: 10 },
            { header: 'EMAIL', accessor: 'email', width: 30 },
            { header: 'ROLE', accessor: 'role', width: 10 },
            { header: 'TIER', accessor: 'subscriptionTier', width: 12 },
            { header: 'ACTIVE', accessor: (u) => u.isActive ? 'Yes' : 'No', width: 7 },
          ];
          console.log(formatTable(data.users, columns));

          if (data.pagination) {
            console.log(`\nPage ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} total)`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin users get <id>
  users
    .command('get <id>')
    .description('Get user details')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching user...', failure: 'Failed to fetch user' },
          () => ctx.client.admin.getUser(id)
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(formatKeyValue({
            ID: data.user.id,
            Email: data.user.email,
            Username: data.user.username,
            Role: data.user.role,
            'Subscription Tier': data.user.subscriptionTier,
            Active: data.user.isActive ? 'Yes' : 'No',
            'Created At': formatDisplayDate(data.user.createdAt),
          }));

          if (data.stats) {
            console.log('\nStatistics:');
            console.log(formatKeyValue({
              Sessions: data.stats.sessionCount,
              'API Keys': data.stats.apiKeyCount,
              'Last Login': data.stats.lastLoginAt ? formatDisplayDate(data.stats.lastLoginAt) : 'Never',
            }));
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin users create
  users
    .command('create')
    .description('Create a new user')
    .requiredOption('-e, --email <email>', 'User email')
    .option('-p, --password <password>', 'User password (generates temporary if not provided)')
    .option('-r, --role <role>', 'User role (admin, developer, publisher, viewer)', 'developer')
    .option('-t, --tier <tier>', 'Subscription tier', 'free')
    .option('--no-welcome', 'Do not send welcome email')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Creating user...', success: 'User created', failure: 'Failed to create user' },
          () => ctx.client.admin.createUser({
            email: options.email,
            password: options.password,
            role: options.role as UserRole,
            subscriptionTier: options.tier as SubscriptionTier,
            sendWelcomeEmail: options.welcome,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`User ${data.user.email} created with ID: ${data.user.id}`);
          if (data.temporaryPassword) {
            console.log(`\nTemporary password: ${data.temporaryPassword}`);
            console.log('(User should change this on first login)');
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin users update <id>
  users
    .command('update <id>')
    .description('Update a user')
    .option('-e, --email <email>', 'New email')
    .option('-r, --role <role>', 'New role (admin, developer, publisher, viewer)')
    .option('-t, --tier <tier>', 'New subscription tier')
    .action(async (id: string, options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Updating user...', success: 'User updated', failure: 'Failed to update user' },
          () => ctx.client.admin.updateUser(id, {
            email: options.email,
            role: options.role as UserRole | undefined,
            subscriptionTier: options.tier as SubscriptionTier | undefined,
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`User ${data.user.email} updated`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin users deactivate <id>
  users
    .command('deactivate <id>')
    .description('Deactivate a user')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Deactivating user...', success: 'User deactivated', failure: 'Failed to deactivate user' },
          () => ctx.client.admin.deactivateUser(id)
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`User ${data.user.email} deactivated`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin users reactivate <id>
  users
    .command('reactivate <id>')
    .description('Reactivate a deactivated user')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Reactivating user...', success: 'User reactivated', failure: 'Failed to reactivate user' },
          () => ctx.client.admin.reactivateUser(id)
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else {
          console.log(`User ${data.user.email} reactivated`);
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin users reset-password <id>
  users
    .command('reset-password <id>')
    .description('Send password reset email to user')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Sending password reset...', success: 'Password reset email sent', failure: 'Failed to send password reset' },
          () => ctx.client.admin.resetUserPassword(id)
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

  // ============================================
  // SESSION MANAGEMENT
  // ============================================

  const sessions = admin
    .command('sessions')
    .description('Session management');

  // ulu admin sessions list
  sessions
    .command('list')
    .description('List all active sessions')
    .option('-u, --user <id>', 'Filter by user ID')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .option('-p, --page <number>', 'Page number', '1')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching sessions...', failure: 'Failed to fetch sessions' },
          () => ctx.client.admin.listSessions({
            userId: options.user,
            limit: parseInt(options.limit, 10),
            page: parseInt(options.page, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.sessions.length === 0) {
          console.log('No sessions found');
        } else {
          const columns: Column<(typeof data.sessions)[0]>[] = [
            { header: 'ID', accessor: (s) => s.id.slice(0, 8), width: 10 },
            { header: 'USER', accessor: 'userEmail', width: 25 },
            { header: 'IP', accessor: (s) => s.ipAddress ?? '-', width: 15 },
            { header: 'CREATED', accessor: (s) => formatDisplayDate(s.createdAt), width: 20 },
          ];
          console.log(formatTable(data.sessions, columns));

          if (data.pagination) {
            console.log(`\nPage ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} total)`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin sessions terminate <id>
  sessions
    .command('terminate <id>')
    .description('Terminate a session')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Terminating session...', success: 'Session terminated', failure: 'Failed to terminate session' },
          () => ctx.client.admin.terminateSession(id)
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

  // ulu admin sessions terminate-user <userId>
  sessions
    .command('terminate-user <userId>')
    .description('Terminate all sessions for a user')
    .action(async (userId: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Terminating user sessions...', success: 'User sessions terminated', failure: 'Failed to terminate user sessions' },
          () => ctx.client.admin.terminateUserSessions(userId)
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

  // ============================================
  // API KEY MANAGEMENT
  // ============================================

  const keys = admin
    .command('keys')
    .description('API key management');

  // ulu admin keys list
  keys
    .command('list')
    .description('List all API keys')
    .option('-u, --user <id>', 'Filter by user ID')
    .option('-s, --search <text>', 'Search by name')
    .option('-l, --limit <number>', 'Maximum results', '20')
    .option('-p, --page <number>', 'Page number', '1')
    .action(async (options, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const data = await withSpinner(
          ctx,
          { start: 'Fetching API keys...', failure: 'Failed to fetch API keys' },
          () => ctx.client.admin.listKeys({
            userId: options.user,
            search: options.search,
            limit: parseInt(options.limit, 10),
            page: parseInt(options.page, 10),
          })
        );

        if (ctx.json) {
          console.log(JSON.stringify(data, null, 2));
        } else if (data.keys.length === 0) {
          console.log('No API keys found');
        } else {
          const columns: Column<(typeof data.keys)[0]>[] = [
            { header: 'ID', accessor: (k) => k.id.slice(0, 8), width: 10 },
            { header: 'NAME', accessor: (k) => k.name ?? '(unnamed)', width: 20 },
            { header: 'USER', accessor: 'userEmail', width: 25 },
            { header: 'LAST USED', accessor: (k) => k.lastUsedAt ? formatDisplayDate(k.lastUsedAt) : 'Never', width: 20 },
          ];
          console.log(formatTable(data.keys, columns));

          if (data.pagination) {
            console.log(`\nPage ${data.pagination.page} of ${data.pagination.totalPages} (${data.pagination.total} total)`);
          }
        }
      } catch (error) {
        handleOpsError(error, ctx);
      }
    });

  // ulu admin keys revoke <id>
  keys
    .command('revoke <id>')
    .description('Revoke an API key')
    .action(async (id: string, _, cmd) => {
      const globalOpts = cmd.optsWithGlobals() as GlobalOptions;
      const ctx = createOpsContext(globalOpts);

      try {
        const result = await withSpinner(
          ctx,
          { start: 'Revoking API key...', success: 'API key revoked', failure: 'Failed to revoke API key' },
          () => ctx.client.admin.revokeKey(id)
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
}
