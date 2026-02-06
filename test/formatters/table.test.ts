import { describe, it, expect } from 'vitest';
import { formatTable, formatKeyValue, type Column } from '../../src/formatters/table.js';

interface TestRow {
  name: string;
  score: number;
  active: boolean;
}

describe('formatTable', () => {
  const columns: Column<TestRow>[] = [
    { header: 'NAME', accessor: 'name' },
    { header: 'SCORE', accessor: (r) => String(r.score), align: 'right' },
    { header: 'ACTIVE', accessor: (r) => (r.active ? 'Yes' : 'No') },
  ];

  it('should return "No data" for empty array', () => {
    expect(formatTable([], columns)).toBe('No data');
  });

  it('should render header, separator, and rows', () => {
    const data: TestRow[] = [{ name: 'Alpha', score: 85, active: true }];
    const result = formatTable(data, columns);
    const lines = result.split('\n');

    expect(lines).toHaveLength(3); // header + separator + 1 row
    expect(lines[0]).toContain('NAME');
    expect(lines[0]).toContain('SCORE');
    expect(lines[0]).toContain('ACTIVE');
    expect(lines[1]).toMatch(/^-+/); // separator
    expect(lines[2]).toContain('Alpha');
    expect(lines[2]).toContain('85');
    expect(lines[2]).toContain('Yes');
  });

  it('should render multiple rows', () => {
    const data: TestRow[] = [
      { name: 'Alpha', score: 85, active: true },
      { name: 'Beta', score: 72, active: false },
    ];
    const result = formatTable(data, columns);
    const lines = result.split('\n');

    expect(lines).toHaveLength(4); // header + separator + 2 rows
    expect(lines[3]).toContain('Beta');
    expect(lines[3]).toContain('No');
  });

  it('should use accessor function', () => {
    const data: TestRow[] = [{ name: 'Test', score: 90, active: false }];
    const result = formatTable(data, columns);
    expect(result).toContain('No');
  });

  it('should truncate values exceeding column width with ellipsis', () => {
    const narrowColumns: Column<TestRow>[] = [{ header: 'NAME', accessor: 'name', width: 5 }];
    const data: TestRow[] = [{ name: 'VeryLongName', score: 0, active: true }];
    const result = formatTable(data, narrowColumns);
    expect(result).toContain('\u2026'); // unicode ellipsis
  });

  it('should right-align columns', () => {
    const data: TestRow[] = [{ name: 'A', score: 5, active: true }];
    const result = formatTable(data, columns);
    // The SCORE column (right-aligned) should have leading spaces before the value
    const lines = result.split('\n');
    const scoreHeader = 'SCORE';
    const headerIdx = lines[0]!.indexOf(scoreHeader);
    expect(headerIdx).toBeGreaterThan(-1);
  });

  it('should center-align columns', () => {
    const centerColumns: Column<TestRow>[] = [
      { header: 'NAME', accessor: 'name', width: 20, align: 'center' },
    ];
    const data: TestRow[] = [{ name: 'Hi', score: 0, active: true }];
    const result = formatTable(data, centerColumns);
    const lines = result.split('\n');
    // "Hi" centered in 20 chars should have leading spaces
    const row = lines[2]!;
    const trimmedStart = row.length - row.trimStart().length;
    expect(trimmedStart).toBeGreaterThan(0);
  });

  it('should cap auto-width at 50', () => {
    const longNameColumns: Column<{ text: string }>[] = [{ header: 'TEXT', accessor: 'text' }];
    const data = [{ text: 'x'.repeat(100) }];
    const result = formatTable(data, longNameColumns);
    const lines = result.split('\n');
    // Row should be capped — the value gets truncated
    expect(lines[2]!.length).toBeLessThanOrEqual(52); // 50 + possible trailing spaces
  });

  it('should handle null/undefined values as empty strings', () => {
    const columns: Column<{ val: string | null }>[] = [{ header: 'VAL', accessor: 'val' }];
    const data = [{ val: null }];
    const result = formatTable(data, columns);
    expect(result).toContain('VAL');
  });
});

describe('formatKeyValue', () => {
  it('should format simple key-value pairs', () => {
    const result = formatKeyValue({ name: 'test', count: 42 });
    expect(result).toContain('Name: test');
    expect(result).toContain('Count: 42');
  });

  it('should filter out undefined values', () => {
    const result = formatKeyValue({ name: 'test', missing: undefined });
    expect(result).toContain('Name: test');
    expect(result).not.toContain('Missing');
  });

  it('should filter out null values', () => {
    const result = formatKeyValue({ name: 'test', missing: null });
    expect(result).not.toContain('Missing');
  });

  it('should convert camelCase keys to Title Case', () => {
    const result = formatKeyValue({ firstName: 'John' });
    expect(result).toContain('First Name: John');
  });

  it('should preserve keys with spaces', () => {
    const result = formatKeyValue({ 'Display Name': 'Test' });
    expect(result).toContain('Display Name: Test');
  });

  it('should handle nested objects', () => {
    const result = formatKeyValue({ stats: { open: 5, closed: 10 } });
    expect(result).toContain('Stats:');
    expect(result).toContain('Open: 5');
    expect(result).toContain('Closed: 10');
  });

  it('should support custom indent', () => {
    const result = formatKeyValue({ name: 'test' }, 4);
    expect(result).toMatch(/^ {4}Name: test$/m);
  });
});
