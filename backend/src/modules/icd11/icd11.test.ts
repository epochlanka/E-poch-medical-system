import request from 'supertest';
import app from '../../app';

describe('ICD-11 API', () => {
  let token: string;
  let fetchSpy: jest.SpyInstance;

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    token = res.body.token;
  });

  afterEach(() => {
    fetchSpy?.mockRestore();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/icd11/search').query({ q: 'diabetes' });
    expect(res.status).toBe(401);
  });

  it('rejects a query shorter than 2 characters', async () => {
    const res = await request(app).get('/api/v1/icd11/search').query({ q: 'd' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('fetches a token once and reuses it across searches, stripping highlight markup', async () => {
    fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce({ ok: true, json: async () => ({ access_token: 'test-token', expires_in: 3600 }) } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          destinationEntities: [
            { theCode: '5A11', title: "<em class='found'>Diabetes</em> mellitus, type 2" },
            { title: 'No code entity' },
          ],
        }),
      } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ destinationEntities: [{ theCode: '5A10', title: 'Diabetes mellitus, type 1' }] }),
      } as any);

    const res1 = await request(app).get('/api/v1/icd11/search').query({ q: 'diabetes' }).set('Authorization', `Bearer ${token}`);
    expect(res1.status).toBe(200);
    expect(res1.body).toEqual([{ code: '5A11', title: 'Diabetes mellitus, type 2' }]);

    const res2 = await request(app).get('/api/v1/icd11/search').query({ q: 'diabetes type 1' }).set('Authorization', `Bearer ${token}`);
    expect(res2.status).toBe(200);
    expect(res2.body).toEqual([{ code: '5A10', title: 'Diabetes mellitus, type 1' }]);

    // 1 token fetch + 2 searches — the second search reuses the cached token.
    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('returns 502 when the upstream WHO API call fails', async () => {
    // The cached token from the previous test is still valid, so this exercises the search-call failure path.
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValueOnce({ ok: false } as any);
    const res = await request(app).get('/api/v1/icd11/search').query({ q: 'unreachable' }).set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(502);
  });
});
