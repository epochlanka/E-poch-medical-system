import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import { NotFoundError, ValidationError } from './errors';


interface Actor {
  user_id: number;
  role: string;
}

// Fallback only for a DB with no ClinicSettings row yet (e.g. a fresh migration before the
// first seed/save) — the real default lives in Settings > Fee Schedules (FR-088) and is read
// fresh on every invoice rather than cached, so an Admin's fee change applies immediately.
const FALLBACK_CONSULTATION_FEE = 500;

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

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

// ---- Consolidated Invoice (consultation fee + every dispensed item) ---------------------

interface DiscountInput {
  description: string;
  amount: number;
}

interface CreateInvoiceInput {
  consultation_id: number;
  consultation_fee?: number;
  discounts?: DiscountInput[];
}

interface LineItemDraft {
  item_type: string;
  description: string;
  qty: number;
  unit_price: number;
  line_total: number;
  source_prescription_item_id?: number;
  medicine_id?: number;
  batch_id?: number;
  source_dispense_id?: number;
  base_qty?: number;
  unit?: string;
  purchase_cost?: number;
  profit?: number;
}

// Shape pulled onto every PrescriptionItem so a Medicine line can be built per exact batch draw —
// shared by createInvoice (first billing) and syncDispensedItemsToInvoice (later top-ups).
const dispensableItemInclude = {
  dispenses: {
    include: {
      invoice_item: { select: { invoice_item_id: true } },
      batch: { include: { medicine: { select: { medicine_id: true, name: true, base_unit: true } } } },
    },
  },
} as const;

type DispenseForBilling = Prisma.PrescriptionItemDispenseGetPayload<{ include: typeof dispensableItemInclude.dispenses.include }>;

// One InvoiceItem per PrescriptionItemDispense — never a weighted average across batches — so a
// line drawn from two different batches produces two batch-specific lines (Section 6/7), each
// carrying the batch's own selling price (never purchase price) and its own purchase cost (never
// the selling price) for accurate historical profit reporting (Section 8). A fully external-
// purchase line (the patient bought it outside the clinic) never reaches here at all, since it
// never has a dispense row to begin with — see the `dispenses.length === 0` skip below.
const buildMedicineLine = (dispense: DispenseForBilling, rxItemId: number): LineItemDraft => {
  const medicine = dispense.batch.medicine;
  const lineTotal = dispense.qty * dispense.unit_price;
  const purchaseCost = dispense.qty * dispense.unit_cost;
  return {
    item_type: 'Medicine',
    description: medicine.name,
    qty: dispense.qty,
    unit_price: dispense.unit_price,
    line_total: lineTotal,
    source_prescription_item_id: rxItemId,
    medicine_id: medicine.medicine_id,
    batch_id: dispense.batch_id,
    source_dispense_id: dispense.dispense_id,
    base_qty: dispense.qty,
    unit: medicine.base_unit,
    purchase_cost: purchaseCost,
    profit: lineTotal - purchaseCost,
  };
};

// Every not-yet-billed dispense across a consultation's prescriptions, turned into draft Medicine
// lines. "Not yet billed" is decided by InvoiceItem.source_dispense_id (unique), not by whether an
// invoice exists yet — the same lookup safely powers both a brand-new invoice and a top-up of an
// existing one.
const collectUnbilledMedicineLines = (
  items: { rx_item_id: number; dispensed_at: Date | null; dispenses: DispenseForBilling[] }[]
): LineItemDraft[] =>
  items
    .filter((item) => !!item.dispensed_at)
    .flatMap((item) => item.dispenses.filter((d) => !d.invoice_item).map((d) => buildMedicineLine(d, item.rx_item_id)));

