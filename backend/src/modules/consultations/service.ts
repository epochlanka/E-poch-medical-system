import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

const assertDoctorOwnsOrAdmin = (actor: Actor, doctorId: number) => {
  if (actor.role === 'Admin') return;
  if (actor.role === 'Doctor' && actor.user_id === doctorId) return;
  throw new ForbiddenError('You do not have permission to modify this consultation');
};

// ---- Vitals (BMI is always server-computed, never accepted from the client) ------------

interface VitalsInput {
  bp_systolic?: number;
  bp_diastolic?: number;
  temp?: number;
  pulse?: number;
  weight?: number; // kg
  height?: number; // cm
}

const computeVitals = (vitals?: VitalsInput | null) => {
  if (!vitals) return null;
  let bmi: number | null = null;
  if (vitals.weight && vitals.height) {
    const heightM = vitals.height / 100;
    bmi = Math.round((vitals.weight / (heightM * heightM)) * 10) / 10;
  }
  return { ...vitals, bmi };
};

const serializeConsultation = (consultation: any) => {
  const { vitals_json, ...rest } = consultation;
  return { ...rest, vitals: vitals_json ? JSON.parse(vitals_json) : null };
};

// ---- Consultation Workspace -----------------------------------------------------------

interface CreateConsultationInput {
  appointment_id: number;
  vitals?: VitalsInput;
  complaint?: string;
  diagnosis?: string;
  icd10_code?: string;
  notes?: string;
  follow_up_date?: Date;
  allergies_ack?: boolean;
}

// A consultation only makes sense once the patient is actually in front of the doctor —
// created the moment an appointment enters Consulting, never before (FR-032's ordering
// requirement only matters if the record exists to surface history against in the first place).
export const createConsultation = async (input: CreateConsultationInput, actor: Actor) => {
  const appointment = await prisma.appointment.findUnique({ where: { appointment_id: input.appointment_id } });
  if (!appointment) throw new NotFoundError('Appointment not found');
  assertDoctorOwnsOrAdmin(actor, appointment.doctor_id);
  if (appointment.status !== 'Consulting') {
    throw new ValidationError('A consultation can only be started for an appointment that is currently Consulting');
  }

  const existing = await prisma.consultation.findUnique({ where: { appointment_id: input.appointment_id } });
  if (existing) throw new ValidationError('A consultation already exists for this appointment');

  const consultation = await prisma.consultation.create({
    data: {
      appointment_id: input.appointment_id,
      vitals_json: JSON.stringify(computeVitals(input.vitals)),
      complaint: input.complaint,
      diagnosis: input.diagnosis,
      icd10_code: input.icd10_code,
      notes: input.notes,
      follow_up_date: input.follow_up_date,
      allergies_ack: input.allergies_ack ?? false,
    },
  });

  return serializeConsultation(consultation);
};

export const getConsultationById = async (id: number) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: id },
    include: {
      appointment: {
        include: {
          patient: { select: { patient_id: true, full_name: true, dob: true, gender: true, allergies: true, blood_group: true } },
          doctor: { select: { user_id: true, username: true, registration_number: true } },
        },
      },
    },
  });
  if (!consultation) return null;
  return serializeConsultation(consultation);
};

interface UpdateConsultationInput {
  vitals?: VitalsInput;
  complaint?: string;
  diagnosis?: string;
  icd10_code?: string;
  notes?: string;
  follow_up_date?: Date | null;
  allergies_ack?: boolean;
}

// Draft is freely editable; once Finalized, changes must go through amendConsultation so
// there's always a logged before/after — never the same form silently overwriting history.
export const updateConsultation = async (id: number, updates: UpdateConsultationInput, actor: Actor) => {
  const existing = await prisma.consultation.findUnique({ where: { consultation_id: id }, include: { appointment: true } });
  if (!existing) throw new NotFoundError('Consultation not found');
  assertDoctorOwnsOrAdmin(actor, existing.appointment.doctor_id);
  if (existing.status !== 'Draft') {
    throw new ValidationError('Only a Draft consultation can be edited directly — use the amendment path for a Finalized record');
  }

  const data: Prisma.ConsultationUpdateInput = {};
  if (updates.vitals !== undefined) data.vitals_json = JSON.stringify(computeVitals(updates.vitals));
  if (updates.complaint !== undefined) data.complaint = updates.complaint;
  if (updates.diagnosis !== undefined) data.diagnosis = updates.diagnosis;
  if (updates.icd10_code !== undefined) data.icd10_code = updates.icd10_code;
  if (updates.notes !== undefined) data.notes = updates.notes;
  if (updates.follow_up_date !== undefined) data.follow_up_date = updates.follow_up_date;
  if (updates.allergies_ack !== undefined) data.allergies_ack = updates.allergies_ack;

  const updated = await prisma.consultation.update({ where: { consultation_id: id }, data });
  return serializeConsultation(updated);
};

