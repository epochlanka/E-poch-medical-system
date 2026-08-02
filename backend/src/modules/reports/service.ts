import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError } from './errors';
import { ReportColumn } from './csv';

const prisma = new PrismaClient();

const DEFAULT_RANGE_DAYS = 30;
const DEFAULT_EXPIRY_THRESHOLD_DAYS = 90;

const startOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const endOfDay = (date = new Date()) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

const addDays = (date: Date, days: number) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const changePct = (current: number, prior: number): number | null => {
  if (prior === 0) return current === 0 ? 0 : null;
  return ((current - prior) / prior) * 100;
};

interface DateRangeInput {
  from?: Date;
  to?: Date;
}

// Resolves an optional {from,to} into a concrete day-aligned range, defaulting to the last
// 30 days, and returns the immediately-preceding period of equal length for comparison.
const resolveRange = ({ from, to }: DateRangeInput) => {
  if (from && to && from > to) throw new ValidationError('"from" must not be after "to"');

  const end = endOfDay(to ?? new Date());
  const start = from ? startOfDay(from) : startOfDay(addDays(end, -(DEFAULT_RANGE_DAYS - 1)));
  const spanMs = end.getTime() - start.getTime();

  const priorEnd = endOfDay(addDays(start, -1));
  const priorStart = new Date(priorEnd.getTime() - spanMs);

  return { start, end, priorStart, priorEnd };
};

export interface ReportResult {
  title: string;
  range: { from: Date; to: Date };
  columns: ReportColumn[];
  rows: Record<string, unknown>[];
  summary: Record<string, unknown>;
}

// ---- Admin: Daily Patient Volume ------------------------------------------------------

export const getPatientVolumeReport = async (input: DateRangeInput): Promise<ReportResult> => {
  const { start, end, priorStart, priorEnd } = resolveRange(input);

  const [appointments, priorAppointments] = await Promise.all([
    prisma.appointment.findMany({ where: { scheduled_at: { gte: start, lte: end } }, select: { patient_id: true, scheduled_at: true } }),
    prisma.appointment.findMany({ where: { scheduled_at: { gte: priorStart, lte: priorEnd } }, select: { patient_id: true } }),
  ]);

  const byDay = new Map<string, Set<string>>();
  for (const a of appointments) {
    const key = localDateKey(a.scheduled_at);
    if (!byDay.has(key)) byDay.set(key, new Set());
    byDay.get(key)!.add(a.patient_id);
  }

  const rows: Record<string, unknown>[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    rows.push({ date: key, uniquePatients: byDay.get(key)?.size ?? 0 });
    cursor = addDays(cursor, 1);
  }

  const totalUniquePatients = new Set(appointments.map((a) => a.patient_id)).size;
  const priorUniquePatients = new Set(priorAppointments.map((a) => a.patient_id)).size;

  return {
    title: 'Daily Patient Volume',
    range: { from: start, to: end },
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'uniquePatients', label: 'Unique Patients' },
    ],
    rows,
    summary: {
      totalUniquePatients,
      totalVisits: appointments.length,
      changePctVsPriorPeriod: changePct(totalUniquePatients, priorUniquePatients),
    },
  };
};

// ---- Admin: Revenue ---------------------------------------------------------------------

export const getRevenueReport = async (input: DateRangeInput): Promise<ReportResult> => {
  const { start, end, priorStart, priorEnd } = resolveRange(input);

  const [payments, priorAgg] = await Promise.all([
    prisma.payment.findMany({ where: { received_at: { gte: start, lte: end } }, select: { received_at: true, amount: true, method: true } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { received_at: { gte: priorStart, lte: priorEnd } } }),
  ]);

  const byDay = new Map<string, { cash: number; card: number; mobile: number; total: number }>();
  const methodKey: Record<string, 'cash' | 'card' | 'mobile'> = { Cash: 'cash', Card: 'card', Mobile: 'mobile' };

  for (const p of payments) {
    const key = localDateKey(p.received_at);
    if (!byDay.has(key)) byDay.set(key, { cash: 0, card: 0, mobile: 0, total: 0 });
    const bucket = byDay.get(key)!;
    const m = methodKey[p.method];
    if (m) bucket[m] += p.amount;
    bucket.total += p.amount;
  }

  const rows: Record<string, unknown>[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    const bucket = byDay.get(key) ?? { cash: 0, card: 0, mobile: 0, total: 0 };
    rows.push({ date: key, ...bucket });
    cursor = addDays(cursor, 1);
  }

  const totalRevenue = payments.reduce((sum, p) => sum + p.amount, 0);
  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] ?? 0) + p.amount;

  return {
    title: 'Revenue Report',
    range: { from: start, to: end },
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'cash', label: 'Cash' },
      { key: 'card', label: 'Card' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'total', label: 'Total' },
    ],
    rows,
    summary: {
      totalRevenue,
      ...byMethod,
      changePctVsPriorPeriod: changePct(totalRevenue, priorAgg._sum.amount ?? 0),
    },
  };
};

