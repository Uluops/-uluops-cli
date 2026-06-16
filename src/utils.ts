import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import ora, { type Ora } from 'ora';

/**
 * Create a spinner for long-running operations. Internal helper for
 * `withSpinner`; not exported because nothing outside this module uses it.
 */
function createSpinner(text: string): Ora {
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
 * Execute an async operation with spinner feedback.
 *
 * @param ctx - Display flags; the spinner is suppressed under `quiet` or `json`.
 * @param options - Start/success/failure messages for the spinner.
 * @param fn - The async operation to run.
 * @returns The resolved value of `fn` on success; re-throws (after failing the
 *   spinner) if `fn` rejects.
 */
export async function withSpinner<T>(
  ctx: { quiet: boolean; json?: boolean },
  options: WithSpinnerOptions,
  fn: () => Promise<T>,
): Promise<T> {
  const spinner = ctx.quiet || ctx.json ? null : createSpinner(options.start);

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
export function formatDisplayDate(
  date: string | Date | undefined | null,
): string {
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
 * Strip ANSI escape sequences from server-controlled strings before they
 * reach the user's terminal (post-impl r2, CWE-116).
 *
 * The SDK schemas constrain string lengths but do NOT strip control bytes.
 * A compromised or adversarial registry/tracker API could return a name,
 * version, context, title, or content value containing:
 *   - `\x1b[2J\x1b[H` to clear the terminal + reset cursor
 *   - `\x1b]0;{title}\x07` to spoof the window title (OSC)
 *   - `\x1b[6n` to probe cursor position (RIS)
 * Pass any string sourced from a remote response through this before
 * `console.log` to neutralize the vector. Compliant servers never include
 * these sequences; an attack chain produces visibly-stripped text instead
 * of an injection event.
 */
export function stripAnsi(str: string): string {
  // Biome flags control bytes in regexes as suspicious because they're
  // usually accidental — here they're load-bearing for the CWE-116 strip,
  // explicitly documented in the JSDoc above, and confined to this helper.
  return (
    str
      // CSI sequence: ESC [ ... letter
      // biome-ignore lint/suspicious/noControlCharactersInRegex: CSI ESC (0x1b)
      .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
      // OSC sequence: ESC ] ... BEL
      // biome-ignore lint/suspicious/noControlCharactersInRegex: OSC framed by ESC (0x1b) ... BEL (0x07)
      .replace(/\x1b\][^\x07]*\x07/g, '')
      // Bare control chars below 0x20 (except tab/newline/cr) + DEL.
      // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping bare control bytes is the point
      .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '')
  );
}

/**
 * Print error message and exit
 */
export function exitWithError(message: string, code = 1): never {
  console.error(`Error: ${message}`);
  process.exit(code);
}

/**
 * Safely extract an error code from a caught error.
 * Avoids unguarded `as NodeJS.ErrnoException` casts on `unknown`.
 */
export function getErrorCode(error: unknown): string | undefined {
  if (error instanceof Error && 'code' in error) {
    return (error as NodeJS.ErrnoException).code;
  }
  return undefined;
}

/**
 * Redact sensitive values for display (shows the last `showLast` chars, masks
 * the rest; fully redacts values shorter than or equal to `showLast`).
 *
 * @internal Not yet wired into a production output path; exported only for unit
 * testing. Intended for masking API keys in future `--debug`/`whoami` output.
 */
export function redact(value: string, showLast = 4): string {
  if (value.length <= showLast) return '[REDACTED]';
  return `${'*'.repeat(value.length - showLast)}${value.slice(-showLast)}`;
}

/**
 * Read a file with user-friendly error messages for common failures.
 * Use this for CLI --file options instead of raw readFileSync.
 */
export function readFileOption(filePath: string): string {
  if (!existsSync(filePath)) {
    console.error(`Error: File not found: ${filePath}`);
    console.error(
      '\nHint: Check the path passed to --file. Use an absolute path or a path relative to the current directory.',
    );
    process.exit(1);
  }
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (error) {
    const code = getErrorCode(error);
    if (code === 'EISDIR') {
      console.error(`Error: ${filePath} is a directory, not a file`);
      console.error(
        '\nHint: The --file option requires a path to a YAML file, not a directory.',
      );
      process.exit(1);
    }
    if (code === 'EACCES') {
      console.error(`Error: Permission denied: ${filePath}`);
      console.error(
        '\nHint: Check file permissions. Run "chmod +r" on the file if needed.',
      );
      process.exit(1);
    }
    exitWithError(`Cannot read file: ${filePath}`);
  }
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
    try {
      unlinkSync(tmpPath);
    } catch {
      /* tmp may not exist */
    }
    throw error;
  }
}

