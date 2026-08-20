import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

const makePatient = async () => {
  const family = await prisma.family.create({ data: { family_name: `ExtMed Test Family ${runId}-${Math.random()}` } });
  return prisma.patient.create({
    data: {
      patient_id: `PT-EXTMED-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `EXTMED-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: 'External Medicine Test Patient',
      dob: new Date('1985-01-01'),
      gender: 'Female',
    },
  });
};

const makePrescriptionForPatient = async (doctorToken: string, doctorId: number, medicineId: number, patientId: string) => {
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const appointment = await prisma.appointment.create({
    data: { patient_id: patientId, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const consultRes = await request(app)
    .post('/api/v1/consultations')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ appointment_id: appointment.appointment_id });
  const rxRes = await request(app)
    .post('/api/v1/prescriptions')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ consultation_id: consultRes.body.consultation_id, items: [{ medicine_id: medicineId, dosage: '1 tab', qty: 1 }] });
  return rxRes.body.prescription_id as number;
};

const makePrescription = async (doctorToken: string, doctorId: number, medicineId: number) => {
  const patient = await makePatient();
  const prescriptionId = await makePrescriptionForPatient(doctorToken, doctorId, medicineId, patient.patient_id);
  return { prescriptionId, patientId: patient.patient_id as string };
};

