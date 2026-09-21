import request from 'supertest';
import bcrypt from 'bcrypt';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import { TOTP, Secret } from 'otpauth';
import app from '../app';
import { UPLOADS_DIR } from '../config/paths';

// Security regression tests for the production-readiness review: file access control, upload
// content validation, attachment ownership, inactivity handling and 2FA enrolment.

const prisma = new PrismaClient();
const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52]);
const PDF = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF');
const HTML = Buffer.from('<html><script>alert(document.cookie)</script></html>');
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>');

let adminToken: string;
let doctorToken: string;
let doctorId: number;
let receptionToken: string;
let pharmacistToken: string;
let otherDoctorToken: string;
let otherDoctorId: number;

const login = async (username: string, password: string, totpToken?: string) => {
  const res = await request(app).post('/api/v1/auth/login').send({ username, password, ...(totpToken ? { totpToken } : {}) });
  return { token: res.body.token as string, id: res.body.user?.id as number, res };
};

const makePatient = async () => {
  const family = await prisma.family.create({ data: { family_name: `Hard Family ${runId}-${Math.random()}` } });
  return prisma.patient.create({
    data: { patient_id: `PT-HARD-${runId}-${Math.random().toString(36).slice(2, 7)}`, family_id: family.family_id, nic: `NIC-${runId}-${Math.random()}`, full_name: 'Hardening Patient', dob: new Date('1990-01-01'), gender: 'Male' },
  });
};

const makeConsultation = async (forDoctorId: number, forDoctorToken: string) => {
  const patient = await makePatient();
  const receptionist = await prisma.user.findUniqueOrThrow({ where: { username: 'reception' } });
  const appointment = await prisma.appointment.create({
    data: { patient_id: patient.patient_id, doctor_id: forDoctorId, scheduled_at: new Date(), status: 'Consulting', created_by: receptionist.user_id },
  });
  const res = await request(app).post('/api/v1/consultations').set('Authorization', `Bearer ${forDoctorToken}`).send({ appointment_id: appointment.appointment_id });
  expect(res.status).toBe(201);
  return { consultationId: res.body.consultation_id as number, patient };
};

beforeAll(async () => {
  ({ token: adminToken } = await login('admin', 'admin123'));
  ({ token: doctorToken, id: doctorId } = await login('doctor', 'doctor123'));
  ({ token: receptionToken } = await login('reception', 'reception123'));
  ({ token: pharmacistToken } = await login('pharmacist', 'pharmacist123'));

  const username = `otherdoc-${runId}`;
  const other = await prisma.user.create({ data: { username, password_hash: await bcrypt.hash('otherdoc123', 10), role: 'Doctor', registration_number: `SLMC-${runId}` } });
  otherDoctorId = other.user_id;
  ({ token: otherDoctorToken } = await login(username, 'otherdoc123'));
});

afterAll(async () => {
  await prisma.$disconnect();
});

