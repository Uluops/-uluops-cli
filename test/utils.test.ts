import { describe, it, expect, vi } from 'vitest';
import {
  truncate,
  toSnakeCase,
  getFlexibleProperty,
  redact,
  formatDisplayDate,
  formatJson,
  exitWithError,
  withSpinner,
} from '../src/utils.js';

describe('truncate', () => {
  it('should return short strings unchanged', () => {
    expect(truncate('hello', 10)).toBe('hello');
  });

  it('should return string at exact maxLength unchanged', () => {
    expect(truncate('hello', 5)).toBe('hello');
  });

  it('should truncate long strings with ellipsis', () => {
    expect(truncate('hello world', 8)).toBe('hello...');
  });

  it('should handle maxLength of 3', () => {
    expect(truncate('hello', 3)).toBe('...');
  });

  it('should handle empty string', () => {
    expect(truncate('', 10)).toBe('');
  });
});

describe('toSnakeCase', () => {
  it('should convert camelCase', () => {
    expect(toSnakeCase('camelCase')).toBe('camel_case');
  });

  it('should convert multi-word camelCase', () => {
    expect(toSnakeCase('falsePositiveRate')).toBe('false_positive_rate');
  });

  it('should leave snake_case unchanged', () => {
    expect(toSnakeCase('already_snake')).toBe('already_snake');
  });

  it('should handle empty string', () => {
    expect(toSnakeCase('')).toBe('');
  });

  it('should handle single word', () => {
    expect(toSnakeCase('word')).toBe('word');
  });
});

describe('getFlexibleProperty', () => {
  it('should find camelCase key', () => {
    expect(getFlexibleProperty({ newIssues: 5 }, 'newIssues', 0)).toBe(5);
  });

  it('should fall back to snake_case', () => {
    expect(getFlexibleProperty({ new_issues: 5 }, 'newIssues', 0)).toBe(5);
  });

  it('should return default when neither exists', () => {
    expect(getFlexibleProperty({}, 'newIssues', 99)).toBe(99);
  });

  it('should treat undefined value as missing', () => {
    expect(getFlexibleProperty({ newIssues: undefined }, 'newIssues', 42)).toBe(42);
  });

  it('should prefer camelCase over snake_case', () => {
    expect(getFlexibleProperty({ newIssues: 10, new_issues: 20 }, 'newIssues', 0)).toBe(10);
  });
});

describe('redact', () => {
  it('should mask long values showing last 4 chars', () => {
    expect(redact('ulr_my-secret-key')).toBe('*************-key');
  });

  it('should return [REDACTED] for short values', () => {
    expect(redact('abc')).toBe('[REDACTED]');
  });

  it('should return [REDACTED] for value at showLast length', () => {
    expect(redact('abcd')).toBe('[REDACTED]');
  });

  it('should support custom showLast', () => {
    expect(redact('secret-value', 6)).toBe('******-value');
  });
});

describe('formatDisplayDate', () => {
  it('should format ISO string', () => {
    const result = formatDisplayDate('2025-01-15T10:30:00.000Z');
    // Locale-dependent, just verify it returns a non-empty string
    expect(result.length).toBeGreaterThan(0);
  });

  it('should format Date object', () => {
    const result = formatDisplayDate(new Date('2025-01-15T10:30:00.000Z'));
    expect(result.length).toBeGreaterThan(0);
  });
});

describe('formatJson', () => {
  it('should pretty-print objects with 2-space indent', () => {
    expect(formatJson({ a: 1 })).toBe('{\n  "a": 1\n}');
  });

  it('should pretty-print arrays', () => {
    expect(formatJson([1, 2])).toBe('[\n  1,\n  2\n]');
  });

  it('should handle nested objects', () => {
    const result = formatJson({ a: { b: 1 } });
    expect(result).toContain('"b": 1');
  });
});

describe('exitWithError', () => {
  it('should print error message to stderr', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      exitWithError('something failed');
    } catch {
      // process.exit mock throws
    }
    expect(errorSpy).toHaveBeenCalledWith('Error: something failed');
  });

  it('should call process.exit with code 1 by default', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => exitWithError('fail')).toThrow('process.exit(1)');
  });

  it('should call process.exit with custom code', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => exitWithError('fail', 2)).toThrow('process.exit(2)');
  });
});

describe('withSpinner', () => {
  it('should run function and return result when quiet', async () => {
    const ctx = { quiet: true };
    const result = await withSpinner(ctx, { start: 'Loading...', failure: 'Failed' }, () =>
      Promise.resolve('data')
    );
    expect(result).toBe('data');
  });

  it('should rethrow errors from the function', async () => {
    const ctx = { quiet: true };
    await expect(
      withSpinner(ctx, { start: 'Loading...', failure: 'Failed' }, () =>
        Promise.reject(new Error('boom'))
      )
    ).rejects.toThrow('boom');
  });
});
