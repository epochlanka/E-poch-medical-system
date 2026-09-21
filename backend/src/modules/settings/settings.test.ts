import request from 'supertest';
import app from '../../app';

const runId = Date.now();

describe('Settings API', () => {
  let adminToken: string;
  let doctorToken: string;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/settings');
    expect(res.status).toBe(401);
  });

  describe('Clinic Settings', () => {
    it('lets any authenticated role read clinic settings', async () => {
      const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('clinic_name');
      expect(res.body).toHaveProperty('default_consultation_fee');
    });

    it('rejects a non-admin from updating clinic settings', async () => {
      const res = await request(app).put('/api/v1/settings').set('Authorization', `Bearer ${doctorToken}`).send({ clinic_name: 'Hacked Clinic' });
      expect(res.status).toBe(403);
    });

    it('rejects a negative default consultation fee', async () => {
      const res = await request(app).put('/api/v1/settings').set('Authorization', `Bearer ${adminToken}`).send({ default_consultation_fee: -5 });
      expect(res.status).toBe(400);
    });

    it('lets admin update and persist clinic settings', async () => {
      const res = await request(app)
        .put('/api/v1/settings')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ registration_number: `REG-${runId}`, expiry_alert_threshold_days: 60 });
      expect(res.status).toBe(200);
      expect(res.body.registration_number).toBe(`REG-${runId}`);
      expect(res.body.expiry_alert_threshold_days).toBe(60);

      const getRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${adminToken}`);
      expect(getRes.body.registration_number).toBe(`REG-${runId}`);

      // Restore the seeded default so other tests / manual runs see the expected 90-day threshold.
      await request(app).put('/api/v1/settings').set('Authorization', `Bearer ${adminToken}`).send({ expiry_alert_threshold_days: 90 });
    });
  });

  describe('Master Data', () => {
    it('rejects an invalid type', async () => {
      const res = await request(app)
        .post('/api/v1/settings/master-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'NotAType', value: `X-${runId}` });
      expect(res.status).toBe(400);
    });

    it('creates a master data item and rejects a duplicate under the same type', async () => {
      const value = `Cardiology-${runId}`;
      const createRes = await request(app)
        .post('/api/v1/settings/master-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'MedicineCategory', value });
      expect(createRes.status).toBe(201);

      const dupRes = await request(app)
        .post('/api/v1/settings/master-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'MedicineCategory', value });
      expect(dupRes.status).toBe(400);
    });

    it('lists master data filtered by type', async () => {
      const res = await request(app).get('/api/v1/settings/master-data').query({ type: 'PaymentMethod' }).set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(200);
      expect(res.body.every((i: any) => i.type === 'PaymentMethod')).toBe(true);
      expect(res.body.some((i: any) => i.value === 'Cash')).toBe(true);
    });

    it('updates and then soft-deactivates a master data item', async () => {
      const createRes = await request(app)
        .post('/api/v1/settings/master-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'DiscountType', value: `Promo-${runId}` });
      const itemId = createRes.body.item_id;

      const updateRes = await request(app)
        .put(`/api/v1/settings/master-data/${itemId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ is_active: false });
      expect(updateRes.status).toBe(200);
      expect(updateRes.body.is_active).toBe(false);

      const listRes = await request(app).get('/api/v1/settings/master-data').set('Authorization', `Bearer ${adminToken}`);
      expect(listRes.body.some((i: any) => i.item_id === itemId)).toBe(false);

      const listAllRes = await request(app).get('/api/v1/settings/master-data').query({ includeInactive: 'true' }).set('Authorization', `Bearer ${adminToken}`);
      expect(listAllRes.body.some((i: any) => i.item_id === itemId)).toBe(true);
    });

    it('deletes a master data item', async () => {
      const createRes = await request(app)
        .post('/api/v1/settings/master-data')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ type: 'DiscountType', value: `ToDelete-${runId}` });
      const itemId = createRes.body.item_id;

      const deleteRes = await request(app).delete(`/api/v1/settings/master-data/${itemId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(204);

      const updateRes = await request(app).put(`/api/v1/settings/master-data/${itemId}`).set('Authorization', `Bearer ${adminToken}`).send({ sort_order: 1 });
      expect(updateRes.status).toBe(404);
    });

    it('rejects a non-admin from writing master data', async () => {
      const res = await request(app)
        .post('/api/v1/settings/master-data')
        .set('Authorization', `Bearer ${doctorToken}`)
        .send({ type: 'MedicineCategory', value: `ShouldFail-${runId}` });
      expect(res.status).toBe(403);
    });
  });

  describe('Backup & Restore', () => {
    let backupId: number;

    it('rejects a non-admin from creating a backup', async () => {
      const res = await request(app).post('/api/v1/settings/backups').set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });

    it('creates a backup of the live database', async () => {
      const res = await request(app).post('/api/v1/settings/backups').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(201);
      expect(res.body.filename).toMatch(/^backup-.*\.db$/);
      expect(res.body.size_bytes).toBeGreaterThan(0);
      backupId = res.body.backup_id;
    });

    it('lists backups newest first', async () => {
      const res = await request(app).get('/api/v1/settings/backups').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((b: any) => b.backup_id === backupId)).toBe(true);
    });

    it('verifies a backup passes SQLite integrity check', async () => {
      const res = await request(app).post(`/api/v1/settings/backups/${backupId}/verify`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.verified).toBe(true);
      expect(res.body.verified_at).toBeTruthy();
    });

    it('downloads a backup file', async () => {
      const res = await request(app).get(`/api/v1/settings/backups/${backupId}/download`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.headers['content-disposition']).toContain('.db');
    });

    it('returns 404 verifying a non-existent backup', async () => {
      const res = await request(app).post('/api/v1/settings/backups/999999/verify').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    // Restore actually swaps the live SQLite file on disk — deliberately NOT exercised end-to-end
    // here since this suite runs against the same shared dev.db every other module's tests use.
    // Authorization/not-found are still verified; the copy/rename logic itself is covered by
    // manual verification (see PR/commit notes) rather than an automated destructive test.
    it('rejects a non-admin from restoring a backup', async () => {
      const res = await request(app).post(`/api/v1/settings/backups/${backupId}/restore`).set('Authorization', `Bearer ${doctorToken}`);
      expect(res.status).toBe(403);
    });

    it('returns 404 restoring a non-existent backup', async () => {
      const res = await request(app).post('/api/v1/settings/backups/999999/restore').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
