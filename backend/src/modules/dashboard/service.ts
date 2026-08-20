import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const ACTIVE_QUEUE_STATUSES = ['Waiting', 'Called', 'Consulting'];
const QUEUE_STATUSES = ['Waiting', 'Called', 'Consulting', 'Completed', 'Skipped'] as const;
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

const isLowStock = (medicine: { reorder_level: number; batches: { qty_on_hand: number }[] }) => {
  const totalQty = medicine.batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
  return totalQty < medicine.reorder_level;
};

// Null means "no meaningful comparison" (yesterday was zero) rather than a fabricated 0%/100%.
const changePct = (today: number, prior: number): number | null => {
  if (prior === 0) return today === 0 ? 0 : null;
  return ((today - prior) / prior) * 100;
};

export const getOverview = async (expiryThresholdDays = DEFAULT_EXPIRY_THRESHOLD_DAYS) => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const yesterdayStart = addDays(todayStart, -1);
  const yesterdayEnd = addDays(todayEnd, -1);

  const [
    todaysPatientRows,
    yesterdaysPatientRows,
    todaysAppointmentsCount,
    yesterdaysAppointmentsCount,
    revenueAgg,
    yesterdayRevenueAgg,
    medicines,
    expiringBatchesCount,
    pendingPrescriptionsCount,
  ] = await Promise.all([
    prisma.appointment.findMany({
      where: { scheduled_at: { gte: todayStart, lte: todayEnd } },
      select: { patient_id: true },
      distinct: ['patient_id'],
    }),
    prisma.appointment.findMany({
      where: { scheduled_at: { gte: yesterdayStart, lte: yesterdayEnd } },
      select: { patient_id: true },
      distinct: ['patient_id'],
    }),
    prisma.appointment.count({ where: { scheduled_at: { gte: todayStart, lte: todayEnd } } }),
    prisma.appointment.count({ where: { scheduled_at: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { received_at: { gte: todayStart, lte: todayEnd } },
    }),
    prisma.payment.aggregate({
      _sum: { amount: true },
      where: { received_at: { gte: yesterdayStart, lte: yesterdayEnd } },
    }),
    prisma.medicine.findMany({
      where: { is_active: true },
      select: { reorder_level: true, batches: { select: { qty_on_hand: true } } },
    }),
    prisma.batch.count({
      where: {
        qty_on_hand: { gt: 0 },
        expiry_date: { gte: todayStart, lte: addDays(todayStart, expiryThresholdDays) },
      },
    }),
    prisma.prescription.count({ where: { status: 'Pending' } }),
  ]);

  const revenueToday = revenueAgg._sum.amount ?? 0;
  const revenueYesterday = yesterdayRevenueAgg._sum.amount ?? 0;

  return {
    todaysPatients: todaysPatientRows.length,
    todaysPatientsChangePct: changePct(todaysPatientRows.length, yesterdaysPatientRows.length),
    revenueToday,
    revenueTodayChangePct: changePct(revenueToday, revenueYesterday),
    totalAppointmentsToday: todaysAppointmentsCount,
    totalAppointmentsTodayChangePct: changePct(todaysAppointmentsCount, yesterdaysAppointmentsCount),
    // No historical status-change tracking, so "pending" has no honest day-over-day comparison.
    pendingPrescriptions: pendingPrescriptionsCount,
    lowStockCount: medicines.filter(isLowStock).length,
    expiringBatchesCount,
  };
};

export const getQueueSnapshot = async (doctorId?: number) => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const appointments = await prisma.appointment.findMany({
    where: {
      scheduled_at: { gte: todayStart, lte: todayEnd },
      ...(doctorId ? { doctor_id: doctorId } : {}),
    },
    include: {
      patient: { select: { patient_id: true, full_name: true } },
      doctor: { select: { user_id: true, username: true } },
    },
    orderBy: { scheduled_at: 'asc' },
  });

  const counts = QUEUE_STATUSES.reduce((acc, status) => ({ ...acc, [status]: 0 }), {} as Record<string, number>);
  for (const appointment of appointments) {
    if (appointment.status in counts) {
      counts[appointment.status] += 1;
    }
  }

  const activeQueue = appointments.filter((a) => ACTIVE_QUEUE_STATUSES.includes(a.status));

  const toAppointmentSummary = (a: (typeof appointments)[number]) => ({
    appointmentId: a.appointment_id,
    patientId: a.patient.patient_id,
    patientName: a.patient.full_name,
    doctorId: a.doctor.user_id,
    doctorName: a.doctor.username,
    status: a.status,
    scheduledAt: a.scheduled_at,
  });

  return {
    counts,
    queueLength: activeQueue.length,
    queue: activeQueue.map(toAppointmentSummary),
    appointmentsToday: appointments.map(toAppointmentSummary),
  };
};

