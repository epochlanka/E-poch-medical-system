import request from 'supertest';
import app from '../../app';

describe('Dashboard API', () => {
  let token: string;

  beforeAll(async () => {
    // Note: The database must be seeded (npm run prisma:migrate, which seeds automatically) for this to pass.
    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'admin', password: 'admin123' });
    token = res.body.token;
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
});
