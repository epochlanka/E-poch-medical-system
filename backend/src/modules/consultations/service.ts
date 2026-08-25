import { PrismaClient, Prisma } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const prisma = new PrismaClient();
export const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads', 'consultations');

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
  respiratory_rate?: number;
  spo2?: number;
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
  const { vitals_json, medical_history_json, ...rest } = consultation;
  return {
    ...rest,
    vitals: vitals_json ? JSON.parse(vitals_json) : null,
    medicalHistory: medical_history_json ? JSON.parse(medical_history_json) : [],
  };
};

// ---- Consultation Workspace -----------------------------------------------------------

interface CreateConsultationInput {
  appointment_id: number;
  vitals?: VitalsInput;
  complaint?: string;
  history_of_present_illness?: string;
  examination_findings?: string;
  medical_history?: string[];
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
      history_of_present_illness: input.history_of_present_illness,
      examination_findings: input.examination_findings,
      medical_history_json: input.medical_history ? JSON.stringify(input.medical_history) : undefined,
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
  history_of_present_illness?: string;
  examination_findings?: string;
  medical_history?: string[];
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
  if (updates.history_of_present_illness !== undefined) data.history_of_present_illness = updates.history_of_present_illness;
  if (updates.examination_findings !== undefined) data.examination_findings = updates.examination_findings;
  if (updates.medical_history !== undefined) data.medical_history_json = JSON.stringify(updates.medical_history);
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
    prisma.consultation.update({ where: { consultation_id: id }, data: { status: 'Finalized', finalized_at: new Date() } }),
    prisma.appointment.update({ where: { appointment_id: existing.appointment_id }, data: { status: 'Completed' } }),
  ]);

  return serializeConsultation(consultation);
};

// ---- Consultation Amendment Log --------------------------------------------------------

const AMENDABLE_FIELDS = [
  'complaint',
  'history_of_present_illness',
  'examination_findings',
  'diagnosis',
  'icd10_code',
  'notes',
  'follow_up_date',
] as const;
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

// Amendment reasons can contain sensitive clinical justification text, so a Doctor caller is
// scoped to their own patients' consultations here too — same rule as amending itself, just not
// blocking Admin/Receptionist/Pharmacist, who already have broader read access to consultations
// elsewhere in this module.
export const listAmendments = async (id: number, actor: Actor) => {
  const consultation = await prisma.consultation.findUnique({ where: { consultation_id: id }, include: { appointment: true } });
  if (!consultation) throw new NotFoundError('Consultation not found');
  if (actor.role === 'Doctor' && actor.user_id !== consultation.appointment.doctor_id) {
    throw new ForbiddenError('You do not have permission to view this consultation');
  }

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
  search?: string;
  followUpOnly?: boolean;
  page?: number;
  limit?: number;
}

