import { api } from './api';

export interface PlaceholderReport {
  found: string[];
  unknown: string[];
  missingBody: boolean;
}

export interface TemplateVersionInfo {
  version_id: number;
  version_number: number;
  original_filename: string;
  uploaded_at: string;
  placeholder_report: PlaceholderReport;
}

export interface LetterTemplate {
  letter_template_id: number;
  name: string;
  letter_type: string;
  is_active: boolean;
  clinic_name: string | null;
  clinic_address: string | null;
  phone_number: string | null;
  doctor_name: string | null;
  doctor_qualification: string | null;
  doctor_department: string | null;
  registration_number: string | null;
  created_at: string;
  updated_at: string;
  version_count: number;
  issued_count: number;
  current_version: TemplateVersionInfo | null;
}

export interface LetterTemplateMetaInput {
  name: string;
  letter_type: string;
  clinic_name?: string | null;
  clinic_address?: string | null;
  phone_number?: string | null;
  doctor_name?: string | null;
  doctor_qualification?: string | null;
  doctor_department?: string | null;
  registration_number?: string | null;
}

// The placeholders an Admin may use in the Word template. Mirrors KNOWN_PLACEHOLDERS on the
// backend (backend/src/modules/letters/docx.ts).
export const KNOWN_PLACEHOLDERS = [
  'CLINIC_NAME',
  'CLINIC_ADDRESS',
  'PHONE',
  'PATIENT_NAME',
  'PATIENT_AGE',
  'DATE',
  'DOCTOR_NAME',
  'DOCTOR_QUALIFICATION',
  'DOCTOR_DEPARTMENT',
  'REGISTRATION_NO',
  'LETTER_BODY',
] as const;

export const LETTER_TYPE_SUGGESTIONS = ['Medical Certificate', 'Referral Letter', 'Lab Request', 'School Letter', 'General'];

export const listLetterTemplates = (activeOnly?: boolean) =>
  api.get<LetterTemplate[]>('/letters/templates', { params: activeOnly ? { activeOnly: 'true' } : {} }).then((r) => r.data);

export const getLetterTemplate = (id: number) => api.get<LetterTemplate>(`/letters/templates/${id}`).then((r) => r.data);

const metaForm = (input: LetterTemplateMetaInput) => {
  const form = new FormData();
  Object.entries(input).forEach(([k, v]) => {
    if (v !== undefined && v !== null) form.append(k, String(v));
  });
  return form;
};

export const createLetterTemplate = (input: LetterTemplateMetaInput, file: File) => {
  const form = metaForm(input);
  form.append('file', file);
  return api.post<LetterTemplate>('/letters/templates', form).then((r) => r.data);
};

export const updateLetterTemplateMeta = (id: number, input: LetterTemplateMetaInput) =>
  api.put<LetterTemplate>(`/letters/templates/${id}`, input).then((r) => r.data);

export const replaceLetterTemplateDocx = (id: number, file: File) => {
  const form = new FormData();
  form.append('file', file);
  return api.post<LetterTemplate>(`/letters/templates/${id}/docx`, form).then((r) => r.data);
};

export const setLetterTemplateActive = (id: number, isActive: boolean) =>
  api.patch<LetterTemplate>(`/letters/templates/${id}/active`, { is_active: isActive }).then((r) => r.data);

export const deleteLetterTemplate = (id: number) => api.delete(`/letters/templates/${id}`).then((r) => r.data);

// preview.pdf and blank.docx are authenticated routes, so fetch them as blobs (the axios
// interceptor attaches the token) and hand back an object URL.
export const fetchTemplatePreviewUrl = (id: number) =>
  api.get(`/letters/templates/${id}/preview.pdf`, { responseType: 'blob' }).then((r) => URL.createObjectURL(r.data as Blob));

export const downloadBlankTemplate = async () => {
  const res = await api.get('/letters/templates/blank.docx', { responseType: 'blob' });
  const url = URL.createObjectURL(res.data as Blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'letter-template-blank.docx';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};
