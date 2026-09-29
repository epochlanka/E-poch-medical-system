import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

describe('Inventory API', () => {
  let adminToken: string;
  let pharmacistToken: string;
  let receptionToken: string;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;

    const receptionRes = await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' });
    receptionToken = receptionRes.body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/inventory/batches');
    expect(res.status).toBe(401);
  });

  it('lists batches with medicine info and lifecycle status', async () => {
    const res = await request(app).get('/api/v1/inventory/batches').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data[0]).toHaveProperty('status');
    expect(res.body.data[0]).toHaveProperty('medicineName');
  });

  it('filters batches by expiring status', async () => {
    const res = await request(app).get('/api/v1/inventory/batches').query({ status: 'Expiring' }).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((b: any) => b.status !== 'Expired')).toBe(true);
  });

  it('filters batches by Active status to in-date batches that still have stock', async () => {
    const res = await request(app).get('/api/v1/inventory/batches').query({ status: 'Active' }).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    // The schema accepted Active and the query ignored it, so every expired and depleted batch
    // came back too.
    expect(res.body.data.every((b: any) => b.status === 'Active')).toBe(true);
  });

  it('finds batches by medicine name, not only by batch number', async () => {
    const all = await request(app).get('/api/v1/inventory/batches').set('Authorization', `Bearer ${pharmacistToken}`);
    const name: string = all.body.data[0].medicineName;
    const res = await request(app)
      .get('/api/v1/inventory/batches')
      .query({ search: name.slice(0, 4) })
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.length).toBeGreaterThan(0);
    expect(res.body.data.some((b: any) => b.medicineName === name)).toBe(true);
  });

  // A medicine whose whole stock has expired cannot be dispensed, so it must still raise a
  // reorder alert. Counting expired units as on-hand used to suppress it entirely.
  it('raises a low-stock alert for a medicine whose only stock has expired', async () => {
    const medicine = await prisma.medicine.create({
      data: {
        barcode: `EXP-${Date.now()}`,
        name: `Expired Only ${Date.now()}`,
        form: 'Tablet',
        base_unit: 'Tablet',
        default_selling_price: 5,
      },
    });
    await prisma.batch.create({
      data: {
        medicine_id: medicine.medicine_id,
        batch_no: `EXPB-${Date.now()}`,
        expiry_date: new Date(Date.now() - 86400000),
        qty_on_hand: 500,
        qty_base_total: 500,
        received_qty: 500,
        received_unit: 'Tablet',
        units_per_pack: 1,
        purchase_price_per_pack: 1,
        cost_per_base_unit: 1,
        selling_price_per_base_unit: 5,
      },
    });

    const res = await request(app).get('/api/v1/inventory/alerts').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    const alert = res.body.find((a: any) => a.type === 'low-stock' && a.refId === medicine.medicine_id);
    expect(alert).toBeDefined();
    expect(alert.severity).toBe('red');
    expect(alert.message).toMatch(/0 left/);
    expect(alert.message).toMatch(/500 more on hand but expired/);

    const catalog = await request(app)
      .get('/api/v1/medicines/catalog')
      .query({ search: medicine.name })
      .set('Authorization', `Bearer ${pharmacistToken}`);
    const row = catalog.body.data.find((m: any) => m.medicine_id === medicine.medicine_id);
    expect(row.stockStatus).toBe('out-of-stock');
    expect(row.usableQty).toBe(0);
    expect(row.totalQty).toBe(500);
  });

  it('calls a medicine low on its usable stock alone, ignoring a large expired pile', async () => {
    const medicine = await prisma.medicine.create({
      data: {
        barcode: `MIX-${Date.now()}`,
        name: `Mostly Expired ${Date.now()}`,
        form: 'Tablet',
        base_unit: 'Tablet',
        default_selling_price: 5,
      },
    });
    const base = {
      medicine_id: medicine.medicine_id,
      qty_base_total: 0,
      received_unit: 'Tablet',
      units_per_pack: 1,
      purchase_price_per_pack: 1,
      cost_per_base_unit: 1,
      selling_price_per_base_unit: 5,
    };
    await prisma.batch.create({
      data: { ...base, batch_no: `MIXE-${Date.now()}`, expiry_date: new Date(Date.now() - 86400000), qty_on_hand: 400, received_qty: 400 },
    });
    await prisma.batch.create({
      data: { ...base, batch_no: `MIXV-${Date.now()}`, expiry_date: new Date(Date.now() + 86400000 * 200), qty_on_hand: 5, received_qty: 5 },
    });

    const catalog = await request(app)
      .get('/api/v1/medicines/catalog')
      .query({ search: medicine.name })
      .set('Authorization', `Bearer ${pharmacistToken}`);
    const row = catalog.body.data.find((m: any) => m.medicine_id === medicine.medicine_id);
    // 405 owned looks healthy; only 5 are dispensable, which is under the threshold of 10.
    expect(row.totalQty).toBe(405);
    expect(row.usableQty).toBe(5);
    expect(row.stockStatus).toBe('low');
  });

  it('returns a single batch with medicine/supplier detail', async () => {
    const res = await request(app).get('/api/v1/inventory/batches/1').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.batch_id).toBe(1);
    expect(res.body.medicine).toBeDefined();
  });

  it('returns 404 for a non-existent batch', async () => {
    const res = await request(app).get('/api/v1/inventory/batches/999999').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(404);
  });

  it('returns the ledger for a seeded batch showing its GRN and dispense history', async () => {
    const res = await request(app).get('/api/v1/inventory/batches/1/ledger').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.some((e: any) => e.eventType === 'GRN')).toBe(true);
    expect(res.body.data.some((e: any) => e.eventType === 'Dispense')).toBe(true);
  });

  it('rejects a manual adjustment from a non-inventory role (Receptionist)', async () => {
    const res = await request(app)
      .post('/api/v1/inventory/batches/1/adjust')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ delta: 5, reason: 'Test' });
    expect(res.status).toBe(403);
  });

  it('rejects a manual adjustment without a reason', async () => {
    const res = await request(app).post('/api/v1/inventory/batches/1/adjust').set('Authorization', `Bearer ${pharmacistToken}`).send({ delta: 5 });
    expect(res.status).toBe(400);
  });

  let adjustBatchId: number;

  it('applies a reason-coded manual adjustment and writes a ledger row', async () => {
    const batch = await prisma.batch.create({
      data: { medicine_id: 1, batch_no: `ADJ-${runId}`, expiry_date: new Date(Date.now() + 60 * 86400000), qty_on_hand: 10 },
    });
    adjustBatchId = batch.batch_id;

    const res = await request(app)
      .post(`/api/v1/inventory/batches/${adjustBatchId}/adjust`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ delta: -3, reason: 'Breakage during shelf restock' });

    expect(res.status).toBe(200);
    expect(res.body.qty_on_hand).toBe(7);

    const ledgerRes = await request(app).get(`/api/v1/inventory/batches/${adjustBatchId}/ledger`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(ledgerRes.body.data[0]).toMatchObject({ eventType: 'Adjustment', changeQty: -3, balanceAfter: 7, reason: 'Breakage during shelf restock' });
  });

  it('rejects an adjustment that would take a batch below zero', async () => {
    const res = await request(app)
      .post(`/api/v1/inventory/batches/${adjustBatchId}/adjust`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ delta: -100, reason: 'Should be rejected' });
    expect(res.status).toBe(400);
  });

  describe('PATCH /batches/:batchId/location', () => {
    it('rejects from a non-inventory role (Receptionist)', async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/batches/${adjustBatchId}/location`)
        .set('Authorization', `Bearer ${receptionToken}`)
        .send({ location: 'Main Store / Shelf A-01' });
      expect(res.status).toBe(403);
    });

    it('rejects an empty location', async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/batches/${adjustBatchId}/location`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ location: '' });
      expect(res.status).toBe(400);
    });

    it('relocates a batch without touching its quantity', async () => {
      const res = await request(app)
        .patch(`/api/v1/inventory/batches/${adjustBatchId}/location`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ location: 'Main Store / Shelf A-01' });
      expect(res.status).toBe(200);
      expect(res.body.location).toBe('Main Store / Shelf A-01');
      expect(res.body.qty_on_hand).toBe(7);
    });

    it('returns 404 for a non-existent batch', async () => {
      const res = await request(app)
        .patch('/api/v1/inventory/batches/999999/location')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ location: 'Somewhere' });
      expect(res.status).toBe(404);
    });
  });

  it('returns low-stock and expiry alerts', async () => {
    const res = await request(app).get('/api/v1/inventory/alerts').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.some((a: any) => a.type === 'low-stock')).toBe(true);
    expect(res.body.some((a: any) => a.type === 'expiring-batch')).toBe(true);
  });

  it('creates a stock count with a small variance that posts without review', async () => {
    const batch = await prisma.batch.create({
      data: { medicine_id: 1, batch_no: `COUNT-SMALL-${runId}`, expiry_date: new Date(Date.now() + 60 * 86400000), qty_on_hand: 100 },
    });

    const createRes = await request(app)
      .post('/api/v1/inventory/stock-counts')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ batch_id: batch.batch_id, counted_qty: 98 }] }); // 2% variance, under the 10% threshold
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('Draft');

    const postRes = await request(app)
      .post(`/api/v1/inventory/stock-counts/${createRes.body.stock_count_id}/post`)
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(postRes.status).toBe(200);
    expect(postRes.body.status).toBe('Posted');

    const batchAfter = await prisma.batch.findUnique({ where: { batch_id: batch.batch_id } });
    expect(batchAfter?.qty_on_hand).toBe(98);
  });

  it('refuses to apply a count when stock moved after counting', async () => {
    const batch = await prisma.batch.create({
      data: { medicine_id: 1, batch_no: `COUNT-STALE-${runId}`, expiry_date: new Date(Date.now() + 60 * 86400000), qty_on_hand: 100 },
    });
    const createRes = await request(app)
      .post('/api/v1/inventory/stock-counts')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ batch_id: batch.batch_id, counted_qty: 98 }] });
    expect(createRes.status).toBe(201);

    await request(app)
      .post(`/api/v1/inventory/batches/${batch.batch_id}/adjust`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ delta: 5, reason: 'New stock found after count' });

    const postRes = await request(app)
      .post(`/api/v1/inventory/stock-counts/${createRes.body.stock_count_id}/post`)
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(postRes.status).toBe(400);
    expect(postRes.body.message).toMatch(/count this batch again/i);
    expect((await prisma.batch.findUniqueOrThrow({ where: { batch_id: batch.batch_id } })).qty_on_hand).toBe(105);
  });

  it('flags a large variance for review and blocks a non-Admin from posting it', async () => {
    const batch = await prisma.batch.create({
      data: { medicine_id: 1, batch_no: `COUNT-BIG-${runId}`, expiry_date: new Date(Date.now() + 60 * 86400000), qty_on_hand: 100 },
    });

    const createRes = await request(app)
      .post('/api/v1/inventory/stock-counts')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ batch_id: batch.batch_id, counted_qty: 50 }] }); // 50% variance
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('PendingReview');

    const blockedRes = await request(app)
      .post(`/api/v1/inventory/stock-counts/${createRes.body.stock_count_id}/post`)
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(blockedRes.status).toBe(403);

    const adminRes = await request(app)
      .post(`/api/v1/inventory/stock-counts/${createRes.body.stock_count_id}/post`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(adminRes.status).toBe(200);
    expect(adminRes.body.status).toBe('Posted');
  });

  it('rejects posting the same stock count twice', async () => {
    const batch = await prisma.batch.create({
      data: { medicine_id: 1, batch_no: `COUNT-ONCE-${runId}`, expiry_date: new Date(Date.now() + 60 * 86400000), qty_on_hand: 20 },
    });
    const createRes = await request(app)
      .post('/api/v1/inventory/stock-counts')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ batch_id: batch.batch_id, counted_qty: 20 }] });

    await request(app).post(`/api/v1/inventory/stock-counts/${createRes.body.stock_count_id}/post`).set('Authorization', `Bearer ${pharmacistToken}`);
    const res = await request(app).post(`/api/v1/inventory/stock-counts/${createRes.body.stock_count_id}/post`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(400);
  });
});
