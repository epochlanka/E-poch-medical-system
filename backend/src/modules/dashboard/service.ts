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

export const getOverview = async (expiryThresholdDays = DEFAULT_EXPIRY_THRESHOLD_DAYS) => {
  const todayStart = startOfDay();
  const todayEnd = endOfDay();

  const [todaysPatients, revenueAgg, medicines, expiringBatchesCount] = await Promise.all([
    prisma.appointment.findMany({
      where: { scheduled_at: { gte: todayStart, lte: todayEnd } },
      select: { patient_id: true },
      distinct: ['patient_id'],
    }),
    prisma.invoice.aggregate({
      _sum: { total_amount: true },
      where: { payment_status: 'Paid', created_at: { gte: todayStart, lte: todayEnd } },
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
  ]);

  return {
    todaysPatients: todaysPatients.length,
    revenueToday: revenueAgg._sum.total_amount ?? 0,
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

  return {
    counts,
    queueLength: activeQueue.length,
    queue: activeQueue.map((a) => ({
      appointmentId: a.appointment_id,
      patientId: a.patient.patient_id,
      patientName: a.patient.full_name,
      doctorId: a.doctor.user_id,
      doctorName: a.doctor.username,
      status: a.status,
      scheduledAt: a.scheduled_at,
    })),
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
