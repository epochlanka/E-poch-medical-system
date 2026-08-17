import request from 'supertest';
import app from '../../app';

// Unique per test run so re-running against the same persistent dev DB never collides on NIC
// or trips the fuzzy-duplicate detector against leftover patients from earlier runs.
const runId = Date.now();
const nic = (n: number) => `PT-TEST-NIC-${runId}-${n}`;
// Deterministic-but-unique DOB per (run, slot) — keeps a fuzzy-match pair sharing the same DOB
// within one run, while different runs land on different DOBs.
const runDob = (slot: number) => {
  const daysOffset = (runId + slot * 104729) % 7300; // ~20 year spread
  const date = new Date(new Date(1980, 0, 1).getTime() + daysOffset * 24 * 60 * 60 * 1000);
  return date.toISOString().slice(0, 10);
};
// Unique per test run so the search test (which relies on default `limit: 20` list ordering)
// doesn't get buried under same-named patients left over from earlier runs against the persistent dev DB.
const patientName = `Kasun Silva ${runId}`;
const patientNameTypo = `Kasun Silwa ${runId}`; // one-letter edit distance from patientName, for fuzzy-match test

describe('Patients API', () => {
  let adminToken: string;
  let doctorToken: string;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/patients');
    expect(res.status).toBe(401);
  });

  it('rejects registration from a read-only role (Doctor)', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({
        full_name: 'Should Not Register',
        dob: '1985-01-01',
        gender: 'Male',
        nic: nic(1),
        new_family: { family_name: 'Should Not Family' },
      });
    expect(res.status).toBe(403);
  });

  it('blocks registration when family_id and new_family are both missing', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'No Family', dob: '1985-01-01', gender: 'Male', nic: nic(2) });
    expect(res.status).toBe(400);
  });

  let firstPatientId: string;

  it('registers a new patient with a new family and auto-generates a Patient ID', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: patientName,
        dob: runDob(1),
        gender: 'Male',
        nic: nic(3),
        phone: '0711111111',
        new_family: { family_name: 'Silva Family', address: 'Kandy' },
      });

    expect(res.status).toBe(201);
    expect(res.body.patient.patient_id).toMatch(/^PT-\d{6}$/);
    expect(res.body.duplicateFlags).toEqual([]);
    firstPatientId = res.body.patient.patient_id;
  });

  it('blocks registration on an exact NIC duplicate', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: patientName,
        dob: runDob(1),
        gender: 'Male',
        nic: nic(3),
        new_family: { family_name: 'Another Family' },
      });

    expect(res.status).toBe(409);
    expect(res.body.conflictingPatient.patient_id).toBe(firstPatientId);
  });

  let flagId: number;

  it('flags (but does not block) a fuzzy name+DOB match under a different NIC', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: patientNameTypo,
        dob: runDob(1),
        gender: 'Male',
        nic: nic(4),
        new_family: { family_name: 'Silwa Family' },
      });

    expect(res.status).toBe(201);
    expect(res.body.duplicateFlags.length).toBeGreaterThan(0);
    flagId = res.body.duplicateFlags[0].flag_id;
  });

  it('registers a minor using guardian_nic + dob instead of their own nic', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Minor Child',
        dob: runDob(2),
        gender: 'Female',
        guardian_nic: nic(5),
        new_family: { family_name: 'Child Family' },
      });

    expect(res.status).toBe(201);
  });

  it('blocks a second minor registration on the same guardian_nic + dob', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Minor Child',
        dob: runDob(2),
        gender: 'Female',
        guardian_nic: nic(5),
        new_family: { family_name: 'Another Child Family' },
      });

    expect(res.status).toBe(409);
  });

  it('finds the registered patient via search', async () => {
    const res = await request(app)
      .get('/api/v1/patients')
      .query({ search: patientName })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((p: any) => p.patient_id === firstPatientId)).toBe(true);
  });

  it('filters the list by gender and includes a last_visit field', async () => {
    const res = await request(app).get('/api/v1/patients').query({ gender: 'Male' }).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.data.every((p: any) => p.gender === 'Male')).toBe(true);
    expect(res.body.data[0]).toHaveProperty('last_visit');
  });

  it('returns patient summary stats used by the list header cards', async () => {
    const res = await request(app).get('/api/v1/patients/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalPatients).toBeGreaterThan(0);
    expect(res.body.malePatients + res.body.femalePatients).toBeLessThanOrEqual(res.body.totalPatients);
    expect(res.body).toHaveProperty('activePatients');
    expect(res.body).toHaveProperty('newPatientsThisMonth');
  });

  it('returns a single patient by id', async () => {
    const res = await request(app).get(`/api/v1/patients/${firstPatientId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.patient_id).toBe(firstPatientId);
  });

  it('updates a patient field and records it in the audit log', async () => {
    const updateRes = await request(app)
      .put(`/api/v1/patients/${firstPatientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ phone: '0799999999' });
    expect(updateRes.status).toBe(200);
    expect(updateRes.body.phone).toBe('0799999999');

    const auditRes = await request(app)
      .get(`/api/v1/patients/${firstPatientId}/audit-log`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(auditRes.status).toBe(200);
    expect(auditRes.body.data.some((e: any) => e.field === 'phone' && e.newValue === '0799999999')).toBe(true);
  });

  it('requires a reason when reassigning family', async () => {
    const res = await request(app)
      .put(`/api/v1/patients/${firstPatientId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ family_id: 1 });
    expect(res.status).toBe(400);
  });

  it('archives and restores a patient (soft delete only)', async () => {
    const archiveRes = await request(app)
      .patch(`/api/v1/patients/${firstPatientId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: false, reason: 'Test archive' });
    expect(archiveRes.status).toBe(200);
    expect(archiveRes.body.is_active).toBe(false);

    const restoreRes = await request(app)
      .patch(`/api/v1/patients/${firstPatientId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ is_active: true });
    expect(restoreRes.status).toBe(200);
    expect(restoreRes.body.is_active).toBe(true);
  });

  it('returns the patient history timeline as a list', async () => {
    const res = await request(app)
      .get(`/api/v1/patients/${firstPatientId}/history`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it('uploads and stores a patient photo', async () => {
    // Smallest valid 1x1 PNG.
    const pngBuffer = Buffer.from(
      '89504e470d0a1a0a0000000d49484452000000010000000108020000009077' +
        '53de000000097048597300000ec300000ec301c76fa864000000174944415' +
        '478da6360606060f80f0000050001ff1f6ac5000000000049454e44ae4260' +
        '82',
      'hex'
    );

    const res = await request(app)
      .post(`/api/v1/patients/${firstPatientId}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', pngBuffer, 'test.png');

    expect(res.status).toBe(200);
    expect(res.body.photo_url).toMatch(/^\/uploads\/patients\/.+\.png$/);
  });

  it('rejects a photo upload with a disallowed file type', async () => {
    const res = await request(app)
      .post(`/api/v1/patients/${firstPatientId}/photo`)
      .set('Authorization', `Bearer ${adminToken}`)
      .attach('photo', Buffer.from('not an image'), { filename: 'note.txt', contentType: 'text/plain' });

    expect(res.status).toBe(400);
  });

  it('exports the patient history as a PDF', async () => {
    const res = await request(app)
      .get(`/api/v1/patients/${firstPatientId}/history/pdf`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toBe('application/pdf');
    expect(res.body.length || res.text.length).toBeGreaterThan(0);
  });

  it('lists the pending duplicate review queue and dismisses a flag', async () => {
    const listRes = await request(app)
      .get('/api/v1/patients/duplicates')
      .query({ search: patientNameTypo, limit: 20 })
      .set('Authorization', `Bearer ${adminToken}`);
    expect(listRes.status).toBe(200);
    expect(listRes.body.data.some((f: any) => f.flagId === flagId)).toBe(true);

    const dismissRes = await request(app)
      .post(`/api/v1/patients/duplicates/${flagId}/dismiss`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(dismissRes.status).toBe(200);
    expect(dismissRes.body.status).toBe('Dismissed');
  });

  it('merges a duplicate flag, archiving the losing record', async () => {
    const regA = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Nadeesha Fernando',
        dob: runDob(3),
        gender: 'Female',
        nic: nic(6),
        new_family: { family_name: 'Fernando A' },
      });
    expect(regA.status).toBe(201);
    const primaryId = regA.body.patient.patient_id;

    const regB = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        full_name: 'Nadeesha Fernando', // exact same normalized name + dob, different NIC
        dob: runDob(3),
        gender: 'Female',
        nic: nic(7),
        new_family: { family_name: 'Fernando B' },
      });
    expect(regB.status).toBe(201);
    const duplicateId = regB.body.patient.patient_id;
    expect(regB.body.duplicateFlags.length).toBeGreaterThan(0);
    const mergeFlagId = regB.body.duplicateFlags[0].flag_id;

    const mergeRes = await request(app)
      .post(`/api/v1/patients/duplicates/${mergeFlagId}/merge`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryPatientId: primaryId });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.status).toBe('Merged');

    const loserRes = await request(app).get(`/api/v1/patients/${duplicateId}`).set('Authorization', `Bearer ${adminToken}`);
    expect(loserRes.body.is_active).toBe(false);
  });
});
