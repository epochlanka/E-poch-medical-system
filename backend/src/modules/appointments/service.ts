import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ForbiddenError, ValidationError } from './errors';

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
   * Create a new appointment. Rejects a doctor double-booking (FR-025) — the same doctor
   * can't hold two active appointments at the exact same scheduled_at. Walk-ins are exempt
   * (their scheduled_at is "now", and the whole point of a walk-in is joining the queue
   * alongside whoever's already booked, not claiming an exclusive slot).
   */
  async createAppointment(data: {
    patient_id: string;
    doctor_id: number;
    scheduled_at: Date;
    reason?: string;
    is_walk_in?: boolean;
    consultation_type?: string;
    visit_type?: string;
    priority?: string;
    notes?: string;
    created_by: number;
  }) {
    if (!data.is_walk_in) {
      const conflict = await prisma.appointment.findFirst({
        where: { doctor_id: data.doctor_id, scheduled_at: data.scheduled_at, status: { in: ACTIVE_STATUSES } },
      });
      if (conflict) throw new ValidationError('This doctor already has an appointment booked at that time');
    }

    return prisma.appointment.create({
      data: {
        patient_id: data.patient_id,
        doctor_id: data.doctor_id,
        scheduled_at: data.scheduled_at,
        reason: data.reason,
        is_walk_in: data.is_walk_in ?? false,
        consultation_type: data.consultation_type,
        visit_type: data.visit_type ?? 'Appointment',
        priority: data.priority ?? 'Normal',
        notes: data.notes,
        created_by: data.created_by,
        status: 'Waiting',
      },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
    });
  }

  /**
   * Real-time slot availability for the Book Appointment picker — a fixed daily OPD template
   * (09:00-13:00, 14:00-17:00, 30-min slots, matching the clinic-hours convention already used
   * elsewhere in this app, e.g. the receptionist dashboard's "Today's Schedule" blocks) checked
   * against this doctor's actual active appointments for that local calendar day. This is the
   * same check createAppointment enforces server-side — shown here so the picker doesn't let a
   * receptionist click a slot only to have it rejected on submit.
   */
  async getAvailability(doctorId: number, date: Date) {
    const dayStart = startOfDay(date);
    const dayEnd = endOfDay(date);
    const now = new Date();

    const booked = await prisma.appointment.findMany({
      where: { doctor_id: doctorId, scheduled_at: { gte: dayStart, lte: dayEnd }, status: { in: ACTIVE_STATUSES }, is_walk_in: false },
      select: { scheduled_at: true },
    });
    const bookedTimes = new Set(booked.map((b) => b.scheduled_at.getTime()));

    const blocks = [
      { startHour: 9, endHour: 13 },
      { startHour: 14, endHour: 17 },
    ];

    const slots: { scheduledAt: string; label: string; available: boolean }[] = [];
    for (const block of blocks) {
      for (let hour = block.startHour; hour < block.endHour; hour++) {
        for (const minute of [0, 30]) {
          const slotDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
          const label = slotDate.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
          slots.push({
            scheduledAt: slotDate.toISOString(),
            label,
            available: !bookedTimes.has(slotDate.getTime()) && slotDate.getTime() > now.getTime(),
          });
        }
      }
    }

    return { date: localDateKey(date), slots };
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
      // Additive, finer-grained breakdown (kept alongside the fields above rather than redefining
      // them) for pages that need Waiting/Called/Consulting shown as three distinct buckets, e.g.
      // the receptionist Walk-in page's "Current Queue Summary" panel.
      waitingCount: active.filter((a) => a.status === 'Waiting').length,
      calledCount: active.filter((a) => a.status === 'Called').length,
    };
  }

  /**
   * The receptionist Live Queue Board's 4-column view (Waiting / With Doctor / In Pharmacy /
   * Completed Today) plus an "Upcoming (next 3 hours)" list and a Skipped list used to populate
   * the Recall picker. "In Pharmacy" is NOT a real Appointment.status — finalizeConsultation
   * (consultations/service.ts) flips the appointment straight to 'Completed' the moment a doctor
   * finalizes, regardless of whether a prescription has been written or dispensed yet, so the
   * only place that distinction exists is Prescription.status on the linked consultation. A
   * Completed appointment is bucketed into "In Pharmacy" if any of its prescriptions are still
   * Pending/Preparing, otherwise "Completed Today" — same "derive, don't fake a status" pattern
   * already used for e.g. medicines' stock-status and purchase orders' summarizePo().
   */
  async getQueueBoard(filters: { doctorId?: number; consultationType?: string; date?: Date }) {
    const day = filters.date ?? new Date();
    const now = new Date();
    const isToday = localDateKey(day) === localDateKey(now);

    const appointments = await prisma.appointment.findMany({
      where: {
        scheduled_at: { gte: startOfDay(day), lte: endOfDay(day) },
        status: { in: [...ACTIVE_STATUSES, 'Completed', 'Skipped'] },
        ...(filters.doctorId ? { doctor_id: filters.doctorId } : {}),
        ...(filters.consultationType ? { consultation_type: filters.consultationType } : {}),
      },
      include: {
        patient: { select: patientSelect },
        doctor: { select: doctorSelect },
        consultation: { select: { created_at: true, finalized_at: true, prescriptions: { select: { status: true } } } },
      },
      orderBy: { scheduled_at: 'asc' },
    });

    const waiting: unknown[] = [];
    const upcoming: unknown[] = [];
    const withDoctor: unknown[] = [];
    const inPharmacy: unknown[] = [];
    const completedToday: unknown[] = [];
    const skipped: unknown[] = [];

    // A single day-wide token sequence (by real scheduled_at order) spans every bucket below —
    // same "derive a display code from real stable ordering" convention as doctor-frontend's
    // T-0xx tokens — rather than a per-column counter, so a card's number is stable regardless
    // of which column it's currently sitting in.
    appointments.forEach((a, i) => {
      const card = {
        appointment_id: a.appointment_id,
        token: i + 1,
        patient_id: a.patient.patient_id,
        patient_name: a.patient.full_name,
        dob: a.patient.dob,
        gender: a.patient.gender,
        phone: a.patient.phone,
        doctor_id: a.doctor_id,
        doctor_name: a.doctor.username,
        scheduled_at: a.scheduled_at,
        status: a.status,
        is_walk_in: a.is_walk_in,
        visit_type: a.visit_type,
        priority: a.priority,
        since: a.consultation?.created_at ?? null,
        completed_at: a.consultation?.finalized_at ?? null,
      };

      if (a.status === 'Skipped') {
        skipped.push(card);
      } else if (a.status === 'Consulting') {
        withDoctor.push(card);
      } else if (a.status === 'Completed') {
        const prescriptions = a.consultation?.prescriptions ?? [];
        const stillDispensing = prescriptions.some((p) => p.status === 'Pending' || p.status === 'Preparing');
        (stillDispensing ? inPharmacy : completedToday).push(card);
      } else if (isToday && a.scheduled_at.getTime() > now.getTime()) {
        upcoming.push(card);
      } else {
        waiting.push(card);
      }
    });

    return { waiting, upcoming, withDoctor, inPharmacy, completedToday, skipped, isToday };
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
    dateFrom?: Date;
    dateTo?: Date;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.AppointmentWhereInput = {};
    if (filters.doctorId) where.doctor_id = filters.doctorId;
    // 'Upcoming' isn't a real persisted status — it's a virtual filter meaning "still active",
    // i.e. any of the statuses the live queue itself treats as not-yet-resolved.
    if (filters.status === 'Upcoming') where.status = { in: ACTIVE_STATUSES };
    else if (filters.status) where.status = filters.status;
    // `date` (single day) takes precedence when given; otherwise an open-ended dateFrom/dateTo
    // range powers list views like Skip / Recall that filter across multiple days.
    if (filters.date) where.scheduled_at = { gte: startOfDay(filters.date), lte: endOfDay(filters.date) };
    else if (filters.dateFrom || filters.dateTo)
      where.scheduled_at = {
        ...(filters.dateFrom ? { gte: startOfDay(filters.dateFrom) } : {}),
        ...(filters.dateTo ? { lte: endOfDay(filters.dateTo) } : {}),
      };

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
   * skip_reason — it's a fresh re-entry into the queue, not a continuation of the old skip —
   * and writes a 'Recalled' row to AppointmentQueueLog (the recall's own optional reason is
   * independent of whatever skip_reason it's clearing) so the Skip/Recall Log page has a real
   * historical record even though the live skip_reason/skipped_at columns get wiped.
   */
  async updateStatus(appointment_id: number, status: string, actor: Actor, reason?: string) {
    const appointment = await prisma.appointment.findUnique({ where: { appointment_id } });
    if (!appointment) throw new NotFoundError('Appointment not found');
    assertDoctorOwnsIfDoctor(actor, appointment.doctor_id);

    const isRecall = status === 'Waiting' && appointment.status === 'Skipped';

    const updated = await prisma.appointment.update({
      where: { appointment_id },
      data: { status, ...(isRecall ? { skip_reason: null, skipped_at: null } : {}) },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
    });

    if (isRecall) {
      await prisma.appointmentQueueLog.create({ data: { appointment_id, action: 'Recalled', reason: reason || null, actor_id: actor.user_id } });
    }

    return updated;
  }

  /**
   * Skip a called-but-unresponsive patient with a required reason (FR-029) — the patient
   * re-enters the queue later via updateStatus(..., 'Waiting'), not dropped from it. Also
   * writes a 'Skipped' row to AppointmentQueueLog — see updateStatus's recall-side note above.
   */
  async skipAppointment(appointment_id: number, reason: string, actor: Actor) {
    const appointment = await prisma.appointment.findUnique({ where: { appointment_id } });
    if (!appointment) throw new NotFoundError('Appointment not found');
    assertDoctorOwnsIfDoctor(actor, appointment.doctor_id);

    const updated = await prisma.appointment.update({
      where: { appointment_id },
      data: { status: 'Skipped', skip_reason: reason, skipped_at: new Date() },
      include: { patient: { select: patientSelect }, doctor: { select: doctorSelect } },
    });

    await prisma.appointmentQueueLog.create({ data: { appointment_id, action: 'Skipped', reason, actor_id: actor.user_id } });

    return updated;
  }

  /**
   * Paginated Skip/Recall Log (receptionist "Skip / Recall Log" page) — every historical Skip
   * and Recall event, joined with the appointment/patient/doctor/actor context each row needs.
   */
  async listQueueLog(filters: {
    dateFrom?: Date;
    dateTo?: Date;
    doctorId?: number;
    consultationType?: string;
    action?: 'Skipped' | 'Recalled';
    search?: string;
    page?: number;
    limit?: number;
  }) {
    const where: Prisma.AppointmentQueueLogWhereInput = {
      ...(filters.action ? { action: filters.action } : {}),
      ...(filters.dateFrom || filters.dateTo
        ? { created_at: { ...(filters.dateFrom ? { gte: startOfDay(filters.dateFrom) } : {}), ...(filters.dateTo ? { lte: endOfDay(filters.dateTo) } : {}) } }
        : {}),
      appointment: {
        ...(filters.doctorId ? { doctor_id: filters.doctorId } : {}),
        ...(filters.consultationType ? { consultation_type: filters.consultationType } : {}),
        ...(filters.search
          ? { OR: [{ patient: { full_name: { contains: filters.search } } }, { patient_id: { contains: filters.search } }] }
          : {}),
      },
    };

    const page = filters.page && filters.page > 0 ? filters.page : 1;
    const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 10;

    const [total, rows] = await Promise.all([
      prisma.appointmentQueueLog.count({ where }),
      prisma.appointmentQueueLog.findMany({
        where,
        include: {
          actor: { select: { username: true, role: true } },
          appointment: {
            select: {
              appointment_id: true,
              scheduled_at: true,
              visit_type: true,
              consultation_type: true,
              priority: true,
              is_walk_in: true,
              patient: { select: patientSelect },
              doctor: { select: doctorSelect },
            },
          },
        },
        orderBy: { created_at: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    return { data: rows, pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } };
  }

  /**
   * KPI row for the Skip / Recall page. Recall clears skipped_at/skip_reason on the appointment
   * itself (there's no separate skip-history log), so these figures only describe appointments
   * still sitting in Skipped right now — there is no way to derive "recalled today" or "average
   * recall time" without retaining a history the schema doesn't keep.
   */
  async getSkipStats(doctorId?: number, dateFrom?: Date, dateTo?: Date) {
    const now = new Date();
    const doctorFilter = doctorId ? { doctor_id: doctorId } : {};
    const rangeFilter: Prisma.AppointmentWhereInput =
      dateFrom || dateTo
        ? { scheduled_at: { ...(dateFrom ? { gte: startOfDay(dateFrom) } : {}), ...(dateTo ? { lte: endOfDay(dateTo) } : {}) } }
        : {};

    const skipped = await prisma.appointment.findMany({
      where: { status: 'Skipped', ...doctorFilter, ...rangeFilter },
      select: { scheduled_at: true, skipped_at: true },
    });

    const waitMinutes = skipped.map((a) => Math.max(0, (now.getTime() - (a.skipped_at ?? a.scheduled_at).getTime()) / 60000));

    return {
      totalSkipped: skipped.length,
      skippedToday: skipped.filter((a) => (a.skipped_at ?? a.scheduled_at) >= startOfDay(now) && (a.skipped_at ?? a.scheduled_at) <= endOfDay(now)).length,
      skippedOver30: waitMinutes.filter((m) => m > 30).length,
      longestSkippedWaitMinutes: waitMinutes.length ? Math.round(Math.max(...waitMinutes)) : 0,
    };
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
