// Frontend keeps an identical copy of this logic (doctor-frontend/src/pages/prescriptions/NewPrescription.tsx)
// for instant UI calculation — this is the authoritative, server-side check. Kept duplicated
// rather than shared since the two apps are separate Node projects with no shared package.
// The two copies MUST stay in lockstep: createPrescription rejects a submitted qty that does not
// equal this function's result, so a parser that is looser on one side rejects valid work.
//
// Quantity = units per dose x doses per day x days. The units-per-dose figure MUST be supplied
// explicitly (`dose_qty`, in the medicine's dispensing unit): the free-text `dosage` field is
// usually a strength ("500 mg") and says nothing about how many tablets or millilitres one dose is.
//
// Every rule below is an exact, bounded match. Anything ambiguous returns null, which makes the
// quantity a manual field — guessing a dose is worse than asking for one.

// Latin/─prescribing shorthand → doses per day. `null` means deliberately not calculable.
const DOSE_CODES: Record<string, number | null> = {
  OD: 1, // once daily
  OM: 1, // omni mane — each morning
  ON: 1, // omni nocte — each night
  HS: 1, // hora somni — at bedtime
  NOCTE: 1,
  MANE: 1,
  DAILY: 1,
  BD: 2, // bis die
  BID: 2,
  TDS: 3, // ter die sumendus
  TID: 3,
  QDS: 4, // quater die sumendus — the common British/Sri Lankan form
  QID: 4,
  PRN: null, // as needed
  SOS: null, // si opus sit — if required
};

const MAX_DAYS = 365;

/** Doses per day, or null when the frequency is as-needed or not recognised. */
const dosesPerDay = (frequency?: string): number | null => {
  const text = (frequency ?? '').trim().toUpperCase();
  if (!text) return null;
  if (/\b(PRN|SOS)\b|AS\s+(NEEDED|REQUIRED)|WHEN\s+(NEEDED|REQUIRED)/.test(text)) return null;

  // "q6h", "every 8 hours" — only when the interval divides a day evenly.
  const hourly = text.match(/\bQ\s*(\d{1,2})\s*H\b/) ?? text.match(/\bEVERY\s+(\d{1,2})\s*(?:H|HRS?|HOURS?)\b/);
  if (hourly) {
    const hours = Number(hourly[1]);
    return hours > 0 && hours <= 24 && 24 % hours === 0 ? 24 / hours : null;
  }

  // "3 times daily", "3 times a day", "3x per day".
  const times = text.match(/\b(\d{1,2})\s*(?:X|TIMES?)\s*(?:A\s+|PER\s+)?DAY(?:LY)?\b/);
  if (times) {
    const n = Number(times[1]);
    return n >= 1 && n <= 24 ? n : null;
  }

  // Worded forms, checked before the codes so "TDS - Three times daily" agrees either way.
  if (/\bONCE\b/.test(text)) return 1;
  if (/\bTWICE\b/.test(text)) return 2;
  if (/\bTHRICE\b|\bTHREE\s+TIMES\b/.test(text)) return 3;
  if (/\bFOUR\s+TIMES\b/.test(text)) return 4;

  // Leading shorthand code, e.g. "BD", "TDS - Three times daily", "BD x 5/7".
  const code = text.match(/^([A-Z]+)\b/)?.[1];
  if (code && Object.prototype.hasOwnProperty.call(DOSE_CODES, code)) return DOSE_CODES[code];
  return null;
};

/** Course length in days, or null when it is open-ended or not recognised. */
const parseDurationDays = (duration?: string): number | null => {
  const text = (duration ?? '').trim().toUpperCase();
  if (!text) return null;
  if (/ONGOING|CONTINUOUS|LONG[\s-]?TERM|INDEFINITE|UNTIL/.test(text)) return null;

  // Prescribing shorthand: 5/7 = 5 days, 2/52 = 2 weeks, 3/12 = 3 months.
  const shorthand = text.match(/^(\d{1,3})\s*\/\s*(7|52|12)$/);
  if (shorthand) {
    const n = Number(shorthand[1]);
    const days = shorthand[2] === '7' ? n : shorthand[2] === '52' ? n * 7 : n * 30;
    return days >= 1 && days <= MAX_DAYS ? days : null;
  }

  // "5 days", "2 weeks", "1 month", or a bare number read as days.
  const m = text.match(/^(\d{1,3})\s*(DAYS?|D|WEEKS?|WKS?|W|MONTHS?|MTHS?|M)?$/);
  if (!m) return null;
  const n = Number(m[1]);
  const unit = m[2] ?? 'DAYS';
  const perUnit = /^(WEEKS?|WKS?|W)$/.test(unit) ? 7 : /^(MONTHS?|MTHS?|M)$/.test(unit) ? 30 : 1;
  const days = n * perUnit;
  return days >= 1 && days <= MAX_DAYS ? days : null;
};

/** Doses per day and course length, for callers that want to explain the arithmetic. */
export const parseSchedule = (frequency?: string, duration?: string) => ({
  perDay: dosesPerDay(frequency),
  days: parseDurationDays(duration),
  /** STAT is a single dose — duration does not apply. */
  isStat: /^STAT\b/.test((frequency ?? '').trim().toUpperCase()),
});

// Total number of doses over the course (e.g. BD x 5 Days = 10), or null when the schedule can't
// be derived mechanically (PRN frequency, non-numeric duration like "Ongoing", or free text).
export const scheduledDoseCount = (frequency?: string, duration?: string): number | null => {
  const { perDay, days, isStat } = parseSchedule(frequency, duration);
  if (isStat) return 1;
  if (perDay === null || days === null) return null;
  return perDay * days;
};

// Whole units to dispense, rounded UP so the patient is never short a fraction of a unit
// (1.5 tablets x TDS x 5 days = 22.5 -> 23). Null when the schedule isn't calculable or no
// positive dose was given — callers must then require an explicit, clinician-confirmed quantity
// rather than guessing a dose.
export const computeExpectedQty = (frequency?: string, duration?: string, dosePerAdministration?: number | null): number | null => {
  const doses = scheduledDoseCount(frequency, duration);
  if (doses === null) return null;
  if (dosePerAdministration == null || !Number.isFinite(dosePerAdministration) || dosePerAdministration <= 0) return null;
  return Math.ceil(dosePerAdministration * doses - 1e-9);
};