// Finalizing is one-way; it also marks the originating appointment Completed, matching the
// queue's own status machine (Consulting -> Completed) rather than leaving it to drift out of sync.
export const finalizeConsultation = async (id: number, actor: Actor) => {
  const existing = await prisma.consultation.findUnique({ where: { consultation_id: id }, include: { appointment: true } });
  if (!existing) throw new NotFoundError('Consultation not found');
  assertDoctorOwnsOrAdmin(actor, existing.appointment.doctor_id);
  if (existing.status !== 'Draft') throw new ValidationError('Only a Draft consultation can be finalized');

  const [consultation] = await prisma.$transaction([
    prisma.consultation.update({ where: { consultation_id: id }, data: { status: 'Finalized' } }),
    prisma.appointment.update({ where: { appointment_id: existing.appointment_id }, data: { status: 'Completed' } }),
  ]);

  return serializeConsultation(consultation);
};

// ---- Consultation Amendment Log --------------------------------------------------------

const AMENDABLE_FIELDS = ['complaint', 'diagnosis', 'icd10_code', 'notes', 'follow_up_date'] as const;
type AmendableField = (typeof AMENDABLE_FIELDS)[number];

interface AmendConsultationInput {
  field: string;
  new_value: string | null;
  reason: string;
}

export const amendConsultation = async (id: number, input: AmendConsultationInput, actor: Actor) => {
  const existing = await prisma.consultation.findUnique({ where: { consultation_id: id }, include: { appointment: true } });
  if (!existing) throw new NotFoundError('Consultation not found');
  assertDoctorOwnsOrAdmin(actor, existing.appointment.doctor_id);
  if (existing.status !== 'Finalized') throw new ValidationError('Only a Finalized consultation can be amended');
  if (!AMENDABLE_FIELDS.includes(input.field as AmendableField)) {
    throw new ValidationError(`Field '${input.field}' cannot be amended`);
  }
  if (!input.reason?.trim()) throw new ValidationError('An amendment reason is required');

  const field = input.field as AmendableField;
  const oldValue = field === 'follow_up_date' ? existing.follow_up_date?.toISOString() ?? null : ((existing as any)[field] ?? null);

  const data: Prisma.ConsultationUpdateInput =
    field === 'follow_up_date' ? { follow_up_date: input.new_value ? new Date(input.new_value) : null } : { [field]: input.new_value };

  const [consultation] = await prisma.$transaction([
    prisma.consultation.update({ where: { consultation_id: id }, data }),
    prisma.consultationAmendmentLog.create({
      data: {
        consultation_id: id,
        field,
        old_value: oldValue,
        new_value: input.new_value,
        reason: input.reason,
        amended_by: actor.user_id,
      },
    }),
  ]);

  return serializeConsultation(consultation);
};

export const listAmendments = async (id: number) => {
  const entries = await prisma.consultationAmendmentLog.findMany({
    where: { consultation_id: id },
    include: { amended_by_user: { select: { username: true } } },
    orderBy: { amended_at: 'desc' },
  });

  return entries.map((e) => ({
    id: e.id,
    field: e.field,
    oldValue: e.old_value,
    newValue: e.new_value,
    reason: e.reason,
    amendedBy: e.amended_by_user.username,
    amendedAt: e.amended_at,
  }));
};

// ---- Search & Filters -------------------------------------------------------------------

interface ListConsultationsFilters {
  patientId?: string;
  doctorId?: number;
  status?: 'Draft' | 'Finalized';
  from?: Date;
  to?: Date;
  diagnosisKeyword?: string;
  page?: number;
  limit?: number;
}

export const listConsultations = async (filters: ListConsultationsFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.ConsultationWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.diagnosisKeyword) where.diagnosis = { contains: filters.diagnosisKeyword };
  if (filters.from || filters.to) {
    where.created_at = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }
  if (filters.patientId || filters.doctorId) {
    where.appointment = {
      ...(filters.patientId ? { patient_id: filters.patientId } : {}),
      ...(filters.doctorId ? { doctor_id: filters.doctorId } : {}),
    };
  }

  const [total, consultations] = await Promise.all([
    prisma.consultation.count({ where }),
    prisma.consultation.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        appointment: {
          include: {
            patient: { select: { patient_id: true, full_name: true } },
            doctor: { select: { user_id: true, username: true } },
          },
        },
      },
    }),
  ]);

  return {
    data: consultations.map((c) => ({
      consultationId: c.consultation_id,
      status: c.status,
      diagnosis: c.diagnosis,
      createdAt: c.created_at,
      followUpDate: c.follow_up_date,
      patientId: c.appointment.patient.patient_id,
      patientName: c.appointment.patient.full_name,
      doctorId: c.appointment.doctor.user_id,
      doctorName: c.appointment.doctor.username,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};