export const getFollowUpsDue = async (doctorId?: number) => {
  const todayEnd = endOfDay();
  const todayStart = startOfDay();

  const consultations = await prisma.consultation.findMany({
    where: {
      status: 'Finalized',
      follow_up_date: { lte: todayEnd },
      ...(doctorId ? { appointment: { doctor_id: doctorId } } : {}),
    },
    include: {
      appointment: {
        include: {
          patient: { select: { patient_id: true, full_name: true, phone: true } },
          doctor: { select: { user_id: true, username: true } },
        },
      },
    },
    orderBy: { follow_up_date: 'asc' },
  });

  return consultations.map((c) => ({
    consultationId: c.consultation_id,
    followUpDate: c.follow_up_date,
    isOverdue: (c.follow_up_date as Date) < todayStart,
    patientId: c.appointment.patient.patient_id,
    patientName: c.appointment.patient.full_name,
    patientPhone: c.appointment.patient.phone,
    doctorId: c.appointment.doctor.user_id,
    doctorName: c.appointment.doctor.username,
  }));
};

const endOfMonth = (date = new Date()) => endOfDay(new Date(date.getFullYear(), date.getMonth() + 1, 0));

/**
 * Full Follow-ups Due page: every Finalized consultation with a follow-up date set, doctor-scoped,
 * bucketed the same "due by X" cumulative way getDoctorDashboard's followUpsDueCount already does
 * (each wider window includes everything narrower, including anything overdue) — not mutually
 * exclusive slices, so a pie/donut isn't the right chart for these; percentages are "of total".
 */
export const getFollowUpsList = async (filters: { doctorId?: number; bucket?: 'all' | 'overdue' | 'today' | 'week' | 'month'; search?: string; page?: number; limit?: number }) => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const weekEnd = endOfDay(addDays(todayStart, 6));
  const monthEnd = endOfMonth();

  const all = await prisma.consultation.findMany({
    where: {
      status: 'Finalized',
      follow_up_date: { not: null },
      ...(filters.doctorId ? { appointment: { doctor_id: filters.doctorId } } : {}),
      ...(filters.search
        ? {
            appointment: {
              ...(filters.doctorId ? { doctor_id: filters.doctorId } : {}),
              OR: [{ patient: { full_name: { contains: filters.search } } }, { patient: { patient_id: { contains: filters.search } } }],
            },
          }
        : {}),
    },
    include: {
      appointment: {
        include: {
          patient: { select: { patient_id: true, full_name: true, gender: true, dob: true, phone: true, photo_url: true } },
          doctor: { select: { user_id: true, username: true } },
        },
      },
    },
    orderBy: { follow_up_date: 'asc' },
  });

  const counts = {
    total: all.length,
    overdue: all.filter((c) => (c.follow_up_date as Date) < todayStart).length,
    dueToday: all.filter((c) => (c.follow_up_date as Date) >= todayStart && (c.follow_up_date as Date) <= todayEnd).length,
    dueThisWeek: all.filter((c) => (c.follow_up_date as Date) <= weekEnd).length,
    dueThisMonth: all.filter((c) => (c.follow_up_date as Date) <= monthEnd).length,
  };

  const bucketed =
    filters.bucket === 'overdue'
      ? all.filter((c) => (c.follow_up_date as Date) < todayStart)
      : filters.bucket === 'today'
        ? all.filter((c) => (c.follow_up_date as Date) >= todayStart && (c.follow_up_date as Date) <= todayEnd)
        : filters.bucket === 'week'
          ? all.filter((c) => (c.follow_up_date as Date) <= weekEnd)
          : filters.bucket === 'month'
            ? all.filter((c) => (c.follow_up_date as Date) <= monthEnd)
            : all;

  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 10;
  const pageRows = bucketed.slice((page - 1) * limit, (page - 1) * limit + limit);

  return {
    data: pageRows.map((c) => ({
      consultationId: c.consultation_id,
      appointmentId: c.appointment_id,
      followUpDate: c.follow_up_date,
      lastVisitDate: c.created_at,
      diagnosis: c.diagnosis,
      complaint: c.complaint,
      patient: c.appointment.patient,
      doctorId: c.appointment.doctor.user_id,
      doctorName: c.appointment.doctor.username,
    })),
    pagination: { page, limit, total: bucketed.length, totalPages: Math.max(1, Math.ceil(bucketed.length / limit)) },
    counts,
  };
};

type Alert = {
  type: 'low-stock' | 'expiring-batch' | 'expired-batch' | 'skipped-appointment';
  severity: 'red' | 'amber';
  message: string;
  refId: number | string;
};

