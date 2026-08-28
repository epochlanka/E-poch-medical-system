import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../app';

const runId = Date.now();

describe('Security API', () => {
  let adminToken: string;
  let adminUserId: number;
  let doctorToken: string;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;
    adminUserId = Number((jwt.decode(adminToken) as any).sub);

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
  });

  const createThrowawayUser = async (role: string, password = 'ThrowawayPass1') => {
    const username = `sec-test-${role.toLowerCase()}-${runId}-${Math.random().toString(36).slice(2, 8)}`;
    const res = await request(app).post('/api/v1/security/users').set('Authorization', `Bearer ${adminToken}`).send({ username, password, role });
    expect(res.status).toBe(201);
    return { userId: res.body.user_id as number, username, password };
  };

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/security/users');
    expect(res.status).toBe(401);
  });

  it('rejects a non-admin from every security endpoint', async () => {
    const res = await request(app).get('/api/v1/security/users').set('Authorization', `Bearer ${doctorToken}`);
    expect(res.status).toBe(403);
  });

  describe('Permission Matrix', () => {
    it('returns the reference permission matrix', async () => {
      const res = await request(app).get('/api/v1/security/permission-matrix').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.some((e: any) => e.module === 'Patients' && e.roles.includes('Receptionist'))).toBe(true);
    });
  });

  describe('Users & Roles', () => {
    it('rejects an invalid role', async () => {
      const res = await request(app)
        .post('/api/v1/security/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username: `bad-role-${runId}`, password: 'Password123', role: 'SuperUser' });
      expect(res.status).toBe(400);
    });

    it('creates a user and rejects a duplicate username', async () => {
      const { username } = await createThrowawayUser('Receptionist');

      const dupRes = await request(app)
        .post('/api/v1/security/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ username, password: 'Password123', role: 'Receptionist' });
      expect(dupRes.status).toBe(400);
    });

    it('never returns the password hash', async () => {
      const { userId } = await createThrowawayUser('Pharmacist');
      const res = await request(app).get(`/api/v1/security/users/${userId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('password_hash');
      expect(res.body).not.toHaveProperty('totp_secret');
    });

    it('returns 404 for a non-existent user', async () => {
      const res = await request(app).get('/api/v1/security/users/999999').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });

    it('lists users, excluding inactive ones by default', async () => {
      const { userId } = await createThrowawayUser('Doctor');
      await request(app).put(`/api/v1/security/users/${userId}`).set('Authorization', `Bearer ${adminToken}`).send({ is_active: false });

      const activeRes = await request(app).get('/api/v1/security/users').set('Authorization', `Bearer ${adminToken}`);
      expect(activeRes.body.some((u: any) => u.user_id === userId)).toBe(false);

      const allRes = await request(app).get('/api/v1/security/users').query({ includeInactive: 'true' }).set('Authorization', `Bearer ${adminToken}`);
      expect(allRes.body.some((u: any) => u.user_id === userId)).toBe(true);
    });

    it('updates a user role', async () => {
      const { userId } = await createThrowawayUser('Receptionist');
      const res = await request(app).put(`/api/v1/security/users/${userId}`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'Pharmacist' });
      expect(res.status).toBe(200);
      expect(res.body.role).toBe('Pharmacist');
    });

    it('prevents an admin from deactivating their own account', async () => {
      const res = await request(app).put(`/api/v1/security/users/${adminUserId}`).set('Authorization', `Bearer ${adminToken}`).send({ is_active: false });
      expect(res.status).toBe(400);
    });

    it('deactivating a user revokes their active sessions', async () => {
      const { userId, username, password } = await createThrowawayUser('Doctor');
      const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
      const token = loginRes.body.token;

      const beforeRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
      expect(beforeRes.status).toBe(200);

      await request(app).put(`/api/v1/security/users/${userId}`).set('Authorization', `Bearer ${adminToken}`).send({ is_active: false });

      const afterRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
      expect(afterRes.status).toBe(401);
    });

    it('resets a password and revokes existing sessions', async () => {
      const { userId, username, password } = await createThrowawayUser('Receptionist');
      const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
      const oldToken = loginRes.body.token;

      const resetRes = await request(app)
        .post(`/api/v1/security/users/${userId}/reset-password`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ newPassword: 'AdminResetPass1' });
      expect(resetRes.status).toBe(200);

      const staleRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${oldToken}`);
      expect(staleRes.status).toBe(401);

      const newLoginRes = await request(app).post('/api/v1/auth/login').send({ username, password: 'AdminResetPass1' });
      expect(newLoginRes.status).toBe(200);
    });
  });

  describe('Sessions', () => {
    it('lists the active session created by this suite\'s admin login', async () => {
      const res = await request(app).get('/api/v1/security/sessions').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((s: any) => s.username === 'admin')).toBe(true);
    });

    it('force-revokes a session, invalidating its token', async () => {
      const { username, password } = await createThrowawayUser('Pharmacist');
      const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
      const token = loginRes.body.token;
      const sessionId = Number((jwt.decode(token) as any).sid);

      const beforeRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
      expect(beforeRes.status).toBe(200);

      const revokeRes = await request(app).delete(`/api/v1/security/sessions/${sessionId}`).set('Authorization', `Bearer ${adminToken}`);
      expect(revokeRes.status).toBe(204);

      const afterRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
      expect(afterRes.status).toBe(401);
    });

    it('returns 404 revoking a non-existent session', async () => {
      const res = await request(app).delete('/api/v1/security/sessions/999999').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(404);
    });
  });
});
