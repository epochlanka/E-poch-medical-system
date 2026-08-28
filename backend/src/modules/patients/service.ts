import { Prisma, PrismaClient, Patient } from '@prisma/client';
import { isFuzzyNameMatch, stringSimilarityPct } from './nameMatch';
import { NotFoundError, ValidationError, DuplicatePatientError } from './errors';

const prisma = new PrismaClient();

type PrismaTx = Prisma.TransactionClient;

// ---- Register New Patient -------------------------------------------------

interface RegisterPatientInput {
  full_name: string;
  dob: Date;
  gender: string;
  nic?: string;
  guardian_nic?: string;
  phone?: string;
  blood_group?: string;
  allergies?: string;
  nationality?: string;
  marital_status?: string;
  occupation?: string;
  employer_school?: string;
  relationship_to_head?: string;
  chronic_conditions?: string;
  current_medications?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  family_id?: number;
  new_family?: { family_name: string; address?: string; contact_no?: string };
}

// Exact-match check: NIC is the primary de-dup key; guardian_nic+dob is the alternate
// composite key for minors without their own NIC. Both hard-block registration (BR-01/BR-02).
const findExactDuplicate = async (nic?: string, guardianNic?: string, dob?: Date) => {
  if (nic) {
    return prisma.patient.findUnique({ where: { nic } });
  }
  if (guardianNic && dob) {
    return prisma.patient.findFirst({ where: { guardian_nic: guardianNic, dob } });
  }
  return null;
};

const PATIENT_ID_PATTERN = /^PT-(\d{6})$/;

// A plain "highest patient_id string, +1" would silently break on any non-standard
// PT-prefixed id (e.g. seed/import data) — string ordering doesn't match numeric ordering,
// and a failed parse would fall back to 1 and collide with an existing patient. Scanning
// and taking the max of only well-formed ids is robust to that.
const generatePatientId = async (tx: PrismaTx) => {
  const candidates = await tx.patient.findMany({
    where: { patient_id: { startsWith: 'PT-' } },
    select: { patient_id: true },
  });

  let max = 0;
  for (const candidate of candidates) {
    const match = PATIENT_ID_PATTERN.exec(candidate.patient_id);
    if (match) max = Math.max(max, parseInt(match[1], 10));
  }

  return `PT-${String(max + 1).padStart(6, '0')}`;
};

// Fuzzy name+DOB match (different NIC) is flagged for human review, never blocked (FR-017).
const flagNearDuplicates = async (patient: Patient) => {
  const candidates = await prisma.patient.findMany({
    where: { dob: patient.dob, patient_id: { not: patient.patient_id }, is_active: true },
  });

  const matches = candidates.filter((candidate) => isFuzzyNameMatch(candidate.full_name, patient.full_name));
  if (matches.length === 0) return [];

  return Promise.all(
    matches.map((match) =>
      prisma.patientDuplicateFlag.create({
        data: {
          patient_id: patient.patient_id,
          matched_patient_id: match.patient_id,
          match_reason: `Same date of birth (${patient.dob.toISOString().slice(0, 10)}) and similar name ("${patient.full_name}" ~ "${match.full_name}")`,
        },
      })
    )
  );
};

export const checkDuplicate = async (params: { nic?: string; guardianNic?: string; dob?: Date }) => {
  const existing = await findExactDuplicate(params.nic, params.guardianNic, params.dob);
  return {
    exists: !!existing,
    patient: existing
      ? { patient_id: existing.patient_id, full_name: existing.full_name, is_active: existing.is_active }
      : null,
  };
};

