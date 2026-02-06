import { describe, it, expect, beforeEach } from 'vitest';
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
import {
  createDefinitionListItem,
  createDefinition,
  createModel,
  createModelAlias,
  createAliasResolution,
  createVersionListItem,
  createVersionDiff,
  createValidationResult,
  resetIds,
} from '../helpers/mock-factories.js';

beforeEach(() => {
  resetIds();
});

describe('formatDefinitions', () => {
  it('should return "No data" for empty array', () => {
    expect(formatDefinitions([])).toBe('No data');
  });

  it('should render table with definition columns', () => {
    const result = formatDefinitions([
      createDefinitionListItem({ name: 'my-validator', type: 'validator', version: '2.0.0', status: 'published' }),
    ]);
    expect(result).toContain('NAME');
    expect(result).toContain('TYPE');
    expect(result).toContain('VERSION');
    expect(result).toContain('STATUS');
    expect(result).toContain('VISIBILITY');
    expect(result).toContain('my-validator');
    expect(result).toContain('2.0.0');
    expect(result).toContain('published');
  });
});

describe('formatDefinition', () => {
  it('should display key-value fields', () => {
    const def = createDefinition({ name: 'code-val', displayName: 'Code Validator' });
    const result = formatDefinition(def);
    expect(result).toContain('Name: code-val');
    expect(result).toContain('Display Name: Code Validator');
  });

  it('should join tags with commas', () => {
    const def = createDefinition({ tags: ['quality', 'typescript', 'linting'] });
    const result = formatDefinition(def);
    expect(result).toContain('quality, typescript, linting');
  });

  it('should truncate long descriptions', () => {
    const def = createDefinition({ description: 'A'.repeat(100) });
    const result = formatDefinition(def);
    expect(result).toContain('...');
  });

  it('should handle null optional fields', () => {
    const def = createDefinition({ subdomain: null, agentType: null, publishedAt: null });
    const result = formatDefinition(def);
    expect(result).not.toContain('Subdomain');
    expect(result).not.toContain('Agent Type');
    expect(result).not.toContain('Published At');
  });
});

describe('formatModels', () => {
  it('should return "No data" for empty array', () => {
    expect(formatModels([])).toBe('No data');
  });

  it('should render table with model columns', () => {
    const result = formatModels([createModel({ provider: 'anthropic', modelId: 'claude-opus-4-6' })]);
    expect(result).toContain('PROVIDER');
    expect(result).toContain('MODEL ID');
    expect(result).toContain('TIER');
    expect(result).toContain('STATUS');
    expect(result).toContain('anthropic');
    expect(result).toContain('claude-opus-4-6');
  });
});

describe('formatModel', () => {
  it('should display capabilities as comma-joined truthy keys', () => {
    const model = createModel({
      capabilities: { vision: true, tools: true, streaming: false, extendedThinking: false },
    });
    const result = formatModel(model);
    expect(result).toContain('vision, tools');
    expect(result).not.toContain('streaming');
  });

  it('should show "none" when no capabilities are true', () => {
    const model = createModel({
      capabilities: { vision: false, tools: false, streaming: false, extendedThinking: false },
    });
    const result = formatModel(model);
    expect(result).toContain('Capabilities: none');
  });

  it('should join regions with commas', () => {
    const model = createModel({ regions: ['us-east-1', 'eu-west-1'] });
    const result = formatModel(model);
    expect(result).toContain('us-east-1, eu-west-1');
  });
});

describe('formatAliases', () => {
  it('should return "No data" for empty array', () => {
    expect(formatAliases([])).toBe('No data');
  });

  it('should render table with alias columns', () => {
    const result = formatAliases([createModelAlias({ alias: 'sonnet', deprecated: false })]);
    expect(result).toContain('ALIAS');
    expect(result).toContain('DEPRECATED');
    expect(result).toContain('sonnet');
    expect(result).toContain('No');
  });

  it('should show deprecated status', () => {
    const result = formatAliases([createModelAlias({ deprecated: true })]);
    expect(result).toContain('Yes');
  });
});

describe('formatAliasResolution', () => {
  it('should display resolved alias details', () => {
    const resolution = createAliasResolution({
      alias: 'sonnet',
      resolved: true,
      provider: 'anthropic',
      modelId: 'claude-sonnet-4-5',
    });
    const result = formatAliasResolution(resolution);
    expect(result).toContain('Alias: sonnet');
    expect(result).toContain('Provider: anthropic');
    expect(result).toContain('Model ID: claude-sonnet-4-5');
  });

  it('should show "not found" for unresolved alias', () => {
    const resolution = createAliasResolution({
      alias: 'unknown',
      resolved: false,
    });
    const result = formatAliasResolution(resolution);
    expect(result).toBe('Alias "unknown" not found');
  });

  it('should show deprecated status', () => {
    const resolution = createAliasResolution({
      resolved: true,
      deprecated: true,
    });
    const result = formatAliasResolution(resolution);
    expect(result).toContain('Status: DEPRECATED');
  });

  it('should include model details when present', () => {
    const model = createModel({ displayName: 'Claude Opus' });
    const resolution = createAliasResolution({
      resolved: true,
      model,
    });
    const result = formatAliasResolution(resolution);
    expect(result).toContain('Model Details:');
    expect(result).toContain('Claude Opus');
  });
});

describe('formatVersions', () => {
  it('should return "No data" for empty array', () => {
    expect(formatVersions([])).toBe('No data');
  });

  it('should render table with version columns', () => {
    const result = formatVersions([createVersionListItem({ version: '2.1.0', status: 'published' })]);
    expect(result).toContain('VERSION');
    expect(result).toContain('STATUS');
    expect(result).toContain('CREATED');
    expect(result).toContain('2.1.0');
    expect(result).toContain('published');
  });
});

describe('formatVersionDiff', () => {
  it('should show from/to versions and yaml changes', () => {
    const diff = createVersionDiff();
    const result = formatVersionDiff(diff);
    expect(result).toContain('From: 1.0.0 -> To: 1.1.0');
    expect(result).toContain('YAML changes:');
    expect(result).toContain('+ 5 added');
    expect(result).toContain('- 2 removed');
    expect(result).toContain('~ 3 modified');
  });

  it('should show metadata changes', () => {
    const diff = createVersionDiff({
      changes: {
        metadata: {
          displayName: { from: 'Old Name', to: 'New Name' },
        },
      },
    });
    const result = formatVersionDiff(diff);
    expect(result).toContain('Metadata changes:');
    expect(result).toContain('displayName: Old Name -> New Name');
  });

  it('should show "No changes" when empty', () => {
    const diff = createVersionDiff({ changes: {} });
    const result = formatVersionDiff(diff);
    expect(result).toContain('No changes');
  });
});

describe('formatValidationResult', () => {
  it('should return "Valid" for valid result', () => {
    expect(formatValidationResult(createValidationResult({ valid: true }))).toBe('Valid');
  });

  it('should list errors for invalid result', () => {
    const result = formatValidationResult(
      createValidationResult({
        valid: false,
        errors: [
          { path: '/name', message: 'Required field' },
          { path: '/version', message: 'Invalid format' },
        ],
      })
    );
    expect(result).toContain('Invalid YAML:');
    expect(result).toContain('/name: Required field');
    expect(result).toContain('/version: Invalid format');
  });
});