/**
 * Parse a string as an integer, exiting with a clear error if it's not a valid number.
 * Use this instead of raw parseInt() for CLI option values.
 */
export function parseIntOption(value: string, name: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed)) {
    exitWithError(`Invalid number for ${name}: "${value}"`);
  }
  return parsed;
}

/**
 * Parse a string as a float, exiting with a clear error if it's not a valid number.
 * Use this instead of raw parseFloat() for CLI option values.
 */
export function parseFloatOption(value: string, name: string): number {
  const parsed = parseFloat(value);
  if (Number.isNaN(parsed)) {
    exitWithError(`Invalid number for ${name}: "${value}"`);
  }
  return parsed;
}

const DEFINITION_TYPES = ['agent', 'command', 'workflow', 'pipeline'] as const;

/**
 * Infer definition type from a YAML filename.
 * Matches patterns like `foo.agent.yaml`, `bar.command.yml`, etc.
 * Returns null if the type cannot be inferred.
 */
export function inferDefinitionType(filePath: string): string | null {
  const basename = path.basename(filePath);
  for (const t of DEFINITION_TYPES) {
    if (basename.includes(`.${t}.`)) return t;
  }
  return null;
}

/**
 * Resolve definition type from an explicit value or by inferring from filename.
 * Exits with a helpful error if neither is available.
 */
export function resolveDefinitionType(
  explicit: string | undefined,
  filePath: string | undefined,
): string {
  if (explicit) return explicit;
  if (filePath) {
    const inferred = inferDefinitionType(filePath);
    if (inferred) return inferred;
  }
  console.error('Error: Could not determine definition type.');
  console.error(
    '\nHint: Either pass the type as an argument or use a filename like my-agent.agent.yaml',
  );
  console.error('Valid types: agent, command, workflow, pipeline');
  process.exit(1);
}

/**
 * Cast SDK response to a flexible record for handling API/SDK type mismatches.
 * Provides a runtime safety check instead of double assertions (as unknown as Record).
 */
export function asFlexibleResponse(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null) return {};
  return value as Record<string, unknown>;
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
    for (const [key, value] of Object.entries(
      input as Record<string, unknown>,
    )) {
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
  defaultValue: T,
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

/**
 * Resolve project name from an explicit argument.
 * Exits with a helpful error if not provided.
 */
export function resolveProject(explicit: string | undefined): string {
  if (explicit) return explicit;

  exitWithError(
    'No project specified.\n' +
      'Pass the project name as the first argument (e.g. `ulu runs list <project>`).',
  );
}

/**
 * Prompt the user for input on the terminal.
 * Returns the entered value (empty string if nothing entered).
 */
export function promptInput(
  question: string,
  options?: { hidden?: boolean },
): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({
      input: process.stdin,
      output: process.stderr,
    });

    if (options?.hidden) {
      // Mask password input
      process.stderr.write(question);
      const stdin = process.stdin;
      const wasRaw = stdin.isRaw;
      if (stdin.isTTY && stdin.setRawMode) {
        stdin.setRawMode(true);
      }
      let input = '';
      const onData = (char: Buffer) => {
        const c = char.toString('utf8');
        if (c === '\n' || c === '\r' || c === '\u0004') {
          if (stdin.isTTY && stdin.setRawMode)
            stdin.setRawMode(wasRaw ?? false);
          stdin.removeListener('data', onData);
          process.stderr.write('\n');
          rl.close();
          resolve(input);
        } else if (c === '\u007f' || c === '\b') {
          // Backspace
          input = input.slice(0, -1);
        } else if (c === '\u0003') {
          // Ctrl+C
          rl.close();
          process.exit(130);
        } else {
          input += c;
        }
      };
      stdin.on('data', onData);
    } else {
      rl.question(question, (answer) => {
        rl.close();
        resolve(answer);
      });
    }
  });
}