// One invoice per visit — closes the "two separate bills" gap. `createdVia` distinguishes a
// system-generated invoice (fired from ensureInvoiceForConsultation below) from one reception
// created by hand — same math either way.
export const createInvoice = async (input: CreateInvoiceInput, actor: Actor, createdVia: 'Manual' | 'Auto' = 'Manual') => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: input.consultation_id },
    include: {
      appointment: { include: { patient: true } },
      prescriptions: { include: { items: { include: dispensableItemInclude } } },
      invoices: { where: { payment_status: { not: 'Voided' } } },
    },
  });
  if (!consultation) throw new NotFoundError('Consultation not found');
  if (consultation.invoices.length > 0) {
    throw new ValidationError('An active invoice already exists for this consultation');
  }
  // Unregistered walk-ins (Appointment.is_temporary, patient_id null) are billable too — the
  // visit still has a real price, and there's no other way to collect payment from someone who
  // chose not to register. patient_id stays null on the invoice; resolveDisplayPatient() below
  // derives a name/phone from the appointment's temp_patient_* fields wherever this is read.
  const patientId = consultation.appointment.patient_id;

  // The doctor's fee for THIS visit, frozen onto the consultation at finalize time, wins over
  // whatever the admin default is *right now* — that's what makes a later default change never
  // rewrite an already-finalized visit's charge (Section 20). `input.consultation_fee` remains as
  // an explicit override for the rare manual/early invoice created before finalization even ran.
  const clinicSettings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
  const fee = input.consultation_fee ?? consultation.consultation_fee ?? clinicSettings?.default_consultation_fee ?? FALLBACK_CONSULTATION_FEE;
  if (fee < 0) throw new ValidationError('Consultation fee cannot be negative');

  const lineItems: LineItemDraft[] = [{ item_type: 'ConsultationFee', description: 'Consultation fee', qty: 1, unit_price: fee, line_total: fee }];

  for (const rx of consultation.prescriptions) {
    lineItems.push(...collectUnbilledMedicineLines(rx.items));
  }

  const subtotal = lineItems.reduce((sum, i) => sum + i.line_total, 0);

  const discounts = input.discounts ?? [];
  for (const d of discounts) {
    if (d.amount <= 0) throw new ValidationError('Discount amounts must be positive');
  }
  const discountItems: LineItemDraft[] = discounts.map((d) => ({
    item_type: 'Discount',
    description: d.description,
    qty: 1,
    unit_price: -d.amount,
    line_total: -d.amount,
  }));
  const discountTotal = discountItems.reduce((sum, i) => sum - i.line_total, 0);

  const totalAmount = subtotal - discountTotal;
  if (totalAmount < 0) throw new ValidationError('Discounts cannot exceed the invoice subtotal');

  const created = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.create({
      data: {
        patient_id: patientId,
        consultation_id: consultation.consultation_id,
        subtotal,
        discount_total: discountTotal,
        total_amount: totalAmount,
        created_by: actor.user_id,
        created_via: createdVia,
      },
    });

    await tx.invoiceItem.createMany({
      data: [...lineItems, ...discountItems].map((i) => ({ invoice_id: invoice.invoice_id, ...i })),
    });

    return invoice;
  });

  return getInvoiceById(created.invoice_id);
};

// ---- Incremental medicine-line top-up ------------------------------------------------------
// Appends any not-yet-billed dispense as a new Medicine line to an EXISTING active invoice and
// recomputes subtotal/total/status — the counterpart to createInvoice's line-building, for the
// (now common) case where the invoice already exists — created at finalization with just the
// consultation fee, or created early by hand — before this particular dispense happened.
// Idempotent: a dispense already linked to an invoice item (source_dispense_id) is never re-billed,
// so calling this repeatedly as dispensing progresses is always safe.
export const syncDispensedItemsToInvoice = async (consultationId: number, actor: Actor) => {
  const invoice = await prisma.invoice.findFirst({ where: { consultation_id: consultationId, payment_status: { not: 'Voided' } } });
  if (!invoice) return null;

  const items = await prisma.prescriptionItem.findMany({
    where: { prescription: { consultation_id: consultationId }, dispensed_at: { not: null } },
    include: dispensableItemInclude,
  });

  const newLines = collectUnbilledMedicineLines(items);
  if (newLines.length === 0) return getInvoiceById(invoice.invoice_id);

  await prisma.$transaction(async (tx) => {
    await tx.invoiceItem.createMany({ data: newLines.map((l) => ({ invoice_id: invoice.invoice_id, ...l })) });

    const allItems = await tx.invoiceItem.findMany({ where: { invoice_id: invoice.invoice_id } });
    const subtotal = allItems.filter((i) => i.item_type !== 'Discount').reduce((sum, i) => sum + i.line_total, 0);
    const discountTotal = allItems.filter((i) => i.item_type === 'Discount').reduce((sum, i) => sum - i.line_total, 0);
    const totalAmount = subtotal - discountTotal;
    const paymentStatus = invoice.paid_amount >= totalAmount - 0.01 ? 'Paid' : invoice.paid_amount > 0 ? 'PartiallyPaid' : 'Outstanding';

    await tx.invoice.update({
      where: { invoice_id: invoice.invoice_id },
      data: { subtotal, discount_total: discountTotal, total_amount: totalAmount, payment_status: paymentStatus },
    });
  });

  return getInvoiceById(invoice.invoice_id);
};

