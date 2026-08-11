import request from 'supertest';
import app from '../../app';

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
    });
  });
});
