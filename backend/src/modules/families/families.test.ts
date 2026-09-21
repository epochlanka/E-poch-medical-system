import request from 'supertest';
import app from '../../app';

const runId = Date.now();
const nic = (n: number) => `FAM-TEST-NIC-${runId}-${n}`;

describe('Families API', () => {
  let adminToken: string;
  let doctorToken: string;

  beforeAll(async () => {
    const adminRes = await request(app).post('/api/v1/auth/login').send({ username: 'admin', password: 'admin123' });
    adminToken = adminRes.body.token;

    const doctorRes = await request(app).post('/api/v1/auth/login').send({ username: 'doctor', password: 'doctor123' });
    doctorToken = doctorRes.body.token;
  });

  it('rejects unauthenticated requests', async () => {
    const res = await request(app).get('/api/v1/families');
    expect(res.status).toBe(401);
  });

  it('rejects family creation from a read-only role (Doctor)', async () => {
    const res = await request(app)
      .post('/api/v1/families')
      .set('Authorization', `Bearer ${doctorToken}`)
      .send({ family_name: 'Should Not Create' });
    expect(res.status).toBe(403);
  });

  let familyId: number;

  it('creates a family shell with no patients yet', async () => {
    const res = await request(app)
      .post('/api/v1/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ family_name: `Perera Household ${runId}`, address: 'Colombo 5', contact_no: '0711000000' });

    expect(res.status).toBe(201);
    expect(res.body.family_id).toEqual(expect.any(Number));
    familyId = res.body.family_id;
  });

  it('finds the family in the directory search', async () => {
    const res = await request(app)
      .get('/api/v1/families')
      .query({ search: `Perera Household ${runId}` })
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.some((f: any) => f.family_id === familyId)).toBe(true);
  });

  it('returns family summary stats used by the list header cards', async () => {
    const res = await request(app).get('/api/v1/families/stats').set('Authorization', `Bearer ${adminToken}`);
    expect(res.status).toBe(200);
    expect(res.body.totalFamilies).toBeGreaterThan(0);
    expect(res.body.activeFamilies + res.body.inactiveFamilies).toBeLessThanOrEqual(res.body.totalFamilies);
    expect(res.body).toHaveProperty('totalFamilyMembers');
    expect(res.body).toHaveProperty('newFamiliesThisMonth');
  });

  it('updates family details', async () => {
    const res = await request(app)
      .put(`/api/v1/families/${familyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ address: 'Colombo 7' });

    expect(res.status).toBe(200);
    expect(res.body.address).toBe('Colombo 7');
  });

  let memberAId: string;
  let memberBId: string;

  it('attaches two patients to the family shell', async () => {
    const resA = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Family Member A', dob: '1990-01-01', gender: 'Male', nic: nic(1), family_id: familyId });
    expect(resA.status).toBe(201);
    memberAId = resA.body.patient.patient_id;

    const resB = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Family Member B', dob: '1992-02-02', gender: 'Female', nic: nic(2), family_id: familyId });
    expect(resB.status).toBe(201);
    memberBId = resB.body.patient.patient_id;
  });

  it('rejects attaching a patient to a non-existent family', async () => {
    const res = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Orphan Attempt', dob: '1990-01-01', gender: 'Male', nic: nic(3), family_id: 999999 });
    expect(res.status).toBe(400);
  });

  it('returns the family member roster with combined history', async () => {
    const res = await request(app).get(`/api/v1/families/${familyId}/members`).set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(200);
    expect(res.body.members).toHaveLength(2);
    expect(res.body.members.map((m: any) => m.patient_id).sort()).toEqual([memberAId, memberBId].sort());
    expect(Array.isArray(res.body.combinedHistory)).toBe(true);
  });

  it('assigns Head of Family to a member of that family', async () => {
    const res = await request(app)
      .patch(`/api/v1/families/${familyId}/head`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patient_id: memberAId });

    expect(res.status).toBe(200);
    expect(res.body.head_patient_id).toBe(memberAId);
  });

  it('rejects assigning Head of Family to a patient outside the family', async () => {
    const otherFamilyRes = await request(app)
      .post('/api/v1/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ family_name: `Unrelated Household ${runId}` });
    const otherFamilyId = otherFamilyRes.body.family_id;

    const outsiderRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Outsider Patient', dob: '1991-01-01', gender: 'Male', nic: nic(4), family_id: otherFamilyId });
    const outsiderId = outsiderRes.body.patient.patient_id;

    const res = await request(app)
      .patch(`/api/v1/families/${familyId}/head`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ patient_id: outsiderId });

    expect(res.status).toBe(400);
  });

  it('merges two families, moving all members and archiving the loser', async () => {
    const secondaryRes = await request(app)
      .post('/api/v1/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ family_name: `Duplicate Household ${runId}`, contact_no: '0709999999' });
    const secondaryFamilyId = secondaryRes.body.family_id;

    const memberCRes = await request(app)
      .post('/api/v1/patients')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ full_name: 'Family Member C', dob: '1995-05-05', gender: 'Female', nic: nic(5), family_id: secondaryFamilyId });
    const memberCId = memberCRes.body.patient.patient_id;

    const mergeRes = await request(app)
      .post('/api/v1/families/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryFamilyId: familyId, secondaryFamilyId, reason: 'Duplicate household entered twice' });

    expect(mergeRes.status).toBe(200);
    expect(mergeRes.body.family_id).toBe(familyId);
    expect(mergeRes.body.patients.map((p: any) => p.patient_id)).toContain(memberCId);
    // Head of Family survives the merge — it was already set on the primary.
    expect(mergeRes.body.head_patient.patient_id).toBe(memberAId);

    const secondaryAfter = await request(app)
      .get(`/api/v1/families/${secondaryFamilyId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(secondaryAfter.body.is_active).toBe(false);
    expect(secondaryAfter.body.patients).toHaveLength(0);

    const movedPatient = await request(app)
      .get(`/api/v1/patients/${memberCId}`)
      .set('Authorization', `Bearer ${adminToken}`);
    expect(movedPatient.body.family_id).toBe(familyId);
  });

  it('rejects merging a family with itself', async () => {
    const res = await request(app)
      .post('/api/v1/families/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryFamilyId: familyId, secondaryFamilyId: familyId });
    expect(res.status).toBe(400);
  });

  it('rejects merging an already-archived family', async () => {
    const secondaryRes = await request(app)
      .post('/api/v1/families')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ family_name: `Third Household ${runId}` });
    const thirdFamilyId = secondaryRes.body.family_id;

    // Archive it via a merge into the primary first.
    await request(app)
      .post('/api/v1/families/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryFamilyId: familyId, secondaryFamilyId: thirdFamilyId });

    const res = await request(app)
      .post('/api/v1/families/merge')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ primaryFamilyId: familyId, secondaryFamilyId: thirdFamilyId });
    expect(res.status).toBe(400);
  });
});
