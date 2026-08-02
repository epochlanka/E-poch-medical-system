import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

const serializeQueueItem = (rx: any) => ({
  prescriptionId: rx.prescription_id,
  code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
  status: rx.status,
  isRefill: rx.is_refill,
  issuedAt: rx.issued_at,
  patientId: rx.consultation.appointment.patient.patient_id,
  patientName: rx.consultation.appointment.patient.full_name,
  itemCount: rx.items.length,
  pendingItemCount: rx.items.filter((i: any) => !i.batch_id).length,
  items: rx.items.map((i: any) => ({ rxItemId: i.rx_item_id, medicine: i.medicine.name, qty: i.qty, dispensed: !!i.batch_id })),
});

// Incoming prescriptions, ordered by submission time — first in, first served (FR-047).
export const getQueue = async (status?: string) => {
  const where: Prisma.PrescriptionWhereInput = status ? { status } : {};
  const prescriptions = await prisma.prescription.findMany({
    where,
    orderBy: { issued_at: 'asc' },
    include: {
      items: { include: { medicine: { select: { name: true } } } },
      consultation: { include: { appointment: { include: { patient: { select: { patient_id: true, full_name: true } } } } } },
    },
  });

  const items = prescriptions.map(serializeQueueItem);
  if (status) return items;

  const grouped: Record<string, any[]> = { Pending: [], Preparing: [], Dispensed: [], Collected: [] };
  for (const item of items) grouped[item.status]?.push(item);
  return grouped;
};

// FEFO-sorted batch options per still-undispensed line, for the batch picker (FR-056).
export const getBatchSuggestions = async (prescriptionId: number) => {
  const prescription = await prisma.prescription.findUnique({
    where: { prescription_id: prescriptionId },
    include: { items: { include: { medicine: true } } },
  });
  if (!prescription) throw new NotFoundError('Prescription not found');

  const now = new Date();
  return Promise.all(
    prescription.items
      .filter((i) => !i.batch_id)
      .map(async (item) => {
        const batches = await prisma.batch.findMany({
          where: { medicine_id: item.medicine_id, qty_on_hand: { gt: 0 }, expiry_date: { gt: now } },
          orderBy: { expiry_date: 'asc' },
        });
        return {
          rxItemId: item.rx_item_id,
          medicineId: item.medicine_id,
          medicineName: item.medicine.name,
          qtyNeeded: item.qty,
          suggestedBatchId: batches[0]?.batch_id ?? null,
          batches: batches.map((b) => ({ batchId: b.batch_id, batchNo: b.batch_no, expiryDate: b.expiry_date, qtyOnHand: b.qty_on_hand })),
        };
      })
  );
};

export const setPreparing = async (prescriptionId: number) => {
  const prescription = await prisma.prescription.findUnique({ where: { prescription_id: prescriptionId } });
  if (!prescription) throw new NotFoundError('Prescription not found');
  if (prescription.status !== 'Pending') throw new ValidationError('Only a Pending prescription can move to Preparing');
  return prisma.prescription.update({ where: { prescription_id: prescriptionId }, data: { status: 'Preparing' } });
};

interface DispenseItemInput {
  rx_item_id: number;
  batch_id: number;
  override_reason?: string;
  substitute_medicine_id?: number;
}

