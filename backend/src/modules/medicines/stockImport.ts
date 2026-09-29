import ExcelJS from 'exceljs';

/**
 * Bulk stock entry from a spreadsheet the clinic staff fill in themselves.
 *
 * Typing several hundred medicines through a form at go-live is the slowest part of starting to
 * use the system, and it is work that a spreadsheet does far better: everyone can already use
 * Excel, several people can split the list, and mistakes are fixed by editing a cell rather than
 * re-opening a dialog.
 *
 * This module only turns a file into validated rows. Writing them is medicines/service.ts, which
 * routes every batch through the same receiveStockBatch path as the "Add Stock Batch" form — so an
 * imported batch is as auditable as a hand-entered one, with its own purchase order and GRN.
 */

/** What the sheet is allowed to contain. Anything else in the header row is reported, not ignored. */
export const IMPORT_COLUMNS = [
  { key: 'name', label: 'Medicine name', required: true, note: 'e.g. Amoxicillin' },
  { key: 'form', label: 'Form', required: false, note: 'Tablet, Capsule, Syrup, Cream, Drops, Injection…' },
  { key: 'strength', label: 'Strength', required: false, note: 'e.g. 250mg' },
  { key: 'unit', label: 'Unit', required: false, note: 'Tablet, Capsule, ml, Gram, Piece. Left blank, it follows the form.' },
  { key: 'quantity', label: 'Quantity on shelf', required: false, note: 'Count in single units, not boxes. Leave blank to add the medicine with no stock.' },
  { key: 'selling_price', label: 'Selling price per unit', required: false, note: 'Required when a quantity is given.' },
  { key: 'expiry_date', label: 'Expiry date', required: false, note: 'YYYY-MM-DD. Required when a quantity is given.' },
  { key: 'generic_name', label: 'Generic name', required: false, note: 'Optional' },
  { key: 'brand_name', label: 'Brand name', required: false, note: 'Optional' },
  { key: 'category', label: 'Category', required: false, note: 'Optional, e.g. Antibiotic' },
  { key: 'batch_no', label: 'Batch number', required: false, note: 'Optional — generated if blank' },
  { key: 'cost_price', label: 'Cost price per unit', required: false, note: 'Optional — what the clinic paid' },
] as const;

export type ImportColumnKey = (typeof IMPORT_COLUMNS)[number]['key'];

/** The sheet staff type into; read in preference to anything else in the workbook. */
export const TEMPLATE_SHEET_NAME = 'Medicines';

/** Header spellings people actually type, mapped to the canonical key. */
const HEADER_ALIASES: Record<string, ImportColumnKey> = {
  medicine: 'name',
  'medicine name': 'name',
  drug: 'name',
  'drug name': 'name',
  name: 'name',
  form: 'form',
  'dosage form': 'form',
  strength: 'strength',
  dose: 'strength',
  unit: 'unit',
  'base unit': 'unit',
  units: 'unit',
  quantity: 'quantity',
  qty: 'quantity',
  'quantity on shelf': 'quantity',
  stock: 'quantity',
  'stock on hand': 'quantity',
  price: 'selling_price',
  'selling price': 'selling_price',
  'selling price per unit': 'selling_price',
  'sell price': 'selling_price',
  mrp: 'selling_price',
  expiry: 'expiry_date',
  'expiry date': 'expiry_date',
  'exp date': 'expiry_date',
  expires: 'expiry_date',
  generic: 'generic_name',
  'generic name': 'generic_name',
  brand: 'brand_name',
  'brand name': 'brand_name',
  category: 'category',
  'therapeutic class': 'category',
  batch: 'batch_no',
  'batch no': 'batch_no',
  'batch number': 'batch_no',
  'cost price': 'cost_price',
  'cost price per unit': 'cost_price',
  cost: 'cost_price',
  'purchase price': 'cost_price',
};

const normaliseHeader = (raw: string) =>
  raw
    .trim()
    .toLowerCase()
    .replace(/[_*]+/g, ' ')
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();

export interface ParsedRow {
  /** 1-based row number as it appears in the spreadsheet, so an error names the row the user sees. */
  rowNumber: number;
  values: Partial<Record<ImportColumnKey, string>>;
}