// ---- Admin: Top Dispensed Medicines -------------------------------------------------------

export const getTopMedicinesReport = async (input: DateRangeInput & { limit?: number }): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);
  const limit = input.limit && input.limit > 0 && input.limit <= 100 ? input.limit : 10;

  const grouped = await prisma.prescriptionItem.groupBy({
    by: ['medicine_id'],
    _sum: { qty: true },
    where: { dispensed_at: { gte: start, lte: end } },
    orderBy: { _sum: { qty: 'desc' } },
    take: limit,
  });

  const medicines = await prisma.medicine.findMany({ where: { medicine_id: { in: grouped.map((g) => g.medicine_id) } } });
  const byId = new Map(medicines.map((m) => [m.medicine_id, m]));

  const rows = grouped.map((g) => {
    const medicine = byId.get(g.medicine_id);
    const unitsSold = g._sum.qty ?? 0;
    return {
      medicineId: g.medicine_id,
      name: medicine?.name ?? 'Unknown',
      unitsSold,
      revenue: medicine ? medicine.unit_price * unitsSold : 0,
    };
  });

  return {
    title: 'Top Dispensed Medicines',
    range: { from: start, to: end },
    columns: [
      { key: 'medicineId', label: 'Medicine ID' },
      { key: 'name', label: 'Medicine' },
      { key: 'unitsSold', label: 'Units Dispensed' },
      { key: 'revenue', label: 'Revenue' },
    ],
    rows,
    summary: { totalUnitsSold: rows.reduce((sum, r) => sum + r.unitsSold, 0), totalRevenue: rows.reduce((sum, r) => sum + r.revenue, 0) },
  };
};

// ---- Admin: Audit Log Search ---------------------------------------------------------------

interface AuditLogFilters extends DateRangeInput {
  userId?: number;
  entity?: string;
  action?: string;
  entityId?: string;
  page?: number;
  limit?: number;
}