export const getAlerts = async (expiryThresholdDays = DEFAULT_EXPIRY_THRESHOLD_DAYS) => {
  const todayStart = startOfDay();
  const expiryHorizon = addDays(todayStart, expiryThresholdDays);

  const [medicines, expiringBatches, skippedAppointments] = await Promise.all([
    prisma.medicine.findMany({
      where: { is_active: true },
      select: { medicine_id: true, name: true, reorder_level: true, batches: { select: { qty_on_hand: true } } },
    }),
    prisma.batch.findMany({
      where: { qty_on_hand: { gt: 0 }, expiry_date: { lte: expiryHorizon } },
      include: { medicine: { select: { name: true } } },
      orderBy: { expiry_date: 'asc' },
    }),
    prisma.appointment.findMany({
      where: { status: 'Skipped', scheduled_at: { gte: todayStart } },
      include: { patient: { select: { full_name: true } } },
    }),
  ]);

  const alerts: Alert[] = [];

  for (const medicine of medicines) {
    if (!isLowStock(medicine)) continue;
    const totalQty = medicine.batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
    alerts.push({
      type: 'low-stock',
      severity: totalQty === 0 ? 'red' : 'amber',
      message: `${medicine.name} is low on stock (${totalQty} on hand, reorder level ${medicine.reorder_level})`,
      refId: medicine.medicine_id,
    });
  }

  const now = new Date();
  for (const batch of expiringBatches) {
    const isExpired = batch.expiry_date < now;
    alerts.push({
      type: isExpired ? 'expired-batch' : 'expiring-batch',
      severity: isExpired ? 'red' : 'amber',
      message: `${batch.medicine.name} batch ${batch.batch_no} ${isExpired ? 'expired' : 'expires'} on ${batch.expiry_date.toISOString().slice(0, 10)}`,
      refId: batch.batch_id,
    });
  }

  for (const appointment of skippedAppointments) {
    alerts.push({
      type: 'skipped-appointment',
      severity: 'amber',
      message: `${appointment.patient.full_name} was skipped and needs to be recalled`,
      refId: appointment.appointment_id,
    });
  }

  return alerts;
};

// ---- Revenue Overview (daily series, month-to-date total, vs. prior period) ----

// "Today" elsewhere in this file is the server's local calendar day (startOfDay/endOfDay use
// local time), so bucket keys must use the same local date — not toISOString(), which is UTC
// and would silently mis-bucket (or overflow the series with an extra day) at any non-UTC offset.
const localDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getRevenueTrend = async (days = 30) => {
  const end = endOfDay();
  const start = startOfDay(addDays(end, -(days - 1)));

  const payments = await prisma.payment.findMany({
    where: { received_at: { gte: start, lte: end } },
    select: { received_at: true, amount: true },
  });

  const buckets = new Map<string, number>();
  for (let i = 0; i < days; i++) {
    buckets.set(localDateKey(addDays(start, i)), 0);
  }
  for (const payment of payments) {
    const key = localDateKey(payment.received_at);
    buckets.set(key, (buckets.get(key) ?? 0) + payment.amount);
  }

  const series = Array.from(buckets.entries()).map(([date, total]) => ({ date, total }));
  const total = series.reduce((sum, day) => sum + day.total, 0);

  const priorEnd = endOfDay(addDays(start, -1));
  const priorStart = startOfDay(addDays(priorEnd, -(days - 1)));
  const priorAgg = await prisma.payment.aggregate({
    _sum: { amount: true },
    where: { received_at: { gte: priorStart, lte: priorEnd } },
  });

  return { series, total, changePct: changePct(total, priorAgg._sum.amount ?? 0) };
};

// ---- Recent Prescriptions -------------------------------------------------

export const getRecentPrescriptions = async (limit = 5) => {
  const prescriptions = await prisma.prescription.findMany({
    orderBy: { issued_at: 'desc' },
    take: limit,
    include: {
      consultation: { include: { appointment: { include: { patient: { select: { patient_id: true, full_name: true } } } } } },
    },
  });

  return prescriptions.map((rx) => ({
    prescriptionId: rx.prescription_id,
    code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
    status: rx.status,
    issuedAt: rx.issued_at,
    patientId: rx.consultation.appointment.patient.patient_id,
    patientName: rx.consultation.appointment.patient.full_name,
  }));
};

// ---- Doctor Dashboard (own appointments/consultations/prescriptions only) -----------------

