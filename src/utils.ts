import ora, { type Ora } from 'ora';
import { writeFileSync, renameSync } from 'node:fs';

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
  writeFileSync(tmpPath, content, { mode: 0o600 });
  renameSync(tmpPath, filePath);
}

/**
 * Convert camelCase to snake_case
 */
export function toSnakeCase(str: string): string {
  return str.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

/**
 * Get a property from an object, trying camelCase first then snake_case
 * Useful for handling API responses that may use either format
 */
export function getFlexibleProperty<T>(
  obj: object,
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
