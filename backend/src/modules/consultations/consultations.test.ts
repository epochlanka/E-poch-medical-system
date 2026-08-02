import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

// No Appointments API exists yet to create a Consulting-status appointment, so we arrange
// that prerequisite directly via Prisma — every assertion still goes through the real HTTP API.
const makeConsultingAppointment = async (doctorId: number, opts: { allergies?: string } = {}) => {
  const family = await prisma.family.create({ data: { family_name: `Consult Test Family ${runId}-${Math.random()}` } });
  const patient = await prisma.patient.create({
    data: {
      patient_id: `PT-CONSULT-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      family_id: family.family_id,
      nic: `CONSULT-NIC-${runId}-${Math.random().toString(36).slice(2, 8)}`,
      full_name: 'Consult Test Patient',
      dob: new Date('1988-01-01'),
      gender: 'Male',
      allergies: opts.allergies,
    },
  });
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const appointment = await prisma.appointment.create({
    data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  return { appointment, patient };
};

describe('Consultations API', () => {
  let doctorToken: string;
  let doctorId: number;
  let adminToken: string;
  let secondDoctorToken: string;
  let secondDoctorId: number;

  beforeAll(async () => {
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;

    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const secondDoctorHash = await bcrypt.hash('doctor2pass', 10);
    const secondDoctor = await prisma.user.upsert({
      where: { username: `doctor2-${runId}` },
      update: {},
      create: { username: `doctor2-${runId}`, password_hash: secondDoctorHash, role: 'Doctor' },
    });
    secondDoctorId = secondDoctor.user_id;
    const secondDoctorRes = await request(app).post('/api/v1/auth/login').send({ username: `doctor2-${runId}`, password: 'doctor2pass' });
    secondDoctorToken = secondDoctorRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/consultations');
    expect(res.status).toBe(401);
  });

  it('rejects consultation creation from a read-only role (Pharmacist)', async () => {
    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    const { appointment } = await makeConsultingAppointment(doctorId);

    const res = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${pharmacistRes.body.token}`)
      .send({ appointment_id: appointment.appointment_id });

    expect(res.status).toBe(403);
  });

  it('blocks creating a consultation for an appointment that is not Consulting', async () => {
    // Seeded appointment_id 1 is Waiting.
    const res = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ appointment_id: 1 });

    expect(res.status).toBe(400);
  });

  let consultationId: number;
  let appointmentId: number;

  it('creates a Draft consultation with server-computed BMI', async () => {
    const { appointment } = await makeConsultingAppointment(doctorId);
    appointmentId = appointment.appointment_id;

    const res = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        appointment_id: appointmentId,
        vitals: { bp_systolic: 120, bp_diastolic: 80, temp: 37.1, pulse: 72, weight: 70, height: 175 },
        complaint: 'Fever and headache',
        diagnosis: 'Viral fever',
      });

    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Draft');
    // 70kg / 1.75m^2 = 22.9
    expect(res.body.vitals.bmi).toBeCloseTo(22.9, 1);
    consultationId = res.body.consultation_id;
  });

  it('rejects a second consultation for the same appointment', async () => {
    const res = await request(app)
      .post('/api/v1/consultations')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ appointment_id: appointmentId });

    expect(res.status).toBe(400);
  });

  it('rejects updates from a doctor who does not own the consultation', async () => {
    const res = await request(app)
      .put(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${secondDoctorToken}`)
      .send({ diagnosis: 'Should not apply' });

    expect(res.status).toBe(403);
  });

  it('returns the consultation with patient allergy/history context', async () => {
    const res = await request(app).get(`/api/v1/consultations/${consultationId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.appointment.patient).toHaveProperty('allergies');
  });

  it('updates a Draft consultation and recomputes BMI', async () => {
    const res = await request(app)
      .put(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ vitals: { weight: 80, height: 160 }, notes: 'Advised rest' });

    expect(res.status).toBe(200);
    // 80kg / 1.6m^2 = 31.25
    expect(res.body.vitals.bmi).toBeCloseTo(31.25, 0.5);
  });

  it('finalizes the consultation and marks the appointment Completed', async () => {
    const res = await request(app).post(`/api/v1/consultations/${consultationId}/finalize`).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Finalized');

    const appt = await prisma.appointment.findUnique({ where: { appointment_id: appointmentId } });
    expect(appt?.status).toBe('Completed');
  });

  it('rejects direct edits to a Finalized consultation', async () => {
    const res = await request(app)
      .put(`/api/v1/consultations/${consultationId}`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ diagnosis: 'Silent overwrite attempt' });

    expect(res.status).toBe(400);
  });

  it('requires a reason to amend a Finalized consultation', async () => {
    const res = await request(app)
      .post(`/api/v1/consultations/${consultationId}/amend`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ field: 'diagnosis', new_value: 'Corrected diagnosis' });

    expect(res.status).toBe(400);
  });

  it('amends a Finalized consultation with a reason and logs it', async () => {
    const res = await request(app)
      .post(`/api/v1/consultations/${consultationId}/amend`)
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ field: 'diagnosis', new_value: 'Corrected diagnosis', reason: 'Lab result came back different' });

    expect(res.status).toBe(200);
    expect(res.body.diagnosis).toBe('Corrected diagnosis');

    const logRes = await request(app).get(`/api/v1/consultations/${consultationId}/amendments`).set('Authorization', `Bearer ${doctorToken}`);
    expect(logRes.status).toBe(200);
    expect(logRes.body[0]).toMatchObject({ field: 'diagnosis', newValue: 'Corrected diagnosis', reason: 'Lab result came back different' });
  });

  it('allows an Admin to amend a consultation the Admin did not create', async () => {
    const res = await request(app)
      .post(`/api/v1/consultations/${consultationId}/amend`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ field: 'notes', new_value: 'Admin-reviewed', reason: 'Quality audit' });

    expect(res.status).toBe(200);
  });

  it('lists consultations filterable by status', async () => {
    const res = await request(app).get('/api/v1/consultations').query({ status: 'Finalized' }).set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((c: any) => c.consultationId === consultationId)).toBe(true);
  });
});