/**
 * Gate a destructive action behind confirmation, failing closed when it cannot
 * prompt.
 *
 * Behavior:
 * - `skip` (from --yes/-y): proceed immediately, no prompt.
 * - Interactive TTY: prompt; a non-"yes" answer cancels cleanly (exit 0) — the
 *   user made a deliberate choice not to proceed.
 * - Non-interactive (no TTY) WITHOUT --yes: there is no one to answer, so the
 *   absence of a "yes" is not a deliberate decline. Fail closed — write an
 *   actionable message to stderr and exit non-zero — instead of silently
 *   skipping the action with a success code. A captive CI/automation caller
 *   cannot distinguish a silent exit-0 skip from a successful deletion, so the
 *   skip path must be loud and non-zero.
 *
 * Never returns when it cancels or fails closed (it calls process.exit).
 */
export async function confirmOrExit(
  message: string,
  skip = false,
): Promise<void> {
  if (skip) return;
  if (!process.stdin.isTTY) {
    console.error(
      'Confirmation required, but stdin is not an interactive terminal.',
    );
    console.error('Re-run with --yes (-y) to proceed non-interactively.');
    process.exit(1);
  }
  const answer = await promptInput(`${message} [y/N] `);
  if (answer.toLowerCase() !== 'y' && answer.toLowerCase() !== 'yes') {
    console.log('Cancelled');
    process.exit(0);
  }
}

/** Timeout for reading from stdin (30 seconds) */
const STDIN_TIMEOUT_MS = 30_000;

/**
 * Strip a leading UTF-8 BOM (byte order mark) that some editors prepend, which
 * would otherwise break `JSON.parse` on the first character.
 *
 * @param content - Raw text that may begin with a BOM.
 * @returns The content with a leading BOM removed, or unchanged if absent.
 */
export function stripBom(content: string): string {
  return content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;
}

/**
 * Read JSON input from a file or stdin.
 * Handles BOM stripping, stdin timeout, and user-friendly error messages.
 */
export async function readJsonInput(options: {
  file?: string;
  stdin?: boolean;
}): Promise<unknown> {
  if (options.stdin) {
    const chunks: Buffer[] = [];
    let timerId: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timerId = setTimeout(
        () => reject(new Error('stdin timeout')),
        STDIN_TIMEOUT_MS,
      );
    });
    const read = async () => {
      for await (const chunk of process.stdin) {
        chunks.push(chunk as Buffer);
      }
    };
    try {
      await Promise.race([read(), timeout]);
    } catch (error) {
      if (error instanceof Error && error.message === 'stdin timeout') {
        exitWithError(
          `No input received on stdin after ${STDIN_TIMEOUT_MS / 1000}s. Pipe data or use --file instead.`,
        );
      }
      throw error;
    } finally {
      if (timerId) clearTimeout(timerId);
    }
    const content = stripBom(Buffer.concat(chunks).toString('utf-8'));
    try {
      return JSON.parse(content);
    } catch {
      exitWithError('Invalid JSON input from stdin');
    }
  }

  if (options.file) {
    if (!existsSync(options.file)) {
      exitWithError(`File not found: ${options.file}`);
    }
    let content: string;
    try {
      content = readFileSync(options.file, 'utf-8');
    } catch (error) {
      const code = getErrorCode(error);
      if (code === 'EISDIR') {
        exitWithError(`${options.file} is a directory, not a file`);
      }
      exitWithError(`Cannot read file: ${options.file}`);
    }
    try {
      return JSON.parse(stripBom(content));
    } catch {
      exitWithError(`Invalid JSON in file: ${options.file}`);
    }
  }

  exitWithError('Either --file or --stdin is required');
}
