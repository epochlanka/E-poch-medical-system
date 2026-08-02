import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

interface SearchMedicinesParams {
  search?: string;
  category?: string;
  includeInactive?: boolean;
}

// Real-time stock status the Prescription Builder shows per line (FR-040) — computed live
// from the same batch data the pharmacist will allocate from at dispense time, never cached.
export const searchMedicines = async (params: SearchMedicinesParams) => {
  const where: Prisma.MedicineWhereInput = {};
  if (!params.includeInactive) where.is_active = true;
  if (params.category) where.category = params.category;

  if (params.search) {
    const term = params.search.trim();
    where.OR = [{ name: { contains: term } }, { generic_name: { contains: term } }, { category: { contains: term } }];
  }

  const medicines = await prisma.medicine.findMany({
    where,
    orderBy: { name: 'asc' },
    include: { batches: { select: { qty_on_hand: true, expiry_date: true } } },
    take: 50,
  });

  const now = new Date();
  return medicines.map((m) => {
    const totalQty = m.batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
    const hasValidStock = m.batches.some((b) => b.qty_on_hand > 0 && b.expiry_date > now);
    const stockStatus = !hasValidStock ? 'out-of-stock' : totalQty < m.reorder_level ? 'low' : 'in-stock';

    return {
      medicine_id: m.medicine_id,
      name: m.name,
      generic_name: m.generic_name,
      category: m.category,
      form: m.form,
      strength: m.strength,
      unit: m.unit,
      unit_price: m.unit_price,
      is_active: m.is_active,
      stockStatus,
      totalQty,
    };
  });
};

export const getMedicineById = (medicineId: number) => prisma.medicine.findUnique({ where: { medicine_id: medicineId } });

interface CreateMedicineInput {
  name: string;
  generic_name?: string;
  category?: string;
  form?: string;
  strength?: string;
  unit: string;
  reorder_level?: number;
  unit_price?: number;
  barcode?: string;
}

// The parent record every batch, prescription line, and dispense event ultimately references.
export const createMedicine = async (input: CreateMedicineInput) => {
  if (input.barcode) {
    const existing = await prisma.medicine.findUnique({ where: { barcode: input.barcode } });
    if (existing) throw new ValidationError('A medicine with this barcode already exists');
  }
  return prisma.medicine.create({ data: input });
};

interface UpdateMedicineInput {
  name?: string;
  generic_name?: string;
  category?: string;
  form?: string;
  strength?: string;
  unit?: string;
  reorder_level?: number;
  unit_price?: number;
  barcode?: string;
  is_active?: boolean;
}

export const updateMedicine = async (medicineId: number, updates: UpdateMedicineInput) => {
  const existing = await prisma.medicine.findUnique({ where: { medicine_id: medicineId } });
  if (!existing) throw new NotFoundError('Medicine not found');

  if (updates.barcode && updates.barcode !== existing.barcode) {
    const clash = await prisma.medicine.findUnique({ where: { barcode: updates.barcode } });
    if (clash) throw new ValidationError('A medicine with this barcode already exists');
  }

  return prisma.medicine.update({ where: { medicine_id: medicineId }, data: updates });
};