export const searchAuditLog = async (filters: AuditLogFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 200 ? filters.limit : 50;

  const where: Prisma.AuditLogWhereInput = {};
  if (filters.userId) where.user_id = filters.userId;
  if (filters.entity) where.entity = filters.entity;
  if (filters.action) where.action = filters.action;
  if (filters.entityId) where.entity_id = filters.entityId;
  if (filters.from || filters.to) {
    where.timestamp = { ...(filters.from ? { gte: startOfDay(filters.from) } : {}), ...(filters.to ? { lte: endOfDay(filters.to) } : {}) };
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: { user: { select: { username: true, role: true } } },
    }),
  ]);

  const rows = logs.map((l) => ({
    logId: l.log_id,
    timestamp: l.timestamp,
    username: l.user?.username ?? 'System',
    role: l.user?.role ?? '—',
    action: l.action,
    entity: l.entity,
    entityId: l.entity_id,
  }));

  const columns: ReportColumn[] = [
    { key: 'logId', label: 'Log ID' },
    { key: 'timestamp', label: 'Timestamp' },
    { key: 'username', label: 'User' },
    { key: 'role', label: 'Role' },
    { key: 'action', label: 'Action' },
    { key: 'entity', label: 'Entity' },
    { key: 'entityId', label: 'Entity ID' },
  ];

  return {
    title: 'Audit Log Search',
    range: { from: filters.from, to: filters.to },
    columns,
    rows,
    summary: { total },
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

// ---- Doctor: Consultation Counts (own, or any/all for Admin) -----------------------------

export const getDoctorConsultationsReport = async (input: DateRangeInput & { doctorId?: number }): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);

  if (input.doctorId) {
    const doctor = await prisma.user.findUnique({ where: { user_id: input.doctorId } });
    if (!doctor) throw new NotFoundError('Doctor not found');

    const consultations = await prisma.consultation.findMany({
      where: { status: 'Finalized', created_at: { gte: start, lte: end }, appointment: { doctor_id: input.doctorId } },
      select: { created_at: true },
    });

    const byDay = new Map<string, number>();
    for (const c of consultations) byDay.set(localDateKey(c.created_at), (byDay.get(localDateKey(c.created_at)) ?? 0) + 1);

    const rows: Record<string, unknown>[] = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      const key = localDateKey(cursor);
      rows.push({ date: key, consultations: byDay.get(key) ?? 0 });
      cursor = addDays(cursor, 1);
    }

    return {
      title: `Consultation Counts — ${doctor.username}`,
      range: { from: start, to: end },
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'consultations', label: 'Consultations' },
      ],
      rows,
      summary: { totalConsultations: consultations.length },
    };
  }

  // Admin, no specific doctor: totals per doctor across the range.
  const consultations = await prisma.consultation.findMany({
    where: { status: 'Finalized', created_at: { gte: start, lte: end } },
    include: { appointment: { include: { doctor: { select: { user_id: true, username: true } } } } },
  });

  const byDoctor = new Map<number, { doctorId: number; doctorName: string; consultations: number }>();
  for (const c of consultations) {
    const doctor = c.appointment.doctor;
    if (!byDoctor.has(doctor.user_id)) byDoctor.set(doctor.user_id, { doctorId: doctor.user_id, doctorName: doctor.username, consultations: 0 });
    byDoctor.get(doctor.user_id)!.consultations += 1;
  }

  return {
    title: 'Consultation Counts — All Doctors',
    range: { from: start, to: end },
    columns: [
      { key: 'doctorId', label: 'Doctor ID' },
      { key: 'doctorName', label: 'Doctor' },
      { key: 'consultations', label: 'Consultations' },
    ],
    rows: Array.from(byDoctor.values()).sort((a, b) => b.consultations - a.consultations),
    summary: { totalConsultations: consultations.length },
  };
};

// ---- Doctor: Follow-ups Due (own, or any/all for Admin) ----------------------------------

export const getDoctorFollowUpsDueReport = async (doctorId?: number): Promise<ReportResult> => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const consultations = await prisma.consultation.findMany({
    where: {
      status: 'Finalized',
      follow_up_date: { lte: todayEnd },
      ...(doctorId ? { appointment: { doctor_id: doctorId } } : {}),
    },
    include: {
      appointment: {
        include: { patient: { select: { patient_id: true, full_name: true, phone: true } }, doctor: { select: { user_id: true, username: true } } },
      },
    },
    orderBy: { follow_up_date: 'asc' },
  });

  const rows = consultations.map((c) => ({
    consultationId: c.consultation_id,
    followUpDate: c.follow_up_date,
    isOverdue: (c.follow_up_date as Date) < todayStart,
    patientId: c.appointment.patient.patient_id,
    patientName: c.appointment.patient.full_name,
    patientPhone: c.appointment.patient.phone,
    doctorName: c.appointment.doctor.username,
  }));

  return {
    title: 'Follow-ups Due',
    range: { from: undefined as any, to: todayEnd },
    columns: [
      { key: 'consultationId', label: 'Consultation ID' },
      { key: 'followUpDate', label: 'Follow-up Date' },
      { key: 'isOverdue', label: 'Overdue' },
      { key: 'patientId', label: 'Patient ID' },
      { key: 'patientName', label: 'Patient' },
      { key: 'patientPhone', label: 'Phone' },
      { key: 'doctorName', label: 'Doctor' },
    ],
    rows,
    summary: { total: rows.length, overdue: rows.filter((r) => r.isOverdue).length },
  };
};

// ---- Pharmacist: Low Stock -----------------------------------------------------------------

