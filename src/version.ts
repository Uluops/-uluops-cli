import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

/**
 * Read the CLI's own version from package.json at runtime.
 *
 * Resolves package.json relative to the compiled module (one level up from
 * `dist/`), memoizes the result, and falls back to `'0.0.0'` on a broken
 * install. Shared by the entry point (`cli.ts`, for `--version`) and the JSON
 * output envelope (`formatters/json.ts`, for `cliVersion`) so there is a single
 * source of truth.
 */
export function getCliVersion(): string {
  if (cached !== undefined) return cached;
  const __filename = fileURLToPath(import.meta.url);
  const packageJsonPath = join(dirname(__filename), '..', 'package.json');
  let resolved = '0.0.0';
  try {
    const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
    if (typeof packageJson.version === 'string') resolved = packageJson.version;
  } catch {
    // Broken install — use fallback version
  }
  cached = resolved;
  return resolved;
}