export interface ParsedSheet {
  rows: ParsedRow[];
  /** Header cells that matched nothing — surfaced so a misspelled column is not silently dropped. */
  unknownHeaders: string[];
}

/** Excel dates arrive as Date objects; everything else as text we trim. */
const cellText = (value: unknown): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    // Excel stores dates without a timezone; read the components as written rather than shifting.
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof value === 'object') {
    const rich = value as { text?: string; result?: unknown; richText?: { text: string }[] };
    if (Array.isArray(rich.richText)) return rich.richText.map((part) => part.text).join('').trim();
    if (rich.text !== undefined) return String(rich.text).trim();
    if (rich.result !== undefined) return String(rich.result).trim();
    return '';
  }
  return String(value).trim();
};

const mapHeaders = (headerCells: string[]) => {
  const mapping = new Map<number, ImportColumnKey>();
  const unknownHeaders: string[] = [];
  headerCells.forEach((raw, index) => {
    const text = raw.trim();
    if (!text) return;
    const key = HEADER_ALIASES[normaliseHeader(text)];
    if (key) mapping.set(index, key);
    else unknownHeaders.push(text);
  });
  return { mapping, unknownHeaders };
};

const rowsFromGrid = (grid: string[][]): ParsedSheet => {
  // Spreadsheets often carry a title or blank lines above the real header; find the first row that
  // actually names a known column rather than assuming row 1.
  let headerIndex = -1;
  let best: ReturnType<typeof mapHeaders> | null = null;
  for (let i = 0; i < Math.min(grid.length, 20); i++) {
    const candidate = mapHeaders(grid[i]);
    if (candidate.mapping.size >= 2 || (candidate.mapping.size === 1 && [...candidate.mapping.values()].includes('name'))) {
      headerIndex = i;
      best = candidate;
      break;
    }
  }
  if (headerIndex === -1 || !best) {
    throw new Error(
      'Could not find the header row. The first row should name the columns — start from the template, which already has them.'
    );
  }

  const rows: ParsedRow[] = [];
  for (let i = headerIndex + 1; i < grid.length; i++) {
    const cells = grid[i];
    const values: Partial<Record<ImportColumnKey, string>> = {};
    for (const [index, key] of best.mapping) {
      const text = cells[index] ?? '';
      if (text) values[key] = text;
    }
    // Skip rows that are entirely blank, and the template's own example row.
    if (Object.keys(values).length === 0) continue;
    rows.push({ rowNumber: i + 1, values });
  }
  return { rows, unknownHeaders: best.unknownHeaders };
};

/** Minimal RFC-4180 CSV reader: quoted fields, doubled quotes, embedded commas and newlines. */
const parseCsvGrid = (text: string): string[][] => {
  const grid: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let inQuotes = false;
  const stripped = text.replace(/^﻿/, '');
  for (let i = 0; i < stripped.length; i++) {
    const ch = stripped[i];
    if (inQuotes) {
      if (ch === '"') {
        if (stripped[i + 1] === '"') {
          cur += '"';
          i++;
        } else inQuotes = false;
      } else cur += ch;
      continue;
    }
    if (ch === '"') inQuotes = true;
    else if (ch === ',') {
      row.push(cur.trim());
      cur = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && stripped[i + 1] === '\n') i++;
      row.push(cur.trim());
      grid.push(row);
      row = [];
      cur = '';
    } else cur += ch;
  }
  row.push(cur.trim());
  if (row.some((cell) => cell !== '')) grid.push(row);
  return grid;
};

const XLSX_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // "PK\x03\x04" — every .xlsx is a zip

/**
 * Read an uploaded .xlsx or .csv into rows. The file's actual bytes decide how it is read, not its
 * name: staff rename files, and a .csv that is really a workbook (or the reverse) should still work.
 */
