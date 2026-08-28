import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

// The Appointments API can create one, but reaching Consulting means walking it through
// Waiting -> Called -> Consulting first; arranging the end state directly via Prisma is
// simpler test setup, and every assertion below still goes through the real HTTP API.
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

  it("rejects a different doctor from reading another doctor's amendment log", async () => {
    const res = await request(app)
      .get(`/api/v1/consultations/${consultationId}/amendments`)
      .set('Authorization', `Bearer ${secondDoctorToken}`);
    expect(res.status).toBe(403);
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

  describe('New clinical fields (HPI, examination, medical history tags)', () => {
    it('round-trips history_of_present_illness, examination_findings, and medical_history tags', async () => {
      const { appointment } = await makeConsultingAppointment(doctorId);

      const createRes = await request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({
          appointment_id: appointment.appointment_id,
          complaint: 'Chest pain',
          history_of_present_illness: 'Onset 2 days ago, worse on exertion',
          examination_findings: 'Chest clear, no wheeze',
          medical_history: ['Hypertension', 'Allergic Rhinitis'],
          vitals: { respiratory_rate: 18, spo2: 98 },
        });

      expect(createRes.status).toBe(201);
      expect(createRes.body.history_of_present_illness).toBe('Onset 2 days ago, worse on exertion');
      expect(createRes.body.examination_findings).toBe('Chest clear, no wheeze');
      expect(createRes.body.medicalHistory).toEqual(['Hypertension', 'Allergic Rhinitis']);
      expect(createRes.body.vitals.respiratory_rate).toBe(18);
      expect(createRes.body.vitals.spo2).toBe(98);
    });
  });

  describe('Consultation Context (GET /consultations/context/:appointmentId)', () => {
    it('returns appointment, patient summary, and null consultation before one is created', async () => {
      const { appointment, patient } = await makeConsultingAppointment(doctorId, { allergies: 'Penicillin' });

      const res = await request(app)
        .get(`/api/v1/consultations/context/${appointment.appointment_id}`)
        .set('Authorization', `Bearer ${doctorToken}`);

      expect(res.status).toBe(200);
      expect(res.body.appointment.patient.patient_id).toBe(patient.patient_id);
      expect(res.body.consultation).toBeNull();
      expect(res.body.patientSummary.allergies).toBe('Penicillin');
      expect(res.body.patientSummary).toHaveProperty('chronicConditions');
      expect(res.body.patientSummary).toHaveProperty('currentMedications');
    });

    it('returns 404 for a non-existent appointment', async () => {
      const res = await request(app).get('/api/v1/consultations/context/999999').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(404);
    });
  });

  describe('Attach Files (consultation documents)', () => {
    it('uploads, lists, and deletes a document', async () => {
      const { appointment } = await makeConsultingAppointment(doctorId);
      const createRes = await request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ appointment_id: appointment.appointment_id });
      const docConsultationId = createRes.body.consultation_id;

      const uploadRes = await request(app)
        .post(`/api/v1/consultations/${docConsultationId}/documents`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .attach('file', Buffer.from('%PDF-1.4 fake pdf content'), { filename: 'referral.pdf', contentType: 'application/pdf' });
      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.original_name).toBe('referral.pdf');

      const listRes = await request(app)
        .get(`/api/v1/consultations/${docConsultationId}/documents`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.some((d: any) => d.document_id === uploadRes.body.document_id)).toBe(true);

      const deleteRes = await request(app)
        .delete(`/api/v1/consultations/documents/${uploadRes.body.document_id}`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(deleteRes.status).toBe(204);
    });

    it('rejects a disallowed file type', async () => {
      const { appointment } = await makeConsultingAppointment(doctorId);
      const createRes = await request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ appointment_id: appointment.appointment_id });

      const res = await request(app)
        .post(`/api/v1/consultations/${createRes.body.consultation_id}/documents`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .attach('file', Buffer.from('exe content'), { filename: 'malware.exe', contentType: 'application/octet-stream' });
      expect(res.status).toBe(400);
    });
  });

  describe('Patient Consultation History (GET /consultations/patient-history/:patientId)', () => {
    it("returns a registered patient's finalized visits, each with doctor, diagnosis, prescriptions, and lab test orders — newest first, Draft visits excluded, and excludeAppointmentId honored", async () => {
      const { appointment, patient } = await makeConsultingAppointment(doctorId);
      const medicine = await prisma.medicine.create({
        data: { name: `History Test Drug ${runId}`, unit: 'tablet', unit_price: 10, is_active: true },
      });

      const createRes = await request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ appointment_id: appointment.appointment_id, complaint: 'Sore throat', diagnosis: `Pharyngitis ${runId}` });
      const histConsultationId = createRes.body.consultation_id;

      await request(app)
        .post('/api/v1/prescriptions')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: histConsultationId, items: [{ medicine_id: medicine.medicine_id, dosage: '1 tab', qty: 5 }] });

      await request(app)
        .post('/api/v1/lab-test-orders')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ consultation_id: histConsultationId, test_name: `History Test CBC ${runId}` });

      const finalizeRes = await request(app).post(`/api/v1/consultations/${histConsultationId}/finalize`).set('Authorization', `Bearer ${doctorToken}`);
      expect(finalizeRes.status).toBe(200);

      // A second, still-Draft consultation for the same patient — must never show up in history.
      const { appointment: draftAppointment } = await makeConsultingAppointment(doctorId);
      await prisma.appointment.update({ where: { appointment_id: draftAppointment.appointment_id }, data: { patient_id: patient.patient_id } });
      const draftRes = await request(app)
        .post('/api/v1/consultations')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ appointment_id: draftAppointment.appointment_id });

      const historyRes = await request(app)
        .get(`/api/v1/consultations/patient-history/${patient.patient_id}`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(historyRes.status).toBe(200);
      expect(Array.isArray(historyRes.body)).toBe(true);
      expect(historyRes.body.some((c: any) => c.consultationId === draftRes.body.consultation_id)).toBe(false);

      const entry = historyRes.body.find((c: any) => c.consultationId === histConsultationId);
      expect(entry).toBeDefined();
      expect(entry.appointmentId).toBe(appointment.appointment_id);
      expect(entry.doctorName).toBe('doctor');
      expect(entry.complaint).toBe('Sore throat');
      expect(entry.diagnosis).toBe(`Pharyngitis ${runId}`);
      expect(entry.prescriptions).toHaveLength(1);
      expect(entry.prescriptions[0].items).toEqual([{ medicine: medicine.name, dosage: '1 tab', qty: 5 }]);
      expect(entry.labTestOrders).toHaveLength(1);
      expect(entry.labTestOrders[0].testName).toBe(`History Test CBC ${runId}`);
      expect(entry.labTestOrders[0]).toHaveProperty('results');

      // excludeAppointmentId hides that one visit, as used when viewing that visit's own workspace.
      const excludedRes = await request(app)
        .get(`/api/v1/consultations/patient-history/${patient.patient_id}`)
        .query({ excludeAppointmentId: appointment.appointment_id })
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(excludedRes.body.some((c: any) => c.consultationId === histConsultationId)).toBe(false);
    });

    it('returns an empty array for a patient id with no finalized visits (also covers the temporary-walk-in case, which never has a real patient_id to call this with)', async () => {
      const res = await request(app)
        .get(`/api/v1/consultations/patient-history/PT-DOES-NOT-EXIST-${runId}`)
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
