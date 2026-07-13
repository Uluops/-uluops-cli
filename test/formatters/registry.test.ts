import { describe, it, expect } from 'vitest';
import {
  formatDefinitions,
  formatDefinition,
  formatModels,
  formatModel,
  formatAliases,
  formatAliasResolution,
  formatVersions,
  formatVersionDiff,
  formatValidationResult,
} from '../../src/formatters/registry.js';

const mockDefinition = {
  id: 'def-123',
  name: 'code-validator',
  type: 'agent' as const,
  version: '1.0.0',
  status: 'published' as const,
  displayName: 'Code Validator',
  description: 'Validates code quality',
  domain: 'validation',
  subdomain: 'code',
  agentType: 'validator',
  visibility: 'public' as const,
  tier: 'free' as const,
  tags: ['validation', 'code'],
  executionCount: 100,
  forkCount: 5,
  starCount: 10,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
  publishedAt: '2026-01-10T00:00:00Z',
  yaml: '',
  ownerId: 'user-1',
};

const mockModel = {
  provider: 'anthropic',
  modelId: 'claude-opus-4-6',
  displayName: 'Claude Opus 4.6',
  description: 'Most capable Claude model',
  providerModelId: 'claude-opus-4-6',
  capabilities: {
    vision: true,
    tools: true,
    streaming: true,
    extendedThinking: true,
  },
  tier: 'premium' as const,
  status: 'active' as const,
  regions: ['us-east-1', 'eu-west-1'],
  releaseDate: '2026-01-01',
  deprecationDate: null,
  successor: null,
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-15T00:00:00Z',
};

describe('formatDefinitions', () => {
  const baseItem = { name: 'code-validator', type: 'agent', version: '1.0.0', status: 'published', visibility: 'public' };
  const format = (items: Record<string, unknown>[]) =>
    formatDefinitions(items as Parameters<typeof formatDefinitions>[0]);

  it('formats a list of definitions as a table', () => {
    const result = format([baseItem]);
    expect(result).toContain('NAME');
    expect(result).toContain('TYPE');
    expect(result).toContain('code-validator');
  });

  // RISK column P6 discipline (risk-verdict list projection, SDK 0.44.0):
  // absent triple = pending; failed/errored scan = incomplete (never clean);
  // trustworthy none = clean; medium/high pass through.
  it('renders RISK "pending" when no risk scalars are present', () => {
    const result = format([baseItem]);
    expect(result).toContain('RISK');
    expect(result).toContain('pending');
  });

  it('renders RISK "incomplete" for a failed-scan sentinel none — never clean (P6)', () => {
    const result = format([{ ...baseItem, riskLevel: 'none', scanStatus: 'failed' }]);
    expect(result).toContain('incomplete');
    expect(result).not.toContain('clean');
  });

  it('renders RISK "incomplete" for an errored deep analysis', () => {
    const result = format([{ ...baseItem, riskLevel: 'none', scanStatus: 'complete', deepStatus: 'error' }]);
    expect(result).toContain('incomplete');
  });

  it('renders RISK "clean" for a trustworthy none and the level for flagged rows', () => {
    const result = format([
      { ...baseItem, riskLevel: 'none', scanStatus: 'complete' },
      { ...baseItem, name: 'risky-agent', riskLevel: 'high', scanStatus: 'complete' },
    ]);
    expect(result).toContain('clean');
    expect(result).toContain('high');
  });
});