export const getDoctorDashboard = async (doctorId: number) => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const yesterdayStart = addDays(todayStart, -1);
  const yesterdayEnd = addDays(todayEnd, -1);

  // Current week, Monday-Sunday, for the consultations trend chart.
  const dayOfWeek = todayStart.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = startOfDay(addDays(todayStart, mondayOffset));
  const weekEnd = endOfDay(addDays(weekStart, 6));

  // "Due this week" = overdue-or-due within the next 7 days, same overdue-inclusive philosophy
  // as getFollowUpsDue, just with an upper bound so the KPI card has a bounded "this week" count.
  const followUpsWindowEnd = endOfDay(addDays(todayStart, 6));

  const [
    appointmentsToday,
    appointmentsYesterday,
    completedToday,
    completedYesterday,
    pendingInQueue,
    followUpsDueCount,
    prescriptionsToday,
    prescriptionsYesterday,
    todaysAppointments,
    weekConsultations,
    recentPrescriptions,
    pendingLabReports,
  ] = await Promise.all([
    prisma.appointment.count({ where: { doctor_id: doctorId, scheduled_at: { gte: todayStart, lte: todayEnd } } }),
    prisma.appointment.count({ where: { doctor_id: doctorId, scheduled_at: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    prisma.consultation.count({ where: { status: 'Finalized', finalized_at: { gte: todayStart, lte: todayEnd }, appointment: { doctor_id: doctorId } } }),
    prisma.consultation.count({ where: { status: 'Finalized', finalized_at: { gte: yesterdayStart, lte: yesterdayEnd }, appointment: { doctor_id: doctorId } } }),
    prisma.appointment.count({
      where: { doctor_id: doctorId, scheduled_at: { gte: todayStart, lte: todayEnd }, status: { in: ACTIVE_QUEUE_STATUSES } },
    }),
    prisma.consultation.count({
      where: { status: 'Finalized', follow_up_date: { lte: followUpsWindowEnd }, appointment: { doctor_id: doctorId } },
    }),
    prisma.prescription.count({ where: { issued_at: { gte: todayStart, lte: todayEnd }, consultation: { appointment: { doctor_id: doctorId } } } }),
    prisma.prescription.count({ where: { issued_at: { gte: yesterdayStart, lte: yesterdayEnd }, consultation: { appointment: { doctor_id: doctorId } } } }),
    prisma.appointment.findMany({
      where: { doctor_id: doctorId, scheduled_at: { gte: todayStart, lte: todayEnd } },
      include: { patient: { select: { patient_id: true, full_name: true } } },
      orderBy: { scheduled_at: 'asc' },
    }),
    prisma.consultation.findMany({
      where: { status: 'Finalized', finalized_at: { gte: weekStart, lte: weekEnd }, appointment: { doctor_id: doctorId } },
      select: { finalized_at: true },
    }),
    prisma.prescription.findMany({
      where: { consultation: { appointment: { doctor_id: doctorId } } },
      orderBy: { issued_at: 'desc' },
      take: 5,
      include: { consultation: { include: { appointment: { include: { patient: { select: { patient_id: true, full_name: true } } } } } } },
    }),
    // "Report Received" specifically — a report the doctor actually needs to open and enter
    // values for, not just any test still awaiting the lab/patient (that's plain Pending).
    prisma.labTestOrder.count({ where: { doctor_id: doctorId, status: 'Report Received' } }),
  ]);

  const byDay = new Map<string, number>();
  let cursor = new Date(weekStart);
  while (cursor <= weekEnd) {
    byDay.set(localDateKey(cursor), 0);
    cursor = addDays(cursor, 1);
  }
  for (const c of weekConsultations) {
    const key = localDateKey(c.finalized_at as Date);
    byDay.set(key, (byDay.get(key) ?? 0) + 1);
  }

  return {
    kpis: {
      totalAppointmentsToday: appointmentsToday,
      totalAppointmentsTodayChangePct: changePct(appointmentsToday, appointmentsYesterday),
      completedConsultationsToday: completedToday,
      completedConsultationsTodayChangePct: changePct(completedToday, completedYesterday),
      pendingConsultationsInQueue: pendingInQueue,
      followUpsDueThisWeek: followUpsDueCount,
      prescriptionsIssuedToday: prescriptionsToday,
      prescriptionsIssuedTodayChangePct: changePct(prescriptionsToday, prescriptionsYesterday),
      pendingLabReports,
    },
    todaysSchedule: todaysAppointments.map((a) => ({
      appointmentId: a.appointment_id,
      scheduledAt: a.scheduled_at,
      patientId: a.patient.patient_id,
      patientName: a.patient.full_name,
      status: a.status,
    })),
    consultationsOverview: Array.from(byDay.entries()).map(([date, count]) => ({ date, count })),
    recentPrescriptions: recentPrescriptions.map((rx) => ({
      prescriptionId: rx.prescription_id,
      code: `RX${String(rx.prescription_id).padStart(6, '0')}`,
      status: rx.status,
      issuedAt: rx.issued_at,
      patientId: rx.consultation.appointment.patient.patient_id,
      patientName: rx.consultation.appointment.patient.full_name,
    })),
  };
};

// ---- Receptionist Dashboard (front-desk KPIs, today's queue, schedule, weekly trend) ------

const PHARMACY_PENDING_STATUSES = ['Pending', 'Preparing'];

type TodaysAppointmentRow = {
  appointment_id: number;
  doctor_id: number;
  patient_id: string;
  scheduled_at: Date;
  status: string;
  is_walk_in: boolean;
  patient: { patient_id: string; full_name: string; photo_url: string | null };
  doctor: { user_id: number; username: string };
  consultation: { prescriptions: { status: string }[] } | null;
};

// Waiting/Called/Consulting map onto Waiting/"With Doctor"; a Completed appointment still shows
// "With Pharmacy" while any of its prescriptions haven't finished dispensing — this is the one
// place in the app that stitches the doctor and pharmacy halves of a visit into a single status
// for the receptionist, who's the one who needs to know when billing can actually start (FR-031).
// Skipped/Cancelled/No Show aren't part of this front-desk queue view at all.
const deriveQueueStatus = (a: Pick<TodaysAppointmentRow, 'status' | 'consultation'>): 'Waiting' | 'With Doctor' | 'With Pharmacy' | 'Completed' | null => {
  if (a.status === 'Waiting') return 'Waiting';
  if (a.status === 'Called' || a.status === 'Consulting') return 'With Doctor';
  if (a.status === 'Completed') {
    const hasPendingRx = (a.consultation?.prescriptions ?? []).some((rx) => PHARMACY_PENDING_STATUSES.includes(rx.status));
    return hasPendingRx ? 'With Pharmacy' : 'Completed';
  }
  return null;
};

const formatHourLabel = (hour: number) => {
  const period = hour >= 12 ? 'PM' : 'AM';
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${String(h12).padStart(2, '0')}:00 ${period}`;
};

export const getReceptionistOverview = async () => {
  const now = new Date();
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const yesterdayStart = addDays(todayStart, -1);
  const yesterdayEnd = addDays(todayEnd, -1);
  const weekStart = startOfDay(addDays(todayStart, -6));

  const [
    appointmentsToday,
    appointmentsYesterday,
    walkInsToday,
    walkInsYesterday,
    patientsSeenRows,
    patientsSeenYesterdayRows,
    invoicesToday,
    invoicesYesterday,
    collectionsAgg,
    collectionsYesterdayAgg,
    todaysAppointments,
    weekAppointments,
    recentActivityLogs,
  ] = await Promise.all([
    prisma.appointment.count({ where: { scheduled_at: { gte: todayStart, lte: todayEnd }, is_walk_in: false } }),
    prisma.appointment.count({ where: { scheduled_at: { gte: yesterdayStart, lte: yesterdayEnd }, is_walk_in: false } }),
    prisma.appointment.count({ where: { scheduled_at: { gte: todayStart, lte: todayEnd }, is_walk_in: true } }),
    prisma.appointment.count({ where: { scheduled_at: { gte: yesterdayStart, lte: yesterdayEnd }, is_walk_in: true } }),
    prisma.appointment.findMany({
      where: { status: 'Completed', scheduled_at: { gte: todayStart, lte: todayEnd } },
      select: { patient_id: true },
      distinct: ['patient_id'],
    }),
    prisma.appointment.findMany({
      where: { status: 'Completed', scheduled_at: { gte: yesterdayStart, lte: yesterdayEnd } },
      select: { patient_id: true },
      distinct: ['patient_id'],
    }),
    prisma.invoice.count({ where: { created_at: { gte: todayStart, lte: todayEnd } } }),
    prisma.invoice.count({ where: { created_at: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { received_at: { gte: todayStart, lte: todayEnd } } }),
    prisma.payment.aggregate({ _sum: { amount: true }, where: { received_at: { gte: yesterdayStart, lte: yesterdayEnd } } }),
    prisma.appointment.findMany({
      where: { scheduled_at: { gte: todayStart, lte: todayEnd } },
      include: {
        patient: { select: { patient_id: true, full_name: true, photo_url: true } },
        doctor: { select: { user_id: true, username: true } },
        consultation: { select: { prescriptions: { select: { status: true } } } },
      },
      orderBy: { scheduled_at: 'asc' },
    }) as Promise<TodaysAppointmentRow[]>,
    prisma.appointment.findMany({
      where: { scheduled_at: { gte: weekStart, lte: todayEnd } },
      select: { scheduled_at: true, is_walk_in: true, status: true, patient_id: true },
    }),
    prisma.auditLog.findMany({ take: 8, orderBy: { timestamp: 'desc' }, include: { user: { select: { username: true, role: true } } } }),
  ]);

  // Token numbers are a receptionist-facing display convenience, not stored data — a letter per
  // doctor (assigned in order of first appearance in today's schedule) plus a per-doctor running
  // sequence, matching the "derive a display code from real ordering" convention used elsewhere
  // in this app (e.g. the doctor portal's `T-${id}` token).
  const doctorLetters = new Map<number, string>();
  let nextLetterCode = 65; // 'A'
  const doctorTokenCounters = new Map<number, number>();

  const queueList = todaysAppointments
    .filter((a) => deriveQueueStatus(a) !== null)
    .map((a) => {
      if (!doctorLetters.has(a.doctor_id)) {
        doctorLetters.set(a.doctor_id, String.fromCharCode(nextLetterCode));
        nextLetterCode += 1;
      }
      const letter = doctorLetters.get(a.doctor_id)!;
      const seq = (doctorTokenCounters.get(a.doctor_id) ?? 0) + 1;
      doctorTokenCounters.set(a.doctor_id, seq);
      const status = deriveQueueStatus(a)!;

      return {
        appointmentId: a.appointment_id,
        patientId: a.patient.patient_id,
        patientName: a.patient.full_name,
        photoUrl: a.patient.photo_url,
        type: a.is_walk_in ? 'Walk-in' : 'Appointment',
        doctorId: a.doctor.user_id,
        doctorName: a.doctor.username,
        token: `${letter}-${String(seq).padStart(3, '0')}`,
        status,
        waitTimeMinutes: status === 'Waiting' ? Math.round(Math.max(0, (now.getTime() - a.scheduled_at.getTime()) / 60000)) : null,
        scheduledAt: a.scheduled_at,
      };
    });

  const queueCounts = {
    all: queueList.length,
    waiting: queueList.filter((q) => q.status === 'Waiting').length,
    withDoctor: queueList.filter((q) => q.status === 'With Doctor').length,
    withPharmacy: queueList.filter((q) => q.status === 'With Pharmacy').length,
    completed: queueList.filter((q) => q.status === 'Completed').length,
  };

  const waitingMinutes = queueList.filter((q) => q.status === 'Waiting').map((q) => q.waitTimeMinutes as number);
  const avgWaitingTimeMinutes = waitingMinutes.length ? Math.round(waitingMinutes.reduce((s, m) => s + m, 0) / waitingMinutes.length) : 0;

  // Today's Schedule groups by doctor+hour rather than the fixed 4-block OPD split the Doctor
  // dashboard uses elsewhere — the receptionist mockup shows a per-doctor time roster, not blocks.
  // Cancelled/No Show slots are dropped from the roster (they're no longer real work for the day);
  // Skipped stays in, since the patient is still expected back.
  const scheduleGroups = new Map<string, { hour: number; doctorId: number; doctorName: string; count: number }>();
  for (const a of todaysAppointments) {
    if (a.status === 'Cancelled' || a.status === 'No Show') continue;
    const hour = a.scheduled_at.getHours();
    const key = `${hour}-${a.doctor_id}`;
    const existing = scheduleGroups.get(key);
    if (existing) existing.count += 1;
    else scheduleGroups.set(key, { hour, doctorId: a.doctor_id, doctorName: a.doctor.username, count: 1 });
  }
  const todaysSchedule = Array.from(scheduleGroups.values())
    .sort((x, y) => x.hour - y.hour)
    .map((g) => ({
      time: formatHourLabel(g.hour),
      doctorId: g.doctorId,
      doctorName: g.doctorName,
      appointmentCount: g.count,
      status: now.getHours() >= g.hour ? 'In Progress' : 'Upcoming',
    }));

  const dayBuckets = new Map<string, { appointments: number; walkIns: number; patientsSeen: Set<string> }>();
  for (let i = 0; i < 7; i++) {
    dayBuckets.set(localDateKey(addDays(weekStart, i)), { appointments: 0, walkIns: 0, patientsSeen: new Set() });
  }
  for (const a of weekAppointments) {
    const bucket = dayBuckets.get(localDateKey(a.scheduled_at));
    if (!bucket) continue;
    if (a.is_walk_in) bucket.walkIns += 1;
    else bucket.appointments += 1;
    if (a.status === 'Completed') bucket.patientsSeen.add(a.patient_id);
  }
  const weeklyOverview = Array.from(dayBuckets.entries()).map(([date, b]) => ({
    date,
    appointments: b.appointments,
    walkIns: b.walkIns,
    patientsSeen: b.patientsSeen.size,
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
    kpis: {
      todaysAppointmentsTotal: appointmentsToday,
      todaysAppointmentsChangePct: changePct(appointmentsToday, appointmentsYesterday),
      walkInPatientsToday: walkInsToday,
      walkInPatientsChangePct: changePct(walkInsToday, walkInsYesterday),
      patientsSeenToday: patientsSeenRows.length,
      patientsSeenChangePct: changePct(patientsSeenRows.length, patientsSeenYesterdayRows.length),
      invoicesGeneratedToday: invoicesToday,
      invoicesGeneratedChangePct: changePct(invoicesToday, invoicesYesterday),
      totalCollectionsToday: collectionsAgg._sum.amount ?? 0,
      totalCollectionsChangePct: changePct(collectionsAgg._sum.amount ?? 0, collectionsYesterdayAgg._sum.amount ?? 0),
      avgWaitingTimeMinutes,
    },
    queueCounts,
    todaysQueue: queueList,
    todaysSchedule,
    weeklyOverview,
    recentActivity,
  };
};

// ---- Pharmacist Dashboard ----------------------------------------------------
// "Prescriptions in Queue" (Pending+Preparing) is deliberately NOT date-scoped — a Pending
// prescription from 3 days ago is still real outstanding work, and hiding it behind a
// today-only filter would misrepresent the actual backlog. "Dispensed Today"/"Collected Today"
// use PrescriptionItem.dispensed_at (the only real dispensing timestamp in the schema — there
// is no separate collected_at anywhere) as the activity signal; "Collected Today" is therefore
// an honest proxy — a Collected prescription whose items were dispensed today — since this is a
// same-day walk-in clinic where collection follows dispensing within the same visit, same
// category of imperfect-but-real proxy as this project's existing "Avg Consultation Time"
// (finalized_at - created_at) elsewhere.

const EXPIRY_ALERT_TIERS = { highDays: 14, mediumDays: 45 } as const;

export const getPharmacistOverview = async () => {
  const now = new Date();
  const todayStart = startOfDay();
  const todayEnd = endOfDay();
  const yesterdayStart = addDays(todayStart, -1);
  const yesterdayEnd = addDays(todayEnd, -1);
  const weekStart = startOfDay(addDays(todayStart, -6));
  const expiryHorizon = addDays(todayStart, 90);
  const expiry30 = addDays(todayStart, 30);

  const [
    pendingCount,
    preparingCount,
    dispensedTodayItems,
    dispensedTodayDistinctItems,
    collectedTodayDistinctItems,
    activeMedicines,
    expiringBatchesRaw,
    salesTodayAgg,
    salesYesterdayAgg,
    weekDispensedItems,
    topDispensedRows,
  ] = await Promise.all([
    prisma.prescription.count({ where: { status: 'Pending' } }),
    prisma.prescription.count({ where: { status: 'Preparing' } }),
    prisma.prescriptionItem.count({ where: { dispensed_at: { gte: todayStart, lte: todayEnd } } }),
    prisma.prescriptionItem.findMany({
      where: { dispensed_at: { gte: todayStart, lte: todayEnd }, prescription: { status: 'Dispensed' } },
      select: { prescription_id: true },
      distinct: ['prescription_id'],
    }),
    prisma.prescriptionItem.findMany({
      where: { dispensed_at: { gte: todayStart, lte: todayEnd }, prescription: { status: 'Collected' } },
      select: { prescription_id: true },
      distinct: ['prescription_id'],
    }),
    prisma.medicine.findMany({ where: { is_active: true }, select: { medicine_id: true, name: true, reorder_level: true, batches: { select: { qty_on_hand: true } } } }),
    prisma.batch.findMany({
      where: { qty_on_hand: { gt: 0 }, expiry_date: { gte: now, lte: expiryHorizon } },
      include: { medicine: { select: { name: true } } },
      orderBy: { expiry_date: 'asc' },
    }),
    prisma.invoiceItem.aggregate({ _sum: { line_total: true }, where: { item_type: 'Medicine', invoice: { created_at: { gte: todayStart, lte: todayEnd } } } }),
    prisma.invoiceItem.aggregate({ _sum: { line_total: true }, where: { item_type: 'Medicine', invoice: { created_at: { gte: yesterdayStart, lte: yesterdayEnd } } } }),
    prisma.prescriptionItem.findMany({
      where: { dispensed_at: { gte: weekStart, lte: todayEnd } },
      select: { dispensed_at: true, qty: true },
    }),
    prisma.prescriptionItem.findMany({
      where: { dispensed_at: { gte: todayStart, lte: todayEnd } },
      select: { qty: true, medicine_id: true, substituted_medicine_id: true, medicine: { select: { name: true } }, substituted_medicine: { select: { name: true } } },
    }),
  ]);

  // Distinct-prescription counts (not just item counts) for the "X Prescriptions / Y Items"
  // KPI card — a multi-item prescription dispensed in one action shouldn't inflate the
  // prescription count.
  const dispensedTodayAllDistinct = await prisma.prescriptionItem.findMany({
    where: { dispensed_at: { gte: todayStart, lte: todayEnd } },
    select: { prescription_id: true },
    distinct: ['prescription_id'],
  });

  let veryLowStockCount = 0;
  let lowStockCount = 0;
  for (const medicine of activeMedicines) {
    const totalQty = medicine.batches.reduce((sum, b) => sum + b.qty_on_hand, 0);
    if (totalQty === 0) veryLowStockCount += 1;
    else if (totalQty < medicine.reorder_level) lowStockCount += 1;
  }

  let expiringWithin30Count = 0;
  let expiringWithin31To90Count = 0;
  const expiringBatches = expiringBatchesRaw.map((b) => {
    const daysLeft = Math.max(0, Math.ceil((b.expiry_date.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    if (b.expiry_date <= expiry30) expiringWithin30Count += 1;
    else expiringWithin31To90Count += 1;
    const alertLevel: 'High' | 'Medium' | 'Low' = daysLeft <= EXPIRY_ALERT_TIERS.highDays ? 'High' : daysLeft <= EXPIRY_ALERT_TIERS.mediumDays ? 'Medium' : 'Low';
    return { batchId: b.batch_id, medicineName: b.medicine.name, batchNo: b.batch_no, expiryDate: b.expiry_date, daysLeft, qtyOnHand: b.qty_on_hand, alertLevel };
  });

  const trendBuckets = new Map<string, number>();
  for (let i = 0; i < 7; i++) trendBuckets.set(localDateKey(addDays(weekStart, i)), 0);
  for (const item of weekDispensedItems) {
    const key = localDateKey(item.dispensed_at as Date);
    if (trendBuckets.has(key)) trendBuckets.set(key, (trendBuckets.get(key) ?? 0) + item.qty);
  }
  const dispensingTrend = Array.from(trendBuckets.entries()).map(([date, itemsDispensed]) => ({
    date,
    label: new Date(date).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }),
    itemsDispensed,
  }));

  const topDispensedMap = new Map<number, { medicineId: number; medicineName: string; qtyDispensed: number }>();
  for (const item of topDispensedRows) {
    const medicineId = item.substituted_medicine_id ?? item.medicine_id;
    const medicineName = item.substituted_medicine?.name ?? item.medicine.name;
    const existing = topDispensedMap.get(medicineId);
    if (existing) existing.qtyDispensed += item.qty;
    else topDispensedMap.set(medicineId, { medicineId, medicineName, qtyDispensed: item.qty });
  }
  const topDispensedToday = Array.from(topDispensedMap.values())
    .sort((a, b) => b.qtyDispensed - a.qtyDispensed)
    .slice(0, 5);

  const salesToday = salesTodayAgg._sum.line_total ?? 0;
  const salesYesterday = salesYesterdayAgg._sum.line_total ?? 0;

  return {
    kpis: {
      prescriptionsInQueue: pendingCount + preparingCount,
      pendingCount,
      preparingCount,
      dispensedTodayPrescriptions: dispensedTodayAllDistinct.length,
      dispensedTodayItems,
      lowStockItemsCount: veryLowStockCount + lowStockCount,
      expiringBatchesCount: expiringWithin30Count + expiringWithin31To90Count,
      todaysSalesPharmacy: salesToday,
      todaysSalesChangePct: changePct(salesToday, salesYesterday),
    },
    queueOverview: {
      pending: pendingCount,
      preparing: preparingCount,
      dispensedToday: dispensedTodayDistinctItems.length,
      collectedToday: collectedTodayDistinctItems.length,
      total: pendingCount + preparingCount + dispensedTodayDistinctItems.length + collectedTodayDistinctItems.length,
    },
    dispensingTrend,
    alertSummary: { veryLowStockCount, lowStockCount, expiringWithin30Count, expiringWithin31To90Count },
    expiringBatches,
    topDispensedToday,
  };
};

// ---- Top Selling Medicines --------------------------------------------------

export const getTopMedicines = async (limit = 5, sinceDays = 30) => {
  const since = startOfDay(addDays(new Date(), -sinceDays));

  const grouped = await prisma.prescriptionItem.groupBy({
    by: ['medicine_id'],
    _sum: { qty: true },
    where: { prescription: { issued_at: { gte: since } } },
    orderBy: { _sum: { qty: 'desc' } },
    take: limit,
  });

  const medicines = await prisma.medicine.findMany({ where: { medicine_id: { in: grouped.map((g) => g.medicine_id) } } });
  const nameById = new Map(medicines.map((m) => [m.medicine_id, m.name]));

  return grouped.map((g) => ({
    medicineId: g.medicine_id,
    name: nameById.get(g.medicine_id) ?? 'Unknown',
    unitsSold: g._sum.qty ?? 0,
  }));
};
