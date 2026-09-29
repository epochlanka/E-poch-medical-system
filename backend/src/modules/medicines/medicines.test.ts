import request from 'supertest';
import app from '../../app';
import { prisma } from '../../lib/prisma';
import ExcelJS from 'exceljs';

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

    it('accepts initial stock with no batch number and generates one', async () => {
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
      expect(res.status).toBe(201);
      const batches = await prisma.batch.findMany({ where: { medicine_id: res.body.medicine_id } });
      expect(batches).toHaveLength(1);
      expect(batches[0].batch_no).toMatch(/^NOBATCH-/);
    });

    it('falls back to the opening-stock supplier when none is given', async () => {
      const expiry = new Date(Date.now() + 90 * 86400000).toISOString();
      const res = await request(app)
        .post('/api/v1/medicines')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .send({
          name: `No Supplier Drug ${runId}`,
          base_unit: 'Tablet',
          initial_stock: {
            expiry_date: expiry,
            received_unit: 'Tablet',
            received_qty: 40,
            units_per_pack: 1,
            selling_price_per_base_unit: 6,
          },
        });
      expect(res.status).toBe(201);
      const batch = await prisma.batch.findFirst({ where: { medicine_id: res.body.medicine_id }, include: { supplier: true } });
      expect(batch).not.toBeNull();
      expect(batch!.supplier!.name).toBe('Opening stock (added at setup)');
      // No purchase price given — recorded as zero rather than rejected.
      expect(batch!.cost_per_base_unit).toBe(0);
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

  describe('Spreadsheet stock import', () => {
    const sheetBuffer = async (rows: unknown[][], sheetName = 'Medicines') => {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(sheetName);
      rows.forEach((row) => sheet.addRow(row));
      return Buffer.from(await workbook.xlsx.writeBuffer());
    };
    const HEADERS = ['Medicine name', 'Form', 'Strength', 'Unit', 'Quantity on shelf', 'Selling price per unit', 'Expiry date'];
    const future = '2031-12-31';

    it('serves a template workbook that imports as zero rows', async () => {
      // responseType('blob') so res.body is the raw workbook rather than a parse attempt.
      const res = await request(app)
        .get('/api/v1/medicines/import-template')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .responseType('blob');
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('spreadsheetml');
      expect(Buffer.isBuffer(res.body)).toBe(true);

      // The blank template must not itself contain importable rows, or a staff member who uploads
      // it unchanged creates fictional medicines with fictional stock.
      const back = await request(app)
        .post('/api/v1/medicines/import?dryRun=true')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', res.body, 'template.xlsx');
      expect(back.status).toBe(400);
      expect(back.body.message).toMatch(/no medicines/i);
    });

    it('previews without writing anything, then writes the same result', async () => {
      const name = `Sheet Drug ${runId}`;
      const file = await sheetBuffer([HEADERS, [name, 'Tablet', '500mg', '', 250, 4.5, future]]);

      const dry = await request(app)
        .post('/api/v1/medicines/import?dryRun=true')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', file, 'stock.xlsx');
      expect(dry.status).toBe(200);
      expect(dry.body).toMatchObject({ created: 1, updated: 0, errored: 0, batches: 1, unitsAdded: 250, dryRun: true });
      expect(await prisma.medicine.count({ where: { name } })).toBe(0);

      const real = await request(app)
        .post('/api/v1/medicines/import')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', file, 'stock.xlsx');
      expect(real.status).toBe(200);
      expect(real.body).toMatchObject({ created: 1, updated: 0, errored: 0, batches: 1, unitsAdded: 250 });

      const saved = await prisma.medicine.findFirstOrThrow({ where: { name }, include: { batches: true } });
      expect(saved.base_unit).toBe('Tablet');
      expect(saved.batches).toHaveLength(1);
      expect(saved.batches[0].qty_on_hand).toBe(250);
      // Imported stock goes through the same audited path as a hand-entered batch.
      const grnItem = await prisma.gRNItem.findFirst({ where: { batch_id: saved.batches[0].batch_id } });
      expect(grnItem).not.toBeNull();
    });

    it('treats repeated rows for one medicine as extra batches, not duplicates', async () => {
      const name = `Two Batch Drug ${runId}`;
      const file = await sheetBuffer([
        HEADERS,
        [name, 'Tablet', '500mg', '', 100, 2, future],
        [name, 'Tablet', '500mg', '', 60, 2, '2032-06-30'],
      ]);
      const res = await request(app)
        .post('/api/v1/medicines/import')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', file, 'stock.xlsx');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: 1, updated: 1, batches: 2, unitsAdded: 160 });
      expect(await prisma.medicine.count({ where: { name } })).toBe(1);
    });

    it('reads the headings and dates staff actually type, and infers the unit from the form', async () => {
      const name = `Loose Sheet Drug ${runId}`;
      const file = await sheetBuffer([
        ['Clinic stock count'],
        [],
        ['Drug Name', 'Dosage Form', 'Qty', 'MRP', 'Exp Date', 'Notes'],
        [name, 'Syrup', 15, 'Rs. 450', '31/12/2031', 'shelf B'],
      ]);
      const res = await request(app)
        .post('/api/v1/medicines/import')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', file, 'stock.xlsx');
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ created: 1, errored: 0, unitsAdded: 15 });
      expect(res.body.unknownHeaders).toContain('Notes');

      const saved = await prisma.medicine.findFirstOrThrow({ where: { name } });
      expect(saved.base_unit).toBe('ml'); // Syrup, so counted in millilitres
      expect(saved.default_selling_price).toBe(450);
    });

    it('skips bad rows with a reason and still imports the good ones', async () => {
      const good = `Mixed Sheet Drug ${runId}`;
      const file = await sheetBuffer([
        HEADERS,
        [good, 'Tablet', '', '', 40, 1.5, future],
        ['', 'Tablet', '', '', 5, 1, future],
        [`Expired ${runId}`, 'Tablet', '', '', 5, 1, '2020-01-01'],
        [`Priceless ${runId}`, 'Tablet', '', '', 5, '', future],
      ]);
      const res = await request(app)
        .post('/api/v1/medicines/import')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', file, 'stock.xlsx');
      expect(res.status).toBe(200);
      expect(res.body.created).toBe(1);
      expect(res.body.errored).toBe(3);
      const messages = res.body.results.filter((r: any) => r.status === 'error').map((r: any) => r.message).join(' | ');
      expect(messages).toMatch(/name is missing/i);
      expect(messages).toMatch(/already passed/i);
      expect(messages).toMatch(/Quantity, Selling price and Expiry date/i);
      expect(await prisma.medicine.count({ where: { name: `Expired ${runId}` } })).toBe(0);
    });

    it('rejects a file that is not a spreadsheet, and one with no recognisable headings', async () => {
      const notASheet = await request(app)
        .post('/api/v1/medicines/import')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', Buffer.from('just some notes'), 'notes.txt');
      expect(notASheet.status).toBe(400);
      expect(notASheet.body.message).toMatch(/Excel|CSV/i);

      const noHeaders = await request(app)
        .post('/api/v1/medicines/import')
        .set('Authorization', `Bearer ${pharmacistToken}`)
        .attach('file', Buffer.from('hello,world\n1,2'), 'junk.csv');
      expect(noHeaders.status).toBe(400);
      expect(noHeaders.body.message).toMatch(/header row/i);
    });

    it('refuses the import to a role that may not manage stock', async () => {
      const file = await sheetBuffer([HEADERS, [`Denied ${runId}`, 'Tablet', '', '', 10, 1, future]]);
      const res = await request(app)
        .post('/api/v1/medicines/import')
        .set('Authorization', `Bearer ${token}`)
        .attach('file', file, 'stock.xlsx');
      expect([401, 403]).toContain(res.status);
    });
  });

});
