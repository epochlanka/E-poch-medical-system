import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import app from '../../app';

const prisma = new PrismaClient();
const runId = Date.now();

describe('Suppliers API', () => {
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
    const res = await request(app).get('/api/v1/suppliers');
    expect(res.status).toBe(401);
  });

  it('rejects supplier creation from a non-Admin role', async () => {
    const res = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ name: 'Should Not Create' });
    expect(res.status).toBe(403);
  });

  let supplierId: number;

  it('creates a supplier and finds it in the directory', async () => {
    const createRes = await request(app)
      .post('/api/v1/suppliers')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: `Test Pharma Distributors ${runId}`, contact: '011-9999999' });
    expect(createRes.status).toBe(201);
    supplierId = createRes.body.supplier_id;

    const listRes = await request(app).get('/api/v1/suppliers').query({ search: `Test Pharma Distributors ${runId}` }).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(listRes.body.some((s: any) => s.supplier_id === supplierId)).toBe(true);
  });

  let medicineId: number;

  it('creates a Draft purchase order and submits it', async () => {
    const medicine = await prisma.medicine.create({ data: { name: `PO Test Drug ${runId}`, unit: 'tablet', is_active: true, reorder_level: 20 } });
    medicineId = medicine.medicine_id;

    const createRes = await request(app)
      .post('/api/v1/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ supplier_id: supplierId, items: [{ medicine_id: medicineId, qty_ordered: 100, unit_cost: 5 }] });
    expect(createRes.status).toBe(201);
    expect(createRes.body.status).toBe('Draft');

    const submitRes = await request(app).post(`/api/v1/suppliers/purchase-orders/${createRes.body.po_id}/submit`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(submitRes.status).toBe(200);
    expect(submitRes.body.status).toBe('Submitted');
  });

  let poId: number;
  let poItemId: number;

  it('receives a GRN matching the order exactly — no discrepancy, PO becomes Received', async () => {
    const poRes = await request(app)
      .post('/api/v1/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ supplier_id: supplierId, items: [{ medicine_id: medicineId, qty_ordered: 50, unit_cost: 5 }] });
    poId = poRes.body.po_id;
    poItemId = poRes.body.items[0].po_item_id;
    await request(app).post(`/api/v1/suppliers/purchase-orders/${poId}/submit`).set('Authorization', `Bearer ${pharmacistToken}`);

    const grnRes = await request(app)
      .post(`/api/v1/suppliers/purchase-orders/${poId}/grn`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        items: [{ po_item_id: poItemId, qty_received: 50, batch_no: `GRN-EXACT-${runId}`, expiry_date: new Date(Date.now() + 200 * 86400000).toISOString() }],
      });
    expect(grnRes.status).toBe(201);
    expect(grnRes.body.has_discrepancy).toBe(false);
    expect(grnRes.body.items[0].batch).toBeDefined();
    expect(grnRes.body.items[0].batch.qty_on_hand).toBe(50);

    const poAfter = await request(app).get(`/api/v1/suppliers/purchase-orders/${poId}`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(poAfter.body.status).toBe('Received');

    const batchLedger = await request(app)
      .get(`/api/v1/inventory/batches/${grnRes.body.items[0].batch.batch_id}/ledger`)
      .set('Authorization', `Bearer ${pharmacistToken}`);
    expect(batchLedger.body.data[0]).toMatchObject({ eventType: 'GRN', changeQty: 50 });
  });

  it('flags a GRN for review when the received quantity does not match the order', async () => {
    const poRes = await request(app)
      .post('/api/v1/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ supplier_id: supplierId, items: [{ medicine_id: medicineId, qty_ordered: 100, unit_cost: 5 }] });
    const discrepancyPoId = poRes.body.po_id;
    const discrepancyPoItemId = poRes.body.items[0].po_item_id;
    await request(app).post(`/api/v1/suppliers/purchase-orders/${discrepancyPoId}/submit`).set('Authorization', `Bearer ${pharmacistToken}`);

    const grnRes = await request(app)
      .post(`/api/v1/suppliers/purchase-orders/${discrepancyPoId}/grn`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({
        items: [
          { po_item_id: discrepancyPoItemId, qty_received: 80, batch_no: `GRN-SHORT-${runId}`, expiry_date: new Date(Date.now() + 200 * 86400000).toISOString() },
        ],
      });
    expect(grnRes.status).toBe(201);
    expect(grnRes.body.has_discrepancy).toBe(true);

    const poAfter = await request(app).get(`/api/v1/suppliers/purchase-orders/${discrepancyPoId}`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(poAfter.body.status).toBe('PartiallyReceived');

    const listRes = await request(app).get('/api/v1/suppliers/goods-received-notes').query({ hasDiscrepancy: 'true', reviewed: 'false' }).set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.body.some((g: any) => g.grn_id === grnRes.body.grn_id)).toBe(true);

    const reviewBlockedRes = await request(app)
      .post(`/api/v1/suppliers/goods-received-notes/${grnRes.body.grn_id}/review-discrepancy`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({});
    expect(reviewBlockedRes.status).toBe(403);

    const reviewRes = await request(app)
      .post(`/api/v1/suppliers/goods-received-notes/${grnRes.body.grn_id}/review-discrepancy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ notes: 'Contacted supplier, remainder to follow' });
    expect(reviewRes.status).toBe(200);
    expect(reviewRes.body.discrepancy_reviewed_by).toBeDefined();

    const reviewTwiceRes = await request(app)
      .post(`/api/v1/suppliers/goods-received-notes/${grnRes.body.grn_id}/review-discrepancy`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({});
    expect(reviewTwiceRes.status).toBe(400);
  });

  it('rejects receiving goods against a Draft (not yet submitted) purchase order', async () => {
    const poRes = await request(app)
      .post('/api/v1/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ supplier_id: supplierId, items: [{ medicine_id: medicineId, qty_ordered: 10 }] });

    const res = await request(app)
      .post(`/api/v1/suppliers/purchase-orders/${poRes.body.po_id}/grn`)
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ items: [{ po_item_id: poRes.body.items[0].po_item_id, qty_received: 10, batch_no: 'X', expiry_date: new Date(Date.now() + 86400000).toISOString() }] });
    expect(res.status).toBe(400);
  });

  it('rejects closing a purchase order that has not been fully Received', async () => {
    const draftPoRes = await request(app)
      .post('/api/v1/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ supplier_id: supplierId, items: [{ medicine_id: medicineId, qty_ordered: 5 }] });
    const res = await request(app).post(`/api/v1/suppliers/purchase-orders/${draftPoRes.body.po_id}/close`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(400);
  });

  it('closes a fully Received purchase order', async () => {
    // poId was fully received (no discrepancy) earlier in this suite.
    const res = await request(app).post(`/api/v1/suppliers/purchase-orders/${poId}/close`).set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('Closed');
  });

  it('suggests reorder quantities for low-stock medicines', async () => {
    const lowStockMedicine = await prisma.medicine.create({ data: { name: `Low Stock Drug ${runId}`, unit: 'tablet', reorder_level: 50, is_active: true } });
    await prisma.batch.create({ data: { medicine_id: lowStockMedicine.medicine_id, batch_no: `LOW-${runId}`, expiry_date: new Date(Date.now() + 86400000 * 100), qty_on_hand: 5 } });

    const res = await request(app).get('/api/v1/suppliers/purchase-orders/suggest-reorder').set('Authorization', `Bearer ${pharmacistToken}`);
    expect(res.status).toBe(200);
    const suggestion = res.body.find((s: any) => s.medicineId === lowStockMedicine.medicine_id);
    expect(suggestion).toBeDefined();
    expect(suggestion.suggestedQty).toBe(95); // target 2x reorder level (100) - current (5)
  });

  it('rejects purchase order creation from a read-only role (Receptionist)', async () => {
    const res = await request(app)
      .post('/api/v1/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${receptionToken}`)
      .send({ supplier_id: supplierId, items: [{ medicine_id: medicineId, qty_ordered: 10 }] });
    expect(res.status).toBe(403);
  });

  it('accepts an expected_date and reports it back', async () => {
    const expected = new Date(Date.now() + 5 * 86400000).toISOString();
    const res = await request(app)
      .post('/api/v1/suppliers/purchase-orders')
      .set('Authorization', `Bearer ${pharmacistToken}`)
      .send({ supplier_id: supplierId, expected_date: expected, items: [{ medicine_id: medicineId, qty_ordered: 10, unit_cost: 5 }] });
    expect(res.status).toBe(201);
    expect(new Date(res.body.expected_date).toISOString()).toBe(expected);
  });

  describe('GET /purchase-orders (list + computed totals)', () => {
    it('paginates, searches by PO number, and computes total/received amounts', async () => {
      // poId (from earlier in this suite) was received in full: 50 units @ 5 = 250.
      const res = await request(app)
        .get('/api/v1/suppliers/purchase-orders')
        .query({ search: `PO-${poId}` })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      const row = res.body.data.find((p: any) => p.po_id === poId);
      expect(row).toBeDefined();
      expect(row.totalAmount).toBe(250);
      expect(row.receivedAmount).toBe(250);
      expect(row.receivedPct).toBe(100);
      expect(row.status).toBe('Closed');
    });

    it('searches by supplier name', async () => {
      const res = await request(app)
        .get('/api/v1/suppliers/purchase-orders')
        .query({ search: `Test Pharma Distributors ${runId}` })
        .set('Authorization', `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.some((p: any) => p.po_id === poId)).toBe(true);
    });
  });

  describe('GET /purchase-orders/stats and /top-suppliers', () => {
    it('returns order-count and amount stats for the "all" range', async () => {
      const res = await request(app).get('/api/v1/suppliers/purchase-orders/stats').query({ range: 'all' }).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalOrders).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('completed');
      expect(res.body).toHaveProperty('pending');
      expect(res.body).toHaveProperty('partiallyReceived');
      expect(res.body).toHaveProperty('cancelled');
      expect(res.body.totalAmount).toBeGreaterThanOrEqual(res.body.receivedAmount);
    });

    it('rejects an invalid range value', async () => {
      const res = await request(app).get('/api/v1/suppliers/purchase-orders/stats').query({ range: 'decade' }).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(400);
    });

    it('ranks top suppliers by total order amount, highest first', async () => {
      // limit is generous rather than the real page-sized default (5) — the shared dev.db
      // accumulates suppliers/orders across every test run, so a tight limit can't reliably
      // be expected to contain any one specific supplier as that volume grows over time.
      const res = await request(app)
        .get('/api/v1/suppliers/purchase-orders/top-suppliers')
        .query({ range: 'all', limit: 1000 })
        .set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.some((s: any) => s.supplierId === supplierId)).toBe(true);
      const amounts = res.body.map((s: any) => s.totalAmount);
      expect(amounts).toEqual([...amounts].sort((a, b) => b - a));
    });
  });

  describe('POST /purchase-orders/:poId/cancel', () => {
    it('cancels a Draft purchase order', async () => {
      const poRes = await request(app)
        .post('/api/v1/suppliers/purchase-orders')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ supplier_id: supplierId, items: [{ medicine_id: medicineId, qty_ordered: 5 }] });

      const cancelRes = await request(app)
        .post(`/api/v1/suppliers/purchase-orders/${poRes.body.po_id}/cancel`)
        .set('Authorization', `Bearer ${pharmacistToken}`);
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.status).toBe('Cancelled');
    });

    it('rejects cancelling a purchase order that has already been (partially) received', async () => {
      // poId was fully Received then Closed earlier in this suite.
      const res = await request(app).post(`/api/v1/suppliers/purchase-orders/${poId}/cancel`).set('Authorization', `Bearer ${pharmacistToken}`);
      expect(res.status).toBe(400);
    });
  });

  describe('Supplier directory contact fields + computed totals', () => {
    it('accepts structured contact fields and searches by them', async () => {
      const createRes = await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: `Contact Fields Supplier ${runId}`,
          contact_person: `Nimal Perera ${runId}`,
          phone: '077 555 1234',
          email: `supplier-${runId}@example.com`,
          city: 'Kandy',
        });
      expect(createRes.status).toBe(201);
      expect(createRes.body.contact_person).toBe(`Nimal Perera ${runId}`);
      expect(createRes.body.city).toBe('Kandy');

      const searchRes = await request(app).get('/api/v1/suppliers').query({ search: 'Kandy' }).set('Authorization', `Bearer ${pharmacistToken}`);
      expect(searchRes.body.some((s: any) => s.supplier_id === createRes.body.supplier_id)).toBe(true);
    });

    it('reports totalOrders and totalPayable computed live from purchase orders', async () => {
      // supplierId had one PO fully received (50 @ 5 = 250) then closed, plus the expected_date
      // PO (10 @ 5 = 50, still Draft/unreceived) earlier in this suite.
      const listRes = await request(app).get('/api/v1/suppliers').query({ search: `Test Pharma Distributors ${runId}` }).set('Authorization', `Bearer ${pharmacistToken}`);
      const row = listRes.body.find((s: any) => s.supplier_id === supplierId);
      expect(row).toBeDefined();
      expect(row.totalOrders).toBeGreaterThan(0);
      expect(row.totalPayable).toBeGreaterThanOrEqual(250);
    });

    it('flags a received order as overdue once its payment-terms window has passed', async () => {
      const overdueSupplier = await request(app)
        .post('/api/v1/suppliers')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: `Overdue Test Supplier ${runId}`, payment_terms_days: 0 });
      const overdueSupplierId = overdueSupplier.body.supplier_id;

      const poRes = await request(app)
        .post('/api/v1/suppliers/purchase-orders')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({ supplier_id: overdueSupplierId, items: [{ medicine_id: medicineId, qty_ordered: 4, unit_cost: 10 }] });
      await request(app).post(`/api/v1/suppliers/purchase-orders/${poRes.body.po_id}/submit`).set('Authorization', `Bearer ${pharmacistToken}`);
      await request(app)
        .post(`/api/v1/suppliers/purchase-orders/${poRes.body.po_id}/grn`)
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          items: [
            {
              po_item_id: poRes.body.items[0].po_item_id,
              qty_received: 4,
              batch_no: `OVERDUE-${runId}`,
              expiry_date: new Date(Date.now() + 200 * 86400000).toISOString(),
            },
          ],
        });

      // payment_terms_days: 0 means the due date is the order date itself, already in the past.
      const listRes = await request(app).get('/api/v1/suppliers').query({ search: `Overdue Test Supplier ${runId}` }).set('Authorization', `Bearer ${pharmacistToken}`);
      const row = listRes.body.find((s: any) => s.supplier_id === overdueSupplierId);
      expect(row.overduePayable).toBe(40);
    });

    it('returns directory-wide stats', async () => {
      const res = await request(app).get('/api/v1/suppliers/stats').set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.totalSuppliers).toBeGreaterThan(0);
      expect(res.body.activeSuppliers).toBeGreaterThan(0);
      expect(res.body).toHaveProperty('totalOrdersThisMonth');
      expect(res.body).toHaveProperty('totalPayable');
      expect(res.body).toHaveProperty('overduePayable');
    });
  });
});
