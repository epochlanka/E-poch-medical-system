import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ForbiddenError } from './errors';

const prisma = new PrismaClient();

interface Actor {
  user_id: number;
  role: string;
}

// A Doctor may only act on their own appointments (FR-029/BR-05, "own queue only") — every
// other role's access is unchanged from before this check existed, since only Doctor callers
// have an ownership concept here at all.
const assertDoctorOwnsIfDoctor = (actor: Actor, doctorId: number) => {
  if (actor.role === 'Doctor' && actor.user_id !== doctorId) {
    throw new ForbiddenError('You can only manage your own queue');
  }
};

const patientSelect = { full_name: true, gender: true, dob: true, phone: true, patient_id: true } as const;
const doctorSelect = { user_id: true, username: true, registration_number: true } as const;

const startOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};
const endOfDay = (date: Date) => {
  const d = new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};
// Monday-start week, matching how a clinic's OPD roster is planned.
const startOfWeek = (date: Date) => {
  const d = startOfDay(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d;
};
const endOfWeek = (date: Date) => {
  const d = endOfDay(startOfWeek(date));
  d.setDate(d.getDate() + 6);
  return d;
};

const localDateKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const ACTIVE_STATUSES = ['Waiting', 'Called', 'Consulting'];

export class AppointmentsService {
  /**
   * Create a new appointment
   */
  async createAppointment(data: { patient_id: string; doctor_id: number; scheduled_at: Date; reason?: string; created_by: number }) {
    return prisma.appointment.create({
      data: {
        patient_id: data.patient_id,
        doctor_id: data.doctor_id,
        scheduled_at: data.scheduled_at,
        reason: data.reason,
        created_by: data.created_by,
        status: 'Waiting',
      },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
    });
  }

  /**
   * Fetch the live queue for today — optionally scoped to one doctor (a Doctor caller is
   * always scoped to themselves; other roles may pass doctorId to filter or omit it for all).
   * Scoped to today's scheduled_at — without this, a stray appointment from days ago that was
   * never moved out of Waiting/Called/Consulting (e.g. abandoned test data) would linger in
   * "today's" queue forever, which is exactly the kind of thing a live queue must not show.
   */
  async getLiveQueue(doctorId?: number) {
    const now = new Date();
    return prisma.appointment.findMany({
      where: {
        status: { in: ACTIVE_STATUSES },
        scheduled_at: { gte: startOfDay(now), lte: endOfDay(now) },
        ...(doctorId ? { doctor_id: doctorId } : {}),
      },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect }, consultation: { select: { created_at: true } } },
      orderBy: { scheduled_at: 'asc' },
    });
  }

  /**
   * KPI row for the queue board: in-queue/waiting/consulting counts, today's completions, and
   * waiting-time stats computed live from scheduled_at (there's no separate "arrived_at" — the
   * whole app already treats scheduled_at as the arrival reference elsewhere, e.g. the doctor
   * dashboard's "Today's Schedule").
   */
  async getQueueStats(doctorId?: number) {
    const now = new Date();
    const doctorFilter = doctorId ? { doctor_id: doctorId } : {};

    const [active, completedToday] = await Promise.all([
      prisma.appointment.findMany({
        where: { status: { in: ACTIVE_STATUSES }, scheduled_at: { gte: startOfDay(now), lte: endOfDay(now) }, ...doctorFilter },
        select: { status: true, scheduled_at: true },
      }),
      prisma.appointment.count({
        where: { status: 'Completed', scheduled_at: { gte: startOfDay(now), lte: endOfDay(now) }, ...doctorFilter },
      }),
    ]);

    const waitingMinutes = active
      .filter((a) => a.status === 'Waiting' || a.status === 'Called')
      .map((a) => Math.max(0, (now.getTime() - a.scheduled_at.getTime()) / 60000));

    return {
      totalInQueue: waitingMinutes.length,
      waitingOver30: waitingMinutes.filter((m) => m > 30).length,
      inConsultation: active.filter((a) => a.status === 'Consulting').length,
      completedToday,
      avgWaitingTimeMinutes: waitingMinutes.length ? Math.round(waitingMinutes.reduce((s, m) => s + m, 0) / waitingMinutes.length) : 0,
      longestWaitingTimeMinutes: waitingMinutes.length ? Math.round(Math.max(...waitingMinutes)) : 0,
    };
  }

  /**
   * Fetch all active doctors (for dropdown autocomplete)
   */
  async getDoctors(search?: string) {
    const where: any = { role: 'Doctor', is_active: true };
    if (search) where.username = { contains: search };

    return prisma.user.findMany({
      where,
      select: doctorSelect,
      orderBy: { username: 'asc' },
      take: 20,
    });
  }

  /**
   * Paginated, filterable appointment list — the "Appointments" management page's main table.
   */
  async listAppointments(filters: {
    search?: string;
    doctorId?: number;
    status?: string;
    date?: Date;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.AppointmentWhereInput = {};
    if (filters.doctorId) where.doctor_id = filters.doctorId;
    // 'Upcoming' isn't a real persisted status — it's a virtual filter meaning "still active",
    // i.e. any of the statuses the live queue itself treats as not-yet-resolved.
    if (filters.status === 'Upcoming') where.status = { in: ACTIVE_STATUSES };
    else if (filters.status) where.status = filters.status;
    if (filters.date) where.scheduled_at = { gte: startOfDay(filters.date), lte: endOfDay(filters.date) };

    if (filters.search) {
      const term = filters.search.trim();
      const asId = Number(term.replace(/^APT-?/i, ''));
      where.OR = [
        { patient: { full_name: { contains: term } } },
        { patient: { phone: { contains: term } } },
        { patient_id: { contains: term } },
        ...(Number.isFinite(asId) && asId > 0 ? [{ appointment_id: asId }] : []),
      ];
    }

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 8;

    const [total, data] = await Promise.all([
      prisma.appointment.count({ where }),
      prisma.appointment.findMany({
        where,
        include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
        orderBy: { scheduled_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /** @deprecated kept for any existing callers; prefer listAppointments for the paginated view */
  async getAllAppointments(filters?: { date?: Date; doctor_id?: number; status?: string }) {
    const where: Prisma.AppointmentWhereInput = {};
    if (filters?.doctor_id) where.doctor_id = filters.doctor_id;
    if (filters?.status) where.status = filters.status;
    if (filters?.date) where.scheduled_at = { gte: startOfDay(filters.date), lte: endOfDay(filters.date) };

    return prisma.appointment.findMany({
      where,
      include: { patient: { select: { full_name: true, gender: true } }, doctor: { select: { username: true } } },
      orderBy: { scheduled_at: 'desc' },
    });
  }

  /**
   * Stat cards for the Appointments dashboard: today's count plus this-week outcome counts.
   */
  async getStats() {
    const now = new Date();
    const weekStart = startOfWeek(now);
    const weekEnd = endOfWeek(now);

    const [todaysAppointments, weekAppointments] = await Promise.all([
      prisma.appointment.count({ where: { scheduled_at: { gte: startOfDay(now), lte: endOfDay(now) } } }),
      prisma.appointment.findMany({
        where: { scheduled_at: { gte: weekStart, lte: weekEnd } },
        select: { status: true },
      }),
    ]);

    let upcoming = 0;
    let completed = 0;
    let cancelled = 0;
    let noShow = 0;
    for (const a of weekAppointments) {
      if (ACTIVE_STATUSES.includes(a.status)) upcoming += 1;
      else if (a.status === 'Completed') completed += 1;
      else if (a.status === 'Cancelled') cancelled += 1;
      else if (a.status === 'No Show') noShow += 1;
    }

    return { todaysAppointments, upcomingThisWeek: upcoming, completedThisWeek: completed, cancelledThisWeek: cancelled, noShowThisWeek: noShow };
  }

  /**
   * Today's appointments bucketed into fixed OPD time blocks, for the "Today's Schedule" panel.
   */
  async getTodaysSchedule() {
    const now = new Date();
    const todays = await prisma.appointment.findMany({
      where: { scheduled_at: { gte: startOfDay(now), lte: endOfDay(now) } },
      select: { scheduled_at: true },
    });

    const blocks = [
      { label: '09:00 AM - 11:00 AM', startHour: 9, endHour: 11 },
      { label: '11:00 AM - 01:00 PM', startHour: 11, endHour: 13 },
      { label: '02:00 PM - 04:00 PM', startHour: 14, endHour: 16 },
      { label: '04:00 PM - 06:00 PM', startHour: 16, endHour: 18 },
    ];

    return blocks.map((b) => ({
      label: b.label,
      count: todays.filter((a) => {
        const h = a.scheduled_at.getHours();
        return h >= b.startHour && h < b.endHour;
      }).length,
    }));
  }

  /**
   * One boolean-ish summary per day in the given month, for the calendar widget's dot indicators.
   */
  async getCalendarSummary(year: number, month: number) {
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = endOfDay(new Date(year, month, 0));

    const appointments = await prisma.appointment.findMany({
      where: { scheduled_at: { gte: monthStart, lte: monthEnd } },
      select: { scheduled_at: true, status: true },
    });

    const byDay = new Map<string, { total: number; cancelled: number; noShow: number }>();
    for (const a of appointments) {
      // Local day, not toISOString()'s UTC day — this server's other date logic (startOfDay/
      // endOfDay/getStats/getTodaysSchedule) all group by local calendar day, so this must too
      // or a day's dot on the calendar and its actual appointment count would disagree.
      const key = localDateKey(a.scheduled_at);
      const entry = byDay.get(key) ?? { total: 0, cancelled: 0, noShow: 0 };
      entry.total += 1;
      if (a.status === 'Cancelled') entry.cancelled += 1;
      if (a.status === 'No Show') entry.noShow += 1;
      byDay.set(key, entry);
    }

    return Array.from(byDay.entries()).map(([date, counts]) => ({ date, ...counts }));
  }

  /**
   * Update appointment status. A recall (back to Waiting from Skipped) clears any prior
   * skip_reason — it's a fresh re-entry into the queue, not a continuation of the old skip.
   */
  async updateStatus(appointment_id: number, status: string, actor: Actor) {
    const appointment = await prisma.appointment.findUnique({ where: { appointment_id } });
    if (!appointment) throw new NotFoundError('Appointment not found');
    assertDoctorOwnsIfDoctor(actor, appointment.doctor_id);

    return prisma.appointment.update({
      where: { appointment_id },
      data: { status, ...(status === 'Waiting' && appointment.status === 'Skipped' ? { skip_reason: null } : {}) },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
    });
  }

  /**
   * Skip a called-but-unresponsive patient with a required reason (FR-029) — the patient
   * re-enters the queue later via updateStatus(..., 'Waiting'), not dropped from it.
   */
  async skipAppointment(appointment_id: number, reason: string, actor: Actor) {
    const appointment = await prisma.appointment.findUnique({ where: { appointment_id } });
    if (!appointment) throw new NotFoundError('Appointment not found');
    assertDoctorOwnsIfDoctor(actor, appointment.doctor_id);

    return prisma.appointment.update({
      where: { appointment_id },
      data: { status: 'Skipped', skip_reason: reason },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
    });
  }

  /**
   * Update appointment time
   */
  async updateTime(appointment_id: number, scheduled_at: Date) {
    return prisma.appointment.update({
      where: { appointment_id },
      data: { scheduled_at },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
    });
  }
}

export const appointmentsService = new AppointmentsService();
