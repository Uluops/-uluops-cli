/**
 * Formatters for registry-sdk types (definitions, models)
 */
import type {
  AliasResolution,
  Definition,
  DefinitionListItem,
  Model,
  ModelAlias,
  ValidationResult,
  VersionDiff,
  VersionDiffSummary,
  VersionListItem,
} from '@uluops/registry-sdk';
import { isVerdictTrustworthy } from '@uluops/registry-sdk';
import { formatDisplayDate, truncate } from '../utils.js';
import { type Column, formatKeyValue, formatTable } from './table.js';

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
  const lines: string[] = [];

  lines.push(
    formatKeyValue({
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
      uniqueExecutionCount: def.uniqueExecutionCount,
      forkCount: def.forkCount,
      starCount: def.starCount,
      createdAt: formatDisplayDate(def.createdAt),
      updatedAt: formatDisplayDate(def.updatedAt),
      publishedAt: def.publishedAt
        ? formatDisplayDate(def.publishedAt)
        : undefined,
    }),
  );

  // Provenance
  if (def.provenance) {
    lines.push('');
    const prov = def.provenance;
    lines.push(`Authorship: ${prov.authorshipType}`);
    if (prov.contributors?.length) {
      for (const c of prov.contributors) {
        const name = c.name || c.id;
        const role = c.role;
        const type = c.type;
        lines.push(
          `  ${type === 'agent' ? '\u{1F916}' : '\u{1F464}'} ${name} (${role})`,
        );
      }
    }
    if (prov.dialecticRounds !== undefined && prov.dialecticRounds > 0) {
      lines.push(`Dialectic rounds: ${String(prov.dialecticRounds)}`);
    }
  }

  // Fork lineage
  if (def.forkedFromId) {
    lines.push('');
    lines.push(`Forked from: ${def.forkedFromId}`);
  }

  // Safety analysis
  lines.push('');
  if (!def.riskProfile) {
    if (def.status === 'published') {
      lines.push('No risk signals. Deep analysis pending.');
    }
  } else {
    const profile = def.riskProfile;
    const caps = profile.sync?.capabilities;
    const signals = profile.sync?.signals;

    // Capabilities (neutral metadata)
    if (caps?.tools?.length) {
      lines.push(`Tools: ${caps.tools.join(', ')}`);
    }
    if (caps?.maxTokens !== undefined)
      lines.push(`Max tokens: ${String(caps.maxTokens)}`);
    if (caps?.temperature !== undefined)
      lines.push(`Temperature: ${String(caps.temperature)}`);

    // Risk signals. A failed sync scan carries aggregateRiskLevel 'none' as a
    // sentinel ("could not determine"), NOT a clean verdict \u2014 never render the
    // absence of signals as "No risk signals." (perverse-outcome finding P6)
    if (!isVerdictTrustworthy(profile)) {
      const reason = profile.scanFailedReason
        ? ` (${profile.scanFailedReason})`
        : '';
      lines.push('');
      lines.push(
        `\u26A0\uFE0F  Safety scan incomplete${reason} \u2014 could not determine.`,
      );
      lines.push('    Absence of signals is not a clean verdict.');
    } else if (!signals?.length) {
      lines.push('No risk signals.');
    } else {
      lines.push('');
      lines.push('\u26A0\uFE0F  Risk Signals:');
      for (const signal of signals) {
        lines.push(`  ${signal.severity.toUpperCase()}   ${signal.title}`);
        lines.push(`         ${signal.detail}`);
      }
      lines.push('');
      lines.push(`Risk Level: ${profile.aggregateRiskLevel.toUpperCase()}`);
    }

    // Analyzer info
    const scannedAt = profile.sync?.scannedAt;
    const version = profile.sync?.version;
    if (scannedAt) {
      const dateStr = scannedAt.split('T')[0];
      lines.push(
        `Last analyzed: ${dateStr}${version ? ` (analyzer v${version})` : ''}`,
      );
    }
    if (!profile.deep) {
      lines.push('Deep analysis pending.');
    } else if (profile.deep.status === 'error') {
      // Deep run errored \u2014 empty findings are a sentinel, not a clean verdict.
      lines.push('Deep analysis incomplete \u2014 could not determine.');
    }
  }

  return lines.join('\n');
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
    description: model.description
      ? truncate(model.description, 60)
      : undefined,
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
    {
      header: 'DEPRECATED',
      accessor: (a: ModelAlias) => (a.deprecated ? 'Yes' : 'No'),
      width: 10,
    },
  ];
  return formatTable(aliases, columns);
}

/**
 * Format alias resolution result
 */
export function formatAliasResolution(resolution: AliasResolution): string {
  if (!resolution.target) {
    return `Alias "${resolution.alias}" not found`;
  }

  const lines = [`Alias: ${resolution.alias}`, `Target: ${resolution.target}`];

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
    {
      header: 'HASH',
      accessor: (v: VersionListItem) => {
        return v.hash ? v.hash.replace('sha256:', '').slice(0, 8) : '';
      },
      width: 10,
    },
    {
      header: 'CHANGE',
      accessor: (v: VersionListItem) => v.changeSummary || '',
      width: 24,
    },
    {
      header: 'CREATED',
      accessor: (v: VersionListItem) => formatDisplayDate(v.createdAt),
      width: 20,
    },
  ];
  return formatTable(versions, columns);
}

/**
 * Format version diff
 */
export function formatVersionDiff(
  diff: VersionDiff | VersionDiffSummary,
): string {
  const lines = [`From: ${diff.fromVersion} -> To: ${diff.toVersion}`, ''];

  if (!diff.hasChanges) {
    lines.push('No changes');
    return lines.join('\n');
  }

  // Full diff includes raw YAML
  if ('fromYaml' in diff) {
    const fromLines = diff.fromYaml.split('\n');
    const toLines = diff.toYaml.split('\n');
    const added = toLines.filter((l) => !fromLines.includes(l)).length;
    const removed = fromLines.filter((l) => !toLines.includes(l)).length;
    lines.push('YAML changes:');
    lines.push(`  + ${added} lines added`);
    lines.push(`  - ${removed} lines removed`);
  } else {
    // Summary diff — section-level changes
    lines.push(`Lines: ${diff.fromLineCount} -> ${diff.toLineCount}`);
    if (diff.sectionsAdded.length > 0)
      lines.push(`Added: ${diff.sectionsAdded.join(', ')}`);
    if (diff.sectionsRemoved.length > 0)
      lines.push(`Removed: ${diff.sectionsRemoved.join(', ')}`);
    if (diff.sectionsModified.length > 0)
      lines.push(`Modified: ${diff.sectionsModified.join(', ')}`);
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
