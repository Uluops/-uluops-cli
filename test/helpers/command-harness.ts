/**
 * Test harness for CLI command testing.
 * Provides mock clients and context factories.
 */
import { vi } from 'vitest';
import type { OpsCliContext, RegistryCliContext } from '../../src/context.js';

/**
 * Create a mock OpsClient with all methods as vi.fn()
 */
export function createMockOpsClient() {
  return {
    projects: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      softDelete: vi.fn(),
      restore: vi.fn(),
      getSummary: vi.fn(),
      getTrends: vi.fn(),
    },
    runs: {
      list: vi.fn(),
      listByProject: vi.fn(),
      get: vi.fn(),
      getLatest: vi.fn(),
      getDetails: vi.fn(),
      save: vi.fn(),
      validate: vi.fn(),
      diff: vi.fn(),
      archive: vi.fn(),
      delete: vi.fn(),
    },
    issues: {
      get: vi.fn(),
      getDetails: vi.fn(),
      search: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      addNote: vi.fn(),
      getHistory: vi.fn(),
      undoLastChange: vi.fn(),
      bulkUpdateStatus: vi.fn(),
      listByProject: vi.fn(),
      create: vi.fn(),
      merge: vi.fn(),
    },
    analytics: {
      getValidatorPerformance: vi.fn(),
      getValidatorReliability: vi.fn(),
      getFileHotspots: vi.fn(),
      getBurndown: vi.fn(),
      getVelocity: vi.fn(),
      getDiscovery: vi.fn(),
      getValidatorMatrix: vi.fn(),
      getResolutionRates: vi.fn(),
      getTaxonomy: vi.fn(),
      getTrends: vi.fn(),
    },
    admin: {
      getStats: vi.fn(),
      listUsers: vi.fn(),
      getUser: vi.fn(),
      createUser: vi.fn(),
      updateUser: vi.fn(),
      deactivateUser: vi.fn(),
      reactivateUser: vi.fn(),
      resetUserPassword: vi.fn(),
      listSessions: vi.fn(),
      terminateSession: vi.fn(),
      terminateUserSessions: vi.fn(),
      listKeys: vi.fn(),
      revokeKey: vi.fn(),
    },
    auth: {
      register: vi.fn(),
      login: vi.fn(),
      logoutAll: vi.fn(),
      getMe: vi.fn(),
      updateProfile: vi.fn(),
      changePassword: vi.fn(),
      forgotPassword: vi.fn(),
      resetPassword: vi.fn(),
      listApiKeys: vi.fn(),
      createApiKey: vi.fn(),
      revokeApiKey: vi.fn(),
    },
    login: vi.fn(),
    logout: vi.fn(),
    getAuthType: vi.fn().mockReturnValue('api_key'),
  };
}

/**
 * Create a mock RegistryClient with all methods as vi.fn()
 */
export function createMockRegistryClient() {
  return {
    definitions: {
      list: vi.fn(),
      get: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      publish: vi.fn(),
      deprecate: vi.fn(),
      delete: vi.fn(),
      validate: vi.fn(),
      render: vi.fn(),
      versions: vi.fn(),
      diff: vi.fn(),
    },
    models: {
      list: vi.fn(),
      get: vi.fn(),
      listProviders: vi.fn(),
      listAliases: vi.fn(),
      resolveAlias: vi.fn(),
      sync: vi.fn(),
    },
  };
}

/**
 * Create a mock OpsCliContext for testing
 */
export function createMockOpsContext(overrides: Partial<OpsCliContext> = {}): OpsCliContext {
  return {
    client: createMockOpsClient() as unknown as OpsCliContext['client'],
    json: false,
    debug: false,
    quiet: true,
    ...overrides,
  };
}

/**
 * Create a mock RegistryCliContext for testing
 */
export function createMockRegistryContext(overrides: Partial<RegistryCliContext> = {}): RegistryCliContext {
  return {
    client: createMockRegistryClient() as unknown as RegistryCliContext['client'],
    json: false,
    debug: false,
    quiet: true,
    ...overrides,
  };
}
