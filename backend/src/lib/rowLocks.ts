import { Prisma } from '@prisma/client';

// Row locks for read-check-write sequences. Under Postgres' default READ COMMITTED isolation two
// concurrent transactions can both read "enough stock" / "balance still outstanding" and both
// write — the classic lost update. Taking `SELECT ... FOR UPDATE` on the row first serializes
// them: the second transaction waits, then re-reads the committed value and decides on that.
//
// LOCK ORDER (deadlock avoidance): Prescription -> Batch rows in ascending batch_id. Invoice
// locks are never taken while holding either of those.

type Tx = Prisma.TransactionClient;

// Interactive transactions default to a 5s timeout and 2s wait for a connection. The database
// can be a WAN round trip away (Supabase pooler), where a multi-statement transaction legitimately
// takes longer — a timeout there would abort a dispense or payment halfway through the request.
export const TX_OPTIONS = { maxWait: 10_000, timeout: 30_000 } as const;

export const lockPrescription = async (tx: Tx, prescriptionId: number) => {
  await tx.$queryRaw`SELECT prescription_id FROM "Prescription" WHERE prescription_id = ${prescriptionId} FOR UPDATE`;
};

export const lockInvoice = async (tx: Tx, invoiceId: number) => {
  await tx.$queryRaw`SELECT invoice_id FROM "Invoice" WHERE invoice_id = ${invoiceId} FOR UPDATE`;
};

export const lockBatches = async (tx: Tx, batchIds: number[]) => {
  const ids = [...new Set(batchIds)].sort((a, b) => a - b);
  if (ids.length === 0) return;
  await tx.$queryRaw`SELECT batch_id FROM "Batch" WHERE batch_id IN (${Prisma.join(ids)}) ORDER BY batch_id FOR UPDATE`;
};
