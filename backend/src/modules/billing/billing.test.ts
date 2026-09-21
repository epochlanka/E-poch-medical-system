import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

const makeFinalizedConsultationWithDispensedRx = async (doctorToken: string, doctorId: number, pharmacistToken: string) => {
  const unitPrice = 25;
  const medicine = await prisma.medicine.create({ data: { name: `Billing Test Drug ${runId}-${Math.random()}`, base_unit: 'Tablet', default_selling_price: unitPrice, is_active: true } });
  // Billing now prices a dispensed line off what the batch actually charged (unit_price snapshotted
  // onto PrescriptionItemDispense at dispense time), not a live Medicine price — set it explicitly here.
  const batch = await prisma.batch.create({
    data: {
      medicine_id: medicine.medicine_id,
      batch_no: `BILL-${runId}-${Math.random()}`,
      expiry_date: new Date(Date.now() + 90 * 86400000),
      qty_on_hand: 50,
      selling_price_per_base_unit: unitPrice,
    },
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

  return { consultationId, medicineUnitPrice: unitPrice };
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

  it('bills an unregistered walk-in directly — no Patient row required', async () => {
    const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
    const appointment = await prisma.appointment.create({
      data: {
        doctor_id: doctorId,
        scheduled_at: new Date(),
        status: 'Consulting',
        created_by: receptionist.user_id,
        is_walk_in: true,
        is_temporary: true,
        temp_patient_name: `Temp Billing Test ${runId}`,
        temp_patient_phone: '0771112222',
      },
    });
    const consultRes = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ appointment_id: appointment.appointment_id });

    const res = await request(app)
      .post('/api/v1/invoices')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ consultation_id: consultRes.body.consultation_id, consultation_fee: 500 });
    expect(res.status).toBe(201);
    expect(res.body.patient.patient_id).toBeNull();
    expect(res.body.patient.full_name).toBe(`Temp Billing Test ${runId}`);
    expect(res.body.patient.phone).toBe('0771112222');

    // Findable by the temp name even though it has no Patient row to match against.
    const searchRes = await request(app)
      .get('/api/v1/invoices')
      .query({ search: `Temp Billing Test ${runId}` })
      .set('Authorization', `Bearer ${receptionToken}`);
    expect(searchRes.body.data.some((i: any) => i.invoice_id === res.body.invoice_id)).toBe(true);

    // Payment can be recorded against it exactly like any other invoice.
    const payRes = await request(app)
      .post(`/api/v1/invoices/${res.body.invoice_id}/payments`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ payments: [{ method: 'Cash', amount: 500 }] });
    expect(payRes.status).toBe(200);
    expect(payRes.body.payment_status).toBe('Paid');

    // Registering the walk-in afterward backfills the invoice onto their new patient record.
    const family = await prisma.family.create({ data: { family_name: `Temp Convert Family ${runId}` } });
    const newPatient = await prisma.patient.create({
      data: {
        patient_id: `PT-TEMPCONV-${runId}`,
        family_id: family.family_id,
        nic: `TEMPCONV-NIC-${runId}`,
        full_name: `Temp Billing Test ${runId}`,
        dob: new Date('1990-01-01'),
        gender: 'Male',
      },
    });
    const convertRes = await request(app)
      .patch(`/api/v1/appointments/${appointment.appointment_id}/convert-to-patient`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ patient_id: newPatient.patient_id });
    expect(convertRes.status).toBe(200);

    const invoiceAfter = await prisma.invoice.findUnique({ where: { invoice_id: res.body.invoice_id } });
    expect(invoiceAfter?.patient_id).toBe(newPatient.patient_id);
  });

  it('an unregistered walk-in with no prescription reaches Payment automatically at finalization (Section 15/16)', async () => {
    const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
    const appointment = await prisma.appointment.create({
      data: {
        doctor_id: doctorId,
        scheduled_at: new Date(),
        status: 'Consulting',
        created_by: receptionist.user_id,
        is_walk_in: true,
        is_temporary: true,
        temp_patient_name: `Walkin No Rx Test ${runId}`,
        temp_patient_phone: '0779998888',
      },
    });
    const consultRes = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ appointment_id: appointment.appointment_id });
    const consultationId = consultRes.body.consultation_id;

    // No prescription at all — doctor just finalizes (Continue Without Registration -> consultation
    // only). The invoice must appear immediately, not stay stuck waiting on pharmacy dispensing.
    const finalizeRes = await request(app)
      .post(`/api/v1/consultations/${consultationId}/finalize`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_fee: 650 });
    expect(finalizeRes.status).toBe(200);

    const invoiceRes = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
    expect(invoiceRes.body.data).toHaveLength(1);
    expect(invoiceRes.body.data[0].total_amount).toBe(650);
    expect(invoiceRes.body.data[0].payment_status).toBe('Outstanding');
    expect(invoiceRes.body.data[0].patient.full_name).toBe(`Walkin No Rx Test ${runId}`);

    // And it's the exact record receptionist-frontend's walk-in search mode finds by name.
    const searchRes = await request(app)
      .get('/api/v1/invoices')
      .query({ search: `Walkin No Rx Test ${runId}`, status: 'Outstanding' })
      .set('Authorization', `Bearer ${receptionToken}`);
    expect(searchRes.body.data.some((i: any) => i.invoice_id === invoiceRes.body.data[0].invoice_id)).toBe(true);
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

  it('filters the invoice list by consultationId', async () => {
    const invoice = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${receptionToken}`);
    const filtered = await request(app)
      .get('/api/v1/invoices')
      .query({ consultationId: invoice.body.consultation_id })
      .set('Authorization', `Bearer ${receptionToken}`);
    expect(filtered.status).toBe(200);
    expect(filtered.body.data.every((i: any) => i.consultation_id === invoice.body.consultation_id)).toBe(true);
    expect(filtered.body.data.some((i: any) => i.invoice_id === invoiceId)).toBe(true);
  });

  it('derives a Consultation+Pharmacy type from the invoice line items', async () => {
    const res = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${receptionToken}`);
    expect(res.body.type).toBe('Consultation+Pharmacy');

    const listRes = await request(app).get('/api/v1/invoices').query({ consultationId: res.body.consultation_id }).set('Authorization', `Bearer ${receptionToken}`);
    expect(listRes.body.data.find((i: any) => i.invoice_id === invoiceId).type).toBe('Consultation+Pharmacy');
  });

  it('filters by the derived Consultation+Pharmacy type, paginating in memory', async () => {
    const res = await request(app).get('/api/v1/invoices').query({ type: 'Consultation+Pharmacy', limit: 100 }).set('Authorization', `Bearer ${receptionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.every((i: any) => i.type === 'Consultation+Pharmacy')).toBe(true);
    expect(res.body.data.some((i: any) => i.invoice_id === invoiceId)).toBe(true);
  });

  it('searches invoices by patient name', async () => {
    const invoice = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${receptionToken}`);
    const res = await request(app)
      .get('/api/v1/invoices')
      .query({ search: invoice.body.patient.full_name })
      .set('Authorization', `Bearer ${receptionToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((i: any) => i.invoice_id === invoiceId)).toBe(true);
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

  it('rejects voiding a paid invoice without refund lines', async () => {
    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Missing refund info' });
    expect(res.status).toBe(400);
  });

  it('voids a paid invoice with Admin approval, a documented reason, and refund lines', async () => {
    const invoiceRes = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${receptionToken}`);
    const paidAmount = invoiceRes.body.paid_amount;

    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceId}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        reason: 'Patient disputed the charge, reissuing corrected invoice',
        refunds: [{ method: 'Cash', amount: paidAmount }],
      });

    expect(res.status).toBe(200);
    expect(res.body.payment_status).toBe('Voided');
    expect(res.body.dispensedItemsNeedingReview).toBe(true);

    const refetched = await request(app).get(`/api/v1/invoices/${invoiceId}`).set('Authorization', `Bearer ${receptionToken}`);
    expect(refetched.body.refunds).toHaveLength(1);
    expect(refetched.body.refunds[0].amount).toBe(paidAmount);
  });

  it('rejects a refund total that exceeds what was actually paid', async () => {
    const { consultationId } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
    const invoiceRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: consultationId });
    await request(app)
      .post(`/api/v1/invoices/${invoiceRes.body.invoice_id}/payments`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ payments: [{ method: 'Cash', amount: 100 }] });

    const res = await request(app)
      .post(`/api/v1/invoices/${invoiceRes.body.invoice_id}/void`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ reason: 'Over-refund attempt', refunds: [{ method: 'Cash', amount: 100000 }] });
    expect(res.status).toBe(400);
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

  describe('GET /invoices/stats', () => {
    it('returns mutually-exclusive Paid/Unpaid/Overdue counts plus this-month revenue', async () => {
      const res = await request(app).get('/api/v1/invoices/stats').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalInvoices).toBeGreaterThan(0);
      // the invoice created+paid earlier in this suite (before being voided) contributed to
      // both paidInvoices (at the time) and totalRevenueThisMonth (payments are never undone).
      expect(res.body).toHaveProperty('paidInvoices');
      expect(res.body).toHaveProperty('unpaidInvoices');
      expect(res.body).toHaveProperty('overdueInvoices');
      expect(res.body.totalRevenueThisMonth).toBeGreaterThan(0);
    });
  });

  describe('GET /invoices/payments (flat payments ledger)', () => {
    let paymentPatientName: string;
    let paymentInvoiceId: number;

    beforeAll(async () => {
      const { consultationId } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
      const invoiceRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: consultationId });
      paymentInvoiceId = invoiceRes.body.invoice_id;
      paymentPatientName = invoiceRes.body.patient.full_name;

      await request(app)
        .post(`/api/v1/invoices/${paymentInvoiceId}/payments`)
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ payments: [{ method: 'Mobile', amount: 50 }] });
    });

    it('rejects a non-read role', async () => {
      const res = await request(app).get('/api/v1/invoices/payments');
      expect(res.status).toBe(401);
    });

    it('lists payments with the paying invoice status attached, not a fabricated per-payment status', async () => {
      const res = await request(app).get('/api/v1/invoices/payments').set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.pagination).toBeDefined();
      const row = res.body.data.find((p: any) => p.invoiceId === paymentInvoiceId);
      expect(row).toBeDefined();
      expect(row.method).toBe('Mobile');
      expect(row.amount).toBe(50);
      expect(['Outstanding', 'PartiallyPaid', 'Paid']).toContain(row.invoiceStatus);
    });

    it('searches payments by patient name', async () => {
      const res = await request(app).get('/api/v1/invoices/payments').query({ search: paymentPatientName }).set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((p: any) => p.invoiceId === paymentInvoiceId)).toBe(true);
    });

    it('filters payments by method', async () => {
      const res = await request(app).get('/api/v1/invoices/payments').query({ method: 'Mobile' }).set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((p: any) => p.method === 'Mobile')).toBe(true);
    });

    it('filters payments by the paying invoice status', async () => {
      const res = await request(app).get('/api/v1/invoices/payments').query({ invoiceStatus: 'PartiallyPaid' }).set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((p: any) => p.invoiceStatus === 'PartiallyPaid')).toBe(true);
    });

    it('returns no rows for a method filter that matches nothing (not a hardcoded enum, so an unknown value just filters to empty)', async () => {
      const res = await request(app).get('/api/v1/invoices/payments').query({ method: 'Bitcoin' }).set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(0);
    });
  });

  describe('GET /invoices/payments/stats', () => {
    it('returns cumulative totals plus a by-method and by-invoice-status breakdown', async () => {
      const res = await request(app).get('/api/v1/invoices/payments/stats').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalPayments).toBeGreaterThan(0);
      expect(res.body.totalReceived).toBeGreaterThan(0);
      expect(Array.isArray(res.body.byMethod)).toBe(true);
      expect(Array.isArray(res.body.byInvoiceStatus)).toBe(true);
      expect(res.body).toHaveProperty('outstandingInvoices');
      expect(res.body).toHaveProperty('voidedInvoices');
    });

    it('includes today/this-week/this-month totals with counts and prior-period totals for the receptionist Payments page KPI row', async () => {
      const res = await request(app).get('/api/v1/invoices/payments/stats').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.today).toHaveProperty('total');
      expect(res.body.today).toHaveProperty('count');
      expect(res.body.thisWeek).toHaveProperty('total');
      expect(res.body.thisMonth).toHaveProperty('total');
      expect(typeof res.body.yesterdayTotal).toBe('number');
      expect(typeof res.body.lastWeekTotal).toBe('number');
      expect(typeof res.body.lastMonthTotal).toBe('number');
      expect(typeof res.body.outstandingAmount).toBe('number');
    });

    it('rejects an invalid range', async () => {
      const res = await request(app).get('/api/v1/invoices/payments/stats').query({ range: 'decade' }).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Automatic billing on visit completion', () => {
    it('bills consultation fee + dispensed medicine automatically once the consultation is finalized (dispensing already done)', async () => {
      const { consultationId, medicineUnitPrice } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);

      const finalizeRes = await request(app).post(`/api/v1/consultations/${consultationId}/finalize`).set('Authorization', `Bearer ${doctorToken}`);
      expect(finalizeRes.status).toBe(200);

      const listRes = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
      expect(listRes.body.data).toHaveLength(1);
      const invoice = listRes.body.data[0];
      expect(invoice.created_via).toBe('Auto');
      expect(invoice.total_amount).toBe(500 + medicineUnitPrice * 10);
    });

    it('creates the invoice immediately at finalization, then tops it up as dispensing happens', async () => {
      const medicine = await prisma.medicine.create({ data: { name: `Auto Bill Drug ${runId}-${Math.random()}`, base_unit: 'Tablet', default_selling_price: 40, is_active: true } });
      const batch = await prisma.batch.create({
        data: {
          medicine_id: medicine.medicine_id,
          batch_no: `AUTO-${runId}-${Math.random()}`,
          expiry_date: new Date(Date.now() + 90 * 86400000),
          qty_on_hand: 50,
          selling_price_per_base_unit: 40,
        },
      });
      const family = await prisma.family.create({ data: { family_name: `Auto Bill Family ${runId}-${Math.random()}` } });
      const patient = await prisma.patient.create({
        data: {
          patient_id: `PT-AUTO-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          family_id: family.family_id,
          nic: `AUTO-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          full_name: 'Auto Bill Test Patient',
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
        .send({ consultation_id: consultationId, items: [{ medicine_id: medicine.medicine_id, dosage: '1 tab', qty: 5 }] });

      // Doctor finalizes before the pharmacist dispenses — this is the common real-world order.
      const finalizeRes = await request(app).post(`/api/v1/consultations/${consultationId}/finalize`).set('Authorization', `Bearer ${doctorToken}`);
      expect(finalizeRes.status).toBe(200);

      // Invoice exists the moment the visit is finalized — consultation fee only, nothing
      // dispensed yet — so an unregistered walk-in with no prescription can reach Payment right
      // away too (Section 3/15), not just once every prescription line is fully dispensed.
      const beforeDispense = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
      expect(beforeDispense.body.data).toHaveLength(1);
      expect(beforeDispense.body.data[0].created_via).toBe('Auto');
      expect(beforeDispense.body.data[0].total_amount).toBe(500);
      const invoiceId = beforeDispense.body.data[0].invoice_id;

      await request(app)
        .post(`/api/v1/pharmacy/prescriptions/${rxRes.body.prescription_id}/dispense`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ items: [{ rx_item_id: rxRes.body.items[0].rx_item_id, batch_id: batch.batch_id }] });

      // Same invoice, topped up — not a second one.
      const afterDispense = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
      expect(afterDispense.body.data).toHaveLength(1);
      expect(afterDispense.body.data[0].invoice_id).toBe(invoiceId);
      expect(afterDispense.body.data[0].total_amount).toBe(500 + 40 * 5);
    });

    it("uses the doctor's per-consultation fee override, and it never carries over to the next consultation", async () => {
      const family = await prisma.family.create({ data: { family_name: `Fee Test Family ${runId}-${Math.random()}` } });
      const patient = await prisma.patient.create({
        data: {
          patient_id: `PT-FEE-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          family_id: family.family_id,
          nic: `FEE-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          full_name: 'Fee Override Test Patient',
          dob: new Date('1990-01-01'),
          gender: 'Male',
        },
      });
      const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });

      const makeAndFinalize = async (fee?: number) => {
        const appointment = await prisma.appointment.create({
          data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
        });
        const consultRes = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${doctorToken}`).send({ appointment_id: appointment.appointment_id });
        const consultationId = consultRes.body.consultation_id;
        const finalizeRes = await request(app)
          .post(`/api/v1/consultations/${consultationId}/finalize`)
          .set('Authorization', `Bearer ${doctorToken}`)
          .send(fee !== undefined ? { consultation_fee: fee } : {});
        expect(finalizeRes.status).toBe(200);
        const invoiceRes = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
        return invoiceRes.body.data[0];
      };

      const settingsRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${adminToken}`);
      const adminDefault = settingsRes.body.default_consultation_fee;

      // Doctor enters a fee for this visit only.
      const invoiceWithOverride = await makeAndFinalize(700);
      expect(invoiceWithOverride.total_amount).toBe(700);

      // Next consultation, doctor leaves it empty — falls back to the admin default, not the 700
      // just used above (never a permanent per-doctor fee).
      const invoiceWithoutOverride = await makeAndFinalize(undefined);
      expect(invoiceWithoutOverride.total_amount).toBe(adminDefault);

      // A different explicit override for a third visit doesn't touch the first invoice's frozen fee.
      await makeAndFinalize(600);
      const stillFrozen = await request(app).get(`/api/v1/invoices/${invoiceWithOverride.invoice_id}`).set('Authorization', `Bearer ${receptionToken}`);
      expect(stillFrozen.body.total_amount).toBe(700);
    });

    it('splits a dispense across two batches into two batch-specific invoice lines with independent cost/profit', async () => {
      const medicine = await prisma.medicine.create({
        data: { name: `Split Batch Drug ${runId}-${Math.random()}`, base_unit: 'Tablet', default_selling_price: 5, is_active: true },
      });
      // B001: earliest expiry, only 1 tablet left. B002: later expiry, plenty of stock. FEFO must
      // draw B001 first and only spill into B002 for what B001 can't cover (Section 6, TEST 7).
      const batch1 = await prisma.batch.create({
        data: {
          medicine_id: medicine.medicine_id,
          batch_no: `SPLIT-B001-${runId}`,
          expiry_date: new Date(Date.now() + 30 * 86400000),
          qty_on_hand: 1,
          cost_per_base_unit: 3,
          selling_price_per_base_unit: 4.5,
        },
      });
      const batch2 = await prisma.batch.create({
        data: {
          medicine_id: medicine.medicine_id,
          batch_no: `SPLIT-B002-${runId}`,
          expiry_date: new Date(Date.now() + 90 * 86400000),
          qty_on_hand: 200,
          cost_per_base_unit: 3.5,
          selling_price_per_base_unit: 5,
        },
      });
      const family = await prisma.family.create({ data: { family_name: `Split Batch Family ${runId}-${Math.random()}` } });
      const patient = await prisma.patient.create({
        data: {
          patient_id: `PT-SPLIT-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          family_id: family.family_id,
          nic: `SPLIT-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          full_name: 'Split Batch Test Patient',
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
        .send({ consultation_id: consultationId, items: [{ medicine_id: medicine.medicine_id, dosage: '1 tab', qty: 2 }] });
      await request(app).post(`/api/v1/consultations/${consultationId}/finalize`).set('Authorization', `Bearer ${doctorToken}`);

      // 1 tablet from B001 (all it has), 1 tablet from B002 — two separate dispense calls, same
      // as a pharmacist drawing from the earliest-expiry batch until it runs dry.
      await request(app)
        .post(`/api/v1/pharmacy/prescriptions/${rxRes.body.prescription_id}/dispense`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ items: [{ rx_item_id: rxRes.body.items[0].rx_item_id, batch_id: batch1.batch_id, qty: 1 }] });
      await request(app)
        .post(`/api/v1/pharmacy/prescriptions/${rxRes.body.prescription_id}/dispense`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ items: [{ rx_item_id: rxRes.body.items[0].rx_item_id, batch_id: batch2.batch_id, qty: 1 }] });

      const invoiceRes = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
      const invoice = invoiceRes.body.data[0];
      const medicineLines = invoice.items.filter((i: any) => i.item_type === 'Medicine');

      expect(medicineLines).toHaveLength(2);
      const line1 = medicineLines.find((l: any) => l.batch_id === batch1.batch_id);
      const line2 = medicineLines.find((l: any) => l.batch_id === batch2.batch_id);
      expect(line1.qty).toBe(1);
      expect(line1.unit_price).toBe(4.5);
      expect(line1.purchase_cost).toBe(3);
      expect(line1.profit).toBe(1.5);
      expect(line2.qty).toBe(1);
      expect(line2.unit_price).toBe(5);
      expect(line2.purchase_cost).toBe(3.5);
      expect(line2.profit).toBe(1.5);
      expect(invoice.total_amount).toBe(500 + 4.5 + 5);
    });

    it('never charges a fully external-purchase prescription line', async () => {
      const medicine = await prisma.medicine.create({
        data: { name: `External Only Drug ${runId}-${Math.random()}`, base_unit: 'Tablet', default_selling_price: 999, is_active: true },
      });
      const family = await prisma.family.create({ data: { family_name: `External Family ${runId}-${Math.random()}` } });
      const patient = await prisma.patient.create({
        data: {
          patient_id: `PT-EXT-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          family_id: family.family_id,
          nic: `EXT-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
          full_name: 'External Only Test Patient',
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
      // Fully external — the patient buys the whole quantity outside the clinic, so the clinic
      // must never charge for it even though the line still reaches "dispensed" (Section 17/32).
      const rxRes = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId, items: [{ medicine_id: medicine.medicine_id, dosage: '1 tab', qty: 5, external_qty: 5 }] });
      await request(app).post(`/api/v1/consultations/${consultationId}/finalize`).set('Authorization', `Bearer ${doctorToken}`);

      await request(app)
        .post(`/api/v1/pharmacy/prescriptions/${rxRes.body.prescription_id}/dispense`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ items: [{ rx_item_id: rxRes.body.items[0].rx_item_id }] });

      const invoiceRes = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
      const invoice = invoiceRes.body.data[0];
      expect(invoice.items.filter((i: any) => i.item_type === 'Medicine')).toHaveLength(0);
      expect(invoice.total_amount).toBe(500);
    });

    it('does not auto-bill a still-Draft consultation, and manual creation remains available as a fallback', async () => {
      const { consultationId, medicineUnitPrice } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
      // Never finalized — the dispense above already ran ensureInvoiceForConsultation and found it not Finalized yet.
      const before = await request(app).get('/api/v1/invoices').query({ consultationId }).set('Authorization', `Bearer ${receptionToken}`);
      expect(before.body.data).toHaveLength(0);

      const manual = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: consultationId });
      expect(manual.status).toBe(201);
      expect(manual.body.created_via).toBe('Manual');
      expect(manual.body.total_amount).toBe(500 + medicineUnitPrice * 10);
    });
  });

  describe('Payment method validation & idempotency', () => {
    it('rejects a payment method that is not an active PaymentMethod master-data entry', async () => {
      const { consultationId } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
      const invoiceRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: consultationId });

      const res = await request(app)
        .post(`/api/v1/invoices/${invoiceRes.body.invoice_id}/payments`)
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ payments: [{ method: 'Bitcoin', amount: 100 }] });
      expect(res.status).toBe(400);
    });

    it('replays an idempotent payment submission without double-charging', async () => {
      const { consultationId } = await makeFinalizedConsultationWithDispensedRx(doctorToken, doctorId, pharmacistToken);
      const invoiceRes = await request(app).post('/api/v1/invoices').set('Authorization', `Bearer ${receptionToken}`).send({ consultation_id: consultationId });
      const idempotencyKey = `idem-${runId}-${Math.random()}`;

      const first = await request(app)
        .post(`/api/v1/invoices/${invoiceRes.body.invoice_id}/payments`)
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ payments: [{ method: 'Cash', amount: 100, idempotency_key: idempotencyKey }] });
      expect(first.status).toBe(200);
      expect(first.body.paid_amount).toBe(100);

      const replay = await request(app)
        .post(`/api/v1/invoices/${invoiceRes.body.invoice_id}/payments`)
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ payments: [{ method: 'Cash', amount: 100, idempotency_key: idempotencyKey }] });
      expect(replay.status).toBe(200);
      expect(replay.body.paid_amount).toBe(100);
      expect(replay.body.payments).toHaveLength(1);
    });
  });
});
