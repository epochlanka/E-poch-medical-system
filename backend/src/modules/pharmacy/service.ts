import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

// "Last activity" for a queue card: when any items have been dispensed, the most recent
// dispense timestamp is more useful than the original issue time (matches how the Dispensed/
// Collected columns should read "when this happened" rather than "when it was first submitted").
const lastActivityAt = (rx: any) => {
  const dispensedTimes = rx.items.map((i: any) => i.dispensed_at).filter(Boolean) as Date[];
  if (dispensedTimes.length === 0) return rx.issued_at;
  return dispensedTimes.reduce((latest: Date, t: Date) => (t > latest ? t : latest));
};

const serializeQueueItem = (rx: any) => ({
  prescriptionId: rx.prescription_id,
  code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
  status: rx.status,
  isRefill: rx.is_refill,
  issuedAt: rx.issued_at,
  lastActivityAt: lastActivityAt(rx),
  patientId: rx.consultation.appointment.patient.patient_id,
  patientName: rx.consultation.appointment.patient.full_name,
  doctorId: rx.consultation.appointment.doctor.user_id,
  doctorName: rx.consultation.appointment.doctor.username,
  consultationType: rx.consultation.appointment.consultation_type,
  itemCount: rx.items.length,
  pendingItemCount: rx.items.filter((i: any) => !i.dispensed_at).length,
  items: rx.items.map((i: any) => ({ rxItemId: i.rx_item_id, medicine: i.medicine.name, qty: i.qty, dispensed: !!i.dispensed_at })),
});

// A line is "done" the moment external + clinic-dispensed quantity covers the full prescribed
// qty — the only thing every other module (billing, queue, reports) needs to know via dispensed_at.
const remainingClinicQty = (item: { qty: number; external_qty: number; dispensed_qty: number }) =>
  Math.max(0, item.qty - item.external_qty - item.dispensed_qty);

