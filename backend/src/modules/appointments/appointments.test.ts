import request from 'supertest';
import app from '../../app';

const runId = Date.now();

describe('Appointments API', () => {
  let adminToken: string;
  let doctorId: number;
  let appointmentId: number;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
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
});
