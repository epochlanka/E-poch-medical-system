import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

const makeFinalizedConsultationWithDispensedRx = async (doctorToken: string, doctorId: number, pharmacistToken: string) => {
  const medicine = await prisma.medicine.create({ data: { name: `Billing Test Drug ${runId}-${Math.random()}`, unit: 'tablet', unit_price: 25, is_active: true } });
  const batch = await prisma.batch.create({
    data: { medicine_id: medicine.medicine_id, batch_no: `BILL-${runId}-${Math.random()}`, expiry_date: new Date(Date.now() + 90 * 86400000), qty_on_hand: 50 },
  });

  const family = await prisma.family.create({ data: { family_name: `Billing Test Family ${runId}-${Math.random()}` } });
  const patient = await prisma.patient.create({
    data: {
      patient_id: `PT-BILL-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `BILL-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: 'Billing Test Patient',
      dob: new Date('1990-01-01'),
      gender: 'Male',
    },
  });
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const appointment = await prisma.appointment.create({
    data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const consultRes = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${doctorToken}`).send({ appointment_id: appointment.appointment_id });
  const consultationId = consultRes.body.consultation_id;

  const rxRes = await request(app)
    .post('/api/v1/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ consultation_id: consultationId, items: [{ medicine_id: medicine.medicine_id, dosage: '1 tab', qty: 10 }] });

  await request(app)
    .post(`/api/v1/pharmacy/prescriptions/${rxRes.body.prescription_id}/dispense`)
    .set('Authorization', `Bearer ${pharmacistToken}`)
    .send({ items: [{ rx_item_id: rxRes.body.items[0].rx_item_id, batch_id: batch.batch_id }] });

  return { consultationId, medicineUnitPrice: medicine.unit_price };
};

describe('Billing API', () => {
  let doctorToken: string;
  let doctorId: number;
  let pharmacistToken: string;
  let receptionToken: string;
  let adminToken: string;

  beforeAll(async () => {
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;

    const receptionRes = await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' });
    receptionToken = receptionRes.body.token;

    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/invoices');
    expect(res.status).toBe(401);
  });

  it('rejects invoice creation from a read-only role (Doctor)', async () => {
    const { consultationId } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
    const res = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${doctorToken}`).send({ consultation_id: consultationId });
    expect(res.status).toBe(403);
  });

  let invoiceId: number;

  it('creates a consolidated invoice combining the consultation fee and dispensed items', async () => {
    const { consultationId, medicineUnitPrice } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);

    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ consultation_id: consultationId, consultation_fee: 500 });

    expect(res.status).toBe(201);
    expect(res.body.subtotal).toBe(500 + medicineUnitPrice * 10);
    expect(res.body.total_amount).toBe(500 + medicineUnitPrice * 10);
    expect(res.body.payment_status).toBe('Outstanding');
    expect(res.body.items.some((i: any) => i.item_type === 'ConsultationFee')).toBe(true);
    expect(res.body.items.some((i: any) => i.item_type === 'Medicine')).toBe(true);
    invoiceId = res.body.invoice_id;
  });

  it('rejects creating a second active invoice for the same consultation', async () => {
    const invoice = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${receptionToken}`);
    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ consultation_id: invoice.body.consultation_id });
    expect(res.status).toBe(400);
  });

  it('applies a discount at invoice creation', async () => {
    const { consultationId, medicineUnitPrice } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ consultation_id: consultationId, consultation_fee: 500, discounts: [{ description: 'Senior citizen discount', amount: 100 }] });

    expect(res.status).toBe(201);
    expect(res.body.discount_total).toBe(100);
    expect(res.body.total_amount).toBe(500 + medicineUnitPrice * 10 - 100);
  });

  it('records a split payment (cash + card) and marks the invoice Paid', async () => {
    const invoiceRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${receptionToken}`);
    const total = invoiceRes.body.total_amount;

    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/payments`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ payments: [{ method: 'Cash', amount: 300 }, { method: 'Card', amount: total - 300 }] });

    expect(res.status).toBe(200);
    expect(res.body.paid_amount).toBe(total);
    expect(res.body.payment_status).toBe('Paid');
    expect(res.body.payments).toHaveLength(2);
  });

  it('rejects a payment that would exceed the outstanding balance', async () => {
    const { consultationId } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
    const invoiceRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: consultationId });

    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceRes.body.invoice_id}/payments`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ payments: [{ method: 'Cash', amount: invoiceRes.body.total_amount + 1000 }] });
    expect(res.status).toBe(400);
  });

  it('supports partial settlement, leaving the invoice PartiallyPaid', async () => {
    const { consultationId } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
    const invoiceRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: consultationId });

    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceRes.body.invoice_id}/payments`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ payments: [{ method: 'Mobile', amount: 200 }] });

    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe('PartiallyPaid');
    expect(res.body.paid_amount).toBe(200);
  });

  it('rejects voiding from a non-Admin role', async () => {
    const res = await request(app).post(`/api/v1/invoices/${invoiceId}/void`).set('Authorization', `Bearer ${receptionToken}`).send({ reason: 'Test' });
    expect(res.status).toBe(403);
  });

  it('requires a reason to void an invoice', async () => {
    const res = await request(app).post(`/api/v1/invoices/${invoiceId}/void`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(res.status).toBe(400);
  });

  it('voids an invoice with Admin approval and a documented reason', async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Patient disputed the charge, reissuing corrected invoice' });

    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe('Voided');
    expect(res.body.dispensedItemsNeedingReview).toBe(true);
  });

  it('rejects recording a payment against a voided invoice', async () => {
    const res = await request(app).post(`/api/v1/invoices/${invoiceId}/payments`).set('Authorization', `Bearer ${receptionToken}`).send({ payments: [{ method: 'Cash', amount: 10 }] });
    expect(res.status).toBe(400);
  });

  it('lists invoices with pagination', async () => {
    const res = await request(app).get('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('returns an end-of-day cash reconciliation for today', async () => {
    const res = await request(app).get('/api/v1/invoices/reconciliation').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('totalCollected');
    expect(res.body).toHaveProperty('byMethod');
    expect(res.body.totalCollected).toBeGreaterThan(0);
  });
});
