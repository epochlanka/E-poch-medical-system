import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

describe('Appointments API', () => {
  let adminToken: string;
  let doctorToken: string;
  let doctorId: number;
  let appointmentId: number;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/appointments/list');
    expect(res.status).toBe(401);
  });

  it('creates an appointment with a reason', async () => {
    const res = await request(app)
      .post('/api/v1/appointments')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        patient_id: 'PT-SEED-001',
        doctor_id: doctorId,
        scheduled_at: new Date().toISOString(),
        reason: `Fever and headache ${runId}`,
      });
    expect(res.status).toBe(201);
    expect(res.body.status).toBe('Waiting');
    expect(res.body.reason).toBe(`Fever and headache ${runId}`);
    appointmentId = res.body.appointment_id;
  });

  // The shared dev.db is never reset between runs (see epoch-backend-conventions), so a fixed
  // day offset would collide with a previous run's leftover appointment for this same seeded
  // doctor on a re-run within the same calendar day. Deriving the offset from runId keeps each
  // run on its own date.
  const dayOffset = 200 + (runId % 500);

  describe('Double-booking prevention (FR-025)', () => {
    it('rejects a second appointment for the same doctor at the same time', async () => {
      const slotTime = new Date();
      slotTime.setDate(slotTime.getDate() + dayOffset);
      slotTime.setHours(10, 0, 0, 0);

      const first = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: slotTime.toISOString(), reason: `Double-book test ${runId}` });
      expect(first.status).toBe(201);

      const second = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-002', doctor_id: doctorId, scheduled_at: slotTime.toISOString(), reason: `Double-book test 2 ${runId}` });
      expect(second.status).toBe(400);
    });

    it('allows a walk-in for the same doctor at an already-booked time', async () => {
      const slotTime = new Date();
      slotTime.setDate(slotTime.getDate() + dayOffset + 1);
      slotTime.setHours(11, 0, 0, 0);

      const first = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: slotTime.toISOString() });
      expect(first.status).toBe(201);

      const walkIn = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-002', doctor_id: doctorId, scheduled_at: slotTime.toISOString(), is_walk_in: true });
      expect(walkIn.status).toBe(201);
    });
  });

  describe('GET /appointments/availability', () => {
    it('returns a full day of slots with a booked one marked unavailable', async () => {
      const date = new Date();
      date.setDate(date.getDate() + dayOffset + 2);
      const dateStr = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
      const slotTime = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 9, 30, 0, 0);

      await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: slotTime.toISOString() });

      const res = await request(app)
        .get('/api/v1/appointments/availability')
        .query({ doctorId, date: dateStr })
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).toBe(200);
      expect(res.body.slots.length).toBe(14);
      const bookedSlot = res.body.slots.find((s: any) => s.label === '09:30 AM');
      expect(bookedSlot.available).toBe(false);
    });
  });

  describe('GET /appointments/list', () => {
    it('paginates and finds the created appointment by patient search', async () => {
      const res = await request(app)
        .get('/api/v1/appointments/list')
        .query({ search: 'PT-SEED-001', limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pagination');
      expect(res.body.data.some((a: any) => a.appointment_id === appointmentId)).toBe(true);
    });

    it('filters by doctor and status', async () => {
      const res = await request(app)
        .get('/api/v1/appointments/list')
        .query({ doctorId, status: 'Waiting', limit: 100 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((a: any) => a.doctor_id === doctorId && a.status === 'Waiting')).toBe(true);
    });
  });

  describe('PATCH /appointments/:id/status', () => {
    it('accepts the new Cancelled and No Show outcomes', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Cancelled' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Cancelled');
    });

    it('rejects an unknown status value', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${appointmentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'NotARealStatus' });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /appointments/stats', () => {
    it('returns today/this-week counts', async () => {
      const res = await request(app).get('/api/v1/appointments/stats').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('todaysAppointments');
      expect(res.body).toHaveProperty('upcomingThisWeek');
      expect(res.body).toHaveProperty('completedThisWeek');
      expect(res.body).toHaveProperty('cancelledThisWeek');
      expect(res.body).toHaveProperty('noShowThisWeek');
      // the appointment created above was scheduled today and just got cancelled this week
      expect(res.body.cancelledThisWeek).toBeGreaterThanOrEqual(1);
    });
  });

  describe('GET /appointments/today-schedule', () => {
    it('returns 4 fixed OPD time blocks with counts', async () => {
      const res = await request(app).get('/api/v1/appointments/today-schedule').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(4);
      expect(res.body[0]).toHaveProperty('label');
      expect(res.body[0]).toHaveProperty('count');
    });
  });

  describe('GET /appointments/calendar', () => {
    it('summarizes per-day counts for the given month', async () => {
      const now = new Date();
      const res = await request(app)
        .get('/api/v1/appointments/calendar')
        .query({ year: now.getFullYear(), month: now.getMonth() + 1 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const today = now.toISOString().slice(0, 10);
      const todayEntry = res.body.find((d: any) => d.date === today);
      expect(todayEntry).toBeDefined();
      expect(todayEntry.total).toBeGreaterThanOrEqual(1);
    });

    it('rejects a missing year/month', async () => {
      const res = await request(app).get('/api/v1/appointments/calendar').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Doctor "own queue only" scoping (FR-029 / BR-05)', () => {
    let otherDoctorToken: string;
    let otherDoctorId: number;
    let otherDoctorAppointmentId: number;
    let ownAppointmentId: number;

    beforeAll(async () => {
      const username = `apt-test-doctor-${runId}`;
      const createRes = await request(app)
        .post('/api/v1/security/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'ThrowawayPass1', role: 'Doctor' });
      otherDoctorId = createRes.body.user_id;

      const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password: 'ThrowawayPass1' });
      otherDoctorToken = loginRes.body.token;

      const otherAptRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: otherDoctorId, scheduled_at: new Date().toISOString() });
      otherDoctorAppointmentId = otherAptRes.body.appointment_id;

      const ownAptRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: new Date().toISOString() });
      ownAppointmentId = ownAptRes.body.appointment_id;
    });

    it("GET /appointments/queue auto-scopes a Doctor caller to their own appointments only", async () => {
      const res = await request(app).get('/api/v1/appointments/queue').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((a: any) => a.doctor_id === doctorId)).toBe(true);
      expect(res.body.some((a: any) => a.appointment_id === otherDoctorAppointmentId)).toBe(false);
    });

    it("GET /appointments/list ignores a doctorId query param from a Doctor and still scopes to self", async () => {
      const res = await request(app)
        .get('/api/v1/appointments/list')
        .query({ doctorId: otherDoctorId, limit: 100 })
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((a: any) => a.doctor_id === doctorId)).toBe(true);
    });

    it('rejects a Doctor changing another doctor\'s appointment status', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${otherDoctorAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'Called' });
      expect(res.status).toBe(403);
    });

    it('rejects a Doctor skipping another doctor\'s appointment', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${otherDoctorAppointmentId}/skip`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ reason: 'Not my patient' });
      expect(res.status).toBe(403);
    });

    it('lets a Doctor update their own appointment status', async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${ownAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'Called' });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('Called');
    });

    it("still lets Admin manage any doctor's appointment (unrestricted, as before)", async () => {
      const res = await request(app)
        .patch(`/api/v1/appointments/${otherDoctorAppointmentId}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Called' });
      expect(res.status).toBe(200);
    });

    it('returns 404 for a non-existent appointment', async () => {
      const res = await request(app)
        .patch('/api/v1/appointments/999999/status')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'Called' });
      expect(res.status).toBe(404);
    });

    it('skips a patient with a required reason, then recalling clears it', async () => {
      const skipRes = await request(app)
        .patch(`/api/v1/appointments/${ownAppointmentId}/skip`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ reason: 'Did not respond when called' });
      expect(skipRes.status).toBe(200);
      expect(skipRes.body.status).toBe('Skipped');
      expect(skipRes.body.skip_reason).toBe('Did not respond when called');

      const missingReasonRes = await request(app)
        .patch(`/api/v1/appointments/${ownAppointmentId}/skip`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({});
      expect(missingReasonRes.status).toBe(400);

      const recallRes = await request(app)
        .patch(`/api/v1/appointments/${ownAppointmentId}/status`)
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ status: 'Waiting' });
      expect(recallRes.status).toBe(200);
      expect(recallRes.body.status).toBe('Waiting');
      expect(recallRes.body.skip_reason).toBeNull();
    });
  });

  describe('GET /appointments/queue/stats', () => {
    it("returns queue KPIs scoped to the calling doctor's own queue", async () => {
      const res = await request(app).get('/api/v1/appointments/queue/stats').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalInQueue');
      expect(res.body).toHaveProperty('waitingOver30');
      expect(res.body).toHaveProperty('inConsultation');
      expect(res.body).toHaveProperty('completedToday');
      expect(res.body).toHaveProperty('avgWaitingTimeMinutes');
      expect(res.body).toHaveProperty('longestWaitingTimeMinutes');
      expect(res.body).toHaveProperty('waitingCount');
      expect(res.body).toHaveProperty('calledCount');
    });
  });

  describe('Walk-in queue creation (receptionist Walk-in / Add to Queue page)', () => {
    it('creates a walk-in appointment with priority and notes, defaulting priority to Normal', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patient_id: 'PT-SEED-001',
          doctor_id: doctorId,
          scheduled_at: new Date().toISOString(),
          is_walk_in: true,
          reason: `Sore throat ${runId}`,
          notes: `Prefers Sinhala ${runId}`,
        });
      expect(res.status).toBe(201);
      expect(res.body.is_walk_in).toBe(true);
      expect(res.body.priority).toBe('Normal');
      expect(res.body.notes).toBe(`Prefers Sinhala ${runId}`);
    });

    it('accepts an explicit Urgent/Emergency priority', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patient_id: 'PT-SEED-001',
          doctor_id: doctorId,
          scheduled_at: new Date().toISOString(),
          is_walk_in: true,
          priority: 'Emergency',
        });
      expect(res.status).toBe(201);
      expect(res.body.priority).toBe('Emergency');
    });

    it('rejects an invalid priority value', async () => {
      const res = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          patient_id: 'PT-SEED-001',
          doctor_id: doctorId,
          scheduled_at: new Date().toISOString(),
          is_walk_in: true,
          priority: 'Critical',
        });
      expect(res.status).toBe(400);
    });
  });

  describe('GET /appointments/board (receptionist Live Queue Board)', () => {
    it('buckets a not-yet-due future appointment into upcoming and a due-now walk-in into waiting', async () => {
      const inTwoHours = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const futureRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: inTwoHours.toISOString() });
      expect(futureRes.status).toBe(201);

      const nowRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: new Date().toISOString(), is_walk_in: true });
      expect(nowRes.status).toBe(201);

      const board = await request(app).get('/api/v1/appointments/board').set('Authorization', `Bearer ${adminToken}`);
      expect(board.status).toBe(200);
      expect(board.body.isToday).toBe(true);
      expect(board.body.upcoming.some((c: any) => c.appointment_id === futureRes.body.appointment_id)).toBe(true);
      expect(board.body.waiting.some((c: any) => c.appointment_id === nowRes.body.appointment_id)).toBe(true);
    });

    it('buckets a Completed appointment with an undispensed prescription into inPharmacy, and one with no pending items into completedToday', async () => {
      const inPharmacyAppt = await prisma.appointment.create({
        data: { patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: new Date(), status: 'Completed', created_by: 1 },
      });
      const inPharmacyConsult = await prisma.consultation.create({
        data: { appointment_id: inPharmacyAppt.appointment_id, status: 'Finalized', finalized_at: new Date() },
      });
      await prisma.prescription.create({ data: { consultation_id: inPharmacyConsult.consultation_id, status: 'Pending' } });

      const doneAppt = await prisma.appointment.create({
        data: { patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: new Date(), status: 'Completed', created_by: 1 },
      });
      const doneConsult = await prisma.consultation.create({
        data: { appointment_id: doneAppt.appointment_id, status: 'Finalized', finalized_at: new Date() },
      });
      await prisma.prescription.create({ data: { consultation_id: doneConsult.consultation_id, status: 'Collected' } });

      const board = await request(app).get('/api/v1/appointments/board').set('Authorization', `Bearer ${adminToken}`);
      expect(board.status).toBe(200);
      expect(board.body.inPharmacy.some((c: any) => c.appointment_id === inPharmacyAppt.appointment_id)).toBe(true);
      expect(board.body.completedToday.some((c: any) => c.appointment_id === doneAppt.appointment_id)).toBe(true);
      // Cross-check: the "done" appointment must not also appear in inPharmacy, and vice versa.
      expect(board.body.inPharmacy.some((c: any) => c.appointment_id === doneAppt.appointment_id)).toBe(false);
      expect(board.body.completedToday.some((c: any) => c.appointment_id === inPharmacyAppt.appointment_id)).toBe(false);
    });
  });

  describe('Skip/Recall Log (AppointmentQueueLog)', () => {
    it('writes a Skipped log row on skip and a Recalled log row on recall, both listed newest-first via GET /appointments/queue-log', async () => {
      const bookRes = await request(app)
        .post('/api/v1/appointments')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ patient_id: 'PT-SEED-001', doctor_id: doctorId, scheduled_at: new Date().toISOString(), is_walk_in: true });
      const id = bookRes.body.appointment_id;

      const skipReason = `Urgent case ahead ${runId}`;
      const skipRes = await request(app).patch(`/api/v1/appointments/${id}/skip`).set('Authorization', `Bearer ${adminToken}`).send({ reason: skipReason });
      expect(skipRes.status).toBe(200);

      const recallReason = `Called back ${runId}`;
      const recallRes = await request(app)
        .patch(`/api/v1/appointments/${id}/status`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ status: 'Waiting', reason: recallReason });
      expect(recallRes.status).toBe(200);

      const logRes = await request(app).get('/api/v1/appointments/queue-log').set('Authorization', `Bearer ${adminToken}`).query({ search: 'PT-SEED-001', limit: 100 });
      expect(logRes.status).toBe(200);
      const entriesForThisAppt = logRes.body.data.filter((r: any) => r.appointment_id === id);
      expect(entriesForThisAppt).toHaveLength(2);
      // newest-first: the Recalled entry (written second) must come before the Skipped entry.
      expect(entriesForThisAppt[0].action).toBe('Recalled');
      expect(entriesForThisAppt[0].reason).toBe(recallReason);
      expect(entriesForThisAppt[1].action).toBe('Skipped');
      expect(entriesForThisAppt[1].reason).toBe(skipReason);
      expect(entriesForThisAppt[0].actor.username).toBe('admin');
    });

    it('filters GET /appointments/queue-log by action type', async () => {
      const res = await request(app).get('/api/v1/appointments/queue-log').set('Authorization', `Bearer ${adminToken}`).query({ action: 'Skipped', limit: 5 });
      expect(res.status).toBe(200);
      expect(res.body.data.every((r: any) => r.action === 'Skipped')).toBe(true);
    });
  });
});
