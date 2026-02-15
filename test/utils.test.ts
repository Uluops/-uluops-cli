import { describe, it, expect, vi } from 'vitest';
import {
  toSnakeCase,
  toCamelCase,
  normalizeKeys,
  truncate,
  redact,
  formatDisplayDate,
  getFlexibleProperty,
  parseIntOption,
  parseFloatOption,
  readFileOption,
  asFlexibleResponse,
} from '../src/utils.js';

describe('toSnakeCase', () => {
  it('converts camelCase to snake_case', () => {
    expect(toSnakeCase('workflowType')).toBe('workflow_type');
    expect(toSnakeCase('allGatesPassed')).toBe('all_gates_passed');
    expect(toSnakeCase('rawMarkdown')).toBe('raw_markdown');
  });

  it('handles single-word strings', () => {
    expect(toSnakeCase('project')).toBe('project');
    expect(toSnakeCase('name')).toBe('name');
  });

  it('handles empty string', () => {
    expect(toSnakeCase('')).toBe('');
  });
});

describe('toCamelCase', () => {
  it('converts snake_case to camelCase', () => {
    expect(toCamelCase('workflow_type')).toBe('workflowType');
    expect(toCamelCase('all_gates_passed')).toBe('allGatesPassed');
    expect(toCamelCase('raw_markdown')).toBe('rawMarkdown');
  });

  it('handles single-word strings', () => {
    expect(toCamelCase('project')).toBe('project');
    expect(toCamelCase('name')).toBe('name');
  });

  it('handles empty string', () => {
    expect(toCamelCase('')).toBe('');
  });

  it('handles already camelCase strings', () => {
    expect(toCamelCase('workflowType')).toBe('workflowType');
  });
});

describe('normalizeKeys', () => {
  it('converts top-level snake_case keys to camelCase', () => {
    const input = {
      project: 'test',
      workflow_type: 'ship',
      raw_markdown: '# Report',
    };
    expect(normalizeKeys(input)).toEqual({
      project: 'test',
      workflowType: 'ship',
      rawMarkdown: '# Report',
    });
  });

  it('converts nested object keys', () => {
    const input = {
      summary: {
        all_gates_passed: true,
        average_score: 85,
      },
    };
    expect(normalizeKeys(input)).toEqual({
      summary: {
        allGatesPassed: true,
        averageScore: 85,
      },
    });
  });

  it('converts keys inside arrays', () => {
    const input = {
      validators: [
        { name: 'code-validator', max_score: 100, duration_ms: 5000 },
        { name: 'test-architect', max_score: 100, duration_ms: 3000 },
      ],
    };
    expect(normalizeKeys(input)).toEqual({
      validators: [
        { name: 'code-validator', maxScore: 100, durationMs: 5000 },
        { name: 'test-architect', maxScore: 100, durationMs: 3000 },
      ],
    });
  });

  it('converts deeply nested structures', () => {
    const input = {
      validators: [
        {
          name: 'v1',
          tokens: {
            input_tokens: 1000,
            output_tokens: 500,
            cache_read_tokens: 200,
          },
        },
      ],
    };
    expect(normalizeKeys(input)).toEqual({
      validators: [
        {
          name: 'v1',
          tokens: {
            inputTokens: 1000,
            outputTokens: 500,
            cacheReadTokens: 200,
          },
        },
      ],
    });
  });

  it('passes through camelCase keys unchanged', () => {
    const input = { workflowType: 'ship', project: 'test' };
    expect(normalizeKeys(input)).toEqual({ workflowType: 'ship', project: 'test' });
  });

  it('handles primitive values', () => {
    expect(normalizeKeys('string')).toBe('string');
    expect(normalizeKeys(42)).toBe(42);
    expect(normalizeKeys(null)).toBe(null);
    expect(normalizeKeys(true)).toBe(true);
  });

  it('handles empty objects and arrays', () => {
    expect(normalizeKeys({})).toEqual({});
    expect(normalizeKeys([])).toEqual([]);
  });

  it('handles realistic SaveFeaturesListInput with snake_case', () => {
    const input = {
      project: 'my-project',
      workflow_type: 'post-implementation',
      validators: [
        {
          name: 'code-validator',
          score: 85,
          max_score: 100,
          status: 'PASS',
          duration_ms: 5000,
          tokens: {
            input_tokens: 1000,
            output_tokens: 500,
          },
        },
      ],
      recommendations: [
        {
          validator: 'code-validator',
          title: 'Fix lint error',
          priority: 'suggested',
          failure_code: 'SEM-VAL/H',
          failure_domain: 'SEM',
          file_path: 'src/index.ts',
          line_number: 42,
        },
      ],
      idempotency_key: 'abc-123',
    };

    const result = normalizeKeys(input) as Record<string, unknown>;
    expect(result.workflowType).toBe('post-implementation');
    expect(result.idempotencyKey).toBe('abc-123');

    const validators = result.validators as Record<string, unknown>[];
    expect(validators[0]!.maxScore).toBe(100);
    expect(validators[0]!.durationMs).toBe(5000);
    const tokens = validators[0]!.tokens as Record<string, unknown>;
    expect(tokens.inputTokens).toBe(1000);
    expect(tokens.outputTokens).toBe(500);

    const recs = result.recommendations as Record<string, unknown>[];
    expect(recs[0]!.failureCode).toBe('SEM-VAL/H');
    expect(recs[0]!.failureDomain).toBe('SEM');
    expect(recs[0]!.filePath).toBe('src/index.ts');
    expect(recs[0]!.lineNumber).toBe(42);
  });
});

