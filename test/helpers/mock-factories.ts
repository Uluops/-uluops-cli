/**
 * Lightweight mock data factories for CLI tests.
 * These produce objects matching the SDK type shapes used by formatters.
 * No Zod validation — that's the SDK's concern.
 */
import type { Project, Run, Issue, PublicApiKey } from '@uluops/ops-sdk';
import type {
  Definition,
  DefinitionListItem,
  Model,
  ModelAlias,
  AliasResolution,
  VersionListItem,
  VersionDiff,
  ValidationResult,
} from '@uluops/registry-sdk';

let idCounter = 0;

export function resetIds(): void {
  idCounter = 0;
}

function nextId(): string {
  idCounter++;
  return `00000000-0000-0000-0000-${String(idCounter).padStart(12, '0')}`;
}

function isoDate(daysAgo = 0): string {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString();
}

// ============================================
// OPS-SDK FACTORIES
// ============================================

export function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: nextId(),
    name: 'test-project',
    ownerId: nextId(),
    createdAt: isoDate(7),
    updatedAt: isoDate(1),
    deletedAt: null,
    ...overrides,
  };
}

export function createRun(overrides: Partial<Run> = {}): Run {
  return {
    id: nextId(),
    projectId: nextId(),
    runNumber: 1,
    workflowType: 'post-implementation',
    timestamp: isoDate(1),
    allGatesPassed: true,
    averageScore: 85.5,
    rawMarkdown: null,
    archivedAt: null,
    archiveReason: null,
    idempotencyKey: null,
    createdAt: isoDate(1),
    updatedAt: isoDate(1),
    ...overrides,
  };
}

export function createIssue(overrides: Partial<Issue> = {}): Issue {
  return {
    id: nextId(),
    projectId: nextId(),
    fingerprint: 'a'.repeat(64),
    title: 'Test issue title',
    status: 'open',
    priority: 'suggested',
    severity: 'medium',
    failureCode: 'SEM-VAL/M',
    failureDomain: 'SEM',
    failureMode: 'VAL',
    failureSeverityCode: 'M',
    category: 'Error Quality',
    // SDK schema field is `agent`, not `validator` (corrected in post-impl r2).
    // Tests that assert on agent rendering depend on this matching the
    // IssueResponseSchema.agent shape.
    agent: 'code-validator',
    type: 'bug',
    filePath: 'src/index.ts',
    lineNumber: 42,
    timesSeen: 3,
    firstSeenRunId: nextId(),
    lastSeenRunId: nextId(),
    resolvedAt: null,
    resolutionRunId: null,
    createdAt: isoDate(5),
    updatedAt: isoDate(1),
    ...overrides,
  } as Issue;
}

export function createPublicApiKey(overrides: Partial<PublicApiKey> = {}): PublicApiKey {
  return {
    id: nextId(),
    name: 'my-key',
    lastUsedAt: isoDate(2),
    expiresAt: null,
    createdAt: isoDate(30),
    ...overrides,
  };
}

// ============================================
// REGISTRY-SDK FACTORIES
// ============================================

export function createDefinitionListItem(overrides: Partial<DefinitionListItem> = {}): DefinitionListItem {
  return {
    id: nextId(),
    type: 'validator',
    name: 'test-validator',
    version: '1.0.0',
    status: 'published',
    displayName: 'Test Validator',
    description: 'A test validator definition',
    domain: 'code-quality',
    ownerId: nextId(),
    tier: 'free',
    visibility: 'public',
    createdAt: isoDate(10),
    updatedAt: isoDate(1),
    executionCount: 42,
    forkCount: 5,
    starCount: 12,
    ...overrides,
  } as DefinitionListItem;
}

export function createDefinition(overrides: Partial<Definition> = {}): Definition {
  return {
    id: nextId(),
    type: 'validator',
    name: 'test-validator',
    version: '1.0.0',
    status: 'published',
    yaml: 'name: test\nversion: 1.0.0',
    hash: 'abc123',
    displayName: 'Test Validator',
    description: 'A test validator definition for testing purposes',
    domain: 'code-quality',
    subdomain: null,
    agentType: null,
    author: null,
    tags: ['test', 'validator'],
    ownerId: nextId(),
    tier: 'free',
    visibility: 'public',
    runtimeMd: null,
    translatorVersion: null,
    schemaVersion: null,
    executionCount: 42,
    forkCount: 5,
    starCount: 12,
    forkedFromId: null,
    createdAt: isoDate(10),
    updatedAt: isoDate(1),
    publishedAt: isoDate(5),
    deprecatedAt: null,
    ...overrides,
  } as Definition;
}

export function createModel(overrides: Partial<Model> = {}): Model {
  return {
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    displayName: 'Claude Sonnet 4.5',
    description: 'Fast and capable model',
    providerModelId: 'claude-sonnet-4-5-20250929',
    capabilities: { vision: true, tools: true, streaming: true, extendedThinking: false },
    tier: 'standard',
    status: 'active',
    regions: ['us-east-1', 'eu-west-1'],
    releaseDate: '2025-09-29',
    deprecationDate: null,
    successor: null,
    createdAt: isoDate(90),
    updatedAt: isoDate(1),
    ...overrides,
  } as Model;
}

export function createModelAlias(overrides: Partial<ModelAlias> = {}): ModelAlias {
  return {
    alias: 'sonnet',
    provider: 'anthropic',
    modelId: 'claude-sonnet-4-5',
    scope: 'global',
    deprecated: false,
    createdAt: isoDate(30),
    updatedAt: isoDate(1),
    ...overrides,
  } as ModelAlias;
}

export function createAliasResolution(overrides: Partial<AliasResolution> = {}): AliasResolution {
  return {
    alias: 'sonnet',
    target: 'anthropic/claude-sonnet-4-5',
    model: null,
    ...overrides,
  };
}

export function createVersionListItem(overrides: Partial<VersionListItem> = {}): VersionListItem {
  return {
    version: '1.0.0',
    status: 'published',
    createdAt: isoDate(10),
    ...overrides,
  } as VersionListItem;
}

export function createVersionDiff(overrides: Partial<VersionDiff> = {}): VersionDiff {
  return {
    fromVersion: '1.0.0',
    toVersion: '1.1.0',
    fromYaml: 'name: my-agent\nversion: "1.0.0"\ndescription: original',
    toYaml: 'name: my-agent\nversion: "1.1.0"\ndescription: updated\ntags:\n  - new',
    ...overrides,
  };
}

export function createValidationResult(overrides: Partial<ValidationResult> = {}): ValidationResult {
  return {
    valid: true,
    ...overrides,
  };
}