export const getLowStockReport = async (): Promise<ReportResult> => {
  const medicines = await prisma.medicine.findMany({
    where: { is_active: true },
    select: { medicine_id: true, name: true, reorder_level: true, batches: { select: { qty_on_hand: true } } },
  });

  const rows = medicines
    .map((m) => ({ medicineId: m.medicine_id, name: m.name, qtyOnHand: m.batches.reduce((s, b) => s + b.qty_on_hand, 0), reorderLevel: m.reorder_level }))
    .filter((m) => m.qtyOnHand < m.reorderLevel)
    .sort((a, b) => a.qtyOnHand - b.qtyOnHand);

  return {
    title: 'Low Stock Medicines',
    range: { from: undefined as any, to: undefined as any },
    columns: [
      { key: 'medicineId', label: 'Medicine ID' },
      { key: 'name', label: 'Medicine' },
      { key: 'qtyOnHand', label: 'Qty on Hand' },
      { key: 'reorderLevel', label: 'Reorder Level' },
    ],
    rows,
    summary: { totalLowStockItems: rows.length, outOfStock: rows.filter((r) => r.qtyOnHand === 0).length },
  };
};

// ---- Pharmacist: Expiring Batches -----------------------------------------------------------

export const getExpiringBatchesReport = async (thresholdDays = DEFAULT_EXPIRY_THRESHOLD_DAYS): Promise<ReportResult> => {
  const todayStart = startOfDay();
  const horizon = addDays(todayStart, thresholdDays);

  const batches = await prisma.batch.findMany({
    where: { qty_on_hand: { gt: 0 }, expiry_date: { lte: horizon } },
    include: { medicine: { select: { name: true } } },
    orderBy: { expiry_date: 'asc' },
  });

  const now = new Date();
  const rows = batches.map((b) => ({
    batchId: b.batch_id,
    medicineName: b.medicine.name,
    batchNo: b.batch_no,
    expiryDate: b.expiry_date,
    qtyOnHand: b.qty_on_hand,
    status: b.expiry_date < now ? 'Expired' : 'Expiring',
    daysUntilExpiry: Math.ceil((b.expiry_date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)),
  }));

  return {
    title: 'Expiring & Expired Batches',
    range: { from: todayStart, to: horizon },
    columns: [
      { key: 'batchId', label: 'Batch ID' },
      { key: 'medicineName', label: 'Medicine' },
      { key: 'batchNo', label: 'Batch No' },
      { key: 'expiryDate', label: 'Expiry Date' },
      { key: 'qtyOnHand', label: 'Qty on Hand' },
      { key: 'status', label: 'Status' },
      { key: 'daysUntilExpiry', label: 'Days Until Expiry' },
    ],
    rows,
    summary: { totalBatches: rows.length, expired: rows.filter((r) => r.status === 'Expired').length },
  };
};

// ---- Pharmacist: Dispensing Volume -----------------------------------------------------------

export const getDispensingVolumeReport = async (input: DateRangeInput): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);

  const items = await prisma.prescriptionItem.findMany({
    where: { dispensed_at: { gte: start, lte: end } },
    select: { dispensed_at: true, qty: true },
  });

  const byDay = new Map<string, { itemsDispensed: number; unitsDispensed: number }>();
  for (const item of items) {
    const key = localDateKey(item.dispensed_at as Date);
    if (!byDay.has(key)) byDay.set(key, { itemsDispensed: 0, unitsDispensed: 0 });
    const bucket = byDay.get(key)!;
    bucket.itemsDispensed += 1;
    bucket.unitsDispensed += item.qty;
  }

  const rows: Record<string, unknown>[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    const bucket = byDay.get(key) ?? { itemsDispensed: 0, unitsDispensed: 0 };
    rows.push({ date: key, ...bucket });
    cursor = addDays(cursor, 1);
  }

  return {
    title: 'Dispensing Volume',
    range: { from: start, to: end },
    columns: [
      { key: 'date', label: 'Date' },
      { key: 'itemsDispensed', label: 'Items Dispensed' },
      { key: 'unitsDispensed', label: 'Units Dispensed' },
    ],
    rows,
    summary: { totalItemsDispensed: items.length, totalUnitsDispensed: items.reduce((s, i) => s + i.qty, 0) },
  };
};
