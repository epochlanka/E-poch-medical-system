export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

export const calculateAge = (dob: string) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];

// Matches the AGE_BUCKETS convention already used by the backend's Reports demographics
// breakdown (reports/service.ts) — kept as ageFrom/ageTo pairs here since the Patients list
// filters through the existing /patients?ageFrom=&ageTo= params rather than a bucket param.
export const AGE_GROUPS: { label: string; ageFrom: number; ageTo?: number }[] = [
  { label: '0 - 18 Years', ageFrom: 0, ageTo: 18 },
  { label: '19 - 30 Years', ageFrom: 19, ageTo: 30 },
  { label: '31 - 45 Years', ageFrom: 31, ageTo: 45 },
  { label: '46 - 60 Years', ageFrom: 46, ageTo: 60 },
  { label: '60+ Years', ageFrom: 61 },
];
