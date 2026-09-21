-- Database-level guarantees behind the application's locking. The application takes row locks
-- (lib/rowLocks.ts) so these should never fire in normal operation — they exist so that a future
-- code path that forgets the lock fails loudly instead of silently corrupting stock or money.

-- Stock can never go negative.
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_qty_on_hand_nonnegative" CHECK (qty_on_hand >= 0);

-- A prescription line can never be dispensed beyond what was prescribed.
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_dispensed_qty_nonnegative" CHECK (dispensed_qty >= 0);
ALTER TABLE "PrescriptionItem" ADD CONSTRAINT "PrescriptionItem_dispensed_within_qty" CHECK (dispensed_qty + external_qty <= qty);

-- Money movements are strictly positive; an invoice never records negative paid money.
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_amount_positive" CHECK (amount > 0);
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_amount_positive" CHECK (amount > 0);
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_paid_amount_nonnegative" CHECK (paid_amount >= 0);

-- At most ONE non-voided invoice per consultation. The application checks this first, but two
-- concurrent requests (finalize + dispense) can both pass that check; this index is what actually
-- stops the duplicate. (Partial index: Prisma's schema language cannot express it, so it lives
-- only in SQL — a future `prisma migrate dev` may propose dropping it; keep it.)
CREATE UNIQUE INDEX "Invoice_one_active_per_consultation"
  ON "Invoice" (consultation_id)
  WHERE consultation_id IS NOT NULL AND payment_status <> 'Voided';