describe('formatDefinition', () => {
  it('formats a single definition with all fields', () => {
    const result = formatDefinition(mockDefinition);
    expect(result).toContain('code-validator');
    expect(result).toContain('agent');
    expect(result).toContain('1.0.0');
    expect(result).toContain('published');
    expect(result).toContain('validation, code');
  });

  it('handles missing optional fields', () => {
    const minimal = { ...mockDefinition, description: undefined, publishedAt: undefined, tags: undefined };
    const result = formatDefinition(minimal as Parameters<typeof formatDefinition>[0]);
    expect(result).toContain('code-validator');
  });

  const makeProfile = (overrides: Record<string, unknown>) => ({
    sync: {
      version: '1.0.0',
      scannedAt: '2026-01-01T00:00:00Z',
      capabilities: { tools: [], preflightCommands: 0 },
      signals: [],
      riskLevel: 'none',
    },
    deep: null,
    aggregateRiskLevel: 'none',
    lastUpdated: '2026-01-01T00:00:00Z',
    ...overrides,
  });

  it('renders a failed scan as incomplete, never as "No risk signals" (P6)', () => {
    const def = {
      ...mockDefinition,
      riskProfile: makeProfile({ scanStatus: 'failed', scanFailedReason: 'timeout' }),
    };
    const result = formatDefinition(def as Parameters<typeof formatDefinition>[0]);
    expect(result).toContain('Safety scan incomplete');
    expect(result).toContain('timeout');
    expect(result).not.toContain('No risk signals');
  });

  it('renders a complete clean scan as "No risk signals"', () => {
    const def = {
      ...mockDefinition,
      riskProfile: makeProfile({ scanStatus: 'complete' }),
    };
    const result = formatDefinition(def as Parameters<typeof formatDefinition>[0]);
    expect(result).toContain('No risk signals');
    expect(result).not.toContain('Safety scan incomplete');
  });

  it('flags a deep-analysis error as incomplete', () => {
    const def = {
      ...mockDefinition,
      riskProfile: makeProfile({
        scanStatus: 'complete',
        deep: {
          version: '1.0.0',
          analyzedAt: '2026-01-01T00:00:00Z',
          findings: [],
          riskLevel: 'none',
          status: 'error',
          errorReason: 'no_output',
        },
      }),
    };
    const result = formatDefinition(def as Parameters<typeof formatDefinition>[0]);
    // Deep-aware isVerdictTrustworthy (registry-sdk 0.43.0): the deep error is
    // named as the failing layer, with its reason, and never rendered clean.
    expect(result).toContain('Deep analysis failed (no_output)');
    expect(result).toContain('not a clean verdict');
    expect(result).not.toContain('No risk signals');
  });

  it('does not flag deep: null (pending) as failed', () => {
    const def = {
      ...mockDefinition,
      riskProfile: makeProfile({ scanStatus: 'complete', deep: null }),
    };
    const result = formatDefinition(def as Parameters<typeof formatDefinition>[0]);
    expect(result).toContain('Deep analysis pending');
    expect(result).not.toContain('Deep analysis failed');
    expect(result).toContain('No risk signals');
  });
});

describe('formatModels', () => {
  it('formats a list of models as a table', () => {
    const result = formatModels([mockModel]);
    expect(result).toContain('PROVIDER');
    expect(result).toContain('MODEL ID');
    expect(result).toContain('anthropic');
    expect(result).toContain('claude-opus-4-6');
  });
});

describe('formatModel', () => {
  it('formats a single model with capabilities', () => {
    const result = formatModel(mockModel);
    expect(result).toContain('anthropic');
    expect(result).toContain('claude-opus-4-6');
    expect(result).toContain('Claude Opus 4.6');
    expect(result).toContain('vision');
    expect(result).toContain('tools');
    expect(result).toContain('us-east-1, eu-west-1');
  });

  it('shows "none" when no capabilities are true', () => {
    const noCapabilities = {
      ...mockModel,
      capabilities: { vision: false, tools: false, streaming: false, extendedThinking: false },
    };
    const result = formatModel(noCapabilities);
    expect(result).toContain('none');
  });
});