export const registerPatient = async (input: RegisterPatientInput, actorUserId: number) => {
  const duplicate = await findExactDuplicate(input.nic, input.guardian_nic, input.dob);
  if (duplicate) {
    throw new DuplicatePatientError(
      input.nic
        ? 'A patient with this NIC is already registered'
        : 'A patient with this guardian NIC and date of birth is already registered',
      { patient_id: duplicate.patient_id, full_name: duplicate.full_name }
    );
  }

  const patient = await prisma.$transaction(async (tx) => {
    let familyId = input.family_id;

    if (familyId) {
      const family = await tx.family.findUnique({ where: { family_id: familyId } });
      if (!family) throw new ValidationError('family_id does not exist');
      if (!family.is_active) throw new ValidationError('family_id refers to an archived/merged family');
    }

    if (!familyId && input.new_family) {
      const family = await tx.family.create({
        data: {
          family_name: input.new_family.family_name,
          address: input.new_family.address,
          contact_no: input.new_family.contact_no,
        },
      });
      familyId = family.family_id;
    }

    const patientId = await generatePatientId(tx);

    const created = await tx.patient.create({
      data: {
        patient_id: patientId,
        family_id: familyId!,
        nic: input.nic,
        guardian_nic: input.guardian_nic,
        full_name: input.full_name,
        dob: input.dob,
        gender: input.gender,
        phone: input.phone,
        blood_group: input.blood_group,
        allergies: input.allergies,
        nationality: input.nationality,
        marital_status: input.marital_status,
        occupation: input.occupation,
        employer_school: input.employer_school,
        relationship_to_head: input.relationship_to_head,
        chronic_conditions: input.chronic_conditions,
        current_medications: input.current_medications,
        emergency_contact_name: input.emergency_contact_name,
        emergency_contact_phone: input.emergency_contact_phone,
      },
    });

    // First member of a brand-new family defaults to Head of Family.
    if (input.new_family && !input.family_id) {
      await tx.family.update({ where: { family_id: familyId! }, data: { head_patient_id: created.patient_id } });
    }

    await tx.auditLog.create({
      data: { user_id: actorUserId, action: 'CREATE', entity: 'Patient', entity_id: created.patient_id },
    });

    return created;
  });

  const duplicateFlags = await flagNearDuplicates(patient);

  return { patient, duplicateFlags };
};

// ---- All Patients (search/list) -------------------------------------------

interface ListPatientsFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  gender?: string;
  bloodGroup?: string;
  ageFrom?: number;
  ageTo?: number;
  familyId?: number;
  page?: number;
  limit?: number;
}

// A person turns `age` on their birthday, so "at least ageFrom years old" means born on/before
// today's date `ageFrom` years ago — i.e. dob <= that cutoff (older dob = higher age). The
// ageTo bound is the mirror: dob must be after the cutoff for turning ageTo+1.
const dobCutoffForMinAge = (age: number) => {
  const d = new Date();
  d.setFullYear(d.getFullYear() - age);
  return d;
};

