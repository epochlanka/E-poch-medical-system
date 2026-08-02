export interface DiagnosisEntry {
  code: string;
  description: string;
}

// The backend stores multiple diagnoses as " | "-joined parallel strings in the existing
// single diagnosis/icd10_code columns (see backend consultations service) rather than a new
// child table — this pair of functions is the only place that encoding is known about.
export const parseDiagnosisList = (diagnosis: string | null, icd10Code: string | null): DiagnosisEntry[] => {
  if (!diagnosis) return [];
  const descriptions = diagnosis.split(' | ');
  const codes = (icd10Code ?? '').split(' | ');
  return descriptions.map((description, i) => ({ description, code: codes[i] ?? '' }));
};

export const joinDiagnosisList = (entries: DiagnosisEntry[]): { diagnosis: string; icd10_code: string } => ({
  diagnosis: entries.map((e) => e.description).join(' | '),
  icd10_code: entries.map((e) => e.code).join(' | '),
});

export const calculateAge = (dob: string) => {
  const birth = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const monthDiff = now.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) age--;
  return age;
};

export const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export const formatDate = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

export const formatTime = (iso: string) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });

export const initials = (name: string) =>
  name
    .split(/[\s._-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('') || '?';

export const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};
