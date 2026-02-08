/**
 * Formatters for registry-sdk types (definitions, models)
 */
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
import { formatTable, formatKeyValue, type Column } from './table.js';
import { formatDisplayDate, truncate } from '../utils.js';

/**
 * Format a list of definitions as table
 */
export function formatDefinitions(definitions: DefinitionListItem[]): string {
  const columns: Column<DefinitionListItem>[] = [
    { header: 'NAME', accessor: 'name', width: 25 },
    { header: 'TYPE', accessor: 'type', width: 10 },
    { header: 'VERSION', accessor: 'version', width: 10 },
    { header: 'STATUS', accessor: 'status', width: 12 },
    { header: 'VISIBILITY', accessor: 'visibility', width: 10 },
  ];
  return formatTable(definitions, columns);
}

/**
 * Format a single definition
 */
export function formatDefinition(def: Definition): string {
  return formatKeyValue({
    name: def.name,
    type: def.type,
    version: def.version,
    status: def.status,
    displayName: def.displayName,
    description: def.description ? truncate(def.description, 60) : undefined,
    domain: def.domain,
    subdomain: def.subdomain,
    agentType: def.agentType,
    visibility: def.visibility,
    tier: def.tier,
    tags: def.tags?.join(', '),
    executionCount: def.executionCount,
    forkCount: def.forkCount,
    starCount: def.starCount,
    createdAt: formatDisplayDate(def.createdAt),
    updatedAt: formatDisplayDate(def.updatedAt),
    publishedAt: def.publishedAt ? formatDisplayDate(def.publishedAt) : undefined,
  });
}

/**
 * Format a list of models as table
 */
export function formatModels(models: Model[]): string {
  const columns: Column<Model>[] = [
    { header: 'PROVIDER', accessor: 'provider', width: 12 },
    { header: 'MODEL ID', accessor: 'modelId', width: 25 },
    { header: 'TIER', accessor: 'tier', width: 10 },
    { header: 'STATUS', accessor: 'status', width: 12 },
  ];
  return formatTable(models, columns);
}

/**
 * Format a single model
 */
export function formatModel(model: Model): string {
  const capabilities = Object.entries(model.capabilities)
    .filter(([, v]) => v)
    .map(([k]) => k)
    .join(', ');

  return formatKeyValue({
    provider: model.provider,
    modelId: model.modelId,
    displayName: model.displayName,
    description: model.description ? truncate(model.description, 60) : undefined,
    tier: model.tier,
    status: model.status,
    capabilities: capabilities || 'none',
    regions: model.regions?.join(', '),
    releaseDate: model.releaseDate,
    deprecationDate: model.deprecationDate,
    successor: model.successor,
  });
}

/**
 * Format a list of model aliases as table
 */
export function formatAliases(aliases: ModelAlias[]): string {
  const columns: Column<ModelAlias>[] = [
    { header: 'ALIAS', accessor: 'alias', width: 20 },
    { header: 'PROVIDER', accessor: 'provider', width: 12 },
    { header: 'MODEL', accessor: 'modelId', width: 25 },
    { header: 'SCOPE', accessor: 'scope', width: 8 },
    { header: 'DEPRECATED', accessor: (a: ModelAlias) => a.deprecated ? 'Yes' : 'No', width: 10 },
  ];
  return formatTable(aliases, columns);
}

/**
 * Format alias resolution result
 */
export function formatAliasResolution(resolution: AliasResolution): string {
  if (!resolution.resolved) {
    return `Alias "${resolution.alias}" not found`;
  }

  const lines = [
    `Alias: ${resolution.alias}`,
    `Provider: ${resolution.provider}`,
    `Model ID: ${resolution.modelId}`,
  ];

  if (resolution.deprecated) {
    lines.push('Status: DEPRECATED');
  }

  if (resolution.model) {
    lines.push('', 'Model Details:', formatModel(resolution.model));
  }

  return lines.join('\n');
}

/**
 * Format a list of versions as table
 */
export function formatVersions(versions: VersionListItem[]): string {
  const columns: Column<VersionListItem>[] = [
    { header: 'VERSION', accessor: 'version', width: 12 },
    { header: 'STATUS', accessor: 'status', width: 12 },
    { header: 'CREATED', accessor: (v: VersionListItem) => formatDisplayDate(v.createdAt), width: 20 },
  ];
  return formatTable(versions, columns);
}

/**
 * Format version diff
 */
export function formatVersionDiff(diff: VersionDiff): string {
  const lines = [
    `From: ${diff.from.version} -> To: ${diff.to.version}`,
    '',
  ];

  if (diff.changes.yaml) {
    lines.push('YAML changes:');
    lines.push(`  + ${diff.changes.yaml.added} added`);
    lines.push(`  - ${diff.changes.yaml.removed} removed`);
    lines.push(`  ~ ${diff.changes.yaml.modified} modified`);
  }

  if (diff.changes.metadata) {
    lines.push('', 'Metadata changes:');
    for (const [key, change] of Object.entries(diff.changes.metadata)) {
      lines.push(`  ${key}: ${String(change.from)} -> ${String(change.to)}`);
    }
  }

  if (!diff.changes.yaml && !diff.changes.metadata) {
    lines.push('No changes');
  }

  return lines.join('\n');
}

/**
 * Format validation result
 */
export function formatValidationResult(result: ValidationResult): string {
  if (result.valid) {
    return 'Valid';
  }

  const lines = ['Invalid YAML:', ''];

  if (result.errors && result.errors.length > 0) {
    for (const error of result.errors) {
      lines.push(`  ${error.path}: ${error.message}`);
    }
  }

  return lines.join('\n');
}