describe('uploaded files are not publicly downloadable', () => {
  let photoUrl: string;
  let patientId: string;

  beforeAll(async () => {
    const patient = await makePatient();
    patientId = patient.patient_id;
    const res = await request(app).post(`/api/v1/patients/${patientId}/photo`).set('Authorization', `Bearer ${receptionToken}`).attach('photo', JPEG, { filename: 'face.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    photoUrl = res.body.photo_url;
    expect(photoUrl).toMatch(/^\/uploads\/patients\/.+\.jpg$/);
  });

  it('refuses an anonymous request for a patient photo', async () => {
    expect((await request(app).get(photoUrl)).status).toBe(401);
  });

  it('serves the photo to a signed-in clinical role, without letting anything cache it', async () => {
    for (const token of [doctorToken, receptionToken, pharmacistToken, adminToken]) {
      const res = await request(app).get(photoUrl).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.headers['cache-control']).toBe('private, no-store');
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    }
  });

  it('also accepts the HttpOnly session cookie the browsers actually send (so <img src> works)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).map((c) => c.split(';')[0]).join('; ');
    expect((await request(app).get(photoUrl).set('Cookie', cookie)).status).toBe(200);
  });

  it('refuses a revoked session', async () => {
    const { token } = await login('doctor', 'doctor123');
    await request(app).post('/api/v1/auth/logout').set('Authorization', `Bearer ${token}`);
    expect((await request(app).get(photoUrl).set('Authorization', `Bearer ${token}`)).status).toBe(401);
  });

  it('never serves letter templates or issued letters, even to an admin', async () => {
    fs.mkdirSync(path.join(UPLOADS_DIR, 'issued-letters'), { recursive: true });
    fs.writeFileSync(path.join(UPLOADS_DIR, 'issued-letters', 'issued-x.pdf'), PDF);
    expect((await request(app).get('/uploads/issued-letters/issued-x.pdf').set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);
    expect((await request(app).get('/uploads/letter-templates/t1.docx').set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);
  });

  it('does not serve unknown folders or path-traversal attempts', async () => {
    expect((await request(app).get('/uploads/unknown/x.jpg').set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);
    // Whatever the client/proxy makes of an encoded ../, the file must never be served without a
    // session (some clients normalize it into an ordinary /uploads/patients/... request, which
    // correctly demands auth; others reach the gate un-normalized, which 404s).
    const file = path.basename(photoUrl);
    for (const url of [`/uploads/settings/..%2fpatients/${file}`, `/uploads/settings/%2e%2e/patients/${file}`, `/uploads/settings/..%5cpatients/${file}`]) {
      expect([401, 404]).toContain((await request(app).get(url)).status);
    }
    expect((await request(app).get('/uploads/../package.json').set('Authorization', `Bearer ${adminToken}`)).status).toBe(404);
  });

  it('keeps the clinic logo (branding, not patient data) public', async () => {
    const up = await request(app).post('/api/v1/settings/logo').set('Authorization', `Bearer ${adminToken}`).attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(up.status).toBe(200);
    expect((await request(app).get(up.body.logo_url)).status).toBe(200);
  });
});

describe('upload content is validated, not just the declared type', () => {
  it('rejects HTML disguised as a JPEG photo, and stores nothing', async () => {
    const patient = await makePatient();
    const before = fs.existsSync(path.join(UPLOADS_DIR, 'patients')) ? fs.readdirSync(path.join(UPLOADS_DIR, 'patients')).length : 0;
    const res = await request(app).post(`/api/v1/patients/${patient.patient_id}/photo`).set('Authorization', `Bearer ${receptionToken}`).attach('photo', HTML, { filename: 'face.jpg', contentType: 'image/jpeg' });
    expect(res.status).toBe(400);
    const after = fs.readdirSync(path.join(UPLOADS_DIR, 'patients')).length;
    expect(after).toBe(before);
  });

  it('rejects an SVG (script-capable) claiming to be a PNG logo', async () => {
    const res = await request(app).post('/api/v1/settings/logo').set('Authorization', `Bearer ${adminToken}`).attach('logo', SVG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
  });

  it('derives the stored extension from the real content, ignoring the client filename', async () => {
    const patient = await makePatient();
    const res = await request(app).post(`/api/v1/patients/${patient.patient_id}/photo`).set('Authorization', `Bearer ${receptionToken}`).attach('photo', JPEG, { filename: 'evil.html', contentType: 'image/jpeg' });
    expect(res.status).toBe(200);
    expect(res.body.photo_url).toMatch(/\.jpg$/);
    expect(res.body.photo_url).not.toMatch(/html/);
  });

  it('accepts a real PDF for a consultation attachment and stores it as .pdf even if named .jpg', async () => {
    const { consultationId } = await makeConsultation(doctorId, doctorToken);
    const res = await request(app).post(`/api/v1/consultations/${consultationId}/documents`).set('Authorization', `Bearer ${doctorToken}`).attach('file', PDF, { filename: 'scan.jpg', contentType: 'application/pdf' });
    expect(res.status).toBe(201);
    expect(res.body.filename).toMatch(/\.pdf$/);
  });

  it('rejects an executable/HTML disguised as a PDF attachment', async () => {
    const { consultationId } = await makeConsultation(doctorId, doctorToken);
    const res = await request(app).post(`/api/v1/consultations/${consultationId}/documents`).set('Authorization', `Bearer ${doctorToken}`).attach('file', HTML, { filename: 'referral.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    expect(await prisma.consultationDocument.count({ where: { consultation_id: consultationId } })).toBe(0);
  });
});

describe('consultation attachments follow ownership and finalization rules', () => {
  const upload = (consultationId: number, token: string) =>
    request(app).post(`/api/v1/consultations/${consultationId}/documents`).set('Authorization', `Bearer ${token}`).attach('file', PDF, { filename: 'a.pdf', contentType: 'application/pdf' });

  it("another doctor cannot attach to, list, or delete files on someone else's consultation", async () => {
    const { consultationId } = await makeConsultation(doctorId, doctorToken);
    const mine = await upload(consultationId, doctorToken);
    expect(mine.status).toBe(201);

    const filesBefore = fs.readdirSync(path.join(UPLOADS_DIR, 'consultations')).length;
    expect((await upload(consultationId, otherDoctorToken)).status).toBe(403);
    expect(fs.readdirSync(path.join(UPLOADS_DIR, 'consultations')).length).toBe(filesBefore); // refused upload leaves no orphan file

    expect((await request(app).get(`/api/v1/consultations/${consultationId}/documents`).set('Authorization', `Bearer ${otherDoctorToken}`)).status).toBe(403);
    expect((await request(app).delete(`/api/v1/consultations/documents/${mine.body.document_id}`).set('Authorization', `Bearer ${otherDoctorToken}`)).status).toBe(403);
    expect(await prisma.consultationDocument.count({ where: { consultation_id: consultationId } })).toBe(1);
  });

  it('the owning doctor and an admin can both manage them', async () => {
    const { consultationId } = await makeConsultation(doctorId, doctorToken);
    const a = await upload(consultationId, doctorToken);
    const b = await upload(consultationId, adminToken);
    expect([a.status, b.status]).toEqual([201, 201]);
    expect((await request(app).delete(`/api/v1/consultations/documents/${a.body.document_id}`).set('Authorization', `Bearer ${adminToken}`)).status).toBe(204);
  });

  it('a document cannot be removed from a Finalized consultation, but a late one can be added and is audit-logged', async () => {
    const { consultationId } = await makeConsultation(doctorId, doctorToken);
    const early = await upload(consultationId, doctorToken);
    expect((await request(app).post(`/api/v1/consultations/${consultationId}/finalize`).set('Authorization', `Bearer ${doctorToken}`).send({ consultation_fee: 100 })).status).toBe(200);

    const del = await request(app).delete(`/api/v1/consultations/documents/${early.body.document_id}`).set('Authorization', `Bearer ${doctorToken}`);
    expect(del.status).toBe(400);
    expect(del.body.message).toMatch(/amend/i);
    expect(await prisma.consultationDocument.count({ where: { consultation_id: consultationId } })).toBe(1);

    const late = await upload(consultationId, doctorToken);
    expect(late.status).toBe(201);
    const audit = await prisma.auditLog.findFirst({ where: { entity: 'ConsultationDocument', entity_id: String(late.body.document_id), action: 'ATTACH_AFTER_FINALIZE' } });
    expect(audit).not.toBeNull();
  });
});

describe('inactivity: background polling does not keep a session alive', () => {
  const sessionOf = async (token: string) => {
    const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());
    return prisma.userSession.findUniqueOrThrow({ where: { session_id: payload.sid } });
  };

  it('a normal request refreshes last-activity; a background one does not', async () => {
    const { token } = await login('reception', 'reception123');
    const stale = new Date(Date.now() - 5 * 60_000);
    await prisma.userSession.update({ where: { session_id: (await sessionOf(token)).session_id }, data: { last_activity_at: stale } });

    const bg = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`).set('X-Epoch-Background', '1');
    expect(bg.status).toBe(200);
    expect((await sessionOf(token)).last_activity_at.getTime()).toBe(stale.getTime()); // untouched

    const human = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`);
    expect(human.status).toBe(200);
    expect((await sessionOf(token)).last_activity_at.getTime()).toBeGreaterThan(stale.getTime());
  });

  it('polling alone cannot outlive the idle timeout — the session expires even though requests keep arriving', async () => {
    const { token } = await login('reception', 'reception123');
    const timeout = (await prisma.clinicSettings.findUnique({ where: { id: 1 } }))?.session_timeout_minutes ?? 15;
    await prisma.userSession.update({ where: { session_id: (await sessionOf(token)).session_id }, data: { last_activity_at: new Date(Date.now() - (timeout + 1) * 60_000) } });

    const bg = await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`).set('X-Epoch-Background', '1');
    expect(bg.status).toBe(401);
    expect((await request(app).get('/api/v1/settings').set('Authorization', `Bearer ${token}`)).status).toBe(401); // and it stays dead
  });
});

describe('2FA enrolment', () => {
  const codeFor = (secret: string) => new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(secret) }).generate();
  let username: string;
  let token: string;

  beforeAll(async () => {
    username = `admin2fa-${runId}`;
    await prisma.user.create({ data: { username, password_hash: await bcrypt.hash('admin2fa123', 10), role: 'Admin' } });
    ({ token } = await login(username, 'admin2fa123'));
  });

  const setup = (password?: string) => request(app).post('/api/v1/auth/2fa/setup').set('Authorization', `Bearer ${token}`).send(password === undefined ? {} : { password });
  const verify = (code: string) => request(app).post('/api/v1/auth/2fa/verify').set('Authorization', `Bearer ${token}`).send({ token: code });
  const state = () => prisma.user.findUniqueOrThrow({ where: { username } });

  it('requires the account password to start setup', async () => {
    expect((await setup()).status).toBe(400);
    expect((await setup('wrong-password')).status).toBe(401);
    expect((await state()).totp_pending_secret).toBeNull();
  });

  it('enables 2FA only after a valid code from the new secret', async () => {
    const res = await setup('admin2fa123');
    expect(res.status).toBe(200);
    expect((await state()).totp_enabled).toBe(false);
    expect((await verify('000000')).status).toBe(401);
    expect((await state()).totp_enabled).toBe(false);

    expect((await verify(codeFor(res.body.secret))).status).toBe(200);
    const after = await state();
    expect(after.totp_enabled).toBe(true);
    expect(after.totp_secret).toBe(res.body.secret);
    expect(after.totp_pending_secret).toBeNull();
    expect((await login(username, 'admin2fa123')).res.status).toBe(401); // now requires a code
  });

  it('starting a re-enrolment does NOT switch off 2FA that is already active', async () => {
    const before = await state();
    expect(before.totp_enabled).toBe(true);

    const res = await setup('admin2fa123');
    expect(res.status).toBe(200);

    const mid = await state();
    expect(mid.totp_enabled).toBe(true); // was: set to false with no password check
    expect(mid.totp_secret).toBe(before.totp_secret); // the old authenticator still works
    expect((await login(username, 'admin2fa123', codeFor(before.totp_secret!))).res.status).toBe(200);
  });

  it('an unverified replacement leaves the old secret in force; only a verified one replaces it', async () => {
    const fresh = await setup('admin2fa123');
    const old = (await state()).totp_secret!;
    expect((await verify('123456')).status).toBe(401);
    expect((await state()).totp_secret).toBe(old);

    expect((await verify(codeFor(fresh.body.secret))).status).toBe(200);
    expect((await state()).totp_secret).toBe(fresh.body.secret);
  });

  it('never returns either secret from user-facing endpoints', async () => {
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(JSON.stringify(me.body)).not.toMatch(/totp_secret|totp_pending_secret/);
  });
});