export const listPatients = async (filters: ListPatientsFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.PatientWhereInput = {};
  if (filters.status === 'active') where.is_active = true;
  else if (filters.status === 'inactive') where.is_active = false;
  if (filters.gender) where.gender = filters.gender;
  if (filters.bloodGroup) where.blood_group = filters.bloodGroup;
  if (filters.familyId) where.family_id = filters.familyId;
  if (filters.ageFrom !== undefined || filters.ageTo !== undefined) {
    where.dob = {
      ...(filters.ageFrom !== undefined ? { lte: dobCutoffForMinAge(filters.ageFrom) } : {}),
      ...(filters.ageTo !== undefined ? { gt: dobCutoffForMinAge(filters.ageTo + 1) } : {}),
    };
  }

  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { patient_id: { contains: term } },
      { full_name: { contains: term } },
      { nic: { contains: term } },
      { phone: { contains: term } },
    ];
  }

  const [total, patients] = await Promise.all([
    prisma.patient.count({ where }),
    prisma.patient.findMany({
      where,
      orderBy: { full_name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { family: { select: { family_id: true, family_name: true } } },
    }),
  ]);

  // One grouped query for the whole page's "last visit" column, rather than a per-row query.
  const lastVisits = await prisma.appointment.groupBy({
    by: ['patient_id'],
    _max: { scheduled_at: true },
    where: { patient_id: { in: patients.map((p) => p.patient_id) } },
  });
  const lastVisitByPatientId = new Map(lastVisits.map((v) => [v.patient_id, v._max.scheduled_at]));

  return {
    data: patients.map((p) => ({ ...p, last_visit: lastVisitByPatientId.get(p.patient_id) ?? null })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ---- Summary stats for the Patients list header cards -----------------------

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);

export const getPatientStats = async () => {
  const now = new Date();
  const thisMonthStart = startOfMonth(now);
  const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 12, now.getDate());

  const [totalPatients, newThisMonth, newLastMonth, malePatients, femalePatients, recentAppointments] = await Promise.all([
    prisma.patient.count(),
    prisma.patient.count({ where: { created_at: { gte: thisMonthStart } } }),
    prisma.patient.count({ where: { created_at: { gte: lastMonthStart, lt: thisMonthStart } } }),
    prisma.patient.count({ where: { gender: 'Male' } }),
    prisma.patient.count({ where: { gender: 'Female' } }),
    prisma.appointment.findMany({ where: { scheduled_at: { gte: twelveMonthsAgo } }, select: { patient_id: true }, distinct: ['patient_id'] }),
  ]);

  const changePct = (current: number, prior: number): number | null => {
    if (prior === 0) return current === 0 ? 0 : null;
    return ((current - prior) / prior) * 100;
  };

  return {
    totalPatients,
    newPatientsThisMonth: newThisMonth,
    newPatientsChangePct: changePct(newThisMonth, newLastMonth),
    activePatients: recentAppointments.length,
    malePatients,
    malePatientsPct: totalPatients === 0 ? 0 : (malePatients / totalPatients) * 100,
    femalePatients,
    femalePatientsPct: totalPatients === 0 ? 0 : (femalePatients / totalPatients) * 100,
  };
};

export const getPatientById = async (patientId: string) => {
  const patient = await prisma.patient.findUnique({ where: { patient_id: patientId }, include: { family: true } });
  if (!patient) return null;

  const lastVisit = await prisma.appointment.aggregate({ _max: { scheduled_at: true }, where: { patient_id: patientId } });

  // Same chronic-conditions/current-medications derivation consultations/service.ts and
  // prescriptions/service.ts each already do for their own context calls — duplicated here
  // rather than imported cross-module, per this codebase's convention for these small lookups.
  const [pastConsultations, recentPrescription, nextFollowUp] = await Promise.all([
    prisma.consultation.findMany({
      where: { appointment: { patient_id: patientId }, status: 'Finalized' },
      select: { medical_history_json: true },
      take: 20,
    }),
    prisma.prescription.findFirst({
      where: { consultation: { appointment: { patient_id: patientId } } },
      include: { items: { include: { medicine: { select: { name: true } } } } },
      orderBy: { issued_at: 'desc' },
    }),
    prisma.consultation.findFirst({
      where: { appointment: { patient_id: patientId }, follow_up_date: { gte: new Date() } },
      orderBy: { follow_up_date: 'asc' },
      select: { follow_up_date: true, appointment: { select: { doctor: { select: { username: true } } } } },
    }),
  ]);

  const chronicConditions = Array.from(
    new Set(pastConsultations.flatMap((c) => (c.medical_history_json ? (JSON.parse(c.medical_history_json) as string[]) : [])))
  );

  return {
    ...patient,
    last_visit: lastVisit._max.scheduled_at ?? null,
    clinicalSummary: {
      chronicConditions,
      currentMedications: recentPrescription?.items.map((i) => i.medicine.name) ?? [],
      nextFollowUp: nextFollowUp ? { date: nextFollowUp.follow_up_date, doctorName: nextFollowUp.appointment.doctor.username } : null,
    },
  };
};

// ---- Update (with field-level change logging) ------------------------------

interface UpdatePatientInput {
  full_name?: string;
  phone?: string;
  blood_group?: string;
  allergies?: string;
  gender?: string;
  guardian_nic?: string;
  nationality?: string;
  marital_status?: string;
  occupation?: string;
  employer_school?: string;
  relationship_to_head?: string;
  chronic_conditions?: string;
  current_medications?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  family_id?: number;
  reason?: string;
}

const EDITABLE_FIELDS = [
  'full_name',
  'phone',
  'blood_group',
  'allergies',
  'gender',
  'guardian_nic',
  'nationality',
  'marital_status',
  'occupation',
  'employer_school',
  'relationship_to_head',
  'chronic_conditions',
  'current_medications',
  'emergency_contact_name',
  'emergency_contact_phone',
] as const;

export const updatePatient = async (patientId: string, updates: UpdatePatientInput, actorUserId: number) => {
  const existing = await prisma.patient.findUnique({ where: { patient_id: patientId } });
  if (!existing) throw new NotFoundError('Patient not found');

  const reassigningFamily = updates.family_id !== undefined && updates.family_id !== existing.family_id;
  if (reassigningFamily && !updates.reason) {
    throw new ValidationError('A reason is required when reassigning a patient to a different family');
  }
  if (reassigningFamily) {
    const targetFamily = await prisma.family.findUnique({ where: { family_id: updates.family_id } });
    if (!targetFamily) throw new ValidationError('family_id does not exist');
    if (!targetFamily.is_active) throw new ValidationError('family_id refers to an archived/merged family');
  }

  const changeLogEntries: { field: string; old_value: string | null; new_value: string | null; reason: string | null }[] = [];
  const data: Prisma.PatientUpdateInput = {};

  for (const field of EDITABLE_FIELDS) {
    const newValue = updates[field];
    if (newValue !== undefined && newValue !== (existing as any)[field]) {
      changeLogEntries.push({ field, old_value: (existing as any)[field] ?? null, new_value: newValue ?? null, reason: null });
      (data as any)[field] = newValue;
    }
  }

  if (reassigningFamily) {
    changeLogEntries.push({
      field: 'family_id',
      old_value: String(existing.family_id),
      new_value: String(updates.family_id),
      reason: updates.reason ?? null,
    });
    data.family = { connect: { family_id: updates.family_id } };
  }

  if (changeLogEntries.length === 0) return existing;

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.update({ where: { patient_id: patientId }, data });
    await tx.patientChangeLog.createMany({
      data: changeLogEntries.map((entry) => ({ patient_id: patientId, changed_by: actorUserId, ...entry })),
    });
    return patient;
  });
};

