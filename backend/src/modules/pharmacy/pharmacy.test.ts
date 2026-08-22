import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

const makePrescription = async (
  doctorToken: string,
  doctorId: number,
  items: { medicine_id: number; dosage: string; qty: number; external_qty?: number }[]
) => {
  const family = await prisma.family.create({ data: { family_name: `Pharmacy Test Family ${runId}-${Math.random()}` } });
  const patient = await prisma.patient.create({
    data: {
      patient_id: `PT-PHARM-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `PHARM-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: 'Pharmacy Test Patient',
      dob: new Date('1990-01-01'),
      gender: 'Male',
    },
  });
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const appointment = await prisma.appointment.create({
    data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const consultRes = await request(app)
    .post('/api/v1/consultations')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ appointment_id: appointment.appointment_id });
  const rxRes = await request(app)
    .post('/api/v1/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ consultation_id: consultRes.body.consultation_id, items });
  return rxRes.body;
};

describe('Pharmacy API', () => {
  let doctorToken: string;
  let doctorId: number;
  let pharmacistToken: string;
  let pharmacistId: number;
  let receptionToken: string;

  // Dedicated medicine + two batches (near-expiry and far-expiry) so FEFO has a real choice.
  let medicineId: number;
  let earlyBatchId: number;
  let lateBatchId: number;

  beforeAll(async () => {
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;
    pharmacistId = pharmacistRes.body.user.id;

    const receptionRes = await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' });
    receptionToken = receptionRes.body.token;

    const medicine = await prisma.medicine.create({ data: { name: `FEFO Test Drug ${runId}`, unit: 'tablet', is_active: true } });
    medicineId = medicine.medicine_id;

    const earlyExpiry = new Date();
    earlyExpiry.setDate(earlyExpiry.getDate() + 20);
    const early = await prisma.batch.create({
      data: { medicine_id: medicineId, batch_no: `EARLY-${runId}`, expiry_date: earlyExpiry, qty_on_hand: 100 },
    });
    earlyBatchId = early.batch_id;

    const lateExpiry = new Date();
    lateExpiry.setDate(lateExpiry.getDate() + 200);
    const late = await prisma.batch.create({
      data: { medicine_id: medicineId, batch_no: `LATE-${runId}`, expiry_date: lateExpiry, qty_on_hand: 100 },
    });
    lateBatchId = late.batch_id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/pharmacy/queue');
    expect(res.status).toBe(401);
  });

  it('rejects dispensing from a non-pharmacy role (Receptionist)', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 5 }]);
    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: earlyBatchId }] });
    expect(res.status).toBe(403);
  });

  it('suggests the earliest-expiry batch first (FEFO)', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 5 }]);
    const res = await request(app)
      .get(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/batch-suggestions`)
      .set('Authorization', `Bearer ${pharmacistToken}`);

    expect(res.status).toBe(200);
    expect(res.body[0].suggestedBatchId).toBe(earlyBatchId);
    expect(res.body[0].batches[0].batchId).toBe(earlyBatchId);
  });

  it('dispenses against the FEFO batch without needing an override reason', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 5 }]);
    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: earlyBatchId }] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Dispensed');
    expect(res.body.items[0].batch_id).toBe(earlyBatchId);
    expect(res.body.items[0].dispensed_by).toBe(pharmacistId);
    expect(res.body.items[0].fefo_override_reason).toBeNull();

    const batch = await prisma.batch.findUnique({ where: { batch_id: earlyBatchId } });
    expect(batch?.qty_on_hand).toBe(95);
  });

  it('requires an override reason to dispense a non-FEFO batch', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 5 }]);

    const blockedRes = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: lateBatchId }] });
    expect(blockedRes.status).toBe(400);

    const overrideRes = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: lateBatchId, override_reason: 'Earlier batch was damaged on inspection' }] });
    expect(overrideRes.status).toBe(200);
    expect(overrideRes.body.items[0].fefo_override_reason).toBe('Earlier batch was damaged on inspection');
  });

  it('re-validates stock at confirm-time and rejects an over-quantity batch', async () => {
    const smallMedicine = await prisma.medicine.create({ data: { name: `Small Stock Drug ${runId}`, unit: 'tablet', is_active: true } });
    const smallBatch = await prisma.batch.create({
      data: { medicine_id: smallMedicine.medicine_id, batch_no: `SMALL-${runId}`, expiry_date: new Date(Date.now() + 30 * 86400000), qty_on_hand: 2 },
    });
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: smallMedicine.medicine_id, dosage: '1 tab', qty: 10 }]);

    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: smallBatch.batch_id }] });

    expect(res.status).toBe(400);
  });

  it('supports partial dispense — only the selected lines advance', async () => {
    const secondMedicine = await prisma.medicine.create({ data: { name: `Second Drug ${runId}`, unit: 'tablet', is_active: true } });
    const secondBatch = await prisma.batch.create({
      data: { medicine_id: secondMedicine.medicine_id, batch_no: `SECOND-${runId}`, expiry_date: new Date(Date.now() + 60 * 86400000), qty_on_hand: 50 },
    });

    const rx = await makePrescription(doctorToken, doctorId, [
      { medicine_id: medicineId, dosage: '1 tab', qty: 5 },
      { medicine_id: secondMedicine.medicine_id, dosage: '1 tab', qty: 5 },
    ]);

    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: earlyBatchId }] });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Preparing');
    const dispensedItem = res.body.items.find((i: any) => i.rx_item_id === rx.items[0].rx_item_id);
    const pendingItem = res.body.items.find((i: any) => i.rx_item_id === rx.items[1].rx_item_id);
    expect(dispensedItem.batch_id).toBe(earlyBatchId);
    expect(pendingItem.batch_id).toBeNull();

    // Now dispense the remaining line — should complete the prescription.
    const finishRes = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[1].rx_item_id, batch_id: secondBatch.batch_id }] });
    expect(finishRes.status).toBe(200);
    expect(finishRes.body.status).toBe('Dispensed');
  });

  it('rejects dispensing the same line twice', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 1 }]);
    await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: earlyBatchId }] });

    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: earlyBatchId }] });
    expect(res.status).toBe(400);
  });

  let collectRxId: number;

  it('marks a Dispensed prescription as Collected, but not before', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 1 }]);
    collectRxId = rx.prescription_id;

    const tooEarly = await request(app).post(`/api/v1/pharmacy/prescriptions/${collectRxId}/collect`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(tooEarly.status).toBe(400);

    await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${collectRxId}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: earlyBatchId }] });

    const res = await request(app).post(`/api/v1/pharmacy/prescriptions/${collectRxId}/collect`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Collected');
  });

  it('returns the queue grouped by status', async () => {
    const res = await request(app).get('/api/v1/pharmacy/queue').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    const collectedRx = res.body.Collected.find((rx: any) => rx.prescriptionId === collectRxId);
    expect(collectedRx).toBeTruthy();
    expect(collectedRx.doctorName).toBeTruthy();
    expect(typeof collectedRx.lastActivityAt).toBe('string');
  });

  it('dispenses a fully external-purchase item without touching stock, and excludes it from batch suggestions', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 3, external_qty: 3 }]);

    const suggestions = await request(app)
      .get(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/batch-suggestions`)
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(suggestions.body).toEqual([]);

    const before = await prisma.batch.findUnique({ where: { batch_id: earlyBatchId } });

    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id }] });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Dispensed');
    expect(res.body.items[0].batch_id).toBeNull();
    expect(res.body.items[0].dispensed_at).toBeTruthy();

    const after = await prisma.batch.findUnique({ where: { batch_id: earlyBatchId } });
    expect(after!.qty_on_hand).toBe(before!.qty_on_hand);
  });

  it('rejects a partially/non-external item dispensed without a batch_id', async () => {
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 3, external_qty: 1 }]);
    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id }] });
    expect(res.status).toBe(400);
  });

  it('prints a dispensing label as a PDF', async () => {
    const res = await request(app).get(`/api/v1/pharmacy/prescriptions/${collectRxId}/label`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('rejects dispensing with an unconfigured substitution', async () => {
    const unrelated = await prisma.medicine.create({ data: { name: `Unrelated Drug ${runId}`, unit: 'tablet', is_active: true } });
    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 1 }]);

    const res = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: earlyBatchId, substitute_medicine_id: unrelated.medicine_id }] });
    expect(res.status).toBe(400);
  });

  it('creates a substitution rule and allows dispensing with the configured alternative', async () => {
    const altMedicine = await prisma.medicine.create({ data: { name: `Alt Drug ${runId}`, unit: 'tablet', is_active: true } });
    const altBatch = await prisma.batch.create({
      data: { medicine_id: altMedicine.medicine_id, batch_no: `ALT-${runId}`, expiry_date: new Date(Date.now() + 60 * 86400000), qty_on_hand: 20 },
    });

    const createRes = await request(app)
      .post('/api/v1/pharmacy/substitutions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ medicine_id: medicineId, substitute_medicine_id: altMedicine.medicine_id });
    expect(createRes.status).toBe(201);

    const listRes = await request(app)
      .get('/api/v1/pharmacy/substitutions')
      .query({ medicineId })
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(listRes.body.some((r: any) => r.substituteMedicineId === altMedicine.medicine_id)).toBe(true);

    const rx = await makePrescription(doctorToken, doctorId, [{ medicine_id: medicineId, dosage: '1 tab', qty: 1 }]);
    const dispenseRes = await request(app)
      .post(`/api/v1/pharmacy/prescriptions/${rx.prescription_id}/dispense`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ rx_item_id: rx.items[0].rx_item_id, batch_id: altBatch.batch_id, substitute_medicine_id: altMedicine.medicine_id }] });

    expect(dispenseRes.status).toBe(200);
    expect(dispenseRes.body.items[0].substituted_medicine_id).toBe(altMedicine.medicine_id);
  });

  it('rejects creating a duplicate substitution pair, supports priority/type, and can update/deactivate a rule', async () => {
    const altMedicine = await prisma.medicine.create({ data: { name: `Rule Test Alt ${runId}`, unit: 'tablet', is_active: true } });

    const createRes = await request(app)
      .post('/api/v1/pharmacy/substitutions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ medicine_id: medicineId, substitute_medicine_id: altMedicine.medicine_id, priority: 2, type: 'Auto' });
    expect(createRes.status).toBe(201);
    expect(createRes.body.priority).toBe(2);
    expect(createRes.body.type).toBe('Auto');

    const dupRes = await request(app)
      .post('/api/v1/pharmacy/substitutions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ medicine_id: medicineId, substitute_medicine_id: altMedicine.medicine_id });
    expect(dupRes.status).toBe(400);

    const substitutionId = createRes.body.substitution_id;

    const updateRes = await request(app)
      .patch(`/api/v1/pharmacy/substitutions/${substitutionId}`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ is_active: false, priority: 3 });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.is_active).toBe(false);
    expect(updateRes.body.priority).toBe(3);

    const activeListRes = await request(app)
      .get('/api/v1/pharmacy/substitutions')
      .query({ medicineId })
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(activeListRes.body.some((r: any) => r.substitutionId === substitutionId)).toBe(false);

    const inactiveListRes = await request(app)
      .get('/api/v1/pharmacy/substitutions')
      .query({ medicineId, status: 'inactive' })
      .set('Authorization', `Bearer ${pharmacistToken}`);
    const found = inactiveListRes.body.find((r: any) => r.substitutionId === substitutionId);
    expect(found).toBeTruthy();
    expect(found.priority).toBe(3);
    expect(found.type).toBe('Auto');
  });

  it('returns substitution rule stats', async () => {
    const res = await request(app).get('/api/v1/pharmacy/substitutions/stats').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(typeof res.body.total).toBe('number');
    expect(res.body.total).toBe(res.body.active + res.body.inactive);
    expect(res.body.total).toBe(res.body.autoCount + res.body.manualCount);
  });
});