// Single entry point for keeping a consultation's invoice honest as its billable facts change —
// called right after finalization (the consultation fee is now known) and after every dispense (a
// new medicine charge may now be known). The first call creates the invoice; every call after that
// tops up the one that already exists. This is what lets a visit with no prescription at all —
// including an unregistered walk-in's — reach Payment immediately at finalization, and lets a
// visit billed early (Section 25's manual-invoice escape hatch) still pick up medicine charges
// dispensed afterwards, rather than losing them (Section 17). Best-effort by design: callers must
// never let a billing hiccup block a clinical/pharmacy action.
export const ensureInvoiceForConsultation = async (consultationId: number, actor: Actor) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: consultationId },
    include: { invoices: { where: { payment_status: { not: 'Voided' } } } },
  });
  if (!consultation || consultation.status !== 'Finalized') return null;

  if (consultation.invoices.length > 0) return syncDispensedItemsToInvoice(consultationId, actor);
  return createInvoice({ consultation_id: consultationId }, actor, 'Auto');
};

// Additive nested include used by both getInvoiceById and listInvoices — pulls the visit's
// doctor/consultation-type context through the Invoice→Consultation→Appointment chain (an
// Invoice has no doctor column of its own; every visit's doctor lives on its Appointment).
// Needed for the receptionist Consolidated Invoice page to honestly group real invoices "by
// visit" (date/doctor/consultation type) rather than inventing a fake per-visit code.
const visitContextInclude = {
  consultation: {
    select: {
      appointment: {
        select: {
          doctor: { select: { user_id: true, username: true, registration_number: true } },
          consultation_type: true,
          scheduled_at: true,
          is_walk_in: true,
          visit_type: true,
          // Only populated for an unregistered walk-in (is_temporary) — read by
          // resolveDisplayPatient() below so those invoices still show a name/phone.
          temp_patient_name: true,
          temp_patient_phone: true,
        },
      },
    },
  },
} as const;

// An unregistered walk-in has no Patient row, so `patient` comes back null from Prisma — but
// every consumer of an invoice (frontend list/detail views, PDF, the payments ledger) expects to
// always be able to read a name/phone. Resolve a display object from the temp_patient_* fields
// captured on the visit's Appointment instead of ever returning null, so `patient_id` is the only
// thing that's ever actually absent.
const resolveDisplayPatient = (invoice: {
  patient: { patient_id: string; full_name: string; phone?: string | null } | null;
  consultation?: { appointment?: { temp_patient_name?: string | null; temp_patient_phone?: string | null } | null } | null;
}) => ({
  patient_id: invoice.patient?.patient_id ?? null,
  full_name: invoice.patient?.full_name ?? invoice.consultation?.appointment?.temp_patient_name ?? 'Unregistered walk-in patient',
  phone: invoice.patient?.phone ?? invoice.consultation?.appointment?.temp_patient_phone ?? null,
});