// ---- Archive / Restore (soft delete only — patients are never hard-deleted) -

export const setPatientActive = async (patientId: string, isActive: boolean, actorUserId: number, reason?: string) => {
  const existing = await prisma.patient.findUnique({ where: { patient_id: patientId } });
  if (!existing) throw new NotFoundError('Patient not found');
  if (existing.is_active === isActive) return existing;

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.update({ where: { patient_id: patientId }, data: { is_active: isActive } });
    await tx.patientChangeLog.create({
      data: {
        patient_id: patientId,
        field: 'is_active',
        old_value: String(existing.is_active),
        new_value: String(isActive),
        reason: reason ?? null,
        changed_by: actorUserId,
      },
    });
    return patient;
  });
};

// ---- Patient Photo Capture --------------------------------------------------

export const setPatientPhoto = async (patientId: string, photoUrl: string, actorUserId: number) => {
  const existing = await prisma.patient.findUnique({ where: { patient_id: patientId } });
  if (!existing) throw new NotFoundError('Patient not found');

  return prisma.$transaction(async (tx) => {
    const patient = await tx.patient.update({ where: { patient_id: patientId }, data: { photo_url: photoUrl } });
    await tx.patientChangeLog.create({
      data: {
        patient_id: patientId,
        field: 'photo_url',
        old_value: existing.photo_url,
        new_value: photoUrl,
        changed_by: actorUserId,
      },
    });
    return patient;
  });
};