// The safety-critical last mile. Re-validates stock/expiry at confirm-time (not just at
// queue-open time, FR-050), deducts stock and stamps the dispenser in the same transaction
// as the status update (Best Practice: never let those be two independently-failable steps),
// and allows partial dispense — only the selected lines advance, the rest stay Pending (FR-052).
export const dispense = async (prescriptionId: number, items: DispenseItemInput[], actor: Actor) => {
  if (items.length === 0) throw new ValidationError('At least one item must be selected to dispense');

  const prescription = await prisma.prescription.findUnique({ where: { prescription_id: prescriptionId } });
  if (!prescription) throw new NotFoundError('Prescription not found');
  if (!['Pending', 'Preparing'].includes(prescription.status)) {
    throw new ValidationError(`Cannot dispense a prescription with status ${prescription.status}`);
  }

  return prisma.$transaction(async (tx) => {
    for (const dispenseItem of items) {
      const rxItem = await tx.prescriptionItem.findUnique({ where: { rx_item_id: dispenseItem.rx_item_id } });
      if (!rxItem || rxItem.prescription_id !== prescriptionId) {
        throw new ValidationError(`rx_item_id ${dispenseItem.rx_item_id} does not belong to this prescription`);
      }
      if (rxItem.batch_id) throw new ValidationError(`Item ${dispenseItem.rx_item_id} has already been dispensed`);

      const effectiveMedicineId = dispenseItem.substitute_medicine_id ?? rxItem.medicine_id;

      if (dispenseItem.substitute_medicine_id) {
        const allowed = await tx.medicineSubstitution.findFirst({
          where: { medicine_id: rxItem.medicine_id, substitute_medicine_id: dispenseItem.substitute_medicine_id, is_active: true },
        });
        if (!allowed) {
          throw new ValidationError(
            `Substituting medicine ${dispenseItem.substitute_medicine_id} for ${rxItem.medicine_id} is not a pre-configured substitution rule`
          );
        }
      }

      const batch = await tx.batch.findUnique({ where: { batch_id: dispenseItem.batch_id } });
      if (!batch || batch.medicine_id !== effectiveMedicineId) {
        throw new ValidationError(`Batch ${dispenseItem.batch_id} does not hold the required medicine`);
      }
      if (batch.expiry_date <= new Date()) {
        throw new ValidationError(`Batch ${batch.batch_no} has expired and cannot be dispensed`);
      }
      if (batch.qty_on_hand < rxItem.qty) {
        throw new ValidationError(`Batch ${batch.batch_no} has insufficient stock for item ${dispenseItem.rx_item_id}`);
      }

      const earliestValidBatch = await tx.batch.findFirst({
        where: { medicine_id: effectiveMedicineId, qty_on_hand: { gt: 0 }, expiry_date: { gt: new Date() } },
        orderBy: { expiry_date: 'asc' },
      });
      const isFefoChoice = earliestValidBatch?.batch_id === batch.batch_id;
      if (!isFefoChoice && !dispenseItem.override_reason?.trim()) {
        throw new ValidationError(`Batch ${batch.batch_no} is not the earliest-expiry batch for this medicine — an override reason is required`);
      }

      const updatedBatch = await tx.batch.update({ where: { batch_id: batch.batch_id }, data: { qty_on_hand: { decrement: rxItem.qty } } });

      // Dispensing is the primary producer of the stock ledger — the deduction and its
      // ledger row land in the same transaction as the status update (never two separately-failable steps).
      await tx.stockLedger.create({
        data: {
          batch_id: batch.batch_id,
          change_qty: -rxItem.qty,
          balance_after: updatedBatch.qty_on_hand,
          event_type: 'Dispense',
          reference_type: 'Prescription',
          reference_id: String(prescriptionId),
          reason: isFefoChoice ? null : dispenseItem.override_reason,
          created_by: actor.user_id,
        },
      });

      await tx.prescriptionItem.update({
        where: { rx_item_id: rxItem.rx_item_id },
        data: {
          batch_id: batch.batch_id,
          substituted_medicine_id: dispenseItem.substitute_medicine_id ?? null,
          fefo_override_reason: isFefoChoice ? null : dispenseItem.override_reason,
          dispensed_by: actor.user_id,
          dispensed_at: new Date(),
        },
      });
    }

    const allItems = await tx.prescriptionItem.findMany({ where: { prescription_id: prescriptionId } });
    const newStatus = allItems.every((i) => i.batch_id) ? 'Dispensed' : 'Preparing';

    return tx.prescription.update({
      where: { prescription_id: prescriptionId },
      data: { status: newStatus },
      include: { items: { include: { medicine: true, batch: true } } },
    });
  });
};

// A patient who never returns stays honestly at Dispensed — collection is a distinct,
// explicit action, never auto-advanced.
export const collectPrescription = async (prescriptionId: number) => {
  const prescription = await prisma.prescription.findUnique({ where: { prescription_id: prescriptionId } });
  if (!prescription) throw new NotFoundError('Prescription not found');
  if (prescription.status !== 'Dispensed') throw new ValidationError('Only a Dispensed prescription can be marked Collected');
  return prisma.prescription.update({ where: { prescription_id: prescriptionId }, data: { status: 'Collected' } });
};

// ---- Substitution Rules (pre-configured only — never an ad-hoc counter substitution) -----

export const createSubstitution = async (medicineId: number, substituteMedicineId: number, actorUserId: number) => {
  if (medicineId === substituteMedicineId) throw new ValidationError('A medicine cannot substitute itself');

  const [medicine, substitute] = await Promise.all([
    prisma.medicine.findUnique({ where: { medicine_id: medicineId } }),
    prisma.medicine.findUnique({ where: { medicine_id: substituteMedicineId } }),
  ]);
  if (!medicine || !substitute) throw new NotFoundError('Medicine not found');

  return prisma.medicineSubstitution.upsert({
    where: { medicine_id_substitute_medicine_id: { medicine_id: medicineId, substitute_medicine_id: substituteMedicineId } },
    update: { is_active: true },
    create: { medicine_id: medicineId, substitute_medicine_id: substituteMedicineId, created_by: actorUserId },
  });
};

export const listSubstitutions = async (medicineId?: number) => {
  const rules = await prisma.medicineSubstitution.findMany({
    where: { is_active: true, ...(medicineId ? { medicine_id: medicineId } : {}) },
    include: { medicine: { select: { name: true } }, substitute_medicine: { select: { medicine_id: true, name: true } } },
    orderBy: { created_at: 'desc' },
  });

  return rules.map((r) => ({
    substitutionId: r.substitution_id,
    medicineId: r.medicine_id,
    medicineName: r.medicine.name,
    substituteMedicineId: r.substitute_medicine_id,
    substituteMedicineName: r.substitute_medicine.name,
  }));
};

export const getPrescriptionForLabel = (prescriptionId: number) =>
  prisma.prescription.findUnique({
    where: { prescription_id: prescriptionId },
    include: {
      items: { include: { medicine: true } },
      consultation: { include: { appointment: { include: { patient: true } } } },
    },
  });
