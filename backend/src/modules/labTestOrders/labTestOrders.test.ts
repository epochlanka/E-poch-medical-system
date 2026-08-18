import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

const makePatient = async () => {
  const family = await prisma.family.create({ data: { family_name: `Lab Test Order Family ${runId}-${Math.random()}` } });
  return prisma.patient.create({
    data: {
      patient_id: `PT-LABTO-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `LABTO-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: 'Lab Test Order Test Patient',
      dob: new Date('1990-01-01'),
      gender: 'Male',
    },
  });
};

const makeDraftConsultation = async (doctorToken: string, doctorId: number) => {
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const patient = await makePatient();
  const appointment = await prisma.appointment.create({
    data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const consultRes = await request(app)
    .post('/api/v1/consultations')
    .set('Authorization', `Bearer ${doctorToken}`)
    .send({ appointment_id: appointment.appointment_id });
  return { consultationId: consultRes.body.consultation_id, patientId: patient.patient_id };
};

describe('Lab Test Orders API', () => {
  let doctorToken: string;
  let doctorId: number;
  let adminToken: string;
  let receptionistToken: string;
  let pharmacistToken: string;

  beforeAll(async () => {
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;

    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const receptionistRes = await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' });
    receptionistToken = receptionistRes.body.token;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/lab-test-orders');
    expect(res.status).toBe(401);
  });

  it('rejects order creation from a non-doctor role (business rule #1)', async () => {
    const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
    for (const token of [adminToken, receptionistToken, pharmacistToken]) {
      const res = await request(app)
        .post('/api/v1/lab-test-orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ consultation_id: consultationId, test_name: 'Complete Blood Count' });
      expect(res.status).toBe(403);
    }
  });

  let labTestOrderId: number;
  let patientId: string;

  it('lets a doctor create a lab test order as Pending, linked to patient/doctor/consultation', async () => {
    const created = await makeDraftConsultation(doctorToken, doctorId);
    patientId = created.patientId;

    const res = await request(app)
      .post('/api/v1/lab-test-orders')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        consultation_id: created.consultationId,
        test_name: 'Complete Blood Count',
        test_category: 'Hematology',
        instructions: 'Fasting sample',
        priority: 'Urgent',
        additional_notes: 'Patient reports fatigue',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Pending');
    expect(res.body.patient_id).toBe(patientId);
    expect(res.body.doctor_id).toBe(doctorId);
    expect(res.body.consultation_id).toBe(created.consultationId);
    expect(res.body.priority).toBe('Urgent');

    labTestOrderId = res.body.lab_test_order_id;
  });

  it('lists the pending order for that patient — it must remain visible even though no result exists yet', async () => {
    const res = await request(app).get('/api/v1/lab-test-orders').query({ patientId, status: 'Pending' }).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((o: any) => o.lab_test_order_id === labTestOrderId)).toBe(true);
  });

  it('generates a printable lab test request PDF', async () => {
    const res = await request(app).get(`/api/v1/lab-test-orders/${labTestOrderId}/print`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
  });

  it('rejects a Pharmacist entering a result (not an authorized clinic-staff role)', async () => {
    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${labTestOrderId}/result`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ result_value: '13.2 g/dL' });
    expect(res.status).toBe(403);
  });

  it('lets a Receptionist enter a result with a report attachment — status becomes Result Received', async () => {
    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${labTestOrderId}/result`)
      .set('Authorization', `Bearer ${receptionistToken}`)
      .field('result_value', 'WBC 7.2, Hb 13.5, Plt 250')
      .field('unit', 'various')
      .field('reference_range', 'See per-component range')
      .field('laboratory_name', 'City Diagnostics Lab')
      .attach('report', Buffer.from('%PDF-1.4 fake report'), { filename: 'cbc-report.pdf', contentType: 'application/pdf' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Result Received');
    expect(res.body.result_value).toBe('WBC 7.2, Hb 13.5, Plt 250');
    expect(res.body.report_file_path).toMatch(/^\/uploads\/lab-reports\//);
    expect(res.body.entered_by).not.toBeNull();
  });

  it('rejects a doctor review before a result exists, and rejects a non-doctor review attempt', async () => {
    const { consultationId } = await makeDraftConsultation(doctorToken, doctorId);
    const createRes = await request(app)
      .post('/api/v1/lab-test-orders')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ consultation_id: consultationId, test_name: 'Fasting Blood Sugar' });
    const pendingId = createRes.body.lab_test_order_id;

    const tooEarly = await request(app).post(`/api/v1/lab-test-orders/${pendingId}/review`).set('Authorization', `Bearer ${doctorToken}`).send({});
    expect(tooEarly.status).toBe(400);

    const notDoctor = await request(app).post(`/api/v1/lab-test-orders/${labTestOrderId}/review`).set('Authorization', `Bearer ${adminToken}`).send({});
    expect(notDoctor.status).toBe(403);
  });

  it('lets the doctor review a resulted order — status becomes Reviewed with a review note', async () => {
    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${labTestOrderId}/review`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ review_notes: 'Values within normal limits, no action needed.' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Reviewed');
    expect(res.body.review_notes).toBe('Values within normal limits, no action needed.');
    expect(res.body.reviewed_by).toBe(doctorId);
  });

  it('re-entering a result updates the same order row rather than creating a duplicate (business rule #6)', async () => {
    const before = await request(app).get('/api/v1/lab-test-orders').query({ patientId }).set('Authorization', `Bearer ${doctorToken}`);
    const countBefore = before.body.pagination.total;

    const res = await request(app)
      .post(`/api/v1/lab-test-orders/${labTestOrderId}/result`)
      .set('Authorization', `Bearer ${adminToken}`)
      .field('result_value', 'Corrected: WBC 7.4, Hb 13.6, Plt 248');
    expect(res.status).toBe(200);
    expect(res.body.lab_test_order_id).toBe(labTestOrderId);
    expect(res.body.result_value).toBe('Corrected: WBC 7.4, Hb 13.6, Plt 248');

    const after = await request(app).get('/api/v1/lab-test-orders').query({ patientId }).set('Authorization', `Bearer ${doctorToken}`);
    expect(after.body.pagination.total).toBe(countBefore);
  });
});