describe('External Medicines API', () => {
  let doctorToken: string;
  let doctorId: number;
  let pharmacistToken: string;
  let receptionToken: string;
  let medicineId: number;

  beforeAll(async () => {
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;

    const receptionRes = await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' });
    receptionToken = receptionRes.body.token;

    const medicine = await prisma.medicine.create({
      data: { name: `ExtMed Catalog Drug ${runId}`, generic_name: 'Test Genericol', brand_name: 'TestoBrand', unit: 'tablet', is_active: true },
    });
    medicineId = medicine.medicine_id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/external-medicines/patient/PT-NONE');
    expect(res.status).toBe(401);
  });

  it('rejects a Receptionist trying to create an external medicine', async () => {
    const { prescriptionId } = await makePrescription(doctorToken, doctorId, medicineId);
    const res = await request(app)
      .post(`/api/v1/external-medicines/prescription/${prescriptionId}`)
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ dosage_form: 'Tablet', dosage: '1 tablet', quantity: 10, quantity_unit: 'tablets', medicine_name: 'Something' });
    expect(res.status).toBe(403);
  });

  it('creates a catalog-sourced external medicine, filling in name/generic/brand from the Medicine Master', async () => {
    const { prescriptionId } = await makePrescription(doctorToken, doctorId, medicineId);
    const res = await request(app)
      .post(`/api/v1/external-medicines/prescription/${prescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ medicine_id: medicineId, dosage_form: 'Tablet', strength: '500mg', dosage: '1 tablet', frequency: 'TDS', duration: '6 Days', quantity: 18, quantity_unit: 'tablets' });
    expect(res.status).toBe(201);
    expect(res.body.medicineName).toContain('ExtMed Catalog Drug');
    expect(res.body.genericName).toBe('Test Genericol');
    expect(res.body.brandName).toBe('TestoBrand');
    expect(res.body.medicineId).toBe(medicineId);
  });

  it('creates a fully manual/freeform external item with no medicine_id', async () => {
    const { prescriptionId } = await makePrescription(doctorToken, doctorId, medicineId);
    const res = await request(app)
      .post(`/api/v1/external-medicines/prescription/${prescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ medicine_name: 'Special Skin Cream', dosage_form: 'Cream', strength: '1%', dosage: 'Apply thinly', quantity: 1, quantity_unit: 'tube', instructions: 'For external use only' });
    expect(res.status).toBe(201);
    expect(res.body.medicineId).toBeNull();
    expect(res.body.medicineName).toBe('Special Skin Cream');
  });

  it('rejects a manual item with no medicine_name and no medicine_id', async () => {
    const { prescriptionId } = await makePrescription(doctorToken, doctorId, medicineId);
    const res = await request(app)
      .post(`/api/v1/external-medicines/prescription/${prescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ dosage_form: 'Cream', dosage: 'Apply thinly', quantity: 1, quantity_unit: 'tube' });
    expect(res.status).toBe(400);
  });

  it('bulk-creates several external medicines in one call, all-or-nothing', async () => {
    const { prescriptionId } = await makePrescription(doctorToken, doctorId, medicineId);
    const res = await request(app)
      .post(`/api/v1/external-medicines/prescription/${prescriptionId}/bulk`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        items: [
          { medicine_name: 'Vitamin D 1000 IU', dosage_form: 'Capsule', dosage: '1 capsule', frequency: 'OD', duration: '30 Days', quantity: 30, quantity_unit: 'capsules' },
          { medicine_name: 'Cough Syrup', dosage_form: 'Syrup', strength: '100mg/5ml', dosage: '5 ml', frequency: 'TDS', duration: '5 Days', quantity: 75, quantity_unit: 'ml' },
        ],
      });
    expect(res.status).toBe(201);
    expect(res.body).toHaveLength(2);

    const list = await request(app).get(`/api/v1/external-medicines/prescription/${prescriptionId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(2);
  });

  it('lists and deduplicates a patient\'s previous external medicines for "Use Again", newest occurrence only', async () => {
    const patient = await makePatient();
    const rx1 = await makePrescriptionForPatient(doctorToken, doctorId, medicineId, patient.patient_id);
    await request(app)
      .post(`/api/v1/external-medicines/prescription/${rx1}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ medicine_name: `Vitamin D Repeat ${runId}`, dosage_form: 'Capsule', dosage: '1 capsule', frequency: 'OD', duration: '30 Days', quantity: 30, quantity_unit: 'capsules' });

    // Same medicine name prescribed again on a later visit for the SAME patient.
    const rx2 = await makePrescriptionForPatient(doctorToken, doctorId, medicineId, patient.patient_id);
    const second = await request(app)
      .post(`/api/v1/external-medicines/prescription/${rx2}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ medicine_name: `Vitamin D Repeat ${runId}`, dosage_form: 'Capsule', dosage: '2 capsules', frequency: 'BD', duration: '15 Days', quantity: 30, quantity_unit: 'capsules' });

    const search = await request(app)
      .get(`/api/v1/external-medicines/patient/${patient.patient_id}`)
      .query({ search: 'Vitamin D Repeat' })
      .set('Authorization', `Bearer ${doctorToken}`);
    expect(search.status).toBe(200);
    expect(search.body.length).toBe(1);
    // Deduped down to just the most recent occurrence's details, not the first.
    expect(search.body[0].extItemId).toBe(second.body.extItemId);
    expect(search.body[0].dosage).toBe('2 capsules');
    expect(search.body[0].lastPrescribedAt).toBeTruthy();
  });

  it('updates and then deletes an external medicine entry', async () => {
    const { prescriptionId } = await makePrescription(doctorToken, doctorId, medicineId);
    const created = await request(app)
      .post(`/api/v1/external-medicines/prescription/${prescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ medicine_name: 'Editable Item', dosage_form: 'Tablet', dosage: '1 tablet', quantity: 10, quantity_unit: 'tablets' });
    const extItemId = created.body.extItemId;

    const updated = await request(app)
      .put(`/api/v1/external-medicines/${extItemId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ quantity: 20 });
    expect(updated.status).toBe(200);
    expect(updated.body.quantity).toBe(20);

    const del = await request(app).delete(`/api/v1/external-medicines/${extItemId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(del.status).toBe(204);

    const list = await request(app).get(`/api/v1/external-medicines/prescription/${prescriptionId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(list.body.find((r: any) => r.extItemId === extItemId)).toBeUndefined();
  });

  it('prints the External Medicine Slip as a PDF, and 400s when there is nothing to print', async () => {
    const { prescriptionId } = await makePrescription(doctorToken, doctorId, medicineId);

    const empty = await request(app).get(`/api/v1/external-medicines/prescription/${prescriptionId}/slip`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(empty.status).toBe(400);

    await request(app)
      .post(`/api/v1/external-medicines/prescription/${prescriptionId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ medicine_name: 'Slip Test Item', dosage_form: 'Tablet', dosage: '1 tablet', quantity: 5, quantity_unit: 'tablets' });

    const res = await request(app).get(`/api/v1/external-medicines/prescription/${prescriptionId}/slip`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });
});
