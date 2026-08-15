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
