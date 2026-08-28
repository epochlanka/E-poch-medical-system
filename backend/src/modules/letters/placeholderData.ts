import { PlaceholderData } from './docx';

// Maps live system data onto the {{PLACEHOLDER}} tokens. Clinic and doctor identity values
// come from the LetterTemplate row (Admin-controlled, locked to the doctor); patient values
// come from the appointment; DATE is generated; LETTER_BODY is the doctor's input. Any value
// that has no source resolves to '' so the placeholder simply vanishes from the letter.

export interface TemplateLetterhead {
  clinic_name: string | null;
  clinic_address: string | null;
  phone_number: string | null;
  doctor_name: string | null;
  doctor_qualification: string | null;
  doctor_department: string | null;
  registration_number: string | null;
}

export interface AppointmentContext {
  patient?: { full_name: string; dob: Date | string | null } | null;
  temp_patient_name?: string | null;
  temp_patient_age?: number | null;
}

export interface ActorUser {
  username: string;
  registration_number?: string | null;
}

export const formatLetterDate = (d = new Date()): string =>
  d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }); // "27 August 2026"

const ageFromDob = (dob: Date | string | null | undefined): string => {
  if (!dob) return '';
  const birth = new Date(dob);
  if (Number.isNaN(birth.getTime())) return '';
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  return age >= 0 ? String(age) : '';
};

export const buildPlaceholderData = (args: {
  template: TemplateLetterhead;
  appointment: AppointmentContext;
  actorUser: ActorUser;
  bodyContent: string;
}): PlaceholderData => {
  const { template, appointment, actorUser, bodyContent } = args;
  const patientName =
    appointment.patient?.full_name || appointment.temp_patient_name || 'Unregistered Patient';
  const patientAge = appointment.patient
    ? ageFromDob(appointment.patient.dob)
    : appointment.temp_patient_age != null
    ? String(appointment.temp_patient_age)
    : '';

  return {
    CLINIC_NAME: template.clinic_name ?? '',
    CLINIC_ADDRESS: template.clinic_address ?? '',
    PHONE: template.phone_number ?? '',
    PATIENT_NAME: patientName,
    PATIENT_AGE: patientAge,
    DATE: formatLetterDate(),
    DOCTOR_NAME: template.doctor_name || actorUser.username || '',
    DOCTOR_QUALIFICATION: template.doctor_qualification ?? '',
    DOCTOR_DEPARTMENT: template.doctor_department ?? '',
    REGISTRATION_NO: template.registration_number || actorUser.registration_number || '',
    LETTER_BODY: bodyContent ?? '',
  };
};

// Shown in the Admin "Preview" so a freshly uploaded template can be checked before activation.
export const SAMPLE_PLACEHOLDER_DATA: PlaceholderData = {
  CLINIC_NAME: 'E-POCH Medical Centre',
  CLINIC_ADDRESS: '45 Galle Road, Colombo 03',
  PHONE: '011-2345678',
  PATIENT_NAME: 'Test Patient',
  PATIENT_AGE: '35',
  DATE: '27 August 2026',
  DOCTOR_NAME: 'Dr. Athula',
  DOCTOR_QUALIFICATION: 'MBBS, MD',
  DOCTOR_DEPARTMENT: 'General Medicine',
  REGISTRATION_NO: 'SLMC-24681',
  LETTER_BODY:
    'This is sample letter body text. When a doctor issues a real letter, only this section is replaced with what they type; every other part of the page comes from your uploaded Word template.',
};

// For the Admin preview we still want the template's own letterhead values when they exist,
// falling back to the sample values above for anything the admin left blank.
export const buildSamplePlaceholderData = (template: TemplateLetterhead): PlaceholderData => ({
  ...SAMPLE_PLACEHOLDER_DATA,
  CLINIC_NAME: template.clinic_name || SAMPLE_PLACEHOLDER_DATA.CLINIC_NAME,
  CLINIC_ADDRESS: template.clinic_address || SAMPLE_PLACEHOLDER_DATA.CLINIC_ADDRESS,
  PHONE: template.phone_number || SAMPLE_PLACEHOLDER_DATA.PHONE,
  DOCTOR_NAME: template.doctor_name || SAMPLE_PLACEHOLDER_DATA.DOCTOR_NAME,
  DOCTOR_QUALIFICATION: template.doctor_qualification || SAMPLE_PLACEHOLDER_DATA.DOCTOR_QUALIFICATION,
  DOCTOR_DEPARTMENT: template.doctor_department || SAMPLE_PLACEHOLDER_DATA.DOCTOR_DEPARTMENT,
  REGISTRATION_NO: template.registration_number || SAMPLE_PLACEHOLDER_DATA.REGISTRATION_NO,
});