describe('truncate', () => {
  it('truncates strings longer than maxLength', () => {
    expect(truncate('Hello, World!', 10)).toBe('Hello, ...');
  });

  it('returns short strings unchanged', () => {
    expect(truncate('Hi', 10)).toBe('Hi');
  });

  it('handles exact length', () => {
    expect(truncate('12345', 5)).toBe('12345');
  });
});

describe('redact', () => {
  it('redacts most of the string', () => {
    expect(redact('sk_1234567890')).toBe('*********7890');
  });

  it('redacts short values completely', () => {
    expect(redact('abc', 4)).toBe('[REDACTED]');
  });

  it('respects showLast parameter', () => {
    expect(redact('abcdefgh', 2)).toBe('******gh');
  });
});

describe('formatDisplayDate', () => {
  it('handles null/undefined', () => {
    expect(formatDisplayDate(null)).toBe('N/A');
    expect(formatDisplayDate(undefined)).toBe('N/A');
  });

  it('formats a date string', () => {
    const result = formatDisplayDate('2026-01-15T10:30:00.000Z');
    expect(result).not.toBe('N/A');
    expect(typeof result).toBe('string');
  });

  it('formats a Date object', () => {
    const result = formatDisplayDate(new Date('2026-01-15T10:30:00.000Z'));
    expect(result).not.toBe('N/A');
  });
});