describe('formatAliases', () => {
  it('formats a list of aliases as a table', () => {
    const aliases = [
      { alias: 'opus', provider: 'anthropic', modelId: 'claude-opus-4-6', scope: 'global' as const, deprecated: false },
    ];
    const result = formatAliases(aliases);
    expect(result).toContain('ALIAS');
    expect(result).toContain('opus');
    expect(result).toContain('anthropic');
    expect(result).toContain('claude-opus-4-6');
    expect(result).toContain('No');
  });

  it('shows deprecation status', () => {
    const aliases = [
      { alias: 'old-model', provider: 'anthropic', modelId: 'old-id', deprecated: true },
    ];
    const result = formatAliases(aliases);
    expect(result).toContain('Yes');
  });
});

describe('formatAliasResolution', () => {
  it('formats a resolved alias', () => {
    const resolution = { alias: 'opus', target: 'anthropic/claude-opus-4-6' };
    const result = formatAliasResolution(resolution);
    expect(result).toContain('Alias: opus');
    expect(result).toContain('Target: anthropic/claude-opus-4-6');
  });

  it('formats a resolved alias with model details', () => {
    const resolution = { alias: 'opus', target: 'anthropic/claude-opus-4-6', model: mockModel };
    const result = formatAliasResolution(resolution);
    expect(result).toContain('Alias: opus');
    expect(result).toContain('Target: anthropic/claude-opus-4-6');
    expect(result).toContain('Model Details:');
  });

  it('shows not found for unresolved alias', () => {
    const resolution = { alias: 'nonexistent', target: '' };
    const result = formatAliasResolution(resolution);
    expect(result).toContain('not found');
  });
});

describe('formatVersions', () => {
  it('formats a list of versions as a table', () => {
    const versions = [
      { version: '1.0.0', status: 'published', createdAt: '2026-01-01T00:00:00Z' },
      { version: '0.9.0', status: 'draft', createdAt: '2025-12-15T00:00:00Z' },
    ];
    const result = formatVersions(versions as Parameters<typeof formatVersions>[0]);
    expect(result).toContain('VERSION');
    expect(result).toContain('1.0.0');
    expect(result).toContain('0.9.0');
  });
});

describe('formatVersionDiff', () => {
  it('formats a diff with yaml changes', () => {
    const diff = {
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      hasChanges: true,
      fromYaml: 'name: foo\nversion: "1.0.0"\ndescription: old',
      toYaml: 'name: foo\nversion: "1.1.0"\ndescription: new\ntags:\n  - test',
    };
    const result = formatVersionDiff(diff);
    expect(result).toContain('1.0.0');
    expect(result).toContain('1.1.0');
    expect(result).toContain('lines added');
    expect(result).toContain('lines removed');
  });

  it('formats a diff with only additions', () => {
    const diff = {
      fromVersion: '1.0.0',
      toVersion: '1.1.0',
      hasChanges: true,
      fromYaml: 'name: foo',
      toYaml: 'name: foo\nextra: line',
    };
    const result = formatVersionDiff(diff);
    expect(result).toContain('+ 1 lines added');
  });

  it('shows "No changes" when yaml is identical', () => {
    const yaml = 'name: foo\nversion: "1.0.0"';
    const diff = {
      fromVersion: '1.0.0',
      toVersion: '1.0.0',
      fromYaml: yaml,
      toYaml: yaml,
    };
    const result = formatVersionDiff(diff);
    expect(result).toContain('No changes');
  });
});

describe('formatValidationResult', () => {
  it('formats a valid result', () => {
    expect(formatValidationResult({ valid: true })).toBe('Valid');
  });

  it('formats an invalid result with errors', () => {
    const result = formatValidationResult({
      valid: false,
      errors: [
        { path: '/name', message: 'Required field' },
        { path: '/type', message: 'Invalid enum value' },
      ],
    });
    expect(result).toContain('Invalid YAML');
    expect(result).toContain('/name: Required field');
    expect(result).toContain('/type: Invalid enum value');
  });

  it('formats an invalid result without errors', () => {
    const result = formatValidationResult({ valid: false });
    expect(result).toContain('Invalid YAML');
  });
});
