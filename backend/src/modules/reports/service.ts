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

const ageInYears = (dob: Date, today: Date) => {
  let age = today.getFullYear() - dob.getFullYear();
  const m = today.getMonth() - dob.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < dob.getDate())) age -= 1;
  return age;
};

const AGE_BUCKETS = [
  { label: '0 - 18 Years', min: 0, max: 18 },
  { label: '19 - 30 Years', min: 19, max: 30 },
  { label: '31 - 45 Years', min: 31, max: 45 },
  { label: '46 - 60 Years', min: 46, max: 60 },
  { label: '60+ Years', min: 61, max: Infinity },
];

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

  // Temporary walk-ins have no patient_id — fall back to a per-appointment key so each still
  // counts toward volume (it was a real visit), just not deduped against a permanent identity.
  const dedupeKey = (a: { patient_id: string | null; scheduled_at?: Date }, i: number) => a.patient_id ?? `temp-${i}`;

  const byDay = new Map<string, Set<string>>();
  appointments.forEach((a, i) => {
    const key = localDateKey(a.scheduled_at);
    if (!byDay.has(key)) byDay.set(key, new Set());
    byDay.get(key)!.add(dedupeKey(a, i));
  });

  const rows: Record<string, unknown>[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    rows.push({ date: key, uniquePatients: byDay.get(key)?.size ?? 0 });
    cursor = addDays(cursor, 1);
  }

  const totalUniquePatients = new Set(appointments.map(dedupeKey)).size;
  const priorUniquePatients = new Set(priorAppointments.map(dedupeKey)).size;

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
    patientId: c.appointment.patient?.patient_id ?? null,
    patientName: c.appointment.patient?.full_name ?? c.appointment.temp_patient_name ?? 'Unregistered Patient',
    patientPhone: c.appointment.patient?.phone ?? c.appointment.temp_patient_phone ?? null,
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

// ---- Doctor: Prescriptions Summary (own, or any/all for Admin) ---------------------------

export const getDoctorPrescriptionsReport = async (input: DateRangeInput & { doctorId?: number }): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);

  if (input.doctorId) {
    const doctor = await prisma.user.findUnique({ where: { user_id: input.doctorId } });
    if (!doctor) throw new NotFoundError('Doctor not found');

    const prescriptions = await prisma.prescription.findMany({
      where: { issued_at: { gte: start, lte: end }, consultation: { appointment: { doctor_id: input.doctorId } } },
      select: { issued_at: true, items: { select: { qty: true } } },
    });

    const byDay = new Map<string, { prescriptions: number; itemsIssued: number }>();
    for (const p of prescriptions) {
      const key = localDateKey(p.issued_at);
      if (!byDay.has(key)) byDay.set(key, { prescriptions: 0, itemsIssued: 0 });
      const bucket = byDay.get(key)!;
      bucket.prescriptions += 1;
      bucket.itemsIssued += p.items.length;
    }

    const rows: Record<string, unknown>[] = [];
    let cursor = new Date(start);
    while (cursor <= end) {
      const key = localDateKey(cursor);
      const bucket = byDay.get(key) ?? { prescriptions: 0, itemsIssued: 0 };
      rows.push({ date: key, ...bucket });
      cursor = addDays(cursor, 1);
    }

    return {
      title: `Prescriptions Summary — ${doctor.username}`,
      range: { from: start, to: end },
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'prescriptions', label: 'Prescriptions' },
        { key: 'itemsIssued', label: 'Medicine Items' },
      ],
      rows,
      summary: { totalPrescriptions: prescriptions.length, totalItemsIssued: prescriptions.reduce((s, p) => s + p.items.length, 0) },
    };
  }

  const prescriptions = await prisma.prescription.findMany({
    where: { issued_at: { gte: start, lte: end } },
    include: { items: { select: { qty: true } }, consultation: { include: { appointment: { include: { doctor: { select: { user_id: true, username: true } } } } } } },
  });

  const byDoctor = new Map<number, { doctorId: number; doctorName: string; prescriptions: number; itemsIssued: number }>();
  for (const p of prescriptions) {
    const doctor = p.consultation.appointment.doctor;
    if (!byDoctor.has(doctor.user_id)) byDoctor.set(doctor.user_id, { doctorId: doctor.user_id, doctorName: doctor.username, prescriptions: 0, itemsIssued: 0 });
    const agg = byDoctor.get(doctor.user_id)!;
    agg.prescriptions += 1;
    agg.itemsIssued += p.items.length;
  }

  return {
    title: 'Prescriptions Summary — All Doctors',
    range: { from: start, to: end },
    columns: [
      { key: 'doctorId', label: 'Doctor ID' },
      { key: 'doctorName', label: 'Doctor' },
      { key: 'prescriptions', label: 'Prescriptions' },
      { key: 'itemsIssued', label: 'Medicine Items' },
    ],
    rows: Array.from(byDoctor.values()).sort((a, b) => b.prescriptions - a.prescriptions),
    summary: { totalPrescriptions: prescriptions.length, totalItemsIssued: prescriptions.reduce((s, p) => s + p.items.length, 0) },
  };
};

