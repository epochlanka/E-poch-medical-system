import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError, AllergyConflictError } from './errors';
import { computeExpectedQty } from './qtyCalc';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

const assertDoctorOwnsOrAdmin = (actor: Actor, doctorId: number) => {
  if (actor.role === 'Admin') return;
  if (actor.role === 'Doctor' && actor.user_id === doctorId) return;
  throw new ForbiddenError('You do not have permission to prescribe for this consultation');
};

interface PrescriptionItemInput {
  medicine_id: number;
  dosage: string;
  frequency?: string;
  duration?: string;
  route?: string;
  instructions?: string;
  qty: number;
  external_qty?: number;
}

interface CreatePrescriptionInput {
  consultation_id: number;
  items?: PrescriptionItemInput[];
  refill_of_prescription_id?: number;
  allergyAck?: boolean;
  notes?: string;
}

const stockStatusFor = (medicine: { reorder_level: number; batches: { qty_on_hand: number; expiry_date: Date }[] }, qty: number) => {
  const now = new Date();
  const total = medicine.batches.filter((b) => b.expiry_date > now).reduce((sum, b) => sum + b.qty_on_hand, 0);
  if (total <= 0) return 'out-of-stock';
  if (total < qty) return 'insufficient';
  if (total < medicine.reorder_level) return 'low';
  return 'in-stock';
};

// Turns a doctor's decision into a structured, stock-validated order. Discontinued medicines
// hard-block (FR-046); an allergy conflict blocks until explicitly acknowledged (FR-042);
// insufficient stock only *flags* a line — the pharmacist re-validates for real at dispense time.
export const createPrescription = async (input: CreatePrescriptionInput, actor: Actor) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: input.consultation_id },
    include: { appointment: { include: { patient: true } } },
  });
  if (!consultation) throw new NotFoundError('Consultation not found');
  assertDoctorOwnsOrAdmin(actor, consultation.appointment.doctor_id);

  let items = input.items;

  if (input.refill_of_prescription_id) {
    const refillOf = await prisma.prescription.findUnique({
      where: { prescription_id: input.refill_of_prescription_id },
      include: { items: true, consultation: { include: { appointment: true } } },
    });
    if (!refillOf) throw new NotFoundError('Referenced prescription to refill not found');
    if (refillOf.consultation.appointment.patient_id !== consultation.appointment.patient_id) {
      throw new ValidationError('refill_of_prescription_id must reference a prior prescription for the same patient');
    }
    if (!items) {
      items = refillOf.items.map((i) => ({
        medicine_id: i.medicine_id,
        dosage: i.dosage,
        frequency: i.frequency ?? undefined,
        duration: i.duration ?? undefined,
        route: i.route ?? undefined,
        instructions: i.instructions ?? undefined,
        qty: i.qty,
      }));
    }
  }

  if (!items || items.length === 0) {
    throw new ValidationError('A prescription must include at least one medicine line');
  }

  const medicineIds = [...new Set(items.map((i) => i.medicine_id))];
  const medicines = await prisma.medicine.findMany({ where: { medicine_id: { in: medicineIds } }, include: { batches: true } });
  const medicineById = new Map(medicines.map((m) => [m.medicine_id, m]));

  const missing = items.filter((i) => !medicineById.has(i.medicine_id));
  if (missing.length > 0) {
    throw new ValidationError(`Unknown medicine id(s): ${missing.map((i) => i.medicine_id).join(', ')}`);
  }

  const discontinued = items.filter((i) => !medicineById.get(i.medicine_id)!.is_active);
  if (discontinued.length > 0) {
    throw new ValidationError(
      `Cannot prescribe discontinued medicine(s): ${discontinued.map((i) => medicineById.get(i.medicine_id)!.name).join(', ')} — substitute instead`
    );
  }

  // Authoritative qty check — only enforced when frequency/duration are both mechanically
  // calculable (e.g. "BD" + "5 Days"); free text or PRN/"Ongoing" is left to the doctor's entry.
  for (const i of items) {
    const expectedQty = computeExpectedQty(i.frequency, i.duration);
    if (expectedQty !== null && expectedQty !== i.qty) {
      const name = medicineById.get(i.medicine_id)!.name;
      throw new ValidationError(`Qty for ${name} should be ${expectedQty} for ${i.frequency} × ${i.duration} (got ${i.qty})`);
    }
    const externalQty = i.external_qty ?? 0;
    if (externalQty < 0 || externalQty > i.qty) {
      const name = medicineById.get(i.medicine_id)!.name;
      throw new ValidationError(`External purchase qty for ${name} must be between 0 and ${i.qty}`);
    }
  }

  const allergyText = (consultation.appointment.patient?.allergies || '').toLowerCase().trim();
  const conflicts = allergyText
    ? items.filter((i) => {
        const m = medicineById.get(i.medicine_id)!;
        return (
          (!!m.name && allergyText.includes(m.name.toLowerCase())) ||
          (!!m.generic_name && allergyText.includes(m.generic_name.toLowerCase()))
        );
      })
    : [];

  if (conflicts.length > 0 && !input.allergyAck) {
    throw new AllergyConflictError(
      'One or more prescribed medicines conflict with a documented allergy — acknowledgement required to proceed',
      conflicts.map((i) => medicineById.get(i.medicine_id)!.name)
    );
  }

  const created = await prisma.$transaction(async (tx) => {
    if (conflicts.length > 0) {
      await tx.consultation.update({ where: { consultation_id: input.consultation_id }, data: { allergies_ack: true } });
    }

    return tx.prescription.create({
      data: {
        consultation_id: input.consultation_id,
        is_refill: !!input.refill_of_prescription_id,
        refill_of_id: input.refill_of_prescription_id,
        notes: input.notes,
        items: {
          create: items!.map((i) => ({
            medicine_id: i.medicine_id,
            dosage: i.dosage,
            frequency: i.frequency,
            duration: i.duration,
            route: i.route,
            instructions: i.instructions,
            qty: i.qty,
            external_qty: i.external_qty ?? 0,
          })),
        },
      },
      include: { items: { include: { medicine: true } } },
    });
  });

  return {
    ...created,
    items: created.items.map((i) => ({ ...i, stockStatus: stockStatusFor(medicineById.get(i.medicine_id)!, i.qty) })),
  };
};

