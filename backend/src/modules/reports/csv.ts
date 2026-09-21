export interface ReportColumn {
  key: string;
  label: string;
}

const escapeCsvCell = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  const str = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
};

// Excel opens CSV natively, so this doubles as the "Excel export" without an xlsx dependency.
export const toCsv = (columns: ReportColumn[], rows: Record<string, unknown>[]): string => {
  const header = columns.map((c) => escapeCsvCell(c.label)).join(',');
  const body = rows.map((row) => columns.map((c) => escapeCsvCell(row[c.key])).join(','));
  return [header, ...body].join('\r\n');
};
