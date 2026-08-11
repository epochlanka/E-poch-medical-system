import request from 'supertest';
import app from '../../app';

describe('Dashboard API', () => {
  let token: string;
  let doctorToken: string;

  beforeAll(async () => {
    // Note: The database must be seeded (npm run prisma:migrate, which seeds automatically) for this to pass.
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = res.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/dashboard/overview');
    expect(res.status).toBe(401);
  });

  it('returns overview metrics', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/overview')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('todaysPatients');
    expect(res.body).toHaveProperty('revenueToday');
    expect(res.body).toHaveProperty('totalAppointmentsToday');
    expect(res.body).toHaveProperty('pendingPrescriptions');
    expect(res.body).toHaveProperty('lowStockCount');
    expect(res.body).toHaveProperty('expiringBatchesCount');
  });

  it('returns a queue snapshot with status counts and an active queue list', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/queue')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('counts');
    expect(res.body).toHaveProperty('queueLength');
    expect(Array.isArray(res.body.queue)).toBe(true);
    expect(Array.isArray(res.body.appointmentsToday)).toBe(true);
  });

  it('returns follow-ups due as a list', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/follow-ups')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns alerts as a list', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/alerts')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns a revenue trend series with a total', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/revenue-trend')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.series)).toBe(true);
    expect(res.body).toHaveProperty('total');
  });

  it('returns recent prescriptions as a list', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/recent-prescriptions')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('returns top medicines as a list', async () => {
    const res = await request(app)
      .get('/api/v1/dashboard/top-medicines')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  describe('GET /dashboard/doctor-overview', () => {
    it('rejects a non-Doctor role, even Admin', async () => {
      const res = await request(app).get('/api/v1/dashboard/doctor-overview').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(403);
    });

    it("returns the doctor's own dashboard with kpis, schedule, trend, and recent prescriptions", async () => {
      const res = await request(app).get('/api/v1/dashboard/doctor-overview').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.kpis).toHaveProperty('totalAppointmentsToday');
      expect(res.body.kpis).toHaveProperty('completedConsultationsToday');
      expect(res.body.kpis).toHaveProperty('pendingConsultationsInQueue');
      expect(res.body.kpis).toHaveProperty('followUpsDueThisWeek');
      expect(res.body.kpis).toHaveProperty('prescriptionsIssuedToday');
      expect(Array.isArray(res.body.todaysSchedule)).toBe(true);
      expect(Array.isArray(res.body.consultationsOverview)).toBe(true);
      expect(res.body.consultationsOverview).toHaveLength(7);
      expect(Array.isArray(res.body.recentPrescriptions)).toBe(true);
    });
  });
});