export const parseImportFile = async (buffer: Buffer, filename = ''): Promise<ParsedSheet> => {
  const looksLikeXlsx = buffer.subarray(0, 4).equals(XLSX_MAGIC);
  if (!looksLikeXlsx) {
    if (/\.xlsx?$/i.test(filename) && !/\.csv$/i.test(filename)) {
      throw new Error(
        'This looks like an old .xls file, which cannot be read. Open it in Excel and use File → Save As → Excel Workbook (.xlsx).'
      );
    }
    return rowsFromGrid(parseCsvGrid(buffer.toString('utf-8')));
  }

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  if (workbook.worksheets.length === 0) throw new Error('The workbook has no sheets.');

  const gridOf = (sheet: ExcelJS.Worksheet): string[][] => {
    const grid: string[][] = [];
    sheet.eachRow({ includeEmpty: true }, (row) => {
      const cells: string[] = [];
      // row.values is 1-based with a leading hole; normalise to a dense 0-based array.
      const values = Array.isArray(row.values) ? row.values : [];
      for (let i = 1; i < values.length; i++) cells.push(cellText(values[i]));
      grid.push(cells);
    });
    return grid;
  };

  // Sheet choice is explicit, not a guess. The template's own instructions sheet lists the column
  // names down a column, which any "does this look like a header?" heuristic happily mistakes for
  // the real thing — and then imports the instructions as medicines.
  const ordered = [
    ...workbook.worksheets.filter((ws) => ws.name.trim().toLowerCase() === TEMPLATE_SHEET_NAME.toLowerCase()),
    ...workbook.worksheets.filter((ws) => ws.name.trim().toLowerCase() !== TEMPLATE_SHEET_NAME.toLowerCase()),
  ];

  let firstError: Error | null = null;
  for (const sheet of ordered) {
    try {
      return rowsFromGrid(gridOf(sheet));
    } catch (err) {
      if (!firstError) firstError = err as Error;
    }
  }
  throw firstError ?? new Error('Could not find a table of medicines in that workbook.');
};

/** The blank sheet staff start from, with the columns already named and one example row. */
export const buildImportTemplate = async (): Promise<Buffer> => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'E-POCH Medical System';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(TEMPLATE_SHEET_NAME);
  sheet.columns = IMPORT_COLUMNS.map((column) => ({
    header: column.label + (column.required ? ' *' : ''),
    key: column.key,
    width: Math.max(column.label.length + 4, 16),
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F5ED' } };
  sheet.getRow(1).border = { bottom: { style: 'thin', color: { argb: 'FFB0CFC0' } } };
  sheet.views = [{ state: 'frozen', ySplit: 1 }];

  // Deliberately no example row on this sheet: anything typed here is imported, and a sample row
  // left in by mistake becomes a fake medicine with fake stock. The worked example lives on the
  // notes sheet instead, where it cannot be uploaded.

  // Text format on the expiry column, so Excel does not reformat typed dates into something
  // regional that then reads back ambiguously.
  const expiryIndex = IMPORT_COLUMNS.findIndex((c) => c.key === 'expiry_date') + 1;
  sheet.getColumn(expiryIndex).numFmt = '@';

  const notes = workbook.addWorksheet('How to fill this in');
  notes.columns = [
    { header: 'Column', key: 'label', width: 26 },
    { header: 'Needed?', key: 'required', width: 12 },
    { header: 'Notes', key: 'note', width: 78 },
  ];
  notes.getRow(1).font = { bold: true };
  for (const column of IMPORT_COLUMNS) {
    notes.addRow({ label: column.label, required: column.required ? 'Required' : 'Optional', note: column.note });
  }
  notes.addRow({});
  notes.addRow({ label: 'EXAMPLE ROW', required: '', note: 'Amoxicillin | Capsule | 250mg | Capsule | 240 | 12.50 | 2027-06-30' });
  notes.addRow({ label: '', required: '', note: 'Type rows like that on the "Medicines" sheet, under the headings.' });
  notes.addRow({});
  notes.addRow({ label: 'One row per batch', required: '', note: 'Same medicine with two expiry dates? Put it on two rows with the same name.' });
  notes.addRow({ label: 'Counting', required: '', note: 'Quantity is in single units. A box of 100 tablets is 100, not 1.' });
  notes.addRow({ label: 'No stock yet', required: '', note: 'Leave Quantity, Price and Expiry blank to add the medicine to the list without any stock.' });
  notes.addRow({ label: 'Already-expired stock', required: '', note: 'Cannot be imported. Dispose of it instead of recording it.' });

  const out = await workbook.xlsx.writeBuffer();
  return Buffer.from(out);
};
