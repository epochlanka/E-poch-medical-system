import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

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

// One invoice per visit — closes the "two separate bills" gap. Only actually-dispensed lines
// (batch_id set) are billed; a still-Pending item hasn't left the shelf yet.
export const createInvoice = async (input: CreateInvoiceInput, actor: Actor) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: input.consultation_id },
    include: {
      appointment: { include: { patient: true } },
      prescriptions: { include: { items: { include: { medicine: true } } } },
      invoices: { where: { payment_status: { not: 'Voided' } } },
    },
  });
  if (!consultation) throw new NotFoundError('Consultation not found');
  if (consultation.invoices.length > 0) {
    throw new ValidationError('An active invoice already exists for this consultation');
  }

  const clinicSettings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
  const fee = input.consultation_fee ?? clinicSettings?.default_consultation_fee ?? FALLBACK_CONSULTATION_FEE;
  if (fee < 0) throw new ValidationError('Consultation fee cannot be negative');

  const lineItems: {
    item_type: string;
    description: string;
    qty: number;
    unit_price: number;
    line_total: number;
    source_prescription_item_id?: number;
  }[] = [{ item_type: 'ConsultationFee', description: 'Consultation fee', qty: 1, unit_price: fee, line_total: fee }];

  for (const rx of consultation.prescriptions) {
    for (const item of rx.items) {
      if (!item.batch_id) continue;
      lineItems.push({
        item_type: 'Medicine',
        description: item.medicine.name,
        qty: item.qty,
        unit_price: item.medicine.unit_price,
        line_total: item.medicine.unit_price * item.qty,
        source_prescription_item_id: item.rx_item_id,
      });
    }
  }

  const subtotal = lineItems.reduce((sum, i) => sum + i.line_total, 0);

  const discounts = input.discounts ?? [];
  for (const d of discounts) {
    if (d.amount <= 0) throw new ValidationError('Discount amounts must be positive');
  }
  const discountItems = discounts.map((d) => ({
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
        patient_id: consultation.appointment.patient_id,
        consultation_id: consultation.consultation_id,
        subtotal,
        discount_total: discountTotal,
        total_amount: totalAmount,
        created_by: actor.user_id,
      },
    });

    await tx.invoiceItem.createMany({
      data: [...lineItems, ...discountItems].map((i) => ({ invoice_id: invoice.invoice_id, ...i })),
    });

    return invoice;
  });

  return getInvoiceById(created.invoice_id);
};

export const getInvoiceById = async (invoiceId: number) => {
  const invoice = await prisma.invoice.findUnique({
    where: { invoice_id: invoiceId },
    include: {
      patient: { select: { patient_id: true, full_name: true } },
      items: true,
      payments: { include: { receiver: { select: { username: true } } } },
      creator: { select: { username: true } },
      voided_by_user: { select: { username: true } },
    },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  return invoice;
};

interface ListInvoicesFilters {
  patientId?: string;
  status?: string;
  from?: Date;
  to?: Date;
  page?: number;
  limit?: number;
}

export const listInvoices = async (filters: ListInvoicesFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.InvoiceWhereInput = {};
  if (filters.patientId) where.patient_id = filters.patientId;
  if (filters.status) where.payment_status = filters.status;
  if (filters.from || filters.to) {
    where.created_at = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }

  const [total, invoices] = await Promise.all([
    prisma.invoice.count({ where }),
    prisma.invoice.findMany({
      where,
      orderBy: { created_at: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { patient: { select: { patient_id: true, full_name: true } } },
    }),
  ]);

  return { data: invoices, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// ---- Payments (cash/card/mobile, split) --------------------------------------------------

interface PaymentInput {
  method: 'Cash' | 'Card' | 'Mobile';
  amount: number;
}

export const recordPayments = async (invoiceId: number, payments: PaymentInput[], actor: Actor) => {
  if (payments.length === 0) throw new ValidationError('At least one payment is required');

  const invoice = await prisma.invoice.findUnique({ where: { invoice_id: invoiceId } });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.payment_status === 'Voided') throw new ValidationError('Cannot record a payment against a voided invoice');
  if (invoice.payment_status === 'Paid') throw new ValidationError('Invoice is already fully paid');

  const totalNew = payments.reduce((sum, p) => sum + p.amount, 0);
  if (totalNew <= 0) throw new ValidationError('Payment amount must be positive');
  if (invoice.paid_amount + totalNew > invoice.total_amount + 0.01) {
    throw new ValidationError(`Payment of ${totalNew} exceeds the outstanding balance of ${invoice.total_amount - invoice.paid_amount}`);
  }

  return prisma.$transaction(async (tx) => {
    await tx.payment.createMany({
      data: payments.map((p) => ({ invoice_id: invoiceId, method: p.method, amount: p.amount, received_by: actor.user_id })),
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

export const voidInvoice = async (invoiceId: number, reason: string, actor: Actor) => {
  if (!reason?.trim()) throw new ValidationError('A void reason is required');

  const invoice = await prisma.invoice.findUnique({
    where: { invoice_id: invoiceId },
    include: { items: { where: { item_type: 'Medicine' } } },
  });
  if (!invoice) throw new NotFoundError('Invoice not found');
  if (invoice.payment_status === 'Voided') throw new ValidationError('Invoice is already voided');

  const updated = await prisma.invoice.update({
    where: { invoice_id: invoiceId },
    data: { payment_status: 'Voided', void_reason: reason, voided_by: actor.user_id, voided_at: new Date() },
  });

  return { ...updated, dispensedItemsNeedingReview: invoice.items.length > 0 };
};

// ---- End-of-Day Cash Reconciliation --------------------------------------------------------

export const getReconciliation = async (date: Date) => {
  const dayStart = startOfDay(date);
  const dayEnd = endOfDay(date);

  const [payments, invoicesCreated, voidedCount] = await Promise.all([
    prisma.payment.findMany({ where: { received_at: { gte: dayStart, lte: dayEnd } } }),
    prisma.invoice.count({ where: { created_at: { gte: dayStart, lte: dayEnd } } }),
    prisma.invoice.count({ where: { voided_at: { gte: dayStart, lte: dayEnd } } }),
  ]);

  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;

  return {
    date: localDateKey(date),
    totalCollected: payments.reduce((sum, p) => sum + p.amount, 0),
    byMethod,
    paymentCount: payments.length,
    invoicesCreated,
    invoicesVoided: voidedCount,
  };
};
