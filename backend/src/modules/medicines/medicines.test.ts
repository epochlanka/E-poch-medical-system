import request from 'supertest';
import app from '../../app';

describe('Medicines API', () => {
  let token: string;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    token = res.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/medicines');
    expect(res.status).toBe(401);
  });

  it('searches medicines by name', async () => {
    const res = await request(app).get('/api/v1/medicines').query({ search: 'Paracetamol' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.some((m: any) => m.name === 'Paracetamol 500mg')).toBe(true);
  });

  it('searches medicines by category', async () => {
    const res = await request(app).get('/api/v1/medicines').query({ category: 'Antibiotic' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.every((m: any) => m.category === 'Antibiotic')).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
  });

  it('excludes inactive medicines by default', async () => {
    const res = await request(app).get('/api/v1/medicines').query({ search: 'Paracetamol' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.every((m: any) => m.is_active)).toBe(true);
  });

  it('includes stock status per medicine', async () => {
    const res = await request(app).get('/api/v1/medicines').query({ search: 'Paracetamol' }).set('Authorization', `Bearer ${token}`);
    expect(res.body[0]).toHaveProperty('stockStatus');
    expect(res.body[0]).toHaveProperty('totalQty');
  });

  it('includes strength and unit price per medicine', async () => {
    const res = await request(app).get('/api/v1/medicines').query({ search: 'Paracetamol' }).set('Authorization', `Bearer ${token}`);
    expect(res.body[0].strength).toBe('500mg');
    expect(res.body[0]).toHaveProperty('unit_price');
  });
});