describe('parseIntOption', () => {
  it('parses valid integers', () => {
    expect(parseIntOption('42', '--limit')).toBe(42);
    expect(parseIntOption('0', '--offset')).toBe(0);
    expect(parseIntOption('-5', '--delta')).toBe(-5);
  });

  it('parses large numbers', () => {
    expect(parseIntOption('1000000', '--max')).toBe(1000000);
    expect(parseIntOption('2147483647', '--max')).toBe(2147483647);
  });

  it('truncates decimal strings to integer', () => {
    // parseInt('3.14', 10) returns 3 - this is standard JS behavior
    expect(parseIntOption('3.14', '--limit')).toBe(3);
    expect(parseIntOption('9.99', '--count')).toBe(9);
  });

  it('exits with error for non-numeric strings', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    parseIntOption('abc', '--limit');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith('Error: Invalid number for --limit: "abc"');

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('exits with error for empty string', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    parseIntOption('', '--limit');
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('handles leading/trailing whitespace', () => {
    expect(parseIntOption(' 42 ', '--limit')).toBe(42);
  });
});

describe('parseFloatOption', () => {
  it('parses valid floats', () => {
    expect(parseFloatOption('3.14', '--temperature')).toBeCloseTo(3.14);
    expect(parseFloatOption('0.5', '--temp')).toBeCloseTo(0.5);
    expect(parseFloatOption('0', '--temp')).toBe(0);
  });

  it('parses negative floats', () => {
    expect(parseFloatOption('-1.5', '--offset')).toBeCloseTo(-1.5);
  });

  it('parses scientific notation', () => {
    expect(parseFloatOption('1e5', '--max')).toBe(100000);
    expect(parseFloatOption('2.5e2', '--max')).toBe(250);
  });

  it('parses integers as floats', () => {
    expect(parseFloatOption('42', '--score')).toBe(42);
  });

  it('exits with error for non-numeric strings', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    parseFloatOption('abc', '--temperature');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith('Error: Invalid number for --temperature: "abc"');

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('exits with error for empty string', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    parseFloatOption('', '--temperature');
    expect(mockExit).toHaveBeenCalledWith(1);

    mockExit.mockRestore();
    mockError.mockRestore();
  });
});

describe('getFlexibleProperty', () => {
  it('returns camelCase value when available', () => {
    const obj = { workflowType: 'ship' };
    expect(getFlexibleProperty(obj, 'workflowType', 'default')).toBe('ship');
  });

  it('falls back to snake_case', () => {
    const obj = { workflow_type: 'ship' };
    expect(getFlexibleProperty(obj, 'workflowType', 'default')).toBe('ship');
  });

  it('returns default when neither exists', () => {
    const obj = { other: 'value' };
    expect(getFlexibleProperty(obj, 'workflowType', 'default')).toBe('default');
  });

  it('prefers camelCase over snake_case', () => {
    const obj = { workflowType: 'camel', workflow_type: 'snake' };
    expect(getFlexibleProperty(obj, 'workflowType', 'default')).toBe('camel');
  });

  it('returns default when camelCase key exists but is undefined', () => {
    const obj = { workflowType: undefined };
    expect(getFlexibleProperty(obj, 'workflowType', 'fallback')).toBe('fallback');
  });

  it('returns default when snake_case key exists but is undefined', () => {
    const obj = { workflow_type: undefined };
    expect(getFlexibleProperty(obj, 'workflowType', 'fallback')).toBe('fallback');
  });

  it('returns falsy values that are not undefined', () => {
    expect(getFlexibleProperty({ count: 0 }, 'count', 99)).toBe(0);
    expect(getFlexibleProperty({ flag: false }, 'flag', true)).toBe(false);
    expect(getFlexibleProperty({ name: '' }, 'name', 'default')).toBe('');
    expect(getFlexibleProperty({ value: null }, 'value', 'default')).toBe(null);
  });

  it('handles empty object', () => {
    expect(getFlexibleProperty({}, 'anything', 42)).toBe(42);
  });

  it('works with typed default values', () => {
    const result = getFlexibleProperty<string[]>({ items: ['a', 'b'] }, 'items', []);
    expect(result).toEqual(['a', 'b']);
  });
});

describe('readFileOption', () => {
  it('exits with error for non-existent file', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    readFileOption('/tmp/does-not-exist-cli-test-file.txt');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('File not found'));

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('exits with error for directory path', () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
    const mockError = vi.spyOn(console, 'error').mockImplementation(() => {});

    readFileOption('/tmp');
    expect(mockExit).toHaveBeenCalledWith(1);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('directory'));

    mockExit.mockRestore();
    mockError.mockRestore();
  });

  it('reads valid file successfully', () => {
    const { writeFileSync, unlinkSync } = require('node:fs');
    const path = '/tmp/cli-test-readFileOption.txt';
    writeFileSync(path, 'hello world');
    try {
      const content = readFileOption(path);
      expect(content).toBe('hello world');
    } finally {
      unlinkSync(path);
    }
  });
});

describe('asFlexibleResponse', () => {
  it('returns object as record', () => {
    const obj = { foo: 'bar', count: 42 };
    const result = asFlexibleResponse(obj);
    expect(result.foo).toBe('bar');
    expect(result.count).toBe(42);
  });

  it('returns empty record for null', () => {
    expect(asFlexibleResponse(null)).toEqual({});
  });

  it('returns empty record for undefined', () => {
    expect(asFlexibleResponse(undefined)).toEqual({});
  });

  it('returns empty record for primitives', () => {
    expect(asFlexibleResponse('string')).toEqual({});
    expect(asFlexibleResponse(42)).toEqual({});
    expect(asFlexibleResponse(true)).toEqual({});
  });

  it('handles arrays as objects', () => {
    const arr = [1, 2, 3];
    const result = asFlexibleResponse(arr);
    expect(result).toBe(arr);
  });
});
