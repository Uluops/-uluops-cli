/**
 * promote-system-definitions.ts
 *
 * One-shot bulk metadata update: walks every definition owned by the `system`
 * org in the UluOps registry and sets:
 *   tier            = 'pro'
 *   minSubscription = 'free'
 *   visibility      = 'public'
 *
 * Idempotent — re-running after a successful apply is a no-op.
 *
 * Usage:
 *   ULUOPS_REGISTRY_API_KEY=ulr_... \
 *     npx tsx scripts/promote-system-definitions.ts          # dry-run
 *   ULUOPS_REGISTRY_API_KEY=ulr_... \
 *     npx tsx scripts/promote-system-definitions.ts --apply  # mutate
 *
 * Flags:
 *   --apply               actually call PUT; without this, just prints diff
 *   --base-url <url>      override registry base URL
 *   --concurrency <n>     parallel update workers (default 5)
 *   --limit <n>           page size for list() (default 100, max 100)
 */

import { RegistryClient } from '@uluops/registry-sdk';
import type {
  DefinitionListItem,
  UpdateDefinitionBody,
} from '@uluops/registry-sdk';

const TARGET = {
  tier: 'pro' as const,
  minSubscription: 'free' as const,
  visibility: 'public' as const,
};

const DEFINITION_TYPES = ['agent', 'command', 'workflow', 'pipeline'] as const;
type DefType = (typeof DEFINITION_TYPES)[number];

interface Args {
  apply: boolean;
  baseUrl?: string;
  concurrency: number;
  limit: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { apply: false, concurrency: 5, limit: 100 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--apply') args.apply = true;
    else if (a === '--base-url') args.baseUrl = argv[++i];
    else if (a === '--concurrency') args.concurrency = parseInt(argv[++i] ?? '5', 10);
    else if (a === '--limit') args.limit = Math.min(parseInt(argv[++i] ?? '100', 10), 100);
    else if (a === '--help' || a === '-h') {
      printHelp();
      process.exit(0);
    } else {
      console.error(`Unknown argument: ${a}`);
      printHelp();
      process.exit(2);
    }
  }
  return args;
}

function printHelp(): void {
  console.log(
    [
      'Promote every system-org definition to tier=pro, minSubscription=free, visibility=public.',
      '',
      'Flags:',
      '  --apply               actually call PUT; default is dry-run',
      '  --base-url <url>      override registry base URL',
      '  --concurrency <n>     parallel update workers (default 5)',
      '  --limit <n>           page size for list() (default 100, max 100)',
      '  --help, -h            show this message',
      '',
      'Env:',
      '  ULUOPS_REGISTRY_API_KEY  required, must start with `ulr_`',
    ].join('\n'),
  );
}

interface PerTypeStats {
  total: number;
  aligned: number;
  changed: number;
  failed: number;
}

interface Failure {
  type: DefType;
  name: string;
  version: string;
  error: string;
}

async function listAll(
  client: RegistryClient,
  type: DefType,
  limit: number,
): Promise<DefinitionListItem[]> {
  const items: DefinitionListItem[] = [];
  let offset = 0;
  while (true) {
    const page = await client.definitions.list({ type, limit, offset });
    items.push(...page.definitions);
    if (page.definitions.length < limit) break;
    offset += page.definitions.length;
    if (page.total && offset >= page.total) break;
  }
  return items;
}

function computeDiff(item: DefinitionListItem): UpdateDefinitionBody {
  const diff: UpdateDefinitionBody = {};
  if (item.tier !== TARGET.tier) diff.tier = TARGET.tier;
  if (item.minSubscription !== TARGET.minSubscription) diff.minSubscription = TARGET.minSubscription;
  if (item.visibility !== TARGET.visibility) diff.visibility = TARGET.visibility;
  return diff;
}

function describeDiff(diff: UpdateDefinitionBody): string {
  const parts: string[] = [];
  if (diff.tier !== undefined) parts.push(`tier→${diff.tier}`);
  if (diff.minSubscription !== undefined) parts.push(`min→${diff.minSubscription}`);
  if (diff.visibility !== undefined) parts.push(`vis→${diff.visibility}`);
  return parts.join(', ');
}

