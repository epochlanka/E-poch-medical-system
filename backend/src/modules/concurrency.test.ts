import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../app';
import { reconcileBilling } from './billing/service';

// Race-condition tests for the money and stock paths. These fire genuinely simultaneous HTTP
// requests at the app against PostgreSQL (the isolated test database) — the failure modes they
// guard against (overdrawn stock, double dispense, overpaid invoices, duplicate invoices) only
// exist under real concurrency, and cannot be reproduced against an in-memory substitute.

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

let doctorToken: string;
let doctorId: number;
let pharmacistToken: string;
let receptionToken: string;
let adminToken: string;

const login = async (username: string, password: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password });
  return { token: res.body.token as string, id: res.body.user.id as number };
};

let seq = 0;
const uid = () => `${runId}-${++seq}`;

const makeMedicine = async (stock: number, price = 25) => {
  const medicine = await prisma.medicine.create({ data: { name: `Concurrency Drug ${uid()}`, base_unit: 'Tablet', default_selling_price: price, is_active: true } });
  const batch = await prisma.batch.create({
    data: {
      medicine_id: medicine.medicine_id,
      batch_no: `CONC-${uid()}`,
      expiry_date: new Date(Date.now() + 90 * 86400000),
      qty_on_hand: stock,
      selling_price_per_base_unit: price,
      cost_per_base_unit: price / 2,
    },
  });
  return { medicine, batch };
};