// ---- Doctor: Consultations by Diagnosis (own, or any/all for Admin) ----------------------

export const getDoctorDiagnosesReport = async (input: DateRangeInput & { doctorId?: number }): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);

  let doctorName = 'All Doctors';
  if (input.doctorId) {
    const doctor = await prisma.user.findUnique({ where: { user_id: input.doctorId } });
    if (!doctor) throw new NotFoundError('Doctor not found');
    doctorName = doctor.username;
  }

  const consultations = await prisma.consultation.findMany({
    where: {
      status: 'Finalized',
      created_at: { gte: start, lte: end },
      diagnosis: { not: null },
      ...(input.doctorId ? { appointment: { doctor_id: input.doctorId } } : {}),
    },
    select: { diagnosis: true },
  });

  const byDiagnosis = new Map<string, number>();
  for (const c of consultations) {
    const key = (c.diagnosis as string).trim();
    if (!key) continue;
    byDiagnosis.set(key, (byDiagnosis.get(key) ?? 0) + 1);
  }

  const rows = Array.from(byDiagnosis.entries())
    .map(([diagnosis, count]) => ({ diagnosis, count }))
    .sort((a, b) => b.count - a.count);

  return {
    title: `Consultations by Diagnosis — ${doctorName}`,
    range: { from: start, to: end },
    columns: [
      { key: 'diagnosis', label: 'Diagnosis' },
      { key: 'count', label: 'Consultations' },
    ],
    rows,
    summary: { totalDiagnosedConsultations: consultations.length, distinctDiagnoses: byDiagnosis.size },
  };
};

// ---- Doctor: Patient Visit Frequency (own, or any/all for Admin) -------------------------

export const getDoctorPatientVisitsReport = async (input: DateRangeInput & { doctorId?: number }): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);

  let doctorName = 'All Doctors';
  if (input.doctorId) {
    const doctor = await prisma.user.findUnique({ where: { user_id: input.doctorId } });
    if (!doctor) throw new NotFoundError('Doctor not found');
    doctorName = doctor.username;
  }

  // Visit *frequency* only means something for a stable, repeat-identifiable patient — a
  // temporary/unregistered walk-in has no persistent identity to accumulate a count against, so
  // it's excluded here rather than shown as a permanent one-off "patient" in a frequency report.
  const appointments = await prisma.appointment.findMany({
    where: { scheduled_at: { gte: start, lte: end }, patient_id: { not: null }, ...(input.doctorId ? { doctor_id: input.doctorId } : {}) },
    select: { patient_id: true, patient: { select: { full_name: true } } },
  });

  const byPatient = new Map<string, { patientId: string; patientName: string; visits: number }>();
  for (const a of appointments) {
    const patientId = a.patient_id as string;
    if (!byPatient.has(patientId)) byPatient.set(patientId, { patientId, patientName: a.patient!.full_name, visits: 0 });
    byPatient.get(patientId)!.visits += 1;
  }

  const rows = Array.from(byPatient.values()).sort((a, b) => b.visits - a.visits);

  return {
    title: `Patient Visit Frequency — ${doctorName}`,
    range: { from: start, to: end },
    columns: [
      { key: 'patientId', label: 'Patient ID' },
      { key: 'patientName', label: 'Patient' },
      { key: 'visits', label: 'Visits' },
    ],
    rows,
    summary: { totalVisits: appointments.length, distinctPatients: byPatient.size },
  };
};