export const listConsultations = async (filters: ListConsultationsFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.ConsultationWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.diagnosisKeyword) where.diagnosis = { contains: filters.diagnosisKeyword };
  if (filters.followUpOnly) where.follow_up_date = { not: null };
  if (filters.from || filters.to) {
    where.created_at = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }
  if (filters.patientId || filters.doctorId || filters.search) {
    where.appointment = {
      ...(filters.patientId ? { patient_id: filters.patientId } : {}),
      ...(filters.doctorId ? { doctor_id: filters.doctorId } : {}),
      ...(filters.search
        ? { OR: [{ patient: { full_name: { contains: filters.search } } }, { patient: { patient_id: { contains: filters.search } } }] }
        : {}),
    };
  }

  const patientSelect = { patient_id: true, full_name: true, gender: true, dob: true, phone: true, photo_url: true } as const;

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
            patient: { select: patientSelect },
            doctor: { select: { user_id: true, username: true } },
          },
        },
      },
    }),
  ]);

  return {
    // patientId/patientName stay flat (existing consumers, e.g. the admin app's Consultations
    // Queue and New Invoice modal, already depend on this shape) — everything else here is
    // purely additive so those callers are unaffected by ignoring the new fields.
    data: consultations.map((c) => ({
      consultationId: c.consultation_id,
      appointmentId: c.appointment_id,
      status: c.status,
      complaint: c.complaint,
      diagnosis: c.diagnosis,
      icd10Code: c.icd10_code,
      notes: c.notes,
      createdAt: c.created_at,
      followUpDate: c.follow_up_date,
      patientId: c.appointment.patient?.patient_id ?? null,
      patientName: c.appointment.patient?.full_name ?? c.appointment.temp_patient_name ?? 'Unregistered Patient',
      patientGender: c.appointment.patient?.gender ?? c.appointment.temp_patient_gender ?? null,
      patientDob: c.appointment.patient?.dob ?? null,
      patientPhone: c.appointment.patient?.phone ?? c.appointment.temp_patient_phone ?? null,
      patientPhotoUrl: c.appointment.patient?.photo_url ?? null,
      isTemporary: c.appointment.is_temporary,
      doctorId: c.appointment.doctor.user_id,
      doctorName: c.appointment.doctor.username,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ---- Consultation Context (everything the workspace page needs in one call) --------------
// Keyed by appointment_id rather than consultation_id since the consultation may not exist
// yet — a Doctor opening a freshly-Consulting appointment needs the patient/appointment
// context to even render the "start a consultation" form.

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

export const getConsultationContext = async (appointmentId: number, actor: Actor) => {
  const appointment = await prisma.appointment.findUnique({
    where: { appointment_id: appointmentId },
    include: {
      patient: true,
      doctor: { select: { user_id: true, username: true, registration_number: true } },
    },
  });
  if (!appointment) throw new NotFoundError('Appointment not found');

  const consultationRow = await prisma.consultation.findUnique({
    where: { appointment_id: appointmentId },
    include: {
      documents: { include: { uploader: { select: { username: true } } }, orderBy: { uploaded_at: 'desc' } },
      prescriptions: { orderBy: { issued_at: 'desc' } },
      invoices: { where: { payment_status: { not: 'Voided' } }, orderBy: { created_at: 'desc' } },
    },
  });
  const consultation = consultationRow ? serializeConsultation(consultationRow) : null;

  // A temporary walk-in has no patient_id — there is no real identity to aggregate history
  // against, and `patient_id: null` would otherwise match every *other* unregistered walk-in's
  // appointments too (Prisma treats `null` as a real filter value), leaking unrelated patients'
  // chronic conditions/medications/last-visit into this context. Skip these lookups entirely.
  const patientId = appointment.patient_id;
  const [pastConsultations, lastOtherAppointment, recentPrescription] = patientId
    ? await Promise.all([
        prisma.consultation.findMany({
          where: { appointment: { patient_id: patientId }, status: 'Finalized', appointment_id: { not: appointmentId } },
          select: { medical_history_json: true, diagnosis: true, created_at: true },
          orderBy: { created_at: 'desc' },
          take: 10,
        }),
        prisma.appointment.findFirst({
          where: { patient_id: patientId, appointment_id: { not: appointmentId }, scheduled_at: { lt: startOfDay() } },
          orderBy: { scheduled_at: 'desc' },
          select: { scheduled_at: true },
        }),
        prisma.prescription.findFirst({
          where: { consultation: { appointment: { patient_id: patientId } } },
          include: { items: { include: { medicine: { select: { name: true } } } } },
          orderBy: { issued_at: 'desc' },
        }),
      ])
    : [[], null, null];

  const chronicConditions = Array.from(
    new Set(pastConsultations.flatMap((c) => (c.medical_history_json ? (JSON.parse(c.medical_history_json) as string[]) : [])))
  );

  const recentConsultations = pastConsultations.slice(0, 5).map((c) => ({ diagnosis: c.diagnosis, date: c.created_at }));

  return {
    appointment: {
      appointmentId: appointment.appointment_id,
      status: appointment.status,
      scheduledAt: appointment.scheduled_at,
      patient: appointment.patient,
      isTemporary: appointment.is_temporary,
      tempPatient: appointment.is_temporary
        ? {
            name: appointment.temp_patient_name,
            gender: appointment.temp_patient_gender,
            phone: appointment.temp_patient_phone,
            age: appointment.temp_patient_age,
          }
        : null,
      doctor: appointment.doctor,
    },
    consultation,
    patientSummary: {
      bloodGroup: appointment.patient?.blood_group ?? null,
      allergies: appointment.patient?.allergies ?? null,
      chronicConditions,
      currentMedications: recentPrescription?.items.map((i) => i.medicine.name) ?? [],
      lastVisit: lastOtherAppointment?.scheduled_at ?? null,
    },
    recentConsultations,
  };
};

// ---- Patient Consultation History (History tab) ------------------------------------------
// Registered patients only — the caller is expected to only invoke this with a real patient_id
// (the doctor-frontend never shows the History tab, and never has a patientId to pass, for a
// temporary/unregistered walk-in). Called with a patientId that matches nothing just returns [].

export const getPatientConsultationHistory = async (patientId: string, excludeAppointmentId?: number) => {
  const consultations = await prisma.consultation.findMany({
    where: {
      appointment: { patient_id: patientId },
      status: 'Finalized',
      ...(excludeAppointmentId ? { appointment_id: { not: excludeAppointmentId } } : {}),
    },
    include: {
      appointment: {
        select: {
          appointment_id: true,
          scheduled_at: true,
          doctor: { select: { user_id: true, username: true, registration_number: true } },
        },
      },
    },
    orderBy: { created_at: 'desc' },
  });

  const consultationIds = consultations.map((c) => c.consultation_id);

  // Two batched queries (not one per visit) — prescriptions and lab orders for every past visit
  // fetched together, then grouped in memory below, so this stays O(1) round-trips regardless
  // of how many past consultations the patient has.
  const [prescriptions, labTestOrders] = consultationIds.length
    ? await Promise.all([
        prisma.prescription.findMany({
          where: { consultation_id: { in: consultationIds } },
          include: { items: { include: { medicine: { select: { name: true } } } } },
          orderBy: { issued_at: 'asc' },
        }),
        prisma.labTestOrder.findMany({
          where: { consultation_id: { in: consultationIds } },
          include: { results: { orderBy: { entered_at: 'asc' } } },
          orderBy: { order_date: 'asc' },
        }),
      ])
    : [[], []];

  return consultations.map((c) => ({
    consultationId: c.consultation_id,
    appointmentId: c.appointment_id,
    createdAt: c.created_at,
    finalizedAt: c.finalized_at,
    doctorName: c.appointment.doctor.username,
    doctorRegistrationNumber: c.appointment.doctor.registration_number,
    complaint: c.complaint,
    historyOfPresentIllness: c.history_of_present_illness,
    examinationFindings: c.examination_findings,
    vitals: c.vitals_json ? JSON.parse(c.vitals_json) : null,
    medicalHistory: c.medical_history_json ? (JSON.parse(c.medical_history_json) as string[]) : [],
    diagnosis: c.diagnosis,
    icd10Code: c.icd10_code,
    notes: c.notes,
    followUpDate: c.follow_up_date,
    prescriptions: prescriptions
      .filter((rx) => rx.consultation_id === c.consultation_id)
      .map((rx) => ({
        prescriptionId: rx.prescription_id,
        status: rx.status,
        issuedAt: rx.issued_at,
        items: rx.items.map((i) => ({ medicine: i.medicine.name, dosage: i.dosage, qty: i.qty })),
      })),
    labTestOrders: labTestOrders
      .filter((lt) => lt.consultation_id === c.consultation_id)
      .map((lt) => ({
        labTestOrderId: lt.lab_test_order_id,
        testName: lt.test_name,
        status: lt.status,
        priority: lt.priority,
        results: lt.results.map((r) => ({
          parameterName: r.parameter_name,
          value: r.result_value,
          unit: r.unit,
          referenceRange: r.reference_range,
          flag: r.result_flag,
        })),
      })),
  }));
};

// ---- Attach Files (consultation-scoped document uploads) --------------------------------

export const addDocument = async (
  consultationId: number,
  file: { filename: string; originalname: string; mimetype: string; size: number },
  actorUserId: number
) => {
  const consultation = await prisma.consultation.findUnique({ where: { consultation_id: consultationId } });
  if (!consultation) throw new NotFoundError('Consultation not found');

  return prisma.consultationDocument.create({
    data: {
      consultation_id: consultationId,
      filename: file.filename,
      original_name: file.originalname,
      mime_type: file.mimetype,
      size_bytes: file.size,
      uploaded_by: actorUserId,
    },
  });
};

export const listDocuments = async (consultationId: number) => {
  return prisma.consultationDocument.findMany({
    where: { consultation_id: consultationId },
    include: { uploader: { select: { username: true } } },
    orderBy: { uploaded_at: 'desc' },
  });
};

export const deleteDocument = async (documentId: number) => {
  const doc = await prisma.consultationDocument.findUnique({ where: { document_id: documentId } });
  if (!doc) throw new NotFoundError('Document not found');
  await prisma.consultationDocument.delete({ where: { document_id: documentId } });

  const filePath = path.join(uploadsDir, doc.filename);
  fs.promises.unlink(filePath).catch(() => {});

  return doc;
};
