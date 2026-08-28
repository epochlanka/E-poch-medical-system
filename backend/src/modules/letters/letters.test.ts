import request from 'supertest';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import PizZip from 'pizzip';
import { PrismaClient } from '@prisma/client';
import app from '../../app';
import { findLibreOffice } from './libreoffice';
import { issuedDir, templatesDir } from './service';

const prisma = new PrismaClient();
const runId = Date.now();
const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// LibreOffice is required to actually render a PDF. When it isn't installed (e.g. a bare CI
// box), the render endpoints return 503 by design — gate those assertions rather than failing.
const HAS_LO = !!findLibreOffice();
const pdfIt = HAS_LO ? it : it.skip;

// A cold LibreOffice conversion takes several seconds; some tests do two or three.
jest.setTimeout(60_000);

// Minimal but valid .docx built in-memory so tests don't depend on Word.
const buildDocx = (opts: { includeBody?: boolean; extra?: string[] } = {}): Buffer => {
  const { includeBody = true, extra = [] } = opts;
  const paras = [
    '{{CLINIC_NAME}}',
    'Patient: {{PATIENT_NAME}} ({{PATIENT_AGE}})  Date: {{DATE}}',
    ...(includeBody ? ['{{LETTER_BODY}}'] : ['(no editable body in this template)']),
    '{{DOCTOR_NAME}} — Reg {{REGISTRATION_NO}}',
    ...extra,
  ]
    .map((t) => `<w:p><w:r><w:t xml:space="preserve">${t.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</w:t></w:r></w:p>`)
    .join('');
  const documentXml =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${paras}` +
    `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr>` +
    `</w:body></w:document>`;
  const zip = new PizZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`
  );
  zip.file('word/document.xml', documentXml);
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`
  );
  return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
};

const binaryParser = (res: any, cb: (err: Error | null, body: Buffer) => void) => {
  const chunks: Buffer[] = [];
  res.on('data', (c: Buffer) => chunks.push(Buffer.from(c)));
  res.on('end', () => cb(null, Buffer.concat(chunks)));
};

describe('Letters API (DOCX templates)', () => {
  let adminToken: string;
  let doctorToken: string;
  let doctorId: number;
  let receptionToken: string;

  beforeAll(async () => {
    adminToken = (await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' })).body.token;
    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
    doctorId = doctorRes.body.user.id;
    receptionToken = (await request(app).post('/api/v1/auth/login').send({ username: 'reception', password: 'reception123' })).body.token;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  const createTemplate = (token: string, extra: Record<string, string> = {}, docx: Buffer = buildDocx()) => {
    const req = request(app)
      .post('/api/v1/letters/templates')
      .set('Authorization', `Bearer ${token}`)
      .field('name', extra.name ?? `Medical Certificate ${runId}`)
      .field('letter_type', extra.letter_type ?? 'Medical Certificate')
      .field('clinic_name', extra.clinic_name ?? 'E-POCH Test Clinic')
      .field('doctor_name', extra.doctor_name ?? 'Dr. Test')
      .field('registration_number', extra.registration_number ?? 'SLMC-00001');
    return req.attach('file', docx, { filename: 'Medical Certificate.docx', contentType: DOCX_MIME });
  };

  const makeAppointment = async (opts: { temporary: boolean }) => {
    const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
    if (opts.temporary) {
      const appointment = await prisma.appointment.create({
        data: {
          doctor_id: doctorId,
          scheduled_at: new Date(),
          status: 'Consulting',
          created_by: receptionist.user_id,
          is_walk_in: true,
          is_temporary: true,
          temp_patient_name: `Temp Letter Patient ${runId}`,
          temp_patient_age: 40,
        },
      });
      return { appointment, patientId: null as string | null };
    }
    const family = await prisma.family.create({ data: { family_name: `Letter Fam ${runId}-${Math.random()}` } });
    const patient = await prisma.patient.create({
      data: {
        patient_id: `PT-LTR-${runId}-${Math.random().toString(36).slice(2, 8)}`,
        family_id: family.family_id,
        full_name: 'Letter Test Patient',
        dob: new Date('1985-01-01'),
        gender: 'Female',
      },
    });
    const appointment = await prisma.appointment.create({
      data: { patient_id: patient.patient_id, doctor_id: doctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
    });
    return { appointment, patientId: patient.patient_id };
  };

  // ---- Template management ----------------------------------------------------------

  it('rejects unauthenticated requests', async () => {
    expect((await request(app).get('/api/v1/letters/templates')).status).toBe(401);
  });

  it('rejects .docx template creation from a Doctor (Admin-only)', async () => {
    const res = await createTemplate(doctorToken);
    expect(res.status).toBe(403);
  });

  it('rejects a non-.docx upload', async () => {
    const res = await request(app)
      .post('/api/v1/letters/templates')
      .set('Authorization', `Bearer ${adminToken}`)
      .field('name', `Bad ${runId}`)
      .attach('file', Buffer.from('not a word doc'), { filename: 'notes.txt', contentType: 'text/plain' });
    expect(res.status).toBe(400);
  });

  let templateId: number;
  let v1OriginalName: string;

  it('lets Admin create a template by uploading a .docx, and reports its placeholders', async () => {
    const res = await createTemplate(adminToken);
    expect(res.status).toBe(201);
    expect(res.body.name).toBe(`Medical Certificate ${runId}`);
    expect(res.body.letter_type).toBe('Medical Certificate');
    expect(res.body.is_active).toBe(true);
    expect(res.body.current_version.version_number).toBe(1);
    expect(res.body.current_version.placeholder_report.found).toEqual(expect.arrayContaining(['LETTER_BODY', 'PATIENT_NAME']));
    expect(res.body.current_version.placeholder_report.missingBody).toBe(false);
    templateId = res.body.letter_template_id;
    v1OriginalName = res.body.current_version.original_filename;
  });

  it('flags a template uploaded without {{LETTER_BODY}}', async () => {
    const res = await createTemplate(adminToken, { name: `No Body ${runId}` }, buildDocx({ includeBody: false, extra: ['{{MYSTERY_FIELD}}'] }));
    expect(res.status).toBe(201);
    expect(res.body.current_version.placeholder_report.missingBody).toBe(true);
    expect(res.body.current_version.placeholder_report.unknown).toContain('MYSTERY_FIELD');
    await request(app).delete(`/api/v1/letters/templates/${res.body.letter_template_id}`).set('Authorization', `Bearer ${adminToken}`);
  });

  it('lets Doctor and Receptionist read templates but not edit them', async () => {
    expect((await request(app).get('/api/v1/letters/templates').set('Authorization', `Bearer ${doctorToken}`)).status).toBe(200);
    expect((await request(app).get('/api/v1/letters/templates').set('Authorization', `Bearer ${receptionToken}`)).status).toBe(200);
    const edit = await request(app).put(`/api/v1/letters/templates/${templateId}`).set('Authorization', `Bearer ${doctorToken}`).send({ name: 'Hacked' });
    expect(edit.status).toBe(403);
  });

  it('creates a version 2 on replace, repoints current_version, and keeps the v1 file on disk', async () => {
    const before = fs.readdirSync(templatesDir).filter((f) => f.startsWith(`t${templateId}-v1-`));
    expect(before.length).toBe(1);

    const res = await request(app)
      .post(`/api/v1/letters/templates/${templateId}/docx`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buildDocx({ extra: ['Version two footer line'] }), { filename: 'Medical Certificate v2.docx', contentType: DOCX_MIME });
    expect(res.status).toBe(200);
    expect(res.body.current_version.version_number).toBe(2);
    expect(res.body.version_count).toBe(2);

    const v1Still = fs.readdirSync(templatesDir).filter((f) => f.startsWith(`t${templateId}-v1-`));
    expect(v1Still).toEqual(before); // v1 file untouched
  });

  it('downloads the blank starter template as a .docx', async () => {
    const res = await request(app).get('/api/v1/letters/templates/blank.docx').set('Authorization', `Bearer ${adminToken}`).buffer().parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 2).toString('latin1')).toBe('PK'); // zip magic
  });

  it('blocks a Doctor from downloading the blank template', async () => {
    expect((await request(app).get('/api/v1/letters/templates/blank.docx').set('Authorization', `Bearer ${doctorToken}`)).status).toBe(403);
  });

  // ---- Rendering -------------------------------------------------------------------

  pdfIt('renders an Admin sample-data preview PDF', async () => {
    const res = await request(app).get(`/api/v1/letters/templates/${templateId}/preview.pdf`).set('Authorization', `Bearer ${adminToken}`).buffer().parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  pdfIt('previews a doctor letter (PDF) without persisting anything', async () => {
    const { appointment } = await makeAppointment({ temporary: false });
    const before = await prisma.issuedLetter.count();
    const res = await request(app)
      .post('/api/v1/letters/preview')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ templateId, appointmentId: appointment.appointment_id, bodyContent: 'Fit for work.' })
      .buffer()
      .parse(binaryParser);
    expect(res.status).toBe(200);
    expect(res.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(await prisma.issuedLetter.count()).toBe(before);
  });

  pdfIt('issues a letter for a registered patient: frozen files on disk + IssuedLetter row in history', async () => {
    const { appointment, patientId } = await makeAppointment({ temporary: false });
    const body = `Issued body ${runId}`;
    const issue = await request(app)
      .post('/api/v1/letters/issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ templateId, appointmentId: appointment.appointment_id, bodyContent: body });
    expect(issue.status).toBe(200);
    expect(issue.headers['content-type']).toBe('application/pdf');

    const list = await request(app).get('/api/v1/letters/issued').query({ patientId }).set('Authorization', `Bearer ${doctorToken}`);
    expect(list.body.length).toBe(1);
    const issuedId = list.body[0].issued_letter_id;

    const row = await prisma.issuedLetter.findUniqueOrThrow({ where: { issued_letter_id: issuedId } });
    expect(fs.existsSync(path.join(issuedDir, row.pdf_filename))).toBe(true);
    expect(fs.existsSync(path.join(issuedDir, row.docx_filename))).toBe(true);

    const detail = await request(app).get(`/api/v1/letters/issued/${issuedId}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(detail.body.letter_body).toBe(body);
    expect(detail.body.placeholder_data.PATIENT_NAME).toBe('Letter Test Patient');

    const again = await request(app).get(`/api/v1/letters/issued/${issuedId}/pdf`).set('Authorization', `Bearer ${doctorToken}`).buffer().parse(binaryParser);
    expect(again.status).toBe(200);
    expect(again.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  pdfIt('issues a temporary walk-in letter with NO record and NO patient row', async () => {
    const { appointment } = await makeAppointment({ temporary: true });
    const patientsBefore = await prisma.patient.count();
    const issue = await request(app)
      .post('/api/v1/letters/issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ templateId, appointmentId: appointment.appointment_id, bodyContent: 'Temp letter body' });
    expect(issue.status).toBe(200);
    expect(issue.headers['content-type']).toBe('application/pdf');
    expect(await prisma.issuedLetter.count({ where: { appointment_id: appointment.appointment_id } })).toBe(0);
    expect(await prisma.patient.count()).toBe(patientsBefore);
  });

  pdfIt('freezes an issued letter: replacing the template afterwards does not change its PDF', async () => {
    const { appointment, patientId } = await makeAppointment({ temporary: false });
    await request(app)
      .post('/api/v1/letters/issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ templateId, appointmentId: appointment.appointment_id, bodyContent: `Frozen ${runId}` });
    const list = await request(app).get('/api/v1/letters/issued').query({ patientId }).set('Authorization', `Bearer ${doctorToken}`);
    const issuedId = list.body[0].issued_letter_id;

    const pdfA = (await request(app).get(`/api/v1/letters/issued/${issuedId}/pdf`).set('Authorization', `Bearer ${doctorToken}`).buffer().parse(binaryParser)).body;
    const hashA = crypto.createHash('sha256').update(pdfA).digest('hex');

    const replace = await request(app)
      .post(`/api/v1/letters/templates/${templateId}/docx`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('file', buildDocx({ extra: ['COMPLETELY DIFFERENT V3 CONTENT'] }), { filename: 'v3.docx', contentType: DOCX_MIME });
    expect(replace.status).toBe(200);

    const pdfB = (await request(app).get(`/api/v1/letters/issued/${issuedId}/pdf`).set('Authorization', `Bearer ${doctorToken}`).buffer().parse(binaryParser)).body;
    expect(crypto.createHash('sha256').update(pdfB).digest('hex')).toBe(hashA);
  });

  pdfIt('keeps issued-letter history working after its template is deleted', async () => {
    const { appointment, patientId } = await makeAppointment({ temporary: false });
    const scratch = await createTemplate(adminToken, { name: `Deletable ${runId}` });
    const scratchId = scratch.body.letter_template_id;
    await request(app)
      .post('/api/v1/letters/issue')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ templateId: scratchId, appointmentId: appointment.appointment_id, bodyContent: 'survives deletion' });
    const issuedId = (await request(app).get('/api/v1/letters/issued').query({ patientId }).set('Authorization', `Bearer ${doctorToken}`)).body[0].issued_letter_id;

    const del = await request(app).delete(`/api/v1/letters/templates/${scratchId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(del.status).toBe(204);
    expect((await request(app).get(`/api/v1/letters/templates/${scratchId}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);

    const stillThere = await request(app).get(`/api/v1/letters/issued/${issuedId}/pdf`).set('Authorization', `Bearer ${doctorToken}`).buffer().parse(binaryParser);
    expect(stillThere.status).toBe(200);
    expect(stillThere.body.subarray(0, 5).toString('latin1')).toBe('%PDF-');
  });

  it('lets Admin deactivate a template so activeOnly listings exclude it', async () => {
    const res = await request(app).patch(`/api/v1/letters/templates/${templateId}/active`).set('Authorization', `Bearer ${adminToken}`).send({ is_active: false });
    expect(res.status).toBe(200);
    expect(res.body.is_active).toBe(false);
    const active = await request(app).get('/api/v1/letters/templates').query({ activeOnly: 'true' }).set('Authorization', `Bearer ${doctorToken}`);
    expect(active.body.some((t: any) => t.letter_template_id === templateId)).toBe(false);
    const all = await request(app).get('/api/v1/letters/templates').set('Authorization', `Bearer ${doctorToken}`);
    expect(all.body.some((t: any) => t.letter_template_id === templateId)).toBe(true);
  });
});
