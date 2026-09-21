import request from 'supertest';
import app from '../../app';

describe('Medicines API', () => {
  let token: string;
  let pharmacistToken: string;
  const runId = Date.now();

  beforeAll(async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    token = res.body.token;
    const pharmacistRes = await request(app).post('/api/v1/auth/login').send({ username: 'pharmacist', password: 'pharmacist123' });
    pharmacistToken = pharmacistRes.body.token;
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

  it('includes strength, base unit and an effective unit price per medicine', async () => {
    const res = await request(app).get('/api/v1/medicines').query({ search: 'Paracetamol' }).set('Authorization', `Bearer ${token}`);
    expect(res.body[0].strength).toBe('500mg');
    expect(res.body[0]).toHaveProperty('base_unit');
    expect(res.body[0]).toHaveProperty('unit_price');
  });

  describe('GET /medicines/stats', () => {
    it('returns catalog-wide stock counts and panel lists', async () => {
      const res = await request(app).get('/api/v1/medicines/stats').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('totalMedicines');
      expect(res.body.inStock + res.body.lowStock + res.body.outOfStock).toBe(res.body.totalMedicines);
      expect(Array.isArray(res.body.expiringList)).toBe(true);
      expect(Array.isArray(res.body.lowStockList)).toBe(true);
    });
  });

  describe('GET /medicines/stock', () => {
    it('paginates and reports sell price, stock value plus min/max stock levels', async () => {
      const res = await request(app).get('/api/v1/medicines/stock').query({ search: 'Paracetamol', limit: 5 }).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('pagination');
      const row = res.body.data.find((m: any) => m.name === 'Paracetamol 500mg');
      expect(row).toBeDefined();
      expect(row).toHaveProperty('sell_price');
      expect(row).toHaveProperty('stockValue');
      expect(row).toHaveProperty('reorder_level');
      expect(row).toHaveProperty('max_stock_level');
      expect(row).toHaveProperty('location');
    });

    it('filters by stock status', async () => {
      const res = await request(app).get('/api/v1/medicines/stock').query({ status: 'out-of-stock', limit: 100 }).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.every((m: any) => m.stockStatus === 'out-of-stock')).toBe(true);
    });

    it('filters by supplier', async () => {
      const res = await request(app).get('/api/v1/medicines/stock').query({ supplierId: 999999 }).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.length).toBe(0);
    });
  });

  describe('POST /medicines', () => {
    it('rejects creation from a read-only role (Doctor)', async () => {
      const res = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${token}`)
        .send({ name: `Reject Test ${runId}`, base_unit: 'Tablet' });
      expect(res.status).toBe(403);
    });

    it('creates a medicine with no initial stock — no batch is created', async () => {
      const res = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ name: `No Stock Drug ${runId}`, base_unit: 'Tablet', default_selling_price: 10 });
      expect(res.status).toBe(201);
      expect(res.body.medicine_id).toBeDefined();

      const batches = await request(app).get('/api/v1/inventory/batches').query({ medicineId: res.body.medicine_id }).set('Authorization', `Bearer ${pharmacistToken}`);
      expect(batches.body.data).toHaveLength(0);
    });

    it('creates a medicine with an initial stock batch in the same call', async () => {
      const expiry = new Date(Date.now() + 180 * 86400000).toISOString();
      const res = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: `Stocked Drug ${runId}`,
          base_unit: 'Tablet',
          default_selling_price: 20,
          initial_stock: {
            supplier_id: 1,
            batch_no: `OPEN-${runId}`,
            expiry_date: expiry,
            received_unit: 'Box',
            received_qty: 15,
            units_per_pack: 10,
            purchase_price_per_pack: 100,
            selling_price_per_pack: 150,
          },
        });
      expect(res.status).toBe(201);

      const batches = await request(app).get('/api/v1/inventory/batches').query({ medicineId: res.body.medicine_id }).set('Authorization', `Bearer ${pharmacistToken}`);
      expect(batches.body.data).toHaveLength(1);
      // 15 boxes x 10 tablets/box = 150 tablets in base units.
      expect(batches.body.data[0].qtyOnHand).toBe(150);
      expect(batches.body.data[0].batchNo).toBe(`OPEN-${runId}`);
      expect(batches.body.data[0].costPerBaseUnit).toBe(10);
      expect(batches.body.data[0].sellingPricePerBaseUnit).toBe(15);

      const ledger = await request(app)
        .get(`/api/v1/inventory/batches/${batches.body.data[0].batchId}/ledger`)
        .set('Authorization', `Bearer ${pharmacistToken}`);
      expect(ledger.body.data.some((entry: any) => entry.eventType === 'GRN' && entry.changeQty === 150)).toBe(true);
    });

    it('rejects initial stock with no batch number', async () => {
      const expiry = new Date(Date.now() + 90 * 86400000).toISOString();
      const res = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: `No Batch Number Drug ${runId}`,
          base_unit: 'Tablet',
          initial_stock: {
            supplier_id: 1,
            expiry_date: expiry,
            received_unit: 'Tablet',
            received_qty: 40,
            units_per_pack: 1,
            purchase_price_per_pack: 4,
            selling_price_per_base_unit: 6,
          },
        });
      expect(res.status).toBe(400);
    });

    it('rejects initial stock with a past expiry date', async () => {
      const res = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: `Expired Stock Drug ${runId}`,
          base_unit: 'Tablet',
          initial_stock: {
            supplier_id: 1,
            batch_no: `EXP-${runId}`,
            expiry_date: '2020-01-01',
            received_unit: 'Tablet',
            received_qty: 10,
            units_per_pack: 1,
            purchase_price_per_pack: 4,
            selling_price_per_base_unit: 6,
          },
        });
      expect(res.status).toBe(400);
    });

    it('rejects a non-positive initial stock quantity', async () => {
      const expiry = new Date(Date.now() + 90 * 86400000).toISOString();
      const res = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: `Zero Stock Drug ${runId}`,
          base_unit: 'Tablet',
          initial_stock: {
            supplier_id: 1,
            batch_no: `ZERO-${runId}`,
            expiry_date: expiry,
            received_unit: 'Tablet',
            received_qty: 0,
            units_per_pack: 1,
            purchase_price_per_pack: 4,
            selling_price_per_base_unit: 6,
          },
        });
      expect(res.status).toBe(400);
    });
  });

  describe('Add Stock Batch (existing Medicine Product)', () => {
    it('adds a new batch to an existing medicine without creating a duplicate product', async () => {
      const create = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ name: `Restock Drug ${runId}`, base_unit: 'Tablet', default_selling_price: 12 });
      const medicineId = create.body.medicine_id;

      const expiry = new Date(Date.now() + 200 * 86400000).toISOString();
      const res = await request(app)
        .post(`/api/v1/medicines/${medicineId}/stock-batches`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          supplier_id: 1,
          batch_no: `RESTOCK-${runId}`,
          expiry_date: expiry,
          received_unit: 'Strip',
          received_qty: 5,
          units_per_pack: 10,
          purchase_price_per_pack: 40,
          selling_price_per_pack: 60,
        });
      expect(res.status).toBe(201);
      expect(res.body.medicine_id).toBe(medicineId);
      expect(res.body.qty_on_hand).toBe(50);

      const withBatches = await request(app).get(`/api/v1/medicines/${medicineId}/batches`).set('Authorization', `Bearer ${pharmacistToken}`);
      expect(withBatches.status).toBe(200);
      expect(withBatches.body.batches).toHaveLength(1);
      expect(withBatches.body.totalQty).toBe(50);
    });
  });
});