export const getPrescriptionById = async (id: number) => {
  const prescription = await prisma.prescription.findUnique({
    where: { prescription_id: id },
    include: {
      items: { include: { medicine: true, batch: true, substituted_medicine: true } },
      consultation: { include: { appointment: { include: { patient: true, doctor: { select: { user_id: true, username: true, registration_number: true } } } } } },
      refill_of: { select: { prescription_id: true, issued_at: true } },
    },
  });
  if (!prescription) return null;

  // Same "has this patient been seen before" signal used by the New Prescription builder's
  // Visit Type badge — computed here too since the prescription detail view shows it as well.
  // A temporary walk-in has no patient_id — `patient_id: null` would otherwise match every
  // *other* unregistered walk-in's consultations too, so short-circuit to 0 instead.
  const patientId = prescription.consultation.appointment.patient_id;
  const priorVisitCount = patientId
    ? await prisma.consultation.count({
        where: {
          status: 'Finalized',
          appointment: { patient_id: patientId },
          consultation_id: { not: prescription.consultation_id },
        },
      })
    : 0;

  return { ...prescription, priorVisitCount };
};

interface ListPrescriptionsFilters {
  patientId?: string;
  doctorId?: number;
  status?: string;
  medicineId?: number;
  search?: string;
  isRefill?: boolean;
  consultationType?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export const listPrescriptions = async (filters: ListPrescriptionsFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.PrescriptionWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.medicineId) where.items = { some: { medicine_id: filters.medicineId } };
  if (filters.isRefill !== undefined) where.is_refill = filters.isRefill;
  if (filters.from || filters.to) {
    where.issued_at = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }
  if (filters.patientId || filters.doctorId || filters.search || filters.consultationType) {
    where.consultation = {
      appointment: {
        ...(filters.patientId ? { patient_id: filters.patientId } : {}),
        ...(filters.doctorId ? { doctor_id: filters.doctorId } : {}),
        ...(filters.consultationType ? { consultation_type: filters.consultationType } : {}),
        ...(filters.search
          ? { OR: [{ patient: { full_name: { contains: filters.search } } }, { patient: { patient_id: { contains: filters.search } } }] }
          : {}),
      },
    };
  }