// ---- Doctor: Top Prescribed Medicines (own, or any/all for Admin) ------------------------

export const getDoctorTopMedicinesReport = async (input: DateRangeInput & { doctorId?: number; limit?: number }): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);
  const limit = input.limit && input.limit > 0 && input.limit <= 100 ? input.limit : 10;

  let doctorName = 'All Doctors';
  if (input.doctorId) {
    const doctor = await prisma.user.findUnique({ where: { user_id: input.doctorId } });
    if (!doctor) throw new NotFoundError('Doctor not found');
    doctorName = doctor.username;
  }

  const grouped = await prisma.prescriptionItem.groupBy({
    by: ['medicine_id'],
    _sum: { qty: true },
    where: {
      prescription: {
        issued_at: { gte: start, lte: end },
        ...(input.doctorId ? { consultation: { appointment: { doctor_id: input.doctorId } } } : {}),
      },
    },
    orderBy: { _sum: { qty: 'desc' } },
    take: limit,
  });

  const medicines = await prisma.medicine.findMany({ where: { medicine_id: { in: grouped.map((g) => g.medicine_id) } } });
  const byId = new Map(medicines.map((m) => [m.medicine_id, m]));

  const rows = grouped.map((g) => ({
    medicineId: g.medicine_id,
    name: byId.get(g.medicine_id)?.name ?? 'Unknown',
    unitsPrescribed: g._sum.qty ?? 0,
  }));

  return {
    title: `Top Prescribed Medicines — ${doctorName}`,
    range: { from: start, to: end },
    columns: [
      { key: 'medicineId', label: 'Medicine ID' },
      { key: 'name', label: 'Medicine' },
      { key: 'unitsPrescribed', label: 'Units Prescribed' },
    ],
    rows,
    summary: { totalUnitsPrescribed: rows.reduce((s, r) => s + r.unitsPrescribed, 0) },
  };
};

// ---- Doctor: Appointment Summary (own, or any/all for Admin) -----------------------------

export const getDoctorAppointmentsReport = async (input: DateRangeInput & { doctorId?: number }): Promise<ReportResult> => {
  const { start, end } = resolveRange(input);

  let doctorName = 'All Doctors';
  if (input.doctorId) {
    const doctor = await prisma.user.findUnique({ where: { user_id: input.doctorId } });
    if (!doctor) throw new NotFoundError('Doctor not found');
    doctorName = doctor.username;
  }

  const appointments = await prisma.appointment.findMany({
    where: { scheduled_at: { gte: start, lte: end }, ...(input.doctorId ? { doctor_id: input.doctorId } : {}) },
    select: { status: true },
  });

  const byStatus = new Map<string, number>();
  for (const a of appointments) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);

  const rows = Array.from(byStatus.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const completed = byStatus.get('Completed') ?? 0;
  const noShow = byStatus.get('No Show') ?? 0;
  const cancelled = byStatus.get('Cancelled') ?? 0;

  return {
    title: `Appointment Summary — ${doctorName}`,
    range: { from: start, to: end },
    columns: [
      { key: 'status', label: 'Status' },
      { key: 'count', label: 'Appointments' },
    ],
    rows,
    summary: {
      totalAppointments: appointments.length,
      completed,
      cancelled,
      noShow,
      attendanceRate: appointments.length ? Math.round((completed / appointments.length) * 1000) / 10 : 0,
    },
  };
};

// ---- Doctor: Clinical Statistics dashboard (own, or any/all for Admin) -------------------
// One bundled endpoint (same "one call per dashboard" pattern as the admin Overview report and
// the doctor-frontend Dashboard/Consultation-context endpoints) rather than a waterfall of the
// individual doctor/* report calls this page's numbers otherwise overlap with.

