import { describe, it, expect } from 'vitest';
import { formatTable, formatKeyValue, type Column } from '../../src/formatters/table.js';

interface TestRow {
  name: string;
  value: number;
  status: string;
}

describe('formatTable', () => {
  const columns: Column<TestRow>[] = [
    { header: 'NAME', accessor: 'name', width: 15 },
    { header: 'VALUE', accessor: (r) => String(r.value), width: 8, align: 'right' },
    { header: 'STATUS', accessor: 'status', width: 10 },
  ];

  it('formats data as a table with headers and rows', () => {
    const data: TestRow[] = [
      { name: 'alpha', value: 42, status: 'active' },
      { name: 'beta', value: 7, status: 'inactive' },
    ];

    const result = formatTable(data, columns);
    const lines = result.split('\n');

    expect(lines.length).toBe(4); // header + separator + 2 rows
    expect(lines[0]).toContain('NAME');
    expect(lines[0]).toContain('VALUE');
    expect(lines[0]).toContain('STATUS');
    expect(lines[1]).toMatch(/^-+/); // separator
    expect(lines[2]).toContain('alpha');
    expect(lines[3]).toContain('beta');
  });

  it('returns "No data" for empty arrays', () => {
    expect(formatTable([], columns)).toBe('No data');
  });

  it('truncates long values', () => {
    const data: TestRow[] = [
      { name: 'a very long name that exceeds the width', value: 1, status: 'ok' },
    ];

    const result = formatTable(data, columns);
    expect(result).toContain('\u2026');
  });

  it('handles null/undefined values', () => {
    const nullableColumns: Column<{ name: string | null }>[] = [
      { header: 'NAME', accessor: 'name', width: 10 },
    ];

    const result = formatTable([{ name: null }], nullableColumns);
    expect(result).not.toContain('null');
  });

  it('supports function accessors', () => {
    const data: TestRow[] = [{ name: 'test', value: 100, status: 'ok' }];
    const result = formatTable(data, columns);
    expect(result).toContain('100');
  });

  it('supports right alignment', () => {
    const data: TestRow[] = [{ name: 'x', value: 5, status: 'ok' }];
    const result = formatTable(data, columns);
    const lines = result.split('\n');
    const dataLine = lines[2]!;
    expect(dataLine).toMatch(/\s+5/);
  });
});

describe('formatKeyValue', () => {
  it('formats simple key-value pairs', () => {
    const result = formatKeyValue({ name: 'test', status: 'active' });
    expect(result).toContain('Name: test');
    expect(result).toContain('Status: active');
  });

  it('filters out null and undefined values', () => {
    const result = formatKeyValue({ name: 'test', empty: null, missing: undefined });
    expect(result).toContain('Name: test');
    expect(result).not.toContain('empty');
    expect(result).not.toContain('missing');
  });

  it('converts camelCase keys to title case', () => {
    const result = formatKeyValue({ workflowType: 'ship' });
    expect(result).toContain('Workflow Type: ship');
  });

  it('handles nested objects', () => {
    const result = formatKeyValue({ outer: { inner: 'value' } });
    expect(result).toContain('Outer:');
    expect(result).toContain('Inner: value');
  });

  it('supports indentation', () => {
    const result = formatKeyValue({ name: 'test' }, 2);
    expect(result.startsWith('  ')).toBe(true);
  });

  it('joins short string arrays inline', () => {
    const result = formatKeyValue({ tags: ['a', 'b', 'c'] });
    expect(result).toContain('Tags: a,b,c');
  });

  it('bullets multi-element arrays containing long strings', () => {
    const result = formatKeyValue({
      rationales: [
        'A long rationale that exceeds forty characters and warrants its own line',
        'Another long rationale also exceeding the forty character threshold',
      ],
    });
    expect(result).toContain('Rationales:');
    expect(result).toContain('  - A long rationale');
    expect(result).toContain('  - Another long rationale');
    expect(result).not.toMatch(/,Another/);
  });

  it('leaves single-element long-string arrays inline', () => {
    const result = formatKeyValue({
      note: ['Just one long note that exceeds forty characters in length'],
    });
    expect(result).toMatch(/Note: Just one long note/);
  });

  it('renders arrays of objects as nested blocks', () => {
    const result = formatKeyValue({
      calibrationExamples: [
        { score: 90, scenario: 'Clean' },
        { score: 40, scenario: 'Noisy' },
      ],
    });
    expect(result).not.toContain('[object Object]');
    expect(result).toContain('Calibration Examples:');
    expect(result).toContain('Score: 90');
    expect(result).toContain('Scenario: Clean');
    expect(result).toContain('Score: 40');
    expect(result).toContain('Scenario: Noisy');
  });
});