// ---- Patient History Timeline ----------------------------------------------

export type TimelineEventType = 'appointment' | 'consultation' | 'prescription' | 'invoice' | 'document' | 'vitals';

interface HistoryOptions {
  from?: Date;
  to?: Date;
  types?: TimelineEventType[];
}

export const getPatientHistory = async (patientId: string, opts: HistoryOptions) => {
  const wantType = (t: TimelineEventType) => !opts.types || opts.types.includes(t);
  const inRange = opts.from || opts.to ? { gte: opts.from, lte: opts.to } : undefined;
  // 'vitals' isn't its own table — it's the vitals_json snapshot already on each Consultation —
  // so it rides along on the same query as 'consultation' rather than a second lookup.
  const needConsultations = wantType('consultation') || wantType('vitals');

  const [appointments, consultations, prescriptions, invoices, documents] = await Promise.all([
    wantType('appointment')
      ? prisma.appointment.findMany({
          where: { patient_id: patientId, ...(inRange ? { scheduled_at: inRange } : {}) },
          include: { doctor: { select: { username: true } } },
          orderBy: { scheduled_at: 'desc' },
        })
      : Promise.resolve([]),
    needConsultations
      ? prisma.consultation.findMany({
          where: { appointment: { patient_id: patientId }, ...(inRange ? { created_at: inRange } : {}) },
          orderBy: { created_at: 'desc' },
        })
      : Promise.resolve([]),
    wantType('prescription')
      ? prisma.prescription.findMany({
          where: { consultation: { appointment: { patient_id: patientId } }, ...(inRange ? { issued_at: inRange } : {}) },
          include: { items: { include: { medicine: { select: { name: true } } } } },
          orderBy: { issued_at: 'desc' },
        })
      : Promise.resolve([]),
    wantType('invoice')
      ? prisma.invoice.findMany({
          where: { patient_id: patientId, ...(inRange ? { created_at: inRange } : {}) },
          orderBy: { created_at: 'desc' },
        })
      : Promise.resolve([]),
    wantType('document')
      ? prisma.consultationDocument.findMany({
          where: { consultation: { appointment: { patient_id: patientId } }, ...(inRange ? { uploaded_at: inRange } : {}) },
          orderBy: { uploaded_at: 'desc' },
        })
      : Promise.resolve([]),
  ]);

  const events = [
    ...appointments.map((a) => ({
      type: 'appointment' as const,
      date: a.scheduled_at,
      appointmentId: a.appointment_id,
      status: a.status,
      doctorName: a.doctor.username,
    })),
    ...(wantType('consultation')
      ? consultations.map((c) => ({
          type: 'consultation' as const,
          date: c.created_at,
          consultationId: c.consultation_id,
          appointmentId: c.appointment_id,
          diagnosis: c.diagnosis,
          status: c.status,
          followUpDate: c.follow_up_date,
        }))
      : []),
    ...prescriptions.map((rx) => ({
      type: 'prescription' as const,
      date: rx.issued_at,
      prescriptionId: rx.prescription_id,
      status: rx.status,
      items: rx.items.map((i) => ({ medicine: i.medicine.name, dosage: i.dosage, qty: i.qty })),
    })),
    ...invoices.map((inv) => ({
      type: 'invoice' as const,
      date: inv.created_at,
      invoiceId: inv.invoice_id,
      totalAmount: inv.total_amount,
      paymentStatus: inv.payment_status,
    })),
    ...documents.map((doc) => ({
      type: 'document' as const,
      date: doc.uploaded_at,
      documentId: doc.document_id,
      consultationId: doc.consultation_id,
      filename: doc.filename,
      originalName: doc.original_name,
      mimeType: doc.mime_type,
    })),
    ...(wantType('vitals')
      ? // vitals_json is only ever absent (empty vitals input serializes to the *string* "null",
        // which is truthy) once actually parsed — so the null-check has to happen after JSON.parse.
        consultations
          .map((c) => ({ consultationId: c.consultation_id, created_at: c.created_at, vitals: c.vitals_json ? JSON.parse(c.vitals_json) : null }))
          .filter((c): c is typeof c & { vitals: NonNullable<typeof c.vitals> } => c.vitals !== null)
          .map((c) => ({
            type: 'vitals' as const,
            date: c.created_at,
            consultationId: c.consultationId,
            vitals: c.vitals,
          }))
      : []),
  ];

  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  return events;
};

