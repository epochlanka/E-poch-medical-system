import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

const makePatient = async (opts: { allergies?: string } = {}) => {
  const family = await prisma.family.create({ data: { family_name: `Rx Test Family ${runId}-${Math.random()}` } });
  return prisma.patient.create({
    data: {
      patient_id: `PT-RX-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `RX-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: 'Prescription Test Patient',
      dob: new Date('1990-01-01'),
      gender: 'Male',
      allergies: opts.allergies,
    },
  });
};

// A fresh Consulting-status appointment + Draft consultation for a given (possibly pre-existing)
// patient — reuse the same patientId across calls to simulate a return visit for the same patient.
const makeDraftConsultationForPatient = async (doctorToken: string, doctorId: number, patientId: string) => {
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const appointment = await prisma.appointment.create({
    data: { patient_id: patientId, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const consultRes = await request(app)
    .post('/api/v1/consultations')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ appointment_id: appointment.appointment_id });
  return { consultationId: consultRes.body.consultation_id };
};

const makeDraftConsultation = async (doctorToken: string, doctorId: number, opts: { allergies?: string } = {}) => {
  const patient = await makePatient(opts);
  const { consultationId } = await makeDraftConsultationForPatient(doctorToken, doctorId, patient.patient_id);
  return { consultationId, patient };
};

describe('Prescriptions API', () => {
  let doctorToken: string;
  let doctorId: number;
  let pharmacistToken: string;

  beforeAll(async () => {
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/prescriptions');
    expect(res.status).toBe(401);
  });

  it('rejects prescription creation from a read-only role (Pharmacist)', async () => {
    const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
    const res = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ consultation_id: consultationId, items: [{ medicine_id: 1, dosage: '1 tab', qty: 5 }] });
    expect(res.status).toBe(403);
  });

  let prescriptionId: number;

  it('creates a prescription and flags live stock status per line', async () => {
    const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
    const res = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        consultation_id: consultationId,
        items: [
          { medicine_id: 1, dosage: '1 tablet', frequency: 'Twice daily', duration: '5 days', route: 'Oral', qty: 10 },
        ],
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
    expect(res.body.items[0].stockStatus).toBeDefined();
    prescriptionId = res.body.prescription_id;
  });

  it('automatically routes the new prescription into the Pending pharmacy queue', async () => {
    const res = await request(app).get('/api/v1/pharmacy/queue').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.Pending.some((rx: any) => rx.prescriptionId === prescriptionId)).toBe(true);
  });

  it('blocks prescribing a discontinued medicine', async () => {
    const discontinued = await prisma.medicine.create({
      data: { name: `Discontinued Drug ${runId}`, unit: 'tablet', is_active: false },
    });
    const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);

    const res = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: consultationId, items: [{ medicine_id: discontinued.medicine_id, dosage: '1 tab', qty: 1 }] });

    expect(res.status).toBe(400);
  });

  it('blocks an allergy-conflicting prescription until acknowledged', async () => {
    const { consultationId } = await makeDraftConsultation(doctorToken, doctorId, { allergies: 'Amoxicillin (penicillin-class)' });

    const blockedRes = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: consultationId, items: [{ medicine_id: 2, dosage: '1 capsule', qty: 10 }] });
    expect(blockedRes.status).toBe(409);
    expect(blockedRes.body.conflicts).toContain('Amoxicillin 250mg');

    const ackRes = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: consultationId, items: [{ medicine_id: 2, dosage: '1 capsule', qty: 10 }], allergyAck: true });
    expect(ackRes.status).toBe(201);

    const consultation = await prisma.consultation.findUnique({ where: { consultation_id: consultationId } });
    expect(consultation?.allergies_ack).toBe(true);
  });

  let originalRxId: number;
  let refillMedicineId: number;
  let refillPatientId: string;

  it('creates a refill that auto-copies items from the original prescription', async () => {
    const refillMedicine = await prisma.medicine.create({ data: { name: `Refillable Drug ${runId}`, unit: 'tablet', is_active: true } });
    refillMedicineId = refillMedicine.medicine_id;

    const patient = await makePatient();
    refillPatientId = patient.patient_id;

    const { consultationId } = await makeDraftConsultationForPatient(doctorToken, doctorId, refillPatientId);
    const originalRes = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: consultationId, items: [{ medicine_id: refillMedicineId, dosage: '1 tab', qty: 30 }] });
    originalRxId = originalRes.body.prescription_id;

    // Same patient, a later visit — the point of a refill is continuity of care for one person.
    const { consultationId: refillConsultationId } = await makeDraftConsultationForPatient(doctorToken, doctorId, refillPatientId);
    const refillRes = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: refillConsultationId, refill_of_prescription_id: originalRxId });

    expect(refillRes.status).toBe(201);
    expect(refillRes.body.is_refill).toBe(true);
    expect(refillRes.body.items[0].medicine_id).toBe(refillMedicineId);
  });

  it('blocks a refill once the medicine has since been discontinued', async () => {
    await prisma.medicine.update({ where: { medicine_id: refillMedicineId }, data: { is_active: false } });

    const { consultationId } = await makeDraftConsultationForPatient(doctorToken, doctorId, refillPatientId);
    const res = await request(app)
      .post('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: consultationId, refill_of_prescription_id: originalRxId });

    expect(res.status).toBe(400);
  });

  it('returns a prescription by id with full item detail', async () => {
    const res = await request(app).get(`/api/v1/prescriptions/${prescriptionId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.prescription_id).toBe(prescriptionId);
  });

  it('exports the prescription as a PDF', async () => {
    const res = await request(app).get(`/api/v1/prescriptions/${prescriptionId}/pdf`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('lists prescriptions', async () => {
    const res = await request(app).get('/api/v1/prescriptions').set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  it('includes consultationType on each listed prescription and can filter by it', async () => {
    const allRes = await request(app).get('/api/v1/prescriptions').set('Authorization', `Bearer ${doctorToken}`).query({ limit: 1 });
    expect(allRes.status).toBe(200);
    expect(allRes.body.data[0]).toHaveProperty('consultationType');

    const filteredRes = await request(app)
      .get('/api/v1/prescriptions')
      .set('Authorization', `Bearer ${doctorToken}`)
      .query({ consultationType: 'General Consultation', limit: 5 });
    expect(filteredRes.status).toBe(200);
    expect(filteredRes.body.data.every((rx: any) => rx.consultationType === 'General Consultation')).toBe(true);
  });

  describe('Prescription Builder Context (GET /prescriptions/context/:consultationId)', () => {
    it('returns patient/allergy context and past prescriptions for the New Prescription page', async () => {
      const patient = await makePatient({ allergies: 'Penicillin' });
      const first = await makeDraftConsultationForPatient(doctorToken, doctorId, patient.patient_id);
      await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: first.consultationId, items: [{ medicine_id: 3, dosage: '1 tablet', qty: 5 }] });

      const second = await makeDraftConsultationForPatient(doctorToken, doctorId, patient.patient_id);
      const res = await request(app)
        .get(`/api/v1/prescriptions/context/${second.consultationId}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.appointment.patient.patient_id).toBe(patient.patient_id);
      expect(res.body.patientSummary.allergies).toBe('Penicillin');
      expect(res.body.pastPrescriptions.length).toBe(1);
      expect(res.body.pastPrescriptions[0].items[0].medicineId).toBe(3);
      expect(res.body.existingPrescriptions).toEqual([]);
    });

    it('returns 404 for a non-existent consultation', async () => {
      const res = await request(app).get('/api/v1/prescriptions/context/999999').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Qty auto-calc validation', () => {
    it('rejects a qty that does not match a calculable frequency × duration', async () => {
      const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId, items: [{ medicine_id: 1, dosage: '1 tablet', frequency: 'TDS', duration: '6 Days', qty: 10 }] });
      expect(res.status).toBe(400);
      expect(res.body.message).toMatch(/should be 18/);
    });

    it('accepts a qty that matches the calculated TDS × 6 days = 18', async () => {
      const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId, items: [{ medicine_id: 1, dosage: '1 tablet', frequency: 'TDS', duration: '6 Days', qty: 18 }] });
      expect(res.status).toBe(201);
    });

    it('does not validate qty for a non-calculable frequency (PRN) or duration ("Ongoing")', async () => {
      const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId, items: [{ medicine_id: 1, dosage: '1 tablet', frequency: 'PRN', duration: 'Ongoing', qty: 7 }] });
      expect(res.status).toBe(201);
    });
  });

  describe('External Purchase', () => {
    it('persists external_qty per item and rejects an out-of-range value', async () => {
      const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
      const badRes = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId, items: [{ medicine_id: 1, dosage: '1 tablet', qty: 10, external_qty: 11 }] });
      expect(badRes.status).toBe(400);

      const { consultationId: consultationId2 } = await makeDraftConsultation(doctorToken, doctorId);
      const res = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId2, items: [{ medicine_id: 1, dosage: '1 tablet', qty: 10, external_qty: 4 }] });
      expect(res.status).toBe(201);
      expect(res.body.items[0].external_qty).toBe(4);
    });

    it('external-slip returns 400 when no items are marked External Purchase, and a PDF once one is', async () => {
      const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
      const clinicOnly = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId, items: [{ medicine_id: 1, dosage: '1 tablet', qty: 5 }] });

      const noSlipRes = await request(app)
        .get(`/api/v1/prescriptions/${clinicOnly.body.prescription_id}/external-slip`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(noSlipRes.status).toBe(400);

      const { consultationId: consultationId2 } = await makeDraftConsultation(doctorToken, doctorId);
      const withExternal = await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: consultationId2, items: [{ medicine_id: 1, dosage: '1 tablet', qty: 5, external_qty: 5 }] });

      const slipRes = await request(app)
        .get(`/api/v1/prescriptions/${withExternal.body.prescription_id}/external-slip`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(slipRes.status).toBe(200);
      expect(slipRes.headers['content-type']).toBe('application/pdf');
    });
  });
});
