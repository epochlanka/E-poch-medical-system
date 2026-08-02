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
});
