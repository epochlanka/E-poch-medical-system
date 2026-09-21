export const formatCurrency = (n: number) => `LKR ${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const formatCurrencyCompact = (n: number) => `LKR ${n.toLocaleString(undefined, { maximumFractionDigits: 0 })}`;

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

// YYYY-MM-DD in *local* time, deliberately not toISOString().slice(0,10) which is UTC and can
// land on the wrong calendar day depending on the machine's offset.
export const toLocalDateInput = (d: Date) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export interface DateRangeInput {
  from: string;
  to: string;
}

export const rangeToApiParams = (range: DateRangeInput) => ({
  from: range.from ? new Date(range.from).toISOString() : undefined,
  to: range.to ? new Date(`${range.to}T23:59:59`).toISOString() : undefined,
});

export const presetRange = (preset: 'daily' | 'weekly' | 'monthly' | 'yearly'): DateRangeInput => {
  const today = new Date();
  const to = toLocalDateInput(today);
  const from = new Date(today);
  if (preset === 'daily') {
    // from stays today
  } else if (preset === 'weekly') {
    from.setDate(from.getDate() - 6);
  } else if (preset === 'monthly') {
    from.setDate(from.getDate() - 29);
  } else {
    from.setFullYear(from.getFullYear() - 1);
    from.setDate(from.getDate() + 1);
  }
  return { from: toLocalDateInput(from), to };
};

const CELL_DATE_KEY = /date|expiry|timestamp|issuedat|followup/i;
const CELL_CURRENCY_KEY = /revenue|amount|price|total|fee|sales|value|^cash$|^card$|^mobile$/i;

export const formatCell = (key: string, value: unknown): string => {
  if (value === null || value === undefined || value === '') return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') {
    if (CELL_CURRENCY_KEY.test(key)) return formatCurrency(value);
    return value.toLocaleString();
  }
  if (typeof value === 'string' && CELL_DATE_KEY.test(key) && !Number.isNaN(Date.parse(value))) {
    return formatDate(value);
  }
  return String(value);
};

// Report `summary` objects are ad hoc per-endpoint dicts (totalLowStockItems, totalBatches,
// totalConsultations, ...) where a broad "total"/"value" substring match false-positives as
// currency. Only the handful of keys that are actually money get formatted as such here.
const SUMMARY_CURRENCY_KEY = /revenue|^cash$|^card$|^mobile$/i;

export const formatSummaryValue = (key: string, value: unknown): string => {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return SUMMARY_CURRENCY_KEY.test(key) ? formatCurrency(value) : value.toLocaleString();
  return String(value);
};

export const formatPct = (pct: number | null) => (pct === null ? '—' : `${pct >= 0 ? '↑' : '↓'} ${Math.abs(pct).toFixed(1)}%`);
