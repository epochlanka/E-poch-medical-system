import { Prisma, PrismaClient } from '@prisma/client';
import * as patientsService from '../patients/service';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

// ---- Family Directory --------------------------------------------------------

interface ListFamiliesFilters {
  search?: string;
  status?: 'active' | 'inactive' | 'all';
  page?: number;
  limit?: number;
}

export const listFamilies = async (filters: ListFamiliesFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.FamilyWhereInput = {};
  if (filters.status === 'active') where.is_active = true;
  else if (filters.status === 'inactive') where.is_active = false;

  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { family_name: { contains: term } },
      { address: { contains: term } },
      { contact_no: { contains: term } },
    ];
  }

  const [total, families] = await Promise.all([
    prisma.family.count({ where }),
    prisma.family.findMany({
      where,
      orderBy: { family_name: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        head_patient: { select: { patient_id: true, full_name: true } },
        _count: { select: { patients: true } },
      },
    }),
  ]);

  return { data: families, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// A Family can exist before any patient is assigned to it (BR-01) — a receptionist
// can create the household shell first, then attach members via patient registration.
export const createFamily = async (
  input: { family_name: string; address?: string; contact_no?: string },
  actorUserId: number
) => {
  return prisma.$transaction(async (tx) => {
    const family = await tx.family.create({ data: input });
    await tx.auditLog.create({ data: { user_id: actorUserId, action: 'CREATE', entity: 'Family', entity_id: String(family.family_id) } });
    return family;
  });
};

export const getFamilyById = async (familyId: number) => {
  return prisma.family.findUnique({
    where: { family_id: familyId },
    include: {
      head_patient: { select: { patient_id: true, full_name: true } },
      patients: { select: { patient_id: true, full_name: true, dob: true, gender: true, is_active: true } },
    },
  });
};

export const updateFamily = async (
  familyId: number,
  updates: { family_name?: string; address?: string; contact_no?: string },
  actorUserId: number
) => {
  const existing = await prisma.family.findUnique({ where: { family_id: familyId } });
  if (!existing) throw new NotFoundError('Family not found');

  return prisma.$transaction(async (tx) => {
    const family = await tx.family.update({ where: { family_id: familyId }, data: updates });
    await tx.auditLog.create({ data: { user_id: actorUserId, action: 'UPDATE', entity: 'Family', entity_id: String(familyId) } });
    return family;
  });
};

// ---- Family Member Roster (FR-021: combined visit + billing history) --------

export const getFamilyMembers = async (familyId: number) => {
  const family = await prisma.family.findUnique({
    where: { family_id: familyId },
    include: {
      head_patient: { select: { patient_id: true, full_name: true } },
      patients: { orderBy: { full_name: 'asc' } },
    },
  });
  if (!family) throw new NotFoundError('Family not found');

  const memberHistories = await Promise.all(
    family.patients.map(async (patient) => {
      const events = await patientsService.getPatientHistory(patient.patient_id, {
        types: ['appointment', 'invoice'],
      });
      return events.map((event) => ({ ...event, patientId: patient.patient_id, patientName: patient.full_name }));
    })
  );

  const combinedHistory = memberHistories
    .flat()
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    family: {
      family_id: family.family_id,
      family_name: family.family_name,
      address: family.address,
      contact_no: family.contact_no,
      is_active: family.is_active,
      head_patient: family.head_patient,
    },
    members: family.patients.map((p) => ({
      patient_id: p.patient_id,
      full_name: p.full_name,
      dob: p.dob,
      gender: p.gender,
      is_active: p.is_active,
      is_head: p.patient_id === family.head_patient_id,
    })),
    combinedHistory,
  };
};

// ---- Head of Family Assignment ------------------------------------------------
// Billing/contact convenience only — does not restrict clinical access to other members.

export const setHeadOfFamily = async (familyId: number, patientId: string, actorUserId: number) => {
  const family = await prisma.family.findUnique({ where: { family_id: familyId } });
  if (!family) throw new NotFoundError('Family not found');

  const patient = await prisma.patient.findUnique({ where: { patient_id: patientId } });
  if (!patient) throw new NotFoundError('Patient not found');
  if (patient.family_id !== familyId) {
    throw new ValidationError('Patient does not belong to this family');
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.family.update({ where: { family_id: familyId }, data: { head_patient_id: patientId } });
    await tx.auditLog.create({ data: { user_id: actorUserId, action: 'SET_HEAD', entity: 'Family', entity_id: String(familyId) } });
    return updated;
  });
};

// ---- Family Merge Tool (FR-023) ------------------------------------------------
// A merge, not a delete-and-recreate: every patient's appointments/invoices stay linked
// to that patient, so simply reassigning the patient's family_id preserves both sides'
// billing and visit history. The losing family is archived, never deleted.

export const mergeFamilies = async (
  primaryFamilyId: number,
  secondaryFamilyId: number,
  actorUserId: number,
  reason?: string
) => {
  if (primaryFamilyId === secondaryFamilyId) {
    throw new ValidationError('Cannot merge a family with itself');
  }

  const [primary, secondary] = await Promise.all([
    prisma.family.findUnique({ where: { family_id: primaryFamilyId } }),
    prisma.family.findUnique({ where: { family_id: secondaryFamilyId } }),
  ]);
  if (!primary) throw new NotFoundError('Primary family not found');
  if (!secondary) throw new NotFoundError('Secondary family not found');
  if (!primary.is_active) throw new ValidationError('Primary family is archived');
  if (!secondary.is_active) throw new ValidationError('Secondary family is already archived/merged');

  const mergedHeadPatientId = primary.head_patient_id ?? secondary.head_patient_id ?? null;
  const auditAction = reason ? `MERGE (${reason})` : 'MERGE';

  return prisma.$transaction(async (tx) => {
    await tx.patient.updateMany({ where: { family_id: secondaryFamilyId }, data: { family_id: primaryFamilyId } });

    await tx.family.update({
      where: { family_id: primaryFamilyId },
      data: {
        head_patient_id: mergedHeadPatientId,
        address: primary.address ?? secondary.address,
        contact_no: primary.contact_no ?? secondary.contact_no,
      },
    });

    await tx.family.update({
      where: { family_id: secondaryFamilyId },
      data: { is_active: false, head_patient_id: null },
    });

    await tx.auditLog.create({ data: { user_id: actorUserId, action: auditAction, entity: 'Family', entity_id: String(primaryFamilyId) } });
    await tx.auditLog.create({ data: { user_id: actorUserId, action: 'MERGED_INTO', entity: 'Family', entity_id: String(secondaryFamilyId) } });

    return tx.family.findUnique({
      where: { family_id: primaryFamilyId },
      include: {
        head_patient: { select: { patient_id: true, full_name: true } },
        patients: { select: { patient_id: true, full_name: true } },
      },
    });
  });
};