// ---- Patient Audit Log ------------------------------------------------------

export const getPatientAuditLog = async (patientId: string, page = 1, limit = 50) => {
  const [total, entries] = await Promise.all([
    prisma.patientChangeLog.count({ where: { patient_id: patientId } }),
    prisma.patientChangeLog.findMany({
      where: { patient_id: patientId },
      include: { changed_by_user: { select: { username: true } } },
      orderBy: { changed_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    data: entries.map((e) => ({
      id: e.id,
      field: e.field,
      oldValue: e.old_value,
      newValue: e.new_value,
      reason: e.reason,
      changedBy: e.changed_by_user.username,
      changedAt: e.changed_at,
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ---- Duplicate / Near-Duplicate Review Queue --------------------------------

type MatchFieldStatus = 'exact' | 'similar' | 'different' | 'unavailable';
interface MatchField {
  status: MatchFieldStatus;
  detail: string;
  value: string | null;
}

const maskTail = (value: string) => (value.length <= 2 ? value : `${value.slice(0, -1)}*`);

// Real, per-field comparison of the two flagged patients' actual current values — computed live
// on every read rather than stored at flag-creation time, so it reflects the records as they are
// now (e.g. if a phone number was corrected after the flag was raised) instead of going stale.
const compareNic = (a: string | null, b: string | null): MatchField => {
  if (!a || !b) return { status: 'unavailable', detail: 'Not available', value: null };
  if (a === b) return { status: 'exact', detail: 'Exact Match', value: a };
  const pct = stringSimilarityPct(a, b);
  if (pct >= 60) return { status: 'similar', detail: `Similar (${pct}% match)`, value: maskTail(a) };
  return { status: 'different', detail: 'Different', value: maskTail(a) };
};

const comparePhone = (a: string | null, b: string | null): MatchField => {
  if (!a || !b) return { status: 'unavailable', detail: 'Not available', value: null };
  if (a === b) return { status: 'exact', detail: 'Exact Match', value: a };
  for (const n of [7, 6, 5]) {
    if (a.length >= n && b.length >= n && a.slice(-n) === b.slice(-n)) {
      return { status: 'similar', detail: `Similar (Last ${n} digits match)`, value: a };
    }
  }
  return { status: 'different', detail: 'Different', value: a };
};

const compareAddress = (a: string | null, b: string | null): MatchField => {
  if (!a || !b) return { status: 'unavailable', detail: 'Not available', value: a ?? b };
  if (a.trim().toLowerCase() === b.trim().toLowerCase()) return { status: 'exact', detail: a, value: a };
  return { status: 'different', detail: a, value: a };
};

const MATCH_WEIGHTS = { dob: 25, name: 40, nic: 20, phone: 15 } as const;

type DuplicatePairPatient = { full_name: string; dob: Date; nic: string | null; phone: string | null; family: { address: string | null } | null };

const computeMatchDetails = (a: DuplicatePairPatient, b: DuplicatePairPatient) => {
  const dobExact = a.dob.getTime() === b.dob.getTime();
  const namePct = stringSimilarityPct(a.full_name, b.full_name);
  const nic = compareNic(a.nic, b.nic);
  const phone = comparePhone(a.phone, b.phone);
  const address = compareAddress(a.family?.address ?? null, b.family?.address ?? null);

  const fieldScores: { weight: number; score: number }[] = [
    { weight: MATCH_WEIGHTS.dob, score: dobExact ? 100 : 0 },
    { weight: MATCH_WEIGHTS.name, score: namePct },
  ];
  if (nic.status !== 'unavailable') fieldScores.push({ weight: MATCH_WEIGHTS.nic, score: nic.status === 'exact' ? 100 : nic.status === 'similar' ? 65 : 20 });
  if (phone.status !== 'unavailable') fieldScores.push({ weight: MATCH_WEIGHTS.phone, score: phone.status === 'exact' ? 100 : phone.status === 'similar' ? 70 : 20 });

  const totalWeight = fieldScores.reduce((s, f) => s + f.weight, 0);
  const matchScorePct = Math.round(fieldScores.reduce((s, f) => s + f.weight * f.score, 0) / totalWeight);
  const matchLabel = matchScorePct >= 95 ? 'Very High Match' : matchScorePct >= 80 ? 'High Match' : matchScorePct >= 61 ? 'Moderate Match' : 'Low Match';
  const matchBand = matchScorePct >= 95 ? 'very-high' : matchScorePct >= 80 ? 'high' : matchScorePct >= 61 ? 'moderate' : 'low';

  return {
    matchScorePct,
    matchLabel,
    matchBand,
    breakdown: {
      dob: { status: dobExact ? 'exact' : 'different', detail: dobExact ? 'Exact Match' : 'Different', value: a.dob.toISOString() } as MatchField,
      nic,
      phone,
      address,
    },
  };
};

interface ListDuplicateFlagsFilters {
  status?: 'Pending' | 'Dismissed' | 'Merged' | 'All';
  search?: string;
  matchBand?: 'very-high' | 'high' | 'moderate' | 'low' | 'all';
  dateFrom?: Date;
  dateTo?: Date;
  reviewedBy?: string;
  page?: number;
  limit?: number;
}

const duplicatePatientSelect = {
  patient_id: true,
  full_name: true,
  dob: true,
  nic: true,
  phone: true,
  is_active: true,
  photo_url: true,
  family: { select: { address: true } },
} as const;

export const listDuplicateFlags = async (filters: ListDuplicateFlagsFilters = {}) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 5;

  const where: Prisma.PatientDuplicateFlagWhereInput = {};
  if (filters.status && filters.status !== 'All') where.status = filters.status;
  if (filters.dateFrom || filters.dateTo) {
    where.created_at = { ...(filters.dateFrom ? { gte: filters.dateFrom } : {}), ...(filters.dateTo ? { lte: filters.dateTo } : {}) };
  }
  if (filters.reviewedBy) where.reviewer = { username: filters.reviewedBy };
  if (filters.search) {
    const term = filters.search.trim();
    const patientMatch = { OR: [{ patient_id: { contains: term } }, { full_name: { contains: term } }, { nic: { contains: term } }, { phone: { contains: term } }] };
    where.OR = [{ patient: patientMatch }, { matched_patient: patientMatch }];
  }

  // Every field this page needs to filter/sort/paginate by (match score, band) is computed, not
  // stored — same "fetch-all, derive, filter, paginate in-memory" tradeoff already established
  // for Medicines' stock-status filter and Invoices' type filter, safe here since duplicate flags
  // are a bounded, small-scale dataset (staff review queue), not clinic-scale transactional data.
  const all = await prisma.patientDuplicateFlag.findMany({
    where,
    include: {
      patient: { select: duplicatePatientSelect },
      matched_patient: { select: duplicatePatientSelect },
      reviewer: { select: { username: true } },
    },
    orderBy: { created_at: 'desc' },
  });

  const enriched = all.map((flag) => {
    const match = computeMatchDetails(flag.patient, flag.matched_patient);
    return {
      flagId: flag.flag_id,
      status: flag.status,
      matchReason: flag.match_reason,
      createdAt: flag.created_at,
      reviewedAt: flag.reviewed_at,
      reviewedBy: flag.reviewer?.username ?? null,
      addedBy: 'System' as const, // every flag today is raised automatically by flagNearDuplicates() at registration
      patient: flag.patient,
      matchedPatient: flag.matched_patient,
      ...match,
    };
  });

  const reviewedByOptions = Array.from(new Set(enriched.map((f) => f.reviewedBy).filter((v): v is string => !!v))).sort();

  const bandFiltered =
    filters.matchBand && filters.matchBand !== 'all' ? enriched.filter((f) => f.matchBand === filters.matchBand) : enriched;

  const sorted = bandFiltered.sort((a, b) => b.matchScorePct - a.matchScorePct || b.createdAt.getTime() - a.createdAt.getTime());

  const total = sorted.length;
  const pageRows = sorted.slice((page - 1) * limit, (page - 1) * limit + limit);

  return {
    data: pageRows,
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    reviewedByOptions,
  };
};

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

export const getDuplicateFlagStats = async () => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const [pendingReview, mergedToday, dismissedToday] = await Promise.all([
    prisma.patientDuplicateFlag.count({ where: { status: 'Pending' } }),
    prisma.patientDuplicateFlag.count({ where: { status: 'Merged', reviewed_at: { gte: todayStart, lte: todayEnd } } }),
    prisma.patientDuplicateFlag.count({ where: { status: 'Dismissed', reviewed_at: { gte: todayStart, lte: todayEnd } } }),
  ]);

  return { pendingReview, reviewedToday: mergedToday + dismissedToday, mergedToday, dismissedToday };
};

export const dismissDuplicateFlag = async (flagId: number, actorUserId: number) => {
  const flag = await prisma.patientDuplicateFlag.findUnique({ where: { flag_id: flagId } });
  if (!flag) throw new NotFoundError('Duplicate flag not found');
  if (flag.status !== 'Pending') throw new ValidationError('Only pending flags can be dismissed');

  return prisma.patientDuplicateFlag.update({
    where: { flag_id: flagId },
    data: { status: 'Dismissed', reviewed_by: actorUserId, reviewed_at: new Date() },
  });
};

// Merging reassigns the losing patient's appointments/invoices onto the surviving record and
// archives the loser — patients are never hard-deleted, so history stays intact either way.
export const mergeDuplicateFlag = async (flagId: number, primaryPatientId: string, actorUserId: number) => {
  const flag = await prisma.patientDuplicateFlag.findUnique({ where: { flag_id: flagId } });
  if (!flag) throw new NotFoundError('Duplicate flag not found');
  if (flag.status !== 'Pending') throw new ValidationError('Only pending flags can be merged');

  if (![flag.patient_id, flag.matched_patient_id].includes(primaryPatientId)) {
    throw new ValidationError('primaryPatientId must be one of the two flagged patients');
  }

  const losingPatientId = primaryPatientId === flag.patient_id ? flag.matched_patient_id : flag.patient_id;

  return prisma.$transaction(async (tx) => {
    await tx.appointment.updateMany({ where: { patient_id: losingPatientId }, data: { patient_id: primaryPatientId } });
    await tx.invoice.updateMany({ where: { patient_id: losingPatientId }, data: { patient_id: primaryPatientId } });
    await tx.patient.update({ where: { patient_id: losingPatientId }, data: { is_active: false } });

    await tx.patientChangeLog.create({
      data: {
        patient_id: primaryPatientId,
        field: 'merge',
        old_value: null,
        new_value: losingPatientId,
        reason: `Merged duplicate record ${losingPatientId} into ${primaryPatientId}`,
        changed_by: actorUserId,
      },
    });
    await tx.patientChangeLog.create({
      data: {
        patient_id: losingPatientId,
        field: 'merge',
        old_value: null,
        new_value: primaryPatientId,
        reason: `Archived and merged into ${primaryPatientId}`,
        changed_by: actorUserId,
      },
    });

    return tx.patientDuplicateFlag.update({
      where: { flag_id: flagId },
      data: { status: 'Merged', reviewed_by: actorUserId, reviewed_at: new Date() },
    });
  });
};
