import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

const assertDoctorOwnsOrAdmin = (actor: Actor, doctorId: number) => {
  if (actor.role === 'Admin') return;
  if (actor.role === 'Doctor' && actor.user_id === doctorId) return;
  throw new ForbiddenError('You do not have permission to manage external medicines for this prescription');
};

export interface ExternalMedicineInput {
  medicine_id?: number;
  medicine_name?: string;
  generic_name?: string;
  brand_name?: string;
  dosage_form: string;
  strength?: string;
  dosage: string;
  frequency?: string;
  duration?: string;
  quantity: number;
  quantity_unit: string;
  instructions?: string;
}

const serialize = (row: any) => ({
  extItemId: row.ext_item_id,
  prescriptionId: row.prescription_id,
  patientId: row.patient_id,
  doctorId: row.doctor_id,
  medicineId: row.medicine_id,
  medicineName: row.medicine_name,
  genericName: row.generic_name,
  brandName: row.brand_name,
  dosageForm: row.dosage_form,
  strength: row.strength,
  dosage: row.dosage,
  frequency: row.frequency,
  duration: row.duration,
  quantity: row.quantity,
  quantityUnit: row.quantity_unit,
  instructions: row.instructions,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

// Resolves the catalog-sourced defaults (name/generic/brand/form/strength) when medicine_id is
// given, letting the doctor's explicit input override any of them (FR: "doctor should still be
// able to modify strength/dosage/etc." even for a catalog match) — and validates the manual-item
// path (no medicine_id) actually has a name typed in, since that's the only required field there.
const resolveMedicineFields = async (tx: any, input: ExternalMedicineInput) => {
  if (input.medicine_id) {
    const medicine = await tx.medicine.findUnique({ where: { medicine_id: input.medicine_id } });
    if (!medicine) throw new NotFoundError('Medicine not found');
    return {
      medicine_id: medicine.medicine_id,
      medicine_name: input.medicine_name?.trim() || medicine.name,
      generic_name: input.generic_name ?? medicine.generic_name ?? undefined,
      brand_name: input.brand_name ?? medicine.brand_name ?? undefined,
    };
  }
  if (!input.medicine_name?.trim()) {
    throw new ValidationError('medicine_name is required when no medicine_id is given (manual external item)');
  }
  return {
    medicine_id: undefined,
    medicine_name: input.medicine_name.trim(),
    generic_name: input.generic_name || undefined,
    brand_name: input.brand_name || undefined,
  };
};

const assertLineValid = (input: ExternalMedicineInput) => {
  if (!input.dosage_form?.trim()) throw new ValidationError('dosage_form is required');
  if (!input.dosage?.trim()) throw new ValidationError('dosage is required');
  if (!input.quantity_unit?.trim()) throw new ValidationError('quantity_unit is required');
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new ValidationError('quantity must be a positive number');
};

const getPrescriptionOwner = async (prescriptionId: number) => {
  const prescription = await prisma.prescription.findUnique({
    where: { prescription_id: prescriptionId },
    include: { consultation: { include: { appointment: true } } },
  });
  if (!prescription) throw new NotFoundError('Prescription not found');
  return { patientId: prescription.consultation.appointment.patient_id, doctorId: prescription.consultation.appointment.doctor_id };
};

export const createExternalMedicine = async (prescriptionId: number, input: ExternalMedicineInput, actor: Actor) => {
  const { patientId, doctorId } = await getPrescriptionOwner(prescriptionId);
  assertDoctorOwnsOrAdmin(actor, doctorId);
  assertLineValid(input);
  const resolved = await resolveMedicineFields(prisma, input);

  const row = await prisma.externalPrescriptionMedicine.create({
    data: {
      prescription_id: prescriptionId,
      patient_id: patientId,
      doctor_id: doctorId,
      medicine_id: resolved.medicine_id,
      medicine_name: resolved.medicine_name,
      generic_name: resolved.generic_name,
      brand_name: resolved.brand_name,
      dosage_form: input.dosage_form.trim(),
      strength: input.strength || undefined,
      dosage: input.dosage.trim(),
      frequency: input.frequency || undefined,
      duration: input.duration || undefined,
      quantity: input.quantity,
      quantity_unit: input.quantity_unit.trim(),
      instructions: input.instructions || undefined,
    },
  });
  return serialize(row);
};

// One transaction for the whole batch — a doctor adding several external items when submitting
// a prescription shouldn't be able to end up with only some of them saved.
export const bulkCreateExternalMedicines = async (prescriptionId: number, items: ExternalMedicineInput[], actor: Actor) => {
  if (items.length === 0) return [];
  const { patientId, doctorId } = await getPrescriptionOwner(prescriptionId);
  assertDoctorOwnsOrAdmin(actor, doctorId);
  items.forEach(assertLineValid);

  return prisma.$transaction(async (tx) => {
    const created = [];
    for (const input of items) {
      const resolved = await resolveMedicineFields(tx, input);
      const row = await tx.externalPrescriptionMedicine.create({
        data: {
          prescription_id: prescriptionId,
          patient_id: patientId,
          doctor_id: doctorId,
          medicine_id: resolved.medicine_id,
          medicine_name: resolved.medicine_name,
          generic_name: resolved.generic_name,
          brand_name: resolved.brand_name,
          dosage_form: input.dosage_form.trim(),
          strength: input.strength || undefined,
          dosage: input.dosage.trim(),
          frequency: input.frequency || undefined,
          duration: input.duration || undefined,
          quantity: input.quantity,
          quantity_unit: input.quantity_unit.trim(),
          instructions: input.instructions || undefined,
        },
      });
      created.push(row);
    }
    return created.map(serialize);
  });
};

export const listByPrescription = async (prescriptionId: number) => {
  const rows = await prisma.externalPrescriptionMedicine.findMany({
    where: { prescription_id: prescriptionId },
    orderBy: { created_at: 'asc' },
  });
  return rows.map(serialize);
};

// "Previous External Medicines" — the patient's history, deduped to the most recent occurrence
// per distinct medicine name so a repeat search ("Vitamin D") surfaces one "Use Again" card
// instead of every past prescription of it.
export const listByPatient = async (patientId: string, search?: string) => {
  const rows = await prisma.externalPrescriptionMedicine.findMany({
    where: {
      patient_id: patientId,
      ...(search
        ? {
            OR: [
              { medicine_name: { contains: search } },
              { generic_name: { contains: search } },
              { brand_name: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { created_at: 'desc' },
    take: 200,
  });

  const seen = new Set<string>();
  const deduped: typeof rows = [];
  for (const row of rows) {
    const key = row.medicine_name.trim().toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped.slice(0, 20).map((row) => ({ ...serialize(row), lastPrescribedAt: row.created_at }));
};

export const updateExternalMedicine = async (extItemId: number, updates: Partial<ExternalMedicineInput>, actor: Actor) => {
  const existing = await prisma.externalPrescriptionMedicine.findUnique({ where: { ext_item_id: extItemId } });
  if (!existing) throw new NotFoundError('External medicine entry not found');
  assertDoctorOwnsOrAdmin(actor, existing.doctor_id);

  const merged: ExternalMedicineInput = {
    medicine_id: existing.medicine_id ?? undefined,
    medicine_name: updates.medicine_name ?? existing.medicine_name,
    generic_name: updates.generic_name ?? existing.generic_name ?? undefined,
    brand_name: updates.brand_name ?? existing.brand_name ?? undefined,
    dosage_form: updates.dosage_form ?? existing.dosage_form,
    strength: updates.strength ?? existing.strength ?? undefined,
    dosage: updates.dosage ?? existing.dosage,
    frequency: updates.frequency ?? existing.frequency ?? undefined,
    duration: updates.duration ?? existing.duration ?? undefined,
    quantity: updates.quantity ?? existing.quantity,
    quantity_unit: updates.quantity_unit ?? existing.quantity_unit,
    instructions: updates.instructions ?? existing.instructions ?? undefined,
  };
  assertLineValid(merged);

  const row = await prisma.externalPrescriptionMedicine.update({
    where: { ext_item_id: extItemId },
    data: {
      medicine_name: merged.medicine_name!.trim(),
      generic_name: merged.generic_name,
      brand_name: merged.brand_name,
      dosage_form: merged.dosage_form.trim(),
      strength: merged.strength,
      dosage: merged.dosage.trim(),
      frequency: merged.frequency,
      duration: merged.duration,
      quantity: merged.quantity,
      quantity_unit: merged.quantity_unit.trim(),
      instructions: merged.instructions,
    },
  });
  return serialize(row);
};

export const removeExternalMedicine = async (extItemId: number, actor: Actor) => {
  const existing = await prisma.externalPrescriptionMedicine.findUnique({ where: { ext_item_id: extItemId } });
  if (!existing) throw new NotFoundError('External medicine entry not found');
  assertDoctorOwnsOrAdmin(actor, existing.doctor_id);
  await prisma.externalPrescriptionMedicine.delete({ where: { ext_item_id: extItemId } });
};

export const getPrescriptionForSlip = async (prescriptionId: number) => {
  const prescription = await prisma.prescription.findUnique({
    where: { prescription_id: prescriptionId },
    include: {
      consultation: { include: { appointment: { include: { patient: true, doctor: true } } } },
      external_medicines: { orderBy: { created_at: 'asc' } },
    },
  });
  if (!prescription) throw new NotFoundError('Prescription not found');
  return prescription;
};
