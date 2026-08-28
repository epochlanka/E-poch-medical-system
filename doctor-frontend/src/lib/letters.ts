import { api } from './api';

export interface LetterTemplate {
  letter_template_id: number;
  name: string;
  letter_type: string;
  has_body_placeholder: boolean;
}

export interface IssuedLetterSummary {
  issued_letter_id: number;
  letter_type_name: string;
  doctor_name_snapshot: string;
  issued_at: string;
  template_version: number | null;
}

interface RawTemplate {
  letter_template_id: number;
  name: string;
  letter_type: string;
  current_version: { placeholder_report: { missingBody: boolean } } | null;
}

// Only active templates that actually have an uploaded .docx — a doctor never sees a retired
// one or a half-configured one.
export const listActiveLetterTemplates = () =>
  api
    .get<RawTemplate[]>('/letters/templates', { params: { activeOnly: 'true' } })
    .then((r) =>
      r.data
        .filter((t) => t.current_version)
        .map<LetterTemplate>((t) => ({
          letter_template_id: t.letter_template_id,
          name: t.name,
          letter_type: t.letter_type,
          has_body_placeholder: !t.current_version!.placeholder_report.missingBody,
        }))
    );

interface LetterActionInput {
  templateId: number;
  appointmentId: number;
  bodyContent: string;
}

// Preview never persists anything — safe to call repeatedly while drafting, for any patient.
export const previewLetter = async (input: LetterActionInput) => {
  const res = await api.post('/letters/preview', input, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
};

// Printing IS issuing — the backend freezes a permanent .docx + PDF and an IssuedLetter row
// for a registered patient, and does nothing but return the PDF for a temporary walk-in.
export const issueLetter = async (input: LetterActionInput) => {
  const res = await api.post('/letters/issue', input, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
};

// Registered patients only — never called for a temporary walk-in.
export const listIssuedLettersForPatient = (patientId: string) =>
  api.get<IssuedLetterSummary[]>('/letters/issued', { params: { patientId } }).then((r) => r.data);

export const printIssuedLetterAgain = async (issuedLetterId: number) => {
  const res = await api.get(`/letters/issued/${issuedLetterId}/pdf`, { responseType: 'blob' });
  return URL.createObjectURL(res.data as Blob);
};
