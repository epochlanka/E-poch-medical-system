import request from 'supertest';
import jwt from 'jsonwebtoken';
import { TOTP, Secret } from 'otpauth';
import { PrismaClient } from '@prisma/client';
import app from '../../app';
import { JWT_ALGORITHM, JWT_AUDIENCE, JWT_ISSUER, JWT_SECRET } from '../../config/auth';

const prisma = new PrismaClient();
const runId = Date.now();

const currentTotpCode = (secretBase32: string) => new TOTP({ secret: Secret.fromBase32(secretBase32), digits: 6, period: 30 }).generate();

describe('Auth API', () => {
  const signTestToken = (payload: Record<string, unknown>, secret = JWT_SECRET) =>
    jwt.sign(payload, secret, {
      algorithm: JWT_ALGORITHM,
      expiresIn: '10m',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    });

  it('should fail login with invalid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'wrongpassword' });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe('Invalid username or password');
  });

  it('should succeed login with valid credentials', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('token');
    expect(res.body.user).toHaveProperty('username', 'admin');
    expect(res.body.user).toHaveProperty('role', 'Admin');
  });

  it('should return 400 for missing fields', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin' });

    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Validation failed');
  });

  describe('JWT session binding', () => {
    it('rejects a token signed with the removed public fallback key', async () => {
      const token = signTestToken({ sub: 1 }, 'super-secret-jwt-key-replace-in-production');
      const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it('rejects a correctly signed token that has no server-side session id', async () => {
      const token = signTestToken({ sub: 1 });
      const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(401);
    });

    it('rejects a valid session id when it belongs to a different user', async () => {
      const loginRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
      expect(loginRes.status).toBe(200);
      const adminClaims = jwt.decode(loginRes.body.token) as { sid: number };
      const doctor = await prisma.user.findUniqueOrThrow({ where: { username: 'doctor' } });
      const token = signTestToken({ sub: doctor.user_id, sid: adminClaims.sid });

      const res = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(401);
    });
  });

  // Every test below acts on throwaway, per-run users created through the Security API rather
  // than the shared seeded admin/doctor/pharmacist/reception accounts — locking, password-resetting,
  // or enabling 2FA on those would break every other test *file's* login in this shared, un-reset dev DB.
  describe('Account lockout, 2FA, sessions, and password change (throwaway users)', () => {
    let adminToken: string;

    beforeAll(async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
      adminToken = res.body.token;
    });

    const createThrowawayUser = async (role: string, password = 'ThrowawayPass1') => {
      const username = `auth-test-${role.toLowerCase()}-${runId}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await request(app).post('/api/v1/security/users').set('Authorization', `Bearer ${adminToken}`).send({ username, password, role });
      expect(res.status).toBe(201);
      return { userId: res.body.user_id as number, username, password };
    };

    describe('Account lockout (FR-004)', () => {
      it('locks the account after 5 consecutive failed attempts, and an admin can unlock it', async () => {
        const { userId, username, password } = await createThrowawayUser('Receptionist');

        let lastRes;
        for (let i = 0; i < 5; i++) {
          lastRes = await request(app).post('/api/v1/auth/login').send({ username, password: 'wrong-password' });
        }
        expect(lastRes!.status).toBe(403);
        expect(lastRes!.body.locked).toBe(true);

        const stillLockedRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        expect(stillLockedRes.status).toBe(403);

        const unlockRes = await request(app).post(`/api/v1/security/users/${userId}/unlock`).set('Authorization', `Bearer ${adminToken}`);
        expect(unlockRes.status).toBe(200);
        expect(unlockRes.body.locked_until).toBeNull();

        const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        expect(loginRes.status).toBe(200);
      });
    });

    describe('Two-Factor Authentication (FR-008, Admin only)', () => {
      it('requires setup + verify before totp_enabled flips on, then gates login on the code', async () => {
        const { username, password } = await createThrowawayUser('Admin');
        const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        const userToken = loginRes.body.token;

        const setupRes = await request(app).post('/api/v1/auth/2fa/setup').set('Authorization', `Bearer ${userToken}`);
        expect(setupRes.status).toBe(200);
        expect(setupRes.body.secret).toBeTruthy();
        const { secret } = setupRes.body;

        const badVerifyRes = await request(app).post('/api/v1/auth/2fa/verify').set('Authorization', `Bearer ${userToken}`).send({ token: '000000' });
        expect(badVerifyRes.status).toBe(401);

        const verifyRes = await request(app)
          .post('/api/v1/auth/2fa/verify')
          .set('Authorization', `Bearer ${userToken}`)
          .send({ token: currentTotpCode(secret) });
        expect(verifyRes.status).toBe(200);
        expect(verifyRes.body.totpEnabled).toBe(true);

        const noCodeRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        expect(noCodeRes.status).toBe(401);
        expect(noCodeRes.body.requiresTotp).toBe(true);

        const wrongCodeRes = await request(app).post('/api/v1/auth/login').send({ username, password, totpToken: '111111' });
        expect(wrongCodeRes.status).toBe(401);

        const withCodeRes = await request(app).post('/api/v1/auth/login').send({ username, password, totpToken: currentTotpCode(secret) });
        expect(withCodeRes.status).toBe(200);

        const disableRes = await request(app).post('/api/v1/auth/2fa/disable').set('Authorization', `Bearer ${withCodeRes.body.token}`).send({ password });
        expect(disableRes.status).toBe(200);
        expect(disableRes.body.totpEnabled).toBe(false);
      });

      it('rejects a non-admin from setting up 2FA', async () => {
        const { username, password } = await createThrowawayUser('Doctor');
        const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        const res = await request(app).post('/api/v1/auth/2fa/setup').set('Authorization', `Bearer ${loginRes.body.token}`);
        expect(res.status).toBe(403);
      });
    });

    describe('Change password (self-service)', () => {
      it('rejects the wrong current password, then succeeds and revokes other sessions', async () => {
        const { username, password } = await createThrowawayUser('Pharmacist');
        const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        const token = loginRes.body.token;

        const wrongRes = await request(app)
          .post('/api/v1/auth/change-password')
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword: 'not-the-password', newPassword: 'NewPassword123' });
        expect(wrongRes.status).toBe(401);

        const changeRes = await request(app)
          .post('/api/v1/auth/change-password')
          .set('Authorization', `Bearer ${token}`)
          .send({ currentPassword: password, newPassword: 'NewPassword123' });
        expect(changeRes.status).toBe(200);

        // The token used to change the password was itself revoked as a side effect.
        const staleTokenRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
        expect(staleTokenRes.status).toBe(401);

        const newLoginRes = await request(app).post('/api/v1/auth/login').send({ username, password: 'NewPassword123' });
        expect(newLoginRes.status).toBe(200);
      });
    });

    describe('Logout and idle session timeout (FR-007)', () => {
      it('revokes the session on logout so the token stops working', async () => {
        const { username, password } = await createThrowawayUser('Receptionist');
        const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        const token = loginRes.body.token;

        const beforeRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
        expect(beforeRes.status).toBe(200);

        const logoutRes = await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
        expect(logoutRes.status).toBe(200);

        const afterRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
        expect(afterRes.status).toBe(401);
      });

      it('rejects a request once the session has been idle past the configured timeout', async () => {
        const { username, password } = await createThrowawayUser('Doctor');
        const loginRes = await request(app).post('/api/v1/auth/login').send({ username, password });
        const token = loginRes.body.token;
        const decoded = jwt.decode(token) as any;

        const beforeRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
        expect(beforeRes.status).toBe(200);

        await prisma.userSession.update({ where: { session_id: decoded.sid }, data: { last_activity_at: new Date(Date.now() - 20 * 60_000) } });

        const idleRes = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
        expect(idleRes.status).toBe(401);
      });
    });
  });
});
