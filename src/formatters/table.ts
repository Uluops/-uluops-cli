/**
 * Column definition for table formatting
 */
export interface Column<T> {
  header: string;
  accessor: keyof T | ((row: T) => string);
  width?: number;
  align?: 'left' | 'right' | 'center';
}

/**
 * Pad a cell value to the specified width
 */
function padCell(text: string, width: number, align: 'left' | 'right' | 'center'): string {
  const truncated = text.length > width ? text.slice(0, width - 1) + '\u2026' : text;
  const padding = width - truncated.length;

  if (padding <= 0) return truncated;

  if (align === 'right') {
    return ' '.repeat(padding) + truncated;
  } else if (align === 'center') {
    const left = Math.floor(padding / 2);
    return ' '.repeat(left) + truncated + ' '.repeat(padding - left);
  }
  return truncated + ' '.repeat(padding);
}

/**
 * Get value from row using accessor
 */
function getValue<T>(row: T, accessor: keyof T | ((row: T) => string)): string {
  if (typeof accessor === 'function') {
    return accessor(row);
  }
  const val = row[accessor];
  if (val === null || val === undefined) return '';
  return String(val);
}

/**
 * Format data as a table
 */
export function formatTable<T>(data: T[], columns: Column<T>[]): string {
  if (data.length === 0) {
    return 'No data';
  }

  // Calculate column widths
  const widths = columns.map((col) => {
    const headerLen = col.header.length;
    const maxDataLen = Math.max(
      ...data.map((row) => getValue(row, col.accessor).length)
    );
    return col.width ?? Math.min(Math.max(headerLen, maxDataLen), 50);
  });

  // Build header
  const header = columns
    .map((col, i) => padCell(col.header, widths[i] ?? col.header.length, col.align ?? 'left'))
    .join('  ');

  const separator = widths.map((w) => '-'.repeat(w ?? 10)).join('--');

  // Build rows
  const rows = data.map((row) =>
    columns
      .map((col, i) => {
        const val = getValue(row, col.accessor);
        return padCell(val, widths[i] ?? 10, col.align ?? 'left');
      })
      .join('  ')
  );

  return [header, separator, ...rows].join('\n');
}

/**
 * Format a simple key-value display
 */
export function formatKeyValue(data: Record<string, unknown>, indent = 0): string {
  const prefix = ' '.repeat(indent);
  return Object.entries(data)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      // Only transform camelCase if key doesn't already contain spaces
      const label = k.includes(' ')
        ? k
        : k.replace(/([A-Z])/g, ' $1').replace(/^./, (s) => s.toUpperCase());
      if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
        return `${prefix}${label}:\n${formatKeyValue(v as Record<string, unknown>, indent + 2)}`;
      }
      return `${prefix}${label}: ${v}`;
    })
    .join('\n');
}