  const patientSelect = { patient_id: true, full_name: true, gender: true, dob: true, phone: true, photo_url: true } as const;

  const [total, prescriptions] = await Promise.all([
    prisma.prescription.count({ where }),
    prisma.prescription.findMany({
      where,
      orderBy: { issued_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        items: { include: { medicine: { select: { name: true } } } },
        consultation: {
          include: { appointment: { include: { patient: { select: patientSelect }, doctor: { select: { user_id: true, username: true } } } } },
        },
      },
    }),
  ]);

  return {
    // patientId/patientName stay flat (existing consumers, e.g. the admin app's Prescriptions
    // Queue, already depend on this shape) — everything else here is purely additive.
    data: prescriptions.map((rx) => ({
      prescriptionId: rx.prescription_id,
      code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
      status: rx.status,
      isRefill: rx.is_refill,
      notes: rx.notes,
      issuedAt: rx.issued_at,
      appointmentId: rx.consultation.appointment_id,
      consultationType: rx.consultation.appointment.consultation_type,
      patientId: rx.consultation.appointment.patient?.patient_id ?? null,
      patientName: rx.consultation.appointment.patient?.full_name ?? rx.consultation.appointment.temp_patient_name ?? 'Unregistered Patient',
      patientGender: rx.consultation.appointment.patient?.gender ?? rx.consultation.appointment.temp_patient_gender ?? null,
      patientDob: rx.consultation.appointment.patient?.dob ?? null,
      patientPhone: rx.consultation.appointment.patient?.phone ?? rx.consultation.appointment.temp_patient_phone ?? null,
      patientPhotoUrl: rx.consultation.appointment.patient?.photo_url ?? null,
      isTemporary: rx.consultation.appointment.is_temporary,
      doctorId: rx.consultation.appointment.doctor.user_id,
      doctorName: rx.consultation.appointment.doctor.username,
      items: rx.items.map((i) => ({ medicine: i.medicine.name, dosage: i.dosage, qty: i.qty, dispensedAt: i.dispensed_at })),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

const startOfMonth = (date: Date) => new Date(date.getFullYear(), date.getMonth(), 1);
const endOfMonth = (date: Date) => {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  d.setHours(23, 59, 59, 999);
  return d;
};
// Null means "no meaningful comparison" (last month was zero) rather than a fabricated 0%/100%.
const changePct = (current: number, prior: number): number | null => {
  if (prior === 0) return current === 0 ? 0 : null;
  return Math.round(((current - prior) / prior) * 100);
};

export const getPrescriptionStats = async (doctorId?: number, isRefill?: boolean) => {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const prevMonthStart = startOfMonth(prevMonth);
  const prevMonthEnd = endOfMonth(prevMonth);

  const doctorFilter: Prisma.PrescriptionWhereInput = {
    ...(doctorId ? { consultation: { appointment: { doctor_id: doctorId } } } : {}),
    ...(isRefill !== undefined ? { is_refill: isRefill } : {}),
  };

  const [total, thisMonth, prevMonthCount, pending, preparing, dispensed, collected] = await Promise.all([
    prisma.prescription.count({ where: doctorFilter }),
    prisma.prescription.count({ where: { ...doctorFilter, issued_at: { gte: monthStart } } }),
    prisma.prescription.count({ where: { ...doctorFilter, issued_at: { gte: prevMonthStart, lte: prevMonthEnd } } }),
    prisma.prescription.count({ where: { ...doctorFilter, status: 'Pending' } }),
    prisma.prescription.count({ where: { ...doctorFilter, status: 'Preparing' } }),
    prisma.prescription.count({ where: { ...doctorFilter, status: 'Dispensed' } }),
    prisma.prescription.count({ where: { ...doctorFilter, status: 'Collected' } }),
  ]);

  return {
    total,
    thisMonth,
    thisMonthDeltaPct: changePct(thisMonth, prevMonthCount),
    pending,
    preparing,
    dispensed,
    collected,
  };
};

// ---- Prescription Builder Context (everything the "New Prescription" page needs) ---------
// Same pattern as consultations/service.ts's getConsultationContext — one call instead of a
// request waterfall for patient/allergy/history context, chronic conditions derived from past
// Finalized consultations' medical_history_json, duplicated here rather than imported cross-module.

export const getPrescriptionContext = async (consultationId: number) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: consultationId },
    include: {
      appointment: {
        include: {
          patient: true,
          doctor: { select: { user_id: true, username: true, registration_number: true } },
        },
      },
      prescriptions: { orderBy: { issued_at: 'desc' }, select: { prescription_id: true, status: true, issued_at: true } },
    },
  });
  if (!consultation) throw new NotFoundError('Consultation not found');

  const patientId = consultation.appointment.patient_id;

  // A temporary walk-in has no patient_id — `patient_id: null` would otherwise match every
  // *other* unregistered walk-in's history too (Prisma treats `null` as a real filter value),
  // so skip these history lookups entirely rather than leak unrelated patients' data in.
  const [pastConsultations, pastPrescriptions] = patientId
    ? await Promise.all([
        prisma.consultation.findMany({
          where: { appointment: { patient_id: patientId }, status: 'Finalized' },
          select: { medical_history_json: true },
          take: 20,
        }),
        prisma.prescription.findMany({
          where: { consultation: { appointment: { patient_id: patientId } }, consultation_id: { not: consultationId } },
          orderBy: { issued_at: 'desc' },
          take: 10,
          include: { items: { include: { medicine: { select: { name: true } } } } },
        }),
      ])
    : [[], []];

  const chronicConditions = Array.from(
    new Set(pastConsultations.flatMap((c) => (c.medical_history_json ? (JSON.parse(c.medical_history_json) as string[]) : [])))
  );

  return {
    consultation: {
      consultationId: consultation.consultation_id,
      status: consultation.status,
      diagnosis: consultation.diagnosis,
      icd10Code: consultation.icd10_code,
    },
    appointment: {
      appointmentId: consultation.appointment.appointment_id,
      scheduledAt: consultation.appointment.scheduled_at,
      patient: consultation.appointment.patient,
      isTemporary: consultation.appointment.is_temporary,
      tempPatient: consultation.appointment.is_temporary
        ? {
            name: consultation.appointment.temp_patient_name,
            gender: consultation.appointment.temp_patient_gender,
            phone: consultation.appointment.temp_patient_phone,
            age: consultation.appointment.temp_patient_age,
          }
        : null,
      doctor: consultation.appointment.doctor,
    },
    existingPrescriptions: consultation.prescriptions,
    patientSummary: {
      allergies: consultation.appointment.patient?.allergies ?? null,
      chronicConditions,
      // Whether this patient has any other Finalized visit at all — lets the UI show
      // "New Visit" vs "Return Visit" honestly, from the pastConsultations query already run
      // for chronicConditions rather than a second lookup.
      priorVisitCount: pastConsultations.length,
      // The patient's most recent OTHER prescription's medicines — same "currently on" signal
      // consultations/service.ts's getConsultationContext derives, just sourced from the
      // pastPrescriptions query this function already runs rather than a second lookup.
      currentMedications: pastPrescriptions[0]?.items.map((i) => i.medicine.name) ?? [],
    },
    pastPrescriptions: pastPrescriptions.map((rx) => ({
      prescriptionId: rx.prescription_id,
      code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
      issuedAt: rx.issued_at,
      items: rx.items.map((i) => ({
        medicineId: i.medicine_id,
        medicine: i.medicine.name,
        dosage: i.dosage,
        frequency: i.frequency,
        duration: i.duration,
        route: i.route,
        instructions: i.instructions,
        qty: i.qty,
      })),
    })),
  };
};
