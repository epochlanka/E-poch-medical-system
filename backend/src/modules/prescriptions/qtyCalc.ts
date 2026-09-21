// Frontend keeps an identical copy of this logic (doctor-frontend/src/pages/prescriptions/NewPrescription.tsx)
// for instant UI calculation — this is the authoritative, server-side check. Kept duplicated
// rather than shared since the two apps are separate Node projects with no shared package.
//
// Quantity = units per dose x doses per day x days. The units-per-dose figure MUST be supplied
// explicitly (`dose_qty`, in the medicine's dispensing unit): the free-text `dosage` field is
// usually a strength ("500 mg") and says nothing about how many tablets or millilitres one dose is.

const DAILY_FREQUENCY: Record<string, number | null> = {
  OD: 1,
  BD: 2,
  TDS: 3,
  QID: 4,
  STAT: 1,
  HS: 1,
  PRN: null, // as-needed — not mechanically calculable
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

// Total number of doses over the course (e.g. BD x 5 Days = 10), or null when the schedule can't
// be derived mechanically (PRN frequency, non-numeric duration like "Ongoing", or free text).
export const scheduledDoseCount = (frequency?: string, duration?: string): number | null => {
  const code = frequency?.trim().toUpperCase().match(/^(OD|BD|TDS|QID|STAT|HS|PRN)\b/)?.[1];
  if (!code) return null;

  // STAT is a one-time dose — independent of duration.
  if (code === 'STAT') return 1;

  const daily = DAILY_FREQUENCY[code];
  if (daily === null || daily === undefined) return null;

  const days = parseDurationDays(duration);
  if (days === null) return null;

  return daily * days;
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