export const getInvoiceById = async (invoiceId: number) => {
  const invoice = await prisma.invoice.findUnique({
    where: { invoice_id: invoiceId },
    include: {
      patient: { select: { patient_id: true, full_name: true, phone: true } },
      items: true,
      payments: { include: { receiver: { select: { username: true } } } },
      refunds: { include: { issuer: { select: { username: true } } } },
      creator: { select: { username: true } },
      voided_by_user: { select: { username: true } },
      ...visitContextInclude,
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return { ...invoice, patient: resolveDisplayPatient(invoice), type: invoiceType(invoice.items) };
};

interface ListInvoicesFilters {
  search?: string;
  patientId?: string;
  consultationId?: number;
  status?: string;
  type?: 'Consultation' | 'Pharmacy' | 'Consultation+Pharmacy';
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

// "Consultation", "Pharmacy", or "Consultation+Pharmacy" — not a stored field, derived from
// which item types actually ended up on the invoice (Discount lines don't count either way).
const invoiceType = (items: { item_type: string }[]) => {
  const hasFee = items.some((i) => i.item_type === 'ConsultationFee');
  const hasMedicine = items.some((i) => i.item_type === 'Medicine');
  if (hasFee && hasMedicine) return 'Consultation+Pharmacy';
  if (hasMedicine) return 'Pharmacy';
  return 'Consultation';
};

export const listInvoices = async (filters: ListInvoicesFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.InvoiceWhereInput = {};
  if (filters.patientId) where.patient_id = filters.patientId;
  if (filters.consultationId) where.consultation_id = filters.consultationId;
  if (filters.status) where.payment_status = filters.status;
  if (filters.from || filters.to) {
    where.created_at = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }
  if (filters.search) {
    const term = filters.search.trim();
    const asId = Number(term.replace(/^INV-?/i, ''));
    where.OR = [
      { patient: { full_name: { contains: term } } },
      { patient: { phone: { contains: term } } },
      { patient_id: { contains: term } },
      // An unregistered walk-in's invoice has no Patient row to match against above — search its
      // visit's captured temp_patient_* fields instead, or it would never be findable at all.
      { consultation: { appointment: { temp_patient_name: { contains: term } } } },
      { consultation: { appointment: { temp_patient_phone: { contains: term } } } },
      ...(Number.isFinite(asId) && asId > 0 ? [{ invoice_id: asId }] : []),
    ];
  }

  // Full items and payments (not just item_type) so a single list call already carries
  // everything the Consolidated Invoice page's per-visit breakdown and Payment Information
  // panel need, avoiding an N+1 of getInvoiceById calls for what's usually a handful of
  // invoices per patient. Matches getInvoiceById's own include shape below for consistency.
  const include = {
    patient: { select: { patient_id: true, full_name: true, phone: true } },
    items: true,
    payments: { include: { receiver: { select: { username: true } } } },
    ...visitContextInclude,
  } as const;

  // 'type' isn't a stored column, so it can't be pushed into the Prisma `where` — filtering by
  // it means fetching every DB-level match, deriving the type in JS, then paginating in memory
  // (same "compute, don't cache" tradeoff medicines/service.ts makes for its stock-status filter).
  if (filters.type) {
    const all = await prisma.invoice.findMany({ where, orderBy: { created_at: 'desc' }, include });
    const filtered = all
      .map((inv) => ({ ...inv, patient: resolveDisplayPatient(inv), type: invoiceType(inv.items) }))
      .filter((inv) => inv.type === filters.type);
    const total = filtered.length;
    const data = filtered.slice((page - 1) * limit, page * limit);
    return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({ where, orderBy: { created_at: 'desc' }, skip: (page - 1) * limit, take: limit, include }),
  ]);

  const data = invoices.map((inv) => ({ ...inv, patient: resolveDisplayPatient(inv), type: invoiceType(inv.items) }));

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// Stat cards for the Invoices dashboard. Paid/Unpaid/Overdue are mutually exclusive buckets
// (Voided invoices aren't counted in any of them): this is a same-day walk-in clinic, so
// "overdue" just means still unpaid from a day other than today — there's no separate due-date
// field to track, since nothing in the domain gives an invoice its own payment terms.
export const getInvoiceStats = async () => {
  const today = startOfDay();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalInvoices, paidInvoices, unpaidInvoices, overdueInvoices, revenueThisMonth] = await Promise.all([
    prisma.invoice.count(),
    prisma.invoice.count({ where: { payment_status: 'Paid' } }),
    prisma.invoice.count({ where: { payment_status: { in: ['Outstanding', 'PartiallyPaid'] }, created_at: { gte: today } } }),
    prisma.invoice.count({ where: { payment_status: { in: ['Outstanding', 'PartiallyPaid'] }, created_at: { lt: today } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { received_at: { gte: monthStart } } }),
  ]);

  return { totalInvoices, paidInvoices, unpaidInvoices, overdueInvoices, totalRevenueThisMonth: revenueThisMonth._sum.amount ?? 0 };
};

// ---- Payments (cash/card/mobile, split) --------------------------------------------------

interface PaymentInput {
  method: string;
  amount: number;
  idempotency_key?: string;
}

// Payment/refund methods are validated against the live PaymentMethod master-data list
// (Settings > Payment Methods) rather than a hardcoded enum, so an admin adding or retiring a
// method there actually takes effect — matches the equivalent list already backing Discount Types.
const assertValidPaymentMethod = async (method: string) => {
  const allowed = await prisma.masterDataItem.findFirst({ where: { type: 'PaymentMethod', value: method, is_active: true } });
  if (!allowed) {
    throw new ValidationError(`"${method}" is not an active payment method — add or enable it under Settings > Payment Methods first`);
  }
};

export const recordPayments = async (invoiceId: number, payments: PaymentInput[], actor: Actor) => {
  if (payments.length === 0) throw new ValidationError('At least one payment is required');

  const invoice = await prisma.invoice.findUnique({ where: { invoice_id: invoiceId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.payment_status === 'Voided') throw new ValidationError('Cannot record a payment against a voided invoice');
  if (invoice.payment_status === 'Paid') throw new ValidationError('Invoice is already fully paid');

  // A request replayed with the same idempotency key (double-click, network retry) returns the
  // invoice unchanged instead of double-charging — checked before any validation so a retry of an
  // already-accepted request never fails even if the invoice has since moved on (e.g. now Paid).
  const keys = payments.map((p) => p.idempotency_key).filter((k): k is string => !!k);
  if (keys.length > 0) {
    const existing = await prisma.payment.findFirst({ where: { idempotency_key: { in: keys } } });
    if (existing) {
      return prisma.invoice.findUnique({
        where: { invoice_id: invoiceId },
        include: { items: true, payments: { include: { receiver: { select: { username: true } } } } },
      });
    }
  }

  for (const method of new Set(payments.map((p) => p.method))) await assertValidPaymentMethod(method);

  const totalNew = payments.reduce((sum, p) => sum + p.amount, 0);
  if (totalNew <= 0) throw new ValidationError('Payment amount must be positive');
  if (invoice.paid_amount + totalNew > invoice.total_amount + 0.01) {
    throw new ValidationError(`Payment of ${totalNew} exceeds the outstanding balance of ${invoice.total_amount - invoice.paid_amount}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.payment.createMany({
      data: payments.map((p) => ({
        invoice_id: invoiceId,
        method: p.method,
        amount: p.amount,
        received_by: actor.user_id,
        idempotency_key: p.idempotency_key,
      })),
    });

    const newPaidAmount = invoice.paid_amount + totalNew;
    const newStatus = newPaidAmount >= invoice.total_amount - 0.01 ? 'Paid' : 'PartiallyPaid';

    await tx.invoice.update({ where: { invoice_id: invoiceId }, data: { paid_amount: newPaidAmount, payment_status: newStatus } });

    return tx.invoice.findUnique({
      where: { invoice_id: invoiceId },
      include: { items: true, payments: { include: { receiver: { select: { username: true } } } } },
    });
  });
};

// ---- Void / Refund (Admin-approved) --------------------------------------------------------

interface RefundInput {
  method: string;
  amount: number;
}

// Voiding an invoice that already collected money must say where that money went — refund lines
// are required whenever paid_amount > 0, summing to at most what was actually paid (a void never
// hands back more than was collected). Stock reversal stays out of scope: dispensedItemsNeedingReview
// still just flags dispensed medicine for manual clinical/stock review, same as before.
export const voidInvoice = async (invoiceId: number, reason: string, actor: Actor, refunds: RefundInput[] = []) => {
  if (!reason?.trim()) throw new ValidationError('A void reason is required');

  const invoice = await prisma.invoice.findUnique({
    where: { invoice_id: invoiceId },
    include: { items: { where: { item_type: 'Medicine' } } },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.payment_status === 'Voided') throw new ValidationError('Invoice is already voided');

  if (invoice.paid_amount > 0) {
    if (refunds.length === 0) {
      throw new ValidationError('This invoice has payments recorded against it — specify how the paid amount is being refunded');
    }
    const totalRefund = refunds.reduce((sum, r) => sum + r.amount, 0);
    if (refunds.some((r) => r.amount <= 0)) throw new ValidationError('Refund amounts must be positive');
    if (totalRefund > invoice.paid_amount + 0.01) {
      throw new ValidationError(`Refund total of ${totalRefund} exceeds the ${invoice.paid_amount} actually paid on this invoice`);
    }
    for (const method of new Set(refunds.map((r) => r.method))) await assertValidPaymentMethod(method);
  }

  const updated = await prisma.$transaction(async (tx) => {
    if (refunds.length > 0) {
      await tx.refund.createMany({
        data: refunds.map((r) => ({ invoice_id: invoiceId, method: r.method, amount: r.amount, reason, issued_by: actor.user_id })),
      });
    }
    return tx.invoice.update({
      where: { invoice_id: invoiceId },
      data: { payment_status: 'Voided', void_reason: reason, voided_by: actor.user_id, voided_at: new Date() },
    });
  });

  return { ...updated, dispensedItemsNeedingReview: invoice.items.length > 0 };
};

// ---- Payments Ledger (flat, cross-invoice view) --------------------------------------------
// Every Payment row is, by construction, money already received (there's no payment-attempt/
// gateway concept in this domain) — so unlike the mockup this list has no per-row status.
// The closest real per-row signal is the *invoice's* current status (Paid/PartiallyPaid/Voided),
// included alongside each payment.

interface ListPaymentsFilters {
  search?: string;
  method?: 'Cash' | 'Card' | 'Mobile';
  invoiceStatus?: 'Outstanding' | 'PartiallyPaid' | 'Paid' | 'Voided';
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export const listPayments = async (filters: ListPaymentsFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 10;

  const where: Prisma.PaymentWhereInput = {};
  if (filters.method) where.method = filters.method;
  if (filters.invoiceStatus) where.invoice = { payment_status: filters.invoiceStatus };
  if (filters.from || filters.to) {
    where.received_at = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }
  if (filters.search) {
    const term = filters.search.trim();
    const asId = Number(term.replace(/^PAY-?/i, ''));
    where.OR = [
      { invoice: { patient: { full_name: { contains: term } } } },
      { invoice: { patient: { phone: { contains: term } } } },
      { invoice: { patient_id: { contains: term } } },
      { invoice: { consultation: { appointment: { temp_patient_name: { contains: term } } } } },
      { invoice: { consultation: { appointment: { temp_patient_phone: { contains: term } } } } },
      ...(Number.isFinite(asId) && asId > 0 ? [{ payment_id: asId }, { invoice_id: asId }] : []),
    ];
  }

  const include = {
    invoice: {
      select: {
        invoice_id: true,
        payment_status: true,
        created_at: true,
        subtotal: true,
        discount_total: true,
        patient: { select: { patient_id: true, full_name: true, phone: true } },
        consultation: { select: { appointment: { select: { temp_patient_name: true, temp_patient_phone: true } } } },
      },
    },
    receiver: { select: { username: true } },
  } as const;

  const [total, payments] = await Promise.all([
    prisma.payment.count({ where }),
    prisma.payment.findMany({ where, orderBy: { received_at: 'desc' }, skip: (page - 1) * limit, take: limit, include }),
  ]);

  const data = payments.map((p) => {
    const displayPatient = resolveDisplayPatient(p.invoice);
    return {
      paymentId: p.payment_id,
      invoiceId: p.invoice_id,
      invoiceStatus: p.invoice.payment_status,
      invoiceCreatedAt: p.invoice.created_at,
      // The invoice's own subtotal/discount, shown alongside this payment row so a receptionist
      // can see what the visit was charged and discounted — NOT this specific payment's own
      // amount (that's `amount` below); for a fully-paid, non-split invoice these will visually
      // reconcile (subtotal - discount = amount), but they needn't for a split/partial payment.
      invoiceSubtotal: p.invoice.subtotal,
      invoiceDiscount: p.invoice.discount_total,
      patientId: displayPatient.patient_id,
      patientName: displayPatient.full_name,
      patientPhone: displayPatient.phone,
      amount: p.amount,
      method: p.method,
      receivedAt: p.received_at,
      receivedBy: p.receiver.username,
    };
  });

  return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
};

type StatsRange = 'month' | 'quarter' | 'year' | 'all';

// Monday-start week, matching the same convention already used for OPD roster planning in the
// appointments module's own startOfWeek — kept as a local copy since billing has no reason to
// import across modules for one helper (matches this project's "small error classes/helpers
// duplicated per-module" convention).
const startOfWeek = (date: Date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};

const sumPayments = (from: Date, to: Date) => prisma.payment.aggregate({ _sum: { amount: true }, _count: true, where: { received_at: { gte: from, lte: to } } });

// KPIs are all-time cumulative (matches a "Total Payments" style counter); the by-method
// breakdown is windowed by `range` since that's what the mockup's "This Month ▾" toggle implies.
// The today/week/month figures below (with their prior-period counterparts for %-change deltas)
// are additive, added for the receptionist Payments page's KPI row — kept alongside the
// existing fields rather than replacing them, since the admin app's own Payments page already
// depends on totalReceivedThisMonth/outstandingInvoices/voidedInvoices as they are.
export const getPaymentsStats = async (range: StatsRange = 'month') => {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const lastMonthEnd = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const yesterday = new Date(todayStart);
  yesterday.setDate(yesterday.getDate() - 1);
  const weekStart = startOfWeek(now);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekEnd = endOfDay(new Date(weekStart.getTime() - 24 * 60 * 60 * 1000));

  let rangeStart: Date | undefined;
  if (range === 'month') rangeStart = monthStart;
  else if (range === 'quarter') rangeStart = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  else if (range === 'year') rangeStart = new Date(now.getFullYear(), 0, 1);

  const [
    totalPayments,
    totalReceivedAgg,
    totalReceivedThisMonthAgg,
    outstandingInvoices,
    voidedInvoices,
    outstandingAmountAgg,
    methodGroups,
    invoiceStatusGroups,
    today,
    yesterdayAgg,
    thisWeek,
    lastWeekAgg,
    lastMonthAgg,
    thisMonth,
  ] = await Promise.all([
    prisma.payment.count(),
    prisma.payment.aggregate({ _sum: { amount: true } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { received_at: { gte: monthStart } } }),
    prisma.invoice.count({ where: { payment_status: { in: ['Outstanding', 'PartiallyPaid'] } } }),
    prisma.invoice.count({ where: { payment_status: 'Voided' } }),
    prisma.invoice.aggregate({
      _sum: { total_amount: true, paid_amount: true },
      where: { payment_status: { in: ['Outstanding', 'PartiallyPaid'] } },
    }),
    prisma.payment.groupBy({ by: ['method'], _sum: { amount: true }, _count: true, where: rangeStart ? { received_at: { gte: rangeStart } } : undefined }),
    prisma.invoice.groupBy({ by: ['payment_status'], _count: true }),
    sumPayments(todayStart, todayEnd),
    sumPayments(yesterday, endOfDay(yesterday)),
    sumPayments(weekStart, endOfDay(now)),
    sumPayments(lastWeekStart, lastWeekEnd),
    sumPayments(lastMonthStart, lastMonthEnd),
    sumPayments(monthStart, endOfDay(now)),
  ]);

  return {
    range,
    totalPayments,
    totalReceived: totalReceivedAgg._sum.amount ?? 0,
    totalReceivedThisMonth: totalReceivedThisMonthAgg._sum.amount ?? 0,
    outstandingInvoices,
    voidedInvoices,
    outstandingAmount: (outstandingAmountAgg._sum.total_amount ?? 0) - (outstandingAmountAgg._sum.paid_amount ?? 0),
    byMethod: methodGroups.map((g) => ({ method: g.method, amount: g._sum.amount ?? 0, count: g._count })),
    byInvoiceStatus: invoiceStatusGroups.map((g) => ({ status: g.payment_status, count: g._count })),
    today: { total: today._sum.amount ?? 0, count: today._count },
    yesterdayTotal: yesterdayAgg._sum.amount ?? 0,
    thisWeek: { total: thisWeek._sum.amount ?? 0, count: thisWeek._count },
    lastWeekTotal: lastWeekAgg._sum.amount ?? 0,
    thisMonth: { total: thisMonth._sum.amount ?? 0, count: thisMonth._count },
    lastMonthTotal: lastMonthAgg._sum.amount ?? 0,
  };
};

// ---- End-of-Day Cash Reconciliation --------------------------------------------------------

export const getReconciliation = async (date: Date) => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const [payments, refunds, invoicesCreated, voidedCount] = await Promise.all([
    prisma.payment.findMany({ where: { received_at: { gte: dayStart, lte: dayEnd } } }),
    prisma.refund.findMany({ where: { issued_at: { gte: dayStart, lte: dayEnd } } }),
    prisma.invoice.count({ where: { created_at: { gte: dayStart, lte: dayEnd } } }),
    prisma.invoice.count({ where: { voided_at: { gte: dayStart, lte: dayEnd } } }),
  ]);

  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;

  const refundsByMethod: Record<string, number> = {};
  for (const r of refunds) refundsByMethod[r.method] = (refundsByMethod[r.method] ?? 0) + r.amount;

  return {
    date: localDateKey(date),
    totalCollected: payments.reduce((sum, p) => sum + p.amount, 0),
    byMethod,
    paymentCount: payments.length,
    totalRefunded: refunds.reduce((sum, r) => sum + r.amount, 0),
    refundsByMethod,
    refundCount: refunds.length,
    invoicesCreated,
    invoicesVoided: voidedCount,
  };
};
