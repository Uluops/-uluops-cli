import ora, { type Ora } from 'ora';
import { writeFileSync, renameSync, unlinkSync } from 'node:fs';

/**
 * Create a spinner for long-running operations
 */
export function createSpinner(text: string): Ora {
  return ora({
    text,
    spinner: 'dots',
  });
}

/**
 * Options for withSpinner utility
 */
export interface WithSpinnerOptions {
  /** Message shown while operation is in progress */
  start: string;
  /** Message shown on success (optional - uses start message if not provided) */
  success?: string;
  /** Message shown on failure */
  failure: string;
}

/**
 * Execute an async operation with spinner feedback
 */
export async function withSpinner<T>(
  ctx: { quiet: boolean },
  options: WithSpinnerOptions,
  fn: () => Promise<T>
): Promise<T> {
  const spinner = ctx.quiet ? null : createSpinner(options.start);

  try {
    spinner?.start();
    const result = await fn();
    spinner?.succeed(options.success);
    return result;
  } catch (error) {
    spinner?.fail(options.failure);
    throw error;
  }
}

/**
 * Format a date for human-readable CLI display
 */
export function formatDisplayDate(date: string | Date | undefined | null): string {
  if (!date) return 'N/A';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleString();
}

/**
 * Truncate a string with ellipsis
 */
export function truncate(str: string, maxLength: number): string {
  if (str.length <= maxLength) return str;
  return str.slice(0, maxLength - 3) + '...';
}

/**
 * Format JSON output
 */
export function formatJson(data: unknown): string {
  return JSON.stringify(data, null, 2);
}

/**
 * Print error message and exit
 */
export function exitWithError(message: string, code = 1): never {
  console.error(`Error: ${message}`);
  process.exit(code);
}

/**
 * Redact sensitive values for display
 */
export function redact(value: string, showLast = 4): string {
  if (value.length <= showLast) return '[REDACTED]';
  return `${'*'.repeat(value.length - showLast)}${value.slice(-showLast)}`;
}

/**
 * Write a file atomically by writing to a temp file then renaming.
 * Prevents corruption if the process crashes mid-write.
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tmpPath = `${filePath}.tmp`;
  try {
    writeFileSync(tmpPath, content, { mode: 0o600 });
    renameSync(tmpPath, filePath);
  } catch (error) {
    try { unlinkSync(tmpPath); } catch { /* tmp may not exist */ }
    throw error;
  }
}

/**
 * Convert camelCase string to snake_case.
 * @param str - The camelCase string to convert (e.g. "someField" → "some_field")
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Convert snake_case string to camelCase.
 * @param str - The snake_case string to convert (e.g. "some_field" → "someField")
 */
export function toCamelCase(str: string): string {
  return str.replace(/_([a-z])/g, (_, letter: string) => letter.toUpperCase());
}

/**
 * Recursively normalize object keys from snake_case to camelCase.
 * Accepts both formats — keys already in camelCase pass through unchanged.
 * Primitives and null values are returned as-is.
 * @param input - The value to normalize (object, array, or primitive)
 * @returns A deep copy with all object keys converted to camelCase
 */
export function normalizeKeys(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(normalizeKeys);
  }
  if (input !== null && typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[toCamelCase(key)] = normalizeKeys(value);
    }
    return result;
  }
  return input;
}

/**
 * Get a property from an object, trying camelCase first then snake_case.
 *
 * The UluOps API returns snake_case keys, but the SDK normalizes them to camelCase.
 * Some responses (especially nested/dynamic objects) may arrive in either format
 * depending on whether they've been normalized. This helper abstracts that away.
 *
 * @param obj - The object to read from
 * @param camelCaseKey - The property name in camelCase (snake_case is derived automatically)
 * @param defaultValue - Fallback if neither key exists or is undefined
 */
export function getFlexibleProperty<T, O extends object = object>(
  obj: O,
  camelCaseKey: string,
  defaultValue: T
): T {
  const record = obj as Record<string, unknown>;
  // Try camelCase first
  if (camelCaseKey in record && record[camelCaseKey] !== undefined) {
    return record[camelCaseKey] as T;
  }
  // Try snake_case
  const snakeKey = toSnakeCase(camelCaseKey);
  if (snakeKey in record && record[snakeKey] !== undefined) {
    return record[snakeKey] as T;
  }
  return defaultValue;
}
