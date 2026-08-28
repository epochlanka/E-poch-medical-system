// Unique, human-quotable identifier for one unexpected error occurrence.
//
//   ERR-YYYYMMDD-NNNNNN     e.g.  ERR-20260828-000125
//
// The same ID is written to the logs, the admin email, and the API/UI response so a developer
// can jump straight to the failing request. The daily counter lives in memory and resets when
// the date rolls over (a restart also resets it — acceptable, the date keeps IDs unambiguous).

let currentDay = '';
let counter = 0;

const pad = (n: number, width: number) => String(n).padStart(width, '0');

const today = (d = new Date()) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1, 2)}${pad(d.getDate(), 2)}`;

export const generateErrorId = (now = new Date()): string => {
  const day = today(now);
  if (day !== currentDay) {
    currentDay = day;
    counter = 0;
  }
  counter += 1;
  return `ERR-${day}-${pad(counter, 6)}`;
};

/** True for strings shaped like a generated Error ID — used to keep client input out of logs. */
export const isErrorId = (value: unknown): value is string =>
  typeof value === 'string' && /^ERR-\d{8}-\d{6}$/.test(value);