export interface ClinicalStatisticsResult {
  title: string;
  range: { from: Date; to: Date };
  kpis: {
    totalConsultations: number;
    priorTotalConsultations: number;
    totalConsultationsChangePct: number | null;
    newPatients: number;
    priorNewPatients: number;
    newPatientsChangePct: number | null;
    prescriptionsIssued: number;
    priorPrescriptionsIssued: number;
    prescriptionsIssuedChangePct: number | null;
    followUpsScheduled: number;
    priorFollowUpsScheduled: number;
    followUpsScheduledChangePct: number | null;
    avgConsultationSeconds: number;
    priorAvgConsultationSeconds: number;
    avgConsultationSecondsChangePct: number | null;
  };
  consultationsTrend: { date: string; count: number }[];
  appointmentOutcomes: { status: string; count: number }[];
  patientDemographics: { label: string; count: number }[];
  topDiagnoses: { diagnosis: string; count: number; percentage: number }[];
}

export const getDoctorClinicalStatistics = async (input: DateRangeInput & { doctorId?: number }): Promise<ClinicalStatisticsResult> => {
  const { start, end, priorStart, priorEnd } = resolveRange(input);

  let doctorName = 'All Doctors';
  if (input.doctorId) {
    const doctor = await prisma.user.findUnique({ where: { user_id: input.doctorId } });
    if (!doctor) throw new NotFoundError('Doctor not found');
    doctorName = doctor.username;
  }
  const apptWhere = input.doctorId ? { doctor_id: input.doctorId } : {};
  const consultWhere = input.doctorId ? { appointment: { doctor_id: input.doctorId } } : {};

  const [consultations, priorConsultations, appointments, prescriptionsCount, priorPrescriptionsCount, followUpsCount, priorFollowUpsCount] =
    await Promise.all([
      prisma.consultation.findMany({
        where: { status: 'Finalized', created_at: { gte: start, lte: end }, ...consultWhere },
        select: { created_at: true, finalized_at: true, diagnosis: true },
      }),
      prisma.consultation.findMany({
        where: { status: 'Finalized', created_at: { gte: priorStart, lte: priorEnd }, ...consultWhere },
        select: { created_at: true, finalized_at: true },
      }),
      // Fetched from the start of time (not just this range) so a patient's *first ever*
      // appointment with this doctor can be found even if it happened long before `start`.
      prisma.appointment.findMany({
        where: { scheduled_at: { lte: end }, ...apptWhere },
        select: { patient_id: true, scheduled_at: true, status: true, patient: { select: { dob: true } } },
        orderBy: { scheduled_at: 'asc' },
      }),
      prisma.prescription.count({ where: { issued_at: { gte: start, lte: end }, consultation: consultWhere } }),
      prisma.prescription.count({ where: { issued_at: { gte: priorStart, lte: priorEnd }, consultation: consultWhere } }),
      prisma.consultation.count({ where: { created_at: { gte: start, lte: end }, follow_up_date: { not: null }, ...consultWhere } }),
      prisma.consultation.count({ where: { created_at: { gte: priorStart, lte: priorEnd }, follow_up_date: { not: null }, ...consultWhere } }),
    ]);

  // Consultations trend, day-bucketed over the full range.
  const byDay = new Map<string, number>();
  for (const c of consultations) byDay.set(localDateKey(c.created_at), (byDay.get(localDateKey(c.created_at)) ?? 0) + 1);
  const consultationsTrend: { date: string; count: number }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    consultationsTrend.push({ date: key, count: byDay.get(key) ?? 0 });
    cursor = addDays(cursor, 1);
  }

  // Average consultation duration: finalized_at - created_at is the only real timing this
  // domain model tracks (no separate start/end-of-visit timestamps exist).
  const durationOf = (c: { created_at: Date; finalized_at: Date | null }) => ((c.finalized_at as Date).getTime() - c.created_at.getTime()) / 1000;
  const avgOf = (list: number[]) => (list.length ? Math.round(list.reduce((s, d) => s + d, 0) / list.length) : 0);
  const durations = consultations.filter((c) => c.finalized_at).map(durationOf);
  const priorDurations = priorConsultations.filter((c) => c.finalized_at).map(durationOf);
  const avgConsultationSeconds = avgOf(durations);
  const priorAvgConsultationSeconds = avgOf(priorDurations);

  // New patients / demographics both need a stable, registered identity (DOB lives on Patient) —
  // temporary walk-ins are excluded from both, same reasoning as the visit-frequency report above.
  const registeredAppointments = appointments.filter(
    (a): a is typeof a & { patient_id: string; patient: NonNullable<(typeof a)['patient']> } => a.patient_id !== null && a.patient !== null
  );

  // New patients: the first appointment this doctor ever had with each patient, bucketed by
  // whether that first visit falls in the current vs prior period.
  const firstSeen = new Map<string, Date>();
  for (const a of registeredAppointments) if (!firstSeen.has(a.patient_id)) firstSeen.set(a.patient_id, a.scheduled_at);
  let newPatients = 0;
  let priorNewPatients = 0;
  for (const date of firstSeen.values()) {
    if (date >= start && date <= end) newPatients += 1;
    else if (date >= priorStart && date <= priorEnd) priorNewPatients += 1;
  }

  // Appointment outcomes + patient demographics are both scoped to this period's appointments only.
  const appointmentsInRange = appointments.filter((a) => a.scheduled_at >= start && a.scheduled_at <= end);
  const byStatus = new Map<string, number>();
  for (const a of appointmentsInRange) byStatus.set(a.status, (byStatus.get(a.status) ?? 0) + 1);
  const appointmentOutcomes = Array.from(byStatus.entries())
    .map(([status, count]) => ({ status, count }))
    .sort((a, b) => b.count - a.count);

  const now = new Date();
  const seenPatients = new Map<string, Date>();
  for (const a of appointmentsInRange) if (a.patient_id && a.patient && !seenPatients.has(a.patient_id)) seenPatients.set(a.patient_id, a.patient.dob as Date);
  const patientDemographics = AGE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: Array.from(seenPatients.values()).filter((dob) => {
      const age = ageInYears(dob, now);
      return age >= bucket.min && age <= bucket.max;
    }).length,
  }));

  const byDiagnosis = new Map<string, number>();
  for (const c of consultations) {
    if (!c.diagnosis) continue;
    const key = c.diagnosis.trim();
    if (!key) continue;
    byDiagnosis.set(key, (byDiagnosis.get(key) ?? 0) + 1);
  }
  const diagnosedTotal = Array.from(byDiagnosis.values()).reduce((s, v) => s + v, 0);
  const topDiagnoses = Array.from(byDiagnosis.entries())
    .map(([diagnosis, count]) => ({ diagnosis, count, percentage: diagnosedTotal ? Math.round((count / diagnosedTotal) * 1000) / 10 : 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);

  return {
    title: `Clinical Statistics — ${doctorName}`,
    range: { from: start, to: end },
    kpis: {
      totalConsultations: consultations.length,
      priorTotalConsultations: priorConsultations.length,
      totalConsultationsChangePct: changePct(consultations.length, priorConsultations.length),
      newPatients,
      priorNewPatients,
      newPatientsChangePct: changePct(newPatients, priorNewPatients),
      prescriptionsIssued: prescriptionsCount,
      priorPrescriptionsIssued: priorPrescriptionsCount,
      prescriptionsIssuedChangePct: changePct(prescriptionsCount, priorPrescriptionsCount),
      followUpsScheduled: followUpsCount,
      priorFollowUpsScheduled: priorFollowUpsCount,
      followUpsScheduledChangePct: changePct(followUpsCount, priorFollowUpsCount),
      avgConsultationSeconds,
      priorAvgConsultationSeconds,
      avgConsultationSecondsChangePct: changePct(avgConsultationSeconds, priorAvgConsultationSeconds),
    },
    consultationsTrend,
    appointmentOutcomes,
    patientDemographics,
    topDiagnoses,
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

// ---- Admin: Dashboard Overview -------------------------------------------------------------
// Aggregates only what the data model actually supports: revenue here is accrual (invoice
// total_amount, net of discounts), distinct from the cash-basis /revenue report. "Collections"
// is the cash-basis counterpart (payments actually received against this period's invoices).

export const getOverviewReport = async (input: DateRangeInput) => {
  const { start, end, priorStart, priorEnd } = resolveRange(input);

  const [
    totalPatients,
    priorTotalPatients,
    newPatients,
    priorNewPatients,
    appointments,
    priorAppointments,
    consultations,
    priorConsultations,
    prescriptions,
    priorPrescriptions,
    invoices,
    priorInvoiceAgg,
    priorMedicineAgg,
    lowStock,
    expiringBatches,
    outstandingInvoicesCount,
    activePatients,
    recentActivityLogs,
  ] = await Promise.all([
    prisma.patient.count({ where: { created_at: { lte: end } } }),
    prisma.patient.count({ where: { created_at: { lte: priorEnd } } }),
    prisma.patient.count({ where: { created_at: { gte: start, lte: end } } }),
    prisma.patient.count({ where: { created_at: { gte: priorStart, lte: priorEnd } } }),
    prisma.appointment.count({ where: { scheduled_at: { gte: start, lte: end } } }),
    prisma.appointment.count({ where: { scheduled_at: { gte: priorStart, lte: priorEnd } } }),
    prisma.consultation.findMany({
      where: { status: 'Finalized', created_at: { gte: start, lte: end } },
      select: {
        consultation_id: true,
        appointment: { select: { appointment_id: true, patient_id: true, doctor: { select: { user_id: true, username: true } } } },
      },
    }),
    prisma.consultation.count({ where: { status: 'Finalized', created_at: { gte: priorStart, lte: priorEnd } } }),
    prisma.prescription.count({ where: { issued_at: { gte: start, lte: end } } }),
    prisma.prescription.count({ where: { issued_at: { gte: priorStart, lte: priorEnd } } }),
    prisma.invoice.findMany({
      where: { created_at: { gte: start, lte: end }, payment_status: { not: 'Voided' } },
      select: {
        invoice_id: true,
        total_amount: true,
        paid_amount: true,
        created_at: true,
        items: { select: { item_type: true, line_total: true } },
        consultation: { select: { appointment: { select: { doctor: { select: { user_id: true, username: true } } } } } },
      },
    }),
    prisma.invoice.aggregate({
      _sum: { total_amount: true, paid_amount: true },
      _count: true,
      where: { created_at: { gte: priorStart, lte: priorEnd }, payment_status: { not: 'Voided' } },
    }),
    prisma.invoiceItem.aggregate({
      _sum: { line_total: true },
      where: { item_type: 'Medicine', invoice: { created_at: { gte: priorStart, lte: priorEnd }, payment_status: { not: 'Voided' } } },
    }),
    getLowStockReport(),
    getExpiringBatchesReport(30),
    prisma.invoice.count({ where: { payment_status: { in: ['Outstanding', 'PartiallyPaid'] } } }),
    prisma.patient.findMany({ where: { is_active: true }, select: { dob: true } }),
    prisma.auditLog.findMany({ take: 8, orderBy: { timestamp: 'desc' }, include: { user: { select: { username: true, role: true } } } }),
  ]);

  // Revenue trend + total: accrual basis, day-bucketed sum of invoice total_amount.
  const revenueByDay = new Map<string, number>();
  for (const inv of invoices) revenueByDay.set(localDateKey(inv.created_at), (revenueByDay.get(localDateKey(inv.created_at)) ?? 0) + inv.total_amount);

  const revenueTrend: { date: string; total: number }[] = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const key = localDateKey(cursor);
    revenueTrend.push({ date: key, total: revenueByDay.get(key) ?? 0 });
    cursor = addDays(cursor, 1);
  }

  const totalRevenue = invoices.reduce((sum, inv) => sum + inv.total_amount, 0);
  const priorTotalRevenue = priorInvoiceAgg._sum.total_amount ?? 0;
  const collections = invoices.reduce((sum, inv) => sum + inv.paid_amount, 0);
  const priorCollections = priorInvoiceAgg._sum.paid_amount ?? 0;

  const revenueByCategory: Record<string, number> = {};
  let subtotalBilled = 0;
  let discountTotal = 0;
  for (const inv of invoices) {
    for (const item of inv.items) {
      if (item.item_type === 'Discount') {
        discountTotal += -item.line_total;
      } else {
        revenueByCategory[item.item_type] = (revenueByCategory[item.item_type] ?? 0) + item.line_total;
        subtotalBilled += item.line_total;
      }
    }
  }
  const medicineSales = revenueByCategory['Medicine'] ?? 0;
  const priorMedicineSales = priorMedicineAgg._sum.line_total ?? 0;

  const avgBillValue = invoices.length ? totalRevenue / invoices.length : 0;
  const priorAvgBillValue = priorInvoiceAgg._count ? priorTotalRevenue / priorInvoiceAgg._count : 0;

  // Top performing doctors: consultation/patient counts from all finalized consultations in
  // range, revenue attributed from invoices billed for those doctors' visits (fee + medicine).
  interface DoctorAgg { doctorId: number; doctorName: string; consultations: number; patients: Set<string>; revenue: number }
  const doctorMap = new Map<number, DoctorAgg>();
  const getDoctorAgg = (id: number, name: string) => {
    if (!doctorMap.has(id)) doctorMap.set(id, { doctorId: id, doctorName: name, consultations: 0, patients: new Set(), revenue: 0 });
    return doctorMap.get(id)!;
  };
  for (const c of consultations) {
    const doctor = c.appointment.doctor;
    const agg = getDoctorAgg(doctor.user_id, doctor.username);
    agg.consultations += 1;
    agg.patients.add(c.appointment.patient_id ?? `temp-${c.appointment.appointment_id}`);
  }
  for (const inv of invoices) {
    const doctor = inv.consultation?.appointment.doctor;
    if (!doctor) continue;
    getDoctorAgg(doctor.user_id, doctor.username).revenue += inv.total_amount;
  }
  const topDoctors = Array.from(doctorMap.values())
    .map((d) => ({ doctorId: d.doctorId, doctorName: d.doctorName, consultations: d.consultations, patients: d.patients.size, revenue: d.revenue }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  // Patient demographics: live snapshot of the current active roster, not range-scoped.
  const now = new Date();
  const patientDemographics = AGE_BUCKETS.map((bucket) => ({
    label: bucket.label,
    count: activePatients.filter((p) => {
      const age = ageInYears(p.dob as Date, now);
      return age >= bucket.min && age <= bucket.max;
    }).length,
  }));

  const recentActivity = recentActivityLogs.map((l) => ({
    logId: l.log_id,
    timestamp: l.timestamp,
    username: l.user?.username ?? 'System',
    role: l.user?.role ?? '—',
    action: l.action,
    entity: l.entity,
    entityId: l.entity_id,
  }));

  return {
    title: 'Reports Overview',
    range: { from: start, to: end },
    kpis: {
      totalPatients,
      totalPatientsChangePct: changePct(totalPatients, priorTotalPatients),
      appointments: appointments,
      appointmentsChangePct: changePct(appointments, priorAppointments),
      consultations: consultations.length,
      consultationsChangePct: changePct(consultations.length, priorConsultations),
      prescriptions,
      prescriptionsChangePct: changePct(prescriptions, priorPrescriptions),
      totalRevenue,
      totalRevenueChangePct: changePct(totalRevenue, priorTotalRevenue),
    },
    revenueTrend,
    revenueByCategory: {
      categories: Object.entries(revenueByCategory).map(([label, value]) => ({ label, value })),
      subtotalBilled,
      discountTotal,
      netRevenue: totalRevenue,
    },
    stats: {
      newPatients,
      newPatientsChangePct: changePct(newPatients, priorNewPatients),
      medicineSales,
      medicineSalesChangePct: changePct(medicineSales, priorMedicineSales),
      avgBillValue,
      avgBillValueChangePct: changePct(avgBillValue, priorAvgBillValue),
      collections,
      collectionsChangePct: changePct(collections, priorCollections),
    },
    topDoctors,
    patientDemographics,
    alerts: {
      lowStockCount: lowStock.summary.totalLowStockItems as number,
      expiringSoonCount: expiringBatches.summary.totalBatches as number,
      outstandingInvoicesCount,
    },
    recentActivity,
  };
};
