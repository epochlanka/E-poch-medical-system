// Frontend keeps an identical copy of this logic (doctor-frontend/src/pages/prescriptions/NewPrescription.tsx)
// for instant UI calculation — this is the authoritative, server-side check. Kept duplicated
// rather than shared since the two apps are separate Node projects with no shared package.

const DAILY_FREQUENCY: Record<string, number | null> = {
  OD: 1,
  BD: 2,
  TDS: 3,
  QID: 4,
  STAT: 1,
  HS: 1,
  PRN: null, // as-needed — not mechanically calculable
};

const parseDailyFrequency = (frequency?: string): number | null => {
  if (!frequency) return null;
  const match = frequency.trim().toUpperCase().match(/^(OD|BD|TDS|QID|STAT|HS|PRN)\b/);
  if (!match) return null;
  return DAILY_FREQUENCY[match[1]];
};

const parseDurationDays = (duration?: string): number | null => {
  if (!duration) return null;
  const d = duration.trim();
  const dayMatch = d.match(/^(\d+)\s*Days?$/i);
  if (dayMatch) return Number(dayMatch[1]);
  const monthMatch = d.match(/^(\d+)\s*Months?$/i);
  if (monthMatch) return Number(monthMatch[1]) * 30;
  return null; // e.g. "Ongoing", or free text that doesn't match a calculable pattern
};

// Returns null when the qty can't be mechanically derived (PRN frequency, non-numeric duration
// like "Ongoing", or free text that doesn't match a known pattern) — callers should skip
// validation/auto-calc in that case and leave Qty as a manually entered value.
export const computeExpectedQty = (frequency?: string, duration?: string): number | null => {
  const code = frequency?.trim().toUpperCase().match(/^(OD|BD|TDS|QID|STAT|HS|PRN)\b/)?.[1];
  if (!code) return null;

  // STAT is a one-time dose — independent of duration.
  if (code === 'STAT') return 1;

  const daily = parseDailyFrequency(frequency);
  if (daily === null) return null;

  const days = parseDurationDays(duration);
  if (days === null) return null;

  return daily * days;
};