async function runBatches<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const slice = items.slice(i, i + concurrency);
    const batch = await Promise.all(slice.map(worker));
    results.push(...batch);
  }
  return results;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const apiKey = process.env['ULUOPS_REGISTRY_API_KEY'] ?? process.env['ULUOPS_API_KEY'];
  if (!apiKey || !apiKey.startsWith('ulr_')) {
    console.error(
      'A registry-scoped API key (`ulr_...`) is required.\n' +
        'Set ULUOPS_REGISTRY_API_KEY (preferred) or ULUOPS_API_KEY.\n' +
        'Generate a key at https://app.uluops.ai.',
    );
    process.exit(2);
  }

  const client = new RegistryClient({
    apiKey,
    orgSlug: 'system',
    debug: process.env['DEBUG'] === 'true',
    ...(args.baseUrl ? { baseUrl: args.baseUrl } : {}),
  });

  const mode = args.apply ? 'APPLY' : 'DRY-RUN';
  console.log(`[${mode}] target=${JSON.stringify(TARGET)} concurrency=${args.concurrency}`);
  console.log('');

  const stats: Record<DefType, PerTypeStats> = {
    agent: { total: 0, aligned: 0, changed: 0, failed: 0 },
    command: { total: 0, aligned: 0, changed: 0, failed: 0 },
    workflow: { total: 0, aligned: 0, changed: 0, failed: 0 },
    pipeline: { total: 0, aligned: 0, changed: 0, failed: 0 },
  };
  const failures: Failure[] = [];

  for (const type of DEFINITION_TYPES) {
    process.stdout.write(`Listing ${type}s... `);
    const items = await listAll(client, type, args.limit);
    stats[type].total = items.length;
    console.log(`${items.length} found`);

    await runBatches(items, args.concurrency, async (item) => {
      const diff = computeDiff(item);
      if (Object.keys(diff).length === 0) {
        stats[type].aligned++;
        return;
      }
      const label = `${type}/${item.name}@${item.version}`;
      if (!args.apply) {
        stats[type].changed++;
        console.log(`  [would-update] ${label}: ${describeDiff(diff)}`);
        return;
      }
      try {
        await client.definitions.update(type, item.name, item.version, diff);
        stats[type].changed++;
        console.log(`  [updated]      ${label}: ${describeDiff(diff)}`);
      } catch (err) {
        stats[type].failed++;
        const msg = err instanceof Error ? err.message : String(err);
        failures.push({ type, name: item.name, version: item.version, error: msg });
        console.log(`  [FAILED]       ${label}: ${msg}`);
      }
    });
    console.log('');
  }

  console.log('────────────────────────────────────────────────────────');
  console.log(`Summary (${mode})`);
  console.log('────────────────────────────────────────────────────────');
  console.log('type       total  aligned  changed  failed');
  let grandTotal = 0;
  let grandAligned = 0;
  let grandChanged = 0;
  let grandFailed = 0;
  for (const type of DEFINITION_TYPES) {
    const s = stats[type];
    grandTotal += s.total;
    grandAligned += s.aligned;
    grandChanged += s.changed;
    grandFailed += s.failed;
    console.log(
      `${type.padEnd(10)} ${String(s.total).padStart(5)}  ${String(s.aligned).padStart(7)}  ${String(s.changed).padStart(7)}  ${String(s.failed).padStart(6)}`,
    );
  }
  console.log('────────────────────────────────────────────────────────');
  console.log(
    `${'all'.padEnd(10)} ${String(grandTotal).padStart(5)}  ${String(grandAligned).padStart(7)}  ${String(grandChanged).padStart(7)}  ${String(grandFailed).padStart(6)}`,
  );

  if (failures.length > 0) {
    console.log('');
    console.log('Failures:');
    for (const f of failures) {
      console.log(`  ${f.type}/${f.name}@${f.version} — ${f.error}`);
    }
  }

  if (!args.apply && grandChanged > 0) {
    console.log('');
    console.log(`Dry-run complete. Re-run with --apply to mutate ${grandChanged} definition(s).`);
  }

  process.exit(grandFailed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Fatal:', err instanceof Error ? err.stack ?? err.message : err);
  process.exit(1);
});