// A visit with a prescription, optionally finalized (which creates the invoice).
const makeVisit = async (opts: { medicineId: number; qty: number; finalize?: boolean; fee?: number }) => {
  const family = await prisma.family.create({ data: { family_name: `Conc Family ${uid()}` } });
  const patient = await prisma.patient.create({
    data: { patient_id: `PT-CONC-${uid()}`, family_id: family.family_id, nic: `NIC-${uid()}`, full_name: 'Concurrency Patient', dob: new Date('1990-01-01'), gender: 'Male' },
  });
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const appointment = await prisma.appointment.create({
    data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const consultRes = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${doctorToken}`).send({ appointment_id: appointment.appointment_id });
  const consultationId: number = consultRes.body.consultation_id;

  const rxRes = await request(app)
    .post('/api/v1/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ consultation_id: consultationId, items: [{ medicine_id: opts.medicineId, dosage: '1 tab', qty: opts.qty }] });
  expect(rxRes.status).toBe(201);

  if (opts.finalize !== false) {
    const fin = await request(app)
      .post(`/api/v1/consultations/${consultationId}/finalize`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_fee: opts.fee ?? 100 });
    expect(fin.status).toBe(200);
  }
  return { consultationId, prescriptionId: rxRes.body.prescription_id as number, rxItemId: rxRes.body.items[0].rx_item_id as number };
};

const dispense = (prescriptionId: number, rxItemId: number, batchId: number, qty?: number) =>
  request(app)
    .post(`/api/v1/pharmacy/prescriptions/${prescriptionId}/dispense`)
    .set('Authorization', `Bearer ${pharmacistToken}`)
    .send({ items: [{ rx_item_id: rxItemId, batch_id: batchId, ...(qty !== undefined ? { qty } : {}) }] });

const pay = (invoiceId: number, amount: number, key?: string) =>
  request(app)
    .post(`/api/v1/invoices/${invoiceId}/payments`)
    .set('Authorization', `Bearer ${receptionToken}`)
    .send({ payments: [{ method: 'Cash', amount, ...(key ? { idempotency_key: key } : {}) }] });

const activeInvoiceFor = (consultationId: number) => prisma.invoice.findFirstOrThrow({ where: { consultation_id: consultationId, payment_status: { not: 'Voided' } } });

beforeAll(async () => {
  ({ token: doctorToken, id: doctorId } = await login('doctor', 'doctor123'));
  ({ token: pharmacistToken } = await login('pharmacist', 'pharmacist123'));
  ({ token: receptionToken } = await login('reception', 'reception123'));
  ({ token: adminToken } = await login('admin', 'admin123'));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('concurrent payments', () => {
  it('two simultaneous payments of 60 against a 100 invoice: exactly one is accepted and the balance stays consistent', async () => {
    const { medicine } = await makeMedicine(50);
    const { consultationId } = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(consultationId);
    expect(invoice.total_amount).toBe(100);

    const results = await Promise.all([pay(invoice.invoice_id, 60), pay(invoice.invoice_id, 60)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 400]);

    const payments = await prisma.payment.findMany({ where: { invoice_id: invoice.invoice_id } });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } });
    expect(payments.reduce((s, p) => s + p.amount, 0)).toBe(60);
    expect(after.paid_amount).toBe(60); // was: payment rows 120, paid_amount 60
    expect(after.payment_status).toBe('PartiallyPaid');
  });

  it('many simultaneous small payments never overpay, and paid_amount always equals the payment rows', async () => {
    const { medicine } = await makeMedicine(50);
    const { consultationId } = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(consultationId);

    const results = await Promise.all(Array.from({ length: 10 }, () => pay(invoice.invoice_id, 20)));
    expect(results.filter((r) => r.status === 200)).toHaveLength(5);

    const payments = await prisma.payment.findMany({ where: { invoice_id: invoice.invoice_id } });
    const after = await prisma.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } });
    expect(payments).toHaveLength(5);
    expect(after.paid_amount).toBe(100);
    expect(after.payment_status).toBe('Paid');
  });

  it('a payment replayed concurrently with the same idempotency key is recorded once', async () => {
    const { medicine } = await makeMedicine(50);
    const { consultationId } = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(consultationId);
    const key = `idem-${uid()}`;

    const results = await Promise.all(Array.from({ length: 5 }, () => pay(invoice.invoice_id, 40, key)));
    expect(results.every((r) => r.status === 200)).toBe(true);

    const payments = await prisma.payment.findMany({ where: { invoice_id: invoice.invoice_id } });
    expect(payments).toHaveLength(1);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } })).paid_amount).toBe(40);
  });

  it('replaying an accepted payment after the invoice became Paid still answers as a replay, not an error', async () => {
    const { medicine } = await makeMedicine(50);
    const { consultationId } = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(consultationId);
    const key = `idem-${uid()}`;
    expect((await pay(invoice.invoice_id, 100, key)).status).toBe(200);
    const replay = await pay(invoice.invoice_id, 100, key);
    expect(replay.status).toBe(200);
    expect(await prisma.payment.count({ where: { invoice_id: invoice.invoice_id } })).toBe(1);
  });
});

describe('concurrent dispensing', () => {
  it('two simultaneous confirmations of the same prescription line dispense it exactly once', async () => {
    const { medicine, batch } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, finalize: false });

    const results = await Promise.all([dispense(v.prescriptionId, v.rxItemId, batch.batch_id), dispense(v.prescriptionId, v.rxItemId, batch.batch_id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);

    expect((await prisma.batch.findUniqueOrThrow({ where: { batch_id: batch.batch_id } })).qty_on_hand).toBe(40); // not 30
    expect(await prisma.prescriptionItemDispense.count({ where: { rx_item_id: v.rxItemId } })).toBe(1);
    expect((await prisma.prescriptionItem.findUniqueOrThrow({ where: { rx_item_id: v.rxItemId } })).dispensed_qty).toBe(10);
  });

  it('simultaneous partial draws cannot dispense more than was prescribed', async () => {
    const { medicine, batch } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, finalize: false });

    const results = await Promise.all([dispense(v.prescriptionId, v.rxItemId, batch.batch_id, 6), dispense(v.prescriptionId, v.rxItemId, batch.batch_id, 6)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect((await prisma.prescriptionItem.findUniqueOrThrow({ where: { rx_item_id: v.rxItemId } })).dispensed_qty).toBe(6);
    expect((await prisma.batch.findUniqueOrThrow({ where: { batch_id: batch.batch_id } })).qty_on_hand).toBe(44);
  });

  it('two different prescriptions racing for the same last stock: one succeeds, stock never goes negative', async () => {
    const { medicine, batch } = await makeMedicine(10);
    const a = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, finalize: false });
    const b = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, finalize: false });

    const results = await Promise.all([dispense(a.prescriptionId, a.rxItemId, batch.batch_id), dispense(b.prescriptionId, b.rxItemId, batch.batch_id)]);
    expect(results.filter((r) => r.status === 200)).toHaveLength(1);
    expect(results.find((r) => r.status !== 200)!.body.message).toMatch(/insufficient stock/i);

    expect((await prisma.batch.findUniqueOrThrow({ where: { batch_id: batch.batch_id } })).qty_on_hand).toBe(0);
    const ledger = await prisma.stockLedger.findMany({ where: { batch_id: batch.batch_id, event_type: 'Dispense' } });
    expect(ledger.reduce((s, l) => s + l.change_qty, 0)).toBe(-10);
  });

  it('the database itself refuses negative stock even if application code forgot the lock', async () => {
    const { batch } = await makeMedicine(5);
    await expect(prisma.$executeRaw`UPDATE "Batch" SET qty_on_hand = -1 WHERE batch_id = ${batch.batch_id}`).rejects.toThrow(/Batch_qty_on_hand_nonnegative|check constraint/i);
  });

  it('a manual stock adjustment racing a dispense does not lose either change', async () => {
    const { medicine, batch } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, finalize: false });

    const adjust = request(app)
      .post(`/api/v1/inventory/batches/${batch.batch_id}/adjust`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ delta: 5, reason: 'recount' });
    const [d, a] = await Promise.all([dispense(v.prescriptionId, v.rxItemId, batch.batch_id), adjust]);
    expect(d.status).toBe(200);
    expect(a.status).toBeLessThan(300);
    expect((await prisma.batch.findUniqueOrThrow({ where: { batch_id: batch.batch_id } })).qty_on_hand).toBe(45); // 50 - 10 + 5
  });
});

describe('partial dispensing is billed', () => {
  it('bills each partial draw immediately, and the rest when it is dispensed', async () => {
    const { medicine, batch } = await makeMedicine(50, 10);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, fee: 100 });

    expect((await dispense(v.prescriptionId, v.rxItemId, batch.batch_id, 5)).status).toBe(200);
    let invoice = await activeInvoiceFor(v.consultationId);
    let lines = await prisma.invoiceItem.findMany({ where: { invoice_id: invoice.invoice_id, item_type: 'Medicine' } });
    expect(lines).toHaveLength(1); // was 0: the partially dispensed line was omitted
    expect(lines[0].qty).toBe(5);
    expect(lines[0].line_total).toBe(50);
    expect(invoice.total_amount).toBe(150);

    expect((await dispense(v.prescriptionId, v.rxItemId, batch.batch_id, 5)).status).toBe(200);
    invoice = await activeInvoiceFor(v.consultationId);
    lines = await prisma.invoiceItem.findMany({ where: { invoice_id: invoice.invoice_id, item_type: 'Medicine' } });
    expect(lines.map((l) => l.qty).sort()).toEqual([5, 5]);
    expect(invoice.total_amount).toBe(200);
  });

  it('a partial draw billed after the invoice was already paid re-opens the balance instead of being lost', async () => {
    const { medicine, batch } = await makeMedicine(50, 10);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, fee: 100 });
    const invoice = await activeInvoiceFor(v.consultationId);
    expect((await pay(invoice.invoice_id, 100)).status).toBe(200);

    expect((await dispense(v.prescriptionId, v.rxItemId, batch.batch_id, 4)).status).toBe(200);
    const after = await activeInvoiceFor(v.consultationId);
    expect(after.total_amount).toBe(140);
    expect(after.paid_amount).toBe(100);
    expect(after.payment_status).toBe('PartiallyPaid');
  });
});

describe('one active invoice per consultation', () => {
  it('simultaneous manual invoice creation yields exactly one active invoice', async () => {
    const { medicine } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, finalize: false });

    const results = await Promise.all(
      Array.from({ length: 6 }, () => request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: v.consultationId, consultation_fee: 100 }))
    );
    expect(results.filter((r) => r.status === 201)).toHaveLength(1);
    expect(await prisma.invoice.count({ where: { consultation_id: v.consultationId, payment_status: { not: 'Voided' } } })).toBe(1);
  });

  it('the database rejects a second active invoice, but allows a new one after the first is voided', async () => {
    const { medicine } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const first = await activeInvoiceFor(v.consultationId);
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

    await expect(prisma.invoice.create({ data: { consultation_id: v.consultationId, created_by: admin.user_id } })).rejects.toThrow(/Unique constraint/i);

    const voided = await request(app).post(`/api/v1/invoices/${first.invoice_id}/void`).set('Authorization', `Bearer ${adminToken}`).send({ reason: 'test' });
    expect(voided.status).toBe(200);
    await expect(prisma.invoice.create({ data: { consultation_id: v.consultationId, created_by: admin.user_id } })).resolves.toBeTruthy();
  });
});

describe('refund validation', () => {
  const voidWith = (invoiceId: number, refunds: unknown[]) =>
    request(app).post(`/api/v1/invoices/${invoiceId}/void`).set('Authorization', `Bearer ${adminToken}`).send({ reason: 'test void', refunds });

  it('refuses a refund against an invoice nobody paid', async () => {
    const { medicine } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(v.consultationId);

    const res = await voidWith(invoice.invoice_id, [{ method: 'Cash', amount: 50 }]);
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/nothing to refund/i);
    expect(await prisma.refund.count({ where: { invoice_id: invoice.invoice_id } })).toBe(0);
    expect((await prisma.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } })).payment_status).not.toBe('Voided');
  });

  it('refuses a refund larger than what was paid, and requires refund lines when money was collected', async () => {
    const { medicine } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(v.consultationId);
    await pay(invoice.invoice_id, 60);

    expect((await voidWith(invoice.invoice_id, [{ method: 'Cash', amount: 61 }])).status).toBe(400);
    expect((await voidWith(invoice.invoice_id, [])).status).toBe(400);
    expect((await voidWith(invoice.invoice_id, [{ method: 'Cash', amount: 60 }])).status).toBe(200);
    expect((await voidWith(invoice.invoice_id, [{ method: 'Cash', amount: 60 }])).status).toBe(400); // already voided
  });

  it('a void racing a payment never leaves money collected without a matching refund', async () => {
    const { medicine } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(v.consultationId);

    await Promise.all([pay(invoice.invoice_id, 100), voidWith(invoice.invoice_id, [])]);
    const after = await prisma.invoice.findUniqueOrThrow({ where: { invoice_id: invoice.invoice_id } });
    const paid = (await prisma.payment.aggregate({ _sum: { amount: true }, where: { invoice_id: invoice.invoice_id } }))._sum.amount ?? 0;
    if (after.payment_status === 'Voided') expect(paid).toBe(0); // voided before the payment landed -> payment rejected
    else expect(paid).toBe(100);
  });
});

describe('failed invoice syncs are reconciled', () => {
  it('lists dispensed medicine that never reached an invoice, and reconcile puts it back', async () => {
    const { medicine, batch } = await makeMedicine(50, 10);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, fee: 100 });
    expect((await dispense(v.prescriptionId, v.rxItemId, batch.batch_id, 5)).status).toBe(200);
    const invoice = await activeInvoiceFor(v.consultationId);

    // Simulate the post-dispense sync having failed: the invoice line is gone.
    await prisma.invoiceItem.deleteMany({ where: { invoice_id: invoice.invoice_id, item_type: 'Medicine' } });
    await prisma.invoice.update({ where: { invoice_id: invoice.invoice_id }, data: { subtotal: 100, total_amount: 100 } });

    const list = await request(app).get('/api/v1/invoices/unbilled-dispenses').set('Authorization', `Bearer ${receptionToken}`);
    expect(list.status).toBe(200);
    expect(list.body.data.some((d: any) => d.consultationId === v.consultationId && d.qty === 5)).toBe(true);

    const result = await reconcileBilling();
    expect(result.failed).toBe(0);

    const after = await activeInvoiceFor(v.consultationId);
    expect(after.total_amount).toBe(150);
    const list2 = await request(app).get('/api/v1/invoices/unbilled-dispenses').set('Authorization', `Bearer ${receptionToken}`);
    expect(list2.body.data.some((d: any) => d.consultationId === v.consultationId)).toBe(false);
  });

  it('does not resurrect an invoice that was voided on purpose', async () => {
    const { medicine, batch } = await makeMedicine(50, 10);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 10, fee: 100 });
    expect((await dispense(v.prescriptionId, v.rxItemId, batch.batch_id, 5)).status).toBe(200);
    const invoice = await activeInvoiceFor(v.consultationId);
    await request(app).post(`/api/v1/invoices/${invoice.invoice_id}/void`).set('Authorization', `Bearer ${adminToken}`).send({ reason: 'test' });

    const before = await prisma.invoice.count({ where: { consultation_id: v.consultationId } });
    await reconcileBilling();
    expect(await prisma.invoice.count({ where: { consultation_id: v.consultationId } })).toBe(before);
  });

  it('only staff who handle billing may see or trigger reconciliation', async () => {
    expect((await request(app).get('/api/v1/invoices/unbilled-dispenses').set('Authorization', `Bearer ${doctorToken}`)).status).toBe(403);
    expect((await request(app).post('/api/v1/invoices/unbilled-dispenses/reconcile').set('Authorization', `Bearer ${receptionToken}`)).status).toBe(403);
    expect((await request(app).post('/api/v1/invoices/unbilled-dispenses/reconcile').set('Authorization', `Bearer ${adminToken}`)).status).toBe(200);
  });
});

describe('clinic-day boundaries use Sri Lanka time (Asia/Colombo), not UTC', () => {
  it('a payment at 23:30 and one at 00:30 Colombo time fall on different reconciliation days', async () => {
    expect(process.env.TZ).toBe('Asia/Colombo');
    const { medicine } = await makeMedicine(50);
    const v = await makeVisit({ medicineId: medicine.medicine_id, qty: 1, fee: 100 });
    const invoice = await activeInvoiceFor(v.consultationId);
    const admin = await prisma.user.findUniqueOrThrow({ where: { username: 'admin' } });

    // Far in the past so no other test's payments land on these days.
    // 2019-03-10 23:30 +05:30 = 18:00Z the same UTC date; 2019-03-11 00:30 +05:30 = 19:00Z ALSO the
    // same UTC date — under a UTC server both would be reconciled together on 10 March.
    await prisma.payment.create({ data: { invoice_id: invoice.invoice_id, method: 'Cash', amount: 10, received_by: admin.user_id, received_at: new Date('2019-03-10T23:30:00+05:30') } });
    await prisma.payment.create({ data: { invoice_id: invoice.invoice_id, method: 'Cash', amount: 20, received_by: admin.user_id, received_at: new Date('2019-03-11T00:30:00+05:30') } });

    const day = (d: string) => request(app).get('/api/v1/invoices/reconciliation').query({ date: d }).set('Authorization', `Bearer ${adminToken}`);
    const tenth = await day('2019-03-10');
    const eleventh = await day('2019-03-11');
    expect(tenth.body.totalCollected).toBe(10);
    expect(eleventh.body.totalCollected).toBe(20);
  });
});
