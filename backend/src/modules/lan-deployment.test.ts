import request from 'supertest';

// The clinic LAN deployment: plain HTTP, production mode, portal origins derived from SITE_HOST.
// Both the origin list and the cookie's Secure flag are read when the app is first loaded, so each
// case loads a fresh copy of the app under the environment it wants to prove.

const loadApp = (env: Record<string, string | undefined>) => {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let app: any;
  jest.isolateModules(() => {
    // Ignore any backend/.env on the developer's machine: these cases prove what happens when a
    // variable is set or ABSENT, which a real .env would silently fill in.
    jest.doMock('dotenv', () => ({ __esModule: true, default: { config: () => ({}) }, config: () => ({}) }));
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    app = require('../app').default;
  });
  return {
    app,
    restore: () => {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    },
  };
};

const prod = { NODE_ENV: 'production', FRONTEND_URLS: '', FRONTEND_URL: '' };

describe('portal origins are derived from SITE_HOST in production', () => {
  const preflight = (app: any, origin: string) =>
    request(app).options('/api/v1/settings').set('Origin', origin).set('Access-Control-Request-Method', 'GET').set('Access-Control-Request-Headers', 'x-epoch-background');

  it('allows the four portals on the site host, and on localhost for the server itself', async () => {
    const { app, restore } = loadApp({ ...prod, SITE_HOST: '192.168.1.50' });
    try {
      for (const origin of ['http://192.168.1.50:5173', 'http://192.168.1.50:5174', 'http://192.168.1.50:5175', 'http://192.168.1.50:5176', 'http://localhost:5174']) {
        const res = await preflight(app, origin);
        expect(res.headers['access-control-allow-origin']).toBe(origin);
        expect(res.headers['access-control-allow-credentials']).toBe('true');
      }
    } finally {
      restore();
    }
  });

  it('refuses any other host, other ports, or a lookalike', async () => {
    const { app, restore } = loadApp({ ...prod, SITE_HOST: '192.168.1.50' });
    try {
      for (const origin of ['http://192.168.1.99:5174', 'http://192.168.1.50:9999', 'http://192.168.1.50.evil.example:5174', 'https://evil.example', 'http://192.168.1.50:5174.evil.example']) {
        const res = await preflight(app, origin);
        expect(res.headers['access-control-allow-origin']).toBeUndefined();
      }
    } finally {
      restore();
    }
  });

  it('allows nothing extra when SITE_HOST is not set (strict allow-list, no dev bypass)', async () => {
    const { app, restore } = loadApp({ ...prod, SITE_HOST: undefined });
    try {
      expect((await preflight(app, 'http://192.168.1.50:5174')).headers['access-control-allow-origin']).toBeUndefined();
    } finally {
      restore();
    }
  });

  it('still honours an explicit FRONTEND_URLS for anything unusual', async () => {
    const { app, restore } = loadApp({ ...prod, SITE_HOST: '192.168.1.50', FRONTEND_URLS: 'http://clinic-pc:5174' });
    try {
      expect((await preflight(app, 'http://clinic-pc:5174')).headers['access-control-allow-origin']).toBe('http://clinic-pc:5174');
    } finally {
      restore();
    }
  });
});

describe('login cookie over plain HTTP', () => {
  const loginCookie = async (env: Record<string, string | undefined>) => {
    const { app, restore } = loadApp(env);
    try {
      const res = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
      expect(res.status).toBe(200);
      return (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith('epoch_session='))!;
    } finally {
      restore();
    }
  };

  it('is NOT Secure when COOKIE_SECURE=false (what the LAN deployment sets) — so the browser will send it back over HTTP', async () => {
    const cookie = await loginCookie({ ...prod, SITE_HOST: '192.168.1.50', COOKIE_SECURE: 'false' });
    expect(cookie).toMatch(/HttpOnly/);
    expect(cookie).not.toMatch(/Secure/);
  });

  // Decided in config/auth.ts. Tested there directly (not through a login) because Prisma's client
  // reads backend/.env into process.env on its own, which would re-add a COOKIE_SECURE the case
  // deliberately removed.
  it('is Secure by default in production, so an accidental omission cannot silently weaken it', () => {
    const saved = { NODE_ENV: process.env.NODE_ENV, COOKIE_SECURE: process.env.COOKIE_SECURE };
    try {
      process.env.NODE_ENV = 'production';
      delete process.env.COOKIE_SECURE;
      let flag: boolean | undefined;
      jest.isolateModules(() => {
        jest.doMock('dotenv', () => ({ __esModule: true, default: { config: () => ({}) }, config: () => ({}) }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        flag = require('../config/auth').AUTH_COOKIE_SECURE;
      });
      expect(flag).toBe(true);

      process.env.COOKIE_SECURE = 'false';
      jest.isolateModules(() => {
        jest.doMock('dotenv', () => ({ __esModule: true, default: { config: () => ({}) }, config: () => ({}) }));
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        flag = require('../config/auth').AUTH_COOKIE_SECURE;
      });
      expect(flag).toBe(false);
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});
