import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError, AllergyConflictError } from './errors';

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
  qty: number;
}

interface CreatePrescriptionInput {
  consultation_id: number;
  items?: PrescriptionItemInput[];
  refill_of_prescription_id?: number;
  allergyAck?: boolean;
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

  const allergyText = (consultation.appointment.patient.allergies || '').toLowerCase().trim();
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
        items: {
          create: items!.map((i) => ({
            medicine_id: i.medicine_id,
            dosage: i.dosage,
            frequency: i.frequency,
            duration: i.duration,
            route: i.route,
            qty: i.qty,
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
  return prisma.prescription.findUnique({
    where: { prescription_id: id },
    include: {
      items: { include: { medicine: true, batch: true, substituted_medicine: true } },
      consultation: { include: { appointment: { include: { patient: true, doctor: { select: { user_id: true, username: true, registration_number: true } } } } } },
      refill_of: { select: { prescription_id: true, issued_at: true } },
    },
  });
};

interface ListPrescriptionsFilters {
  patientId?: string;
  doctorId?: number;
  status?: string;
  medicineId?: number;
  page?: number;
  limit?: number;
}

export const listPrescriptions = async (filters: ListPrescriptionsFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.PrescriptionWhereInput = {};
  if (filters.status) where.status = filters.status;
  if (filters.medicineId) where.items = { some: { medicine_id: filters.medicineId } };
  if (filters.patientId || filters.doctorId) {
    where.consultation = {
      appointment: {
        ...(filters.patientId ? { patient_id: filters.patientId } : {}),
        ...(filters.doctorId ? { doctor_id: filters.doctorId } : {}),
      },
    };
  }

  const [total, prescriptions] = await Promise.all([
    prisma.prescription.count({ where }),
    prisma.prescription.findMany({
      where,
      orderBy: { issued_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        items: { include: { medicine: { select: { name: true } } } },
        consultation: { include: { appointment: { include: { patient: { select: { patient_id: true, full_name: true } } } } } },
      },
    }),
  ]);

  return {
    data: prescriptions.map((rx) => ({
      prescriptionId: rx.prescription_id,
      code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
      status: rx.status,
      isRefill: rx.is_refill,
      issuedAt: rx.issued_at,
      patientId: rx.consultation.appointment.patient.patient_id,
      patientName: rx.consultation.appointment.patient.full_name,
      items: rx.items.map((i) => ({ medicine: i.medicine.name, dosage: i.dosage, qty: i.qty })),
    })),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
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

  const [pastConsultations, pastPrescriptions] = await Promise.all([
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
  ]);

  const chronicConditions = Array.from(
    new Set(pastConsultations.flatMap((c) => (c.medical_history_json ? (JSON.parse(c.medical_history_json) as string[]) : [])))
  );

  return {
    consultation: {
      consultationId: consultation.consultation_id,
      status: consultation.status,
      diagnosis: consultation.diagnosis,
    },
    appointment: {
      appointmentId: consultation.appointment.appointment_id,
      scheduledAt: consultation.appointment.scheduled_at,
      patient: consultation.appointment.patient,
      doctor: consultation.appointment.doctor,
    },
    existingPrescriptions: consultation.prescriptions,
    patientSummary: {
      allergies: consultation.appointment.patient.allergies,
      chronicConditions,
    },
    pastPrescriptions: pastPrescriptions.map((rx) => ({
      prescriptionId: rx.prescription_id,
      code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
      issuedAt: rx.issued_at,
      items: rx.items.map((i) => ({ medicineId: i.medicine_id, medicine: i.medicine.name, dosage: i.dosage, frequency: i.frequency, duration: i.duration, route: i.route, qty: i.qty })),
    })),
  };
};
