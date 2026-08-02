import request from 'supertest';
import app from '../../app';

describe('Reports API', () => {
  let adminToken: string;
  let doctorToken: string;
  let pharmacistToken: string;
  let receptionToken: string;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;

    const receptionRes = await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' });
    receptionToken = receptionRes.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/reports/patient-volume');
    expect(res.status).toBe(401);
  });

  describe('Admin reports', () => {
    it('rejects a non-admin from the patient volume report', async () => {
      const res = await request(app).get('/api/v1/reports/patient-volume').set('Authorization', `Bearer ${receptionToken}`);
      expect(res.status).toBe(403);
    });

    it('returns daily patient volume for admin', async () => {
      const res = await request(app).get('/api/v1/reports/patient-volume').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.columns).toBeDefined();
      expect(Array.isArray(res.body.rows)).toBe(true);
      expect(res.body.summary).toHaveProperty('totalUniquePatients');
    });

    it('rejects an invalid date range where from is after to', async () => {
      const res = await request(app)
        .get('/api/v1/reports/revenue')
        .query({ from: '2026-06-10', to: '2026-06-01' })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('returns a revenue report broken down by payment method', async () => {
      const res = await request(app).get('/api/v1/reports/revenue').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toHaveProperty('totalRevenue');
    });

    it('exports the revenue report as CSV', async () => {
      const res = await request(app).get('/api/v1/reports/revenue').query({ format: 'csv' }).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/csv');
      expect(res.text.split('\r\n')[0]).toContain('Date');
    });

    it('exports the top medicines report as PDF', async () => {
      const res = await request(app).get('/api/v1/reports/top-medicines').query({ format: 'pdf' }).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('searches the audit log', async () => {
      const res = await request(app).get('/api/v1/reports/audit-log').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.pagination).toBeDefined();
    });

    it('rejects a non-admin from the audit log', async () => {
      const res = await request(app).get('/api/v1/reports/audit-log').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('Doctor reports', () => {
    it('scopes a doctor to their own consultation counts even if another doctorId is requested', async () => {
      const res = await request(app)
        .get('/api/v1/reports/doctor/consultations')
        .query({ doctorId: 999999 })
        .set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.title).not.toContain('All Doctors');
    });

    it('lets admin view all-doctor consultation totals when no doctorId is given', async () => {
      const res = await request(app).get('/api/v1/reports/doctor/consultations').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.title).toContain('All Doctors');
    });

    it('rejects a pharmacist from the doctor consultations report', async () => {
      const res = await request(app).get('/api/v1/reports/doctor/consultations').set('Authorization', `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(403);
    });

    it('returns the follow-ups due report for a doctor', async () => {
      const res = await request(app).get('/api/v1/reports/doctor/follow-ups-due').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toHaveProperty('overdue');
    });
  });

  describe('Pharmacist reports', () => {
    it('returns the low stock report', async () => {
      const res = await request(app).get('/api/v1/reports/pharmacist/low-stock').set('Authorization', `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toHaveProperty('totalLowStockItems');
    });

    it('returns the expiring batches report', async () => {
      const res = await request(app).get('/api/v1/reports/pharmacist/expiring-batches').set('Authorization', `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toHaveProperty('totalBatches');
    });

    it('returns the dispensing volume report', async () => {
      const res = await request(app).get('/api/v1/reports/pharmacist/dispensing-volume').set('Authorization', `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(200);
      expect(res.body.summary).toHaveProperty('totalItemsDispensed');
    });

    it('rejects a doctor from pharmacist reports', async () => {
      const res = await request(app).get('/api/v1/reports/pharmacist/low-stock').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });
  });
});