// Incoming prescriptions, ordered by submission time — first in, first served (FR-047).
export const getQueue = async (status?: string) => {
  const where: Prisma.PrescriptionWhereInput = status ? { status } : {};
  const prescriptions = await prisma.prescription.findMany({
    where,
    orderBy: { issued_at: 'asc' },
    include: {
      items: { include: { medicine: { select: { name: true } } } },
      consultation: {
        include: {
          appointment: {
            include: { patient: { select: { patient_id: true, full_name: true } }, doctor: { select: { user_id: true, username: true } } },
          },
        },
      },
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
      // Already-handled lines are done either way (real batch or the external-purchase skip
      // below); fully-external lines never need a batch at all, so they're excluded here too —
      // the Dispensing UI shows them as "External Purchase" instead of a batch picker.
      .filter((i) => !i.dispensed_at && i.external_qty < i.qty)
      .map(async (item) => {
        const batches = await prisma.batch.findMany({
          where: { medicine_id: item.medicine_id, qty_on_hand: { gt: 0 }, expiry_date: { gt: now } },
          orderBy: { expiry_date: 'asc' },
        });
        return {
          rxItemId: item.rx_item_id,
          medicineId: item.medicine_id,
          medicineName: item.medicine.name,
          qtyNeeded: remainingClinicQty(item),
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
  batch_id?: number;
  qty?: number; // defaults to the item's full remaining clinic balance — omit for the existing "dispense the whole line" flow, set for a genuine partial draw
  override_reason?: string;
  notes?: string;
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
      if (rxItem.dispensed_at) throw new ValidationError(`Item ${dispenseItem.rx_item_id} has already been dispensed`);

      // Fully external-purchase lines (the patient sourced the whole qty outside the clinic,
      // FR added alongside the New Prescription external-purchase flow) never draw real stock —
      // no batch to pick, nothing to decrement, no ledger row. Just stamp it handled so the
      // prescription can still reach Dispensed. batch_id stays null forever for these lines.
      if (rxItem.external_qty >= rxItem.qty) {
        await tx.prescriptionItem.update({
          where: { rx_item_id: rxItem.rx_item_id },
          data: { dispensed_by: actor.user_id, dispensed_at: new Date() },
        });
        continue;
      }

      const balance = remainingClinicQty(rxItem);
      const requestedQty = dispenseItem.qty ?? balance;
      if (requestedQty <= 0) throw new ValidationError(`Item ${dispenseItem.rx_item_id} has nothing left to dispense`);
      if (requestedQty > balance) {
        throw new ValidationError(`Item ${dispenseItem.rx_item_id} only has ${balance} remaining to dispense — cannot dispense ${requestedQty}`);
      }

      if (!dispenseItem.batch_id) throw new ValidationError(`A batch must be selected to dispense item ${dispenseItem.rx_item_id}`);

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
      if (batch.qty_on_hand < requestedQty) {
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

      const updatedBatch = await tx.batch.update({ where: { batch_id: batch.batch_id }, data: { qty_on_hand: { decrement: requestedQty } } });

      // Dispensing is the primary producer of the stock ledger — the deduction and its
      // ledger row land in the same transaction as the status update (never two separately-failable steps).
      await tx.stockLedger.create({
        data: {
          batch_id: batch.batch_id,
          change_qty: -requestedQty,
          balance_after: updatedBatch.qty_on_hand,
          event_type: 'Dispense',
          reference_type: 'Prescription',
          reference_id: String(prescriptionId),
          reason: isFefoChoice ? null : dispenseItem.override_reason,
          created_by: actor.user_id,
        },
      });

      // Full per-batch audit trail for this line — a later top-up from a different batch (the
      // first one ran out mid-way) gets its own row here, even though PrescriptionItem itself
      // only ever remembers the last batch that touched it.
      await tx.prescriptionItemDispense.create({
        data: {
          rx_item_id: rxItem.rx_item_id,
          batch_id: batch.batch_id,
          qty: requestedQty,
          fefo_override_reason: isFefoChoice ? null : dispenseItem.override_reason,
          notes: dispenseItem.notes,
          dispensed_by: actor.user_id,
        },
      });

      const newDispensedQty = rxItem.dispensed_qty + requestedQty;
      const isNowComplete = newDispensedQty + rxItem.external_qty >= rxItem.qty;

      await tx.prescriptionItem.update({
        where: { rx_item_id: rxItem.rx_item_id },
        data: {
          dispensed_qty: newDispensedQty,
          batch_id: batch.batch_id,
          substituted_medicine_id: dispenseItem.substitute_medicine_id ?? null,
          fefo_override_reason: isFefoChoice ? null : dispenseItem.override_reason,
          // dispensed_by/dispensed_at only stamped once the line is fully handled — every other
          // module (billing, queue, reports) treats dispensed_at as the binary "done" signal.
          ...(isNowComplete ? { dispensed_by: actor.user_id, dispensed_at: new Date() } : {}),
        },
      });
    }

    const allItems = await tx.prescriptionItem.findMany({ where: { prescription_id: prescriptionId } });
    const newStatus = allItems.every((i) => i.dispensed_at) ? 'Dispensed' : 'Preparing';

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
// `priority` and `type` (Auto/Manual) are informational/organizational only — dispense() only
// ever checks is_active when validating a pharmacist's chosen substitute (see dispense() above);
// there is no auto-apply-without-pharmacist-input mechanism anywhere in this app, so "Auto" here
// means "this pair is pre-approved for quick pharmacist selection," not "the system swaps it in
// unattended."

interface CreateSubstitutionOptions {
  priority?: number;
  type?: string;
}

export const createSubstitution = async (
  medicineId: number,
  substituteMedicineId: number,
  actorUserId: number,
  options?: CreateSubstitutionOptions
) => {
  if (medicineId === substituteMedicineId) throw new ValidationError('A medicine cannot substitute itself');

  const [medicine, substitute] = await Promise.all([
    prisma.medicine.findUnique({ where: { medicine_id: medicineId } }),
    prisma.medicine.findUnique({ where: { medicine_id: substituteMedicineId } }),
  ]);
  if (!medicine || !substitute) throw new NotFoundError('Medicine not found');

  const existing = await prisma.medicineSubstitution.findUnique({
    where: { medicine_id_substitute_medicine_id: { medicine_id: medicineId, substitute_medicine_id: substituteMedicineId } },
  });
  if (existing) throw new ValidationError('A substitution rule for this medicine pair already exists');

  return prisma.medicineSubstitution.create({
    data: {
      medicine_id: medicineId,
      substitute_medicine_id: substituteMedicineId,
      priority: options?.priority ?? 1,
      type: options?.type ?? 'Manual',
      created_by: actorUserId,
    },
  });
};

interface UpdateSubstitutionInput {
  priority?: number;
  type?: string;
  is_active?: boolean;
}

export const updateSubstitution = async (substitutionId: number, updates: UpdateSubstitutionInput) => {
  const existing = await prisma.medicineSubstitution.findUnique({ where: { substitution_id: substitutionId } });
  if (!existing) throw new NotFoundError('Substitution rule not found');
  return prisma.medicineSubstitution.update({ where: { substitution_id: substitutionId }, data: updates });
};

interface ListSubstitutionsParams {
  medicineId?: number;
  status?: 'all' | 'active' | 'inactive';
}

export const listSubstitutions = async (params?: ListSubstitutionsParams) => {
  const status = params?.status ?? 'active';
  const rules = await prisma.medicineSubstitution.findMany({
    where: {
      ...(status === 'active' ? { is_active: true } : status === 'inactive' ? { is_active: false } : {}),
      ...(params?.medicineId ? { medicine_id: params.medicineId } : {}),
    },
    include: {
      medicine: { select: { name: true, category: true } },
      substitute_medicine: { select: { medicine_id: true, name: true } },
      creator: { select: { username: true } },
    },
    orderBy: [{ priority: 'asc' }, { created_at: 'desc' }],
  });

  return rules.map((r) => ({
    substitutionId: r.substitution_id,
    medicineId: r.medicine_id,
    medicineName: r.medicine.name,
    substituteMedicineId: r.substitute_medicine_id,
    substituteMedicineName: r.substitute_medicine.name,
    therapeuticClass: r.medicine.category,
    priority: r.priority,
    type: r.type,
    isActive: r.is_active,
    createdBy: r.creator.username,
    createdAt: r.created_at,
  }));
};

export const getSubstitutionStats = async () => {
  const [total, active, inactive, autoCount, manualCount] = await Promise.all([
    prisma.medicineSubstitution.count(),
    prisma.medicineSubstitution.count({ where: { is_active: true } }),
    prisma.medicineSubstitution.count({ where: { is_active: false } }),
    prisma.medicineSubstitution.count({ where: { type: 'Auto' } }),
    prisma.medicineSubstitution.count({ where: { type: 'Manual' } }),
  ]);
  return { total, active, inactive, autoCount, manualCount };
};

export const getPrescriptionForLabel = (prescriptionId: number) =>
  prisma.prescription.findUnique({
    where: { prescription_id: prescriptionId },
    include: {
      items: { include: { medicine: true } },
      consultation: { include: { appointment: { include: { patient: true } } } },
    },
  });
