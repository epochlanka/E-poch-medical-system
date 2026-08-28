import path from 'path';
import { PrismaClient, Prisma } from '@prisma/client';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const prisma = new PrismaClient();

export const uploadsDir = path.join(__dirname, '..', '..', '..', 'uploads', 'lab-reports');

interface Actor {
  user_id: number;
  role: string;
}

const assertDoctorOwnsConsultation = (actor: Actor, doctorId: number) => {
  if (actor.user_id !== doctorId) {
    throw new ForbiddenError('You can only order lab tests for your own consultations');
  }
};

const detailInclude = {
  patient: true,
  doctor: { select: { user_id: true, username: true, registration_number: true } },
  catalog_test: true,
  printed_by_user: { select: { user_id: true, username: true } },
  report_received_by_user: { select: { user_id: true, username: true } },
  completed_by_user: { select: { user_id: true, username: true } },
  consultation: { select: { consultation_id: true, diagnosis: true } },
  results: { orderBy: { entered_at: 'asc' as const } },
} as const;

const requestNumber = (id: number) => `LAB${String(id).padStart(6, '0')}`;

interface CreateLabTestOrderInput {
  consultation_id: number;
  catalog_test_id?: number;
  test_name?: string;
  test_category?: string;
  instructions?: string;
  priority?: string;
  additional_notes?: string;
}

// Only a doctor may order a lab test, and only for their own consultation (business rules #1/#2).
// A catalog test pre-fills name/category (still overridable); a free-typed test needs test_name.
export const createLabTestOrder = async (input: CreateLabTestOrderInput, actor: Actor) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: input.consultation_id },
    include: { appointment: true },
  });
  if (!consultation) throw new NotFoundError('Consultation not found');
  assertDoctorOwnsConsultation(actor, consultation.appointment.doctor_id);
  // patient_id is a hard FK on LabTestOrder — a temporary/unregistered walk-in has no Patient
  // row to attach a lab order to.
  if (!consultation.appointment.patient_id) {
    throw new ValidationError('This patient is not registered yet — register them before ordering a lab test');
  }

  let testName = input.test_name?.trim();
  let testCategory = input.test_category?.trim() || undefined;
  if (input.catalog_test_id) {
    const catalogTest = await prisma.labTestCatalog.findUnique({ where: { test_id: input.catalog_test_id } });
    if (!catalogTest) throw new NotFoundError('Lab test not found in catalog');
    testName = testName || catalogTest.test_name;
    testCategory = testCategory || catalogTest.category || undefined;
  }
  if (!testName) throw new ValidationError('Test name is required');

  const created = await prisma.labTestOrder.create({
    data: {
      patient_id: consultation.appointment.patient_id,
      doctor_id: consultation.appointment.doctor_id,
      consultation_id: input.consultation_id,
      catalog_test_id: input.catalog_test_id,
      test_name: testName,
      test_category: testCategory,
      instructions: input.instructions,
      priority: input.priority || 'Routine',
      additional_notes: input.additional_notes,
    },
    include: detailInclude,
  });

  return prisma.labTestOrder.update({
    where: { lab_test_order_id: created.lab_test_order_id },
    data: { request_number: requestNumber(created.lab_test_order_id) },
    include: detailInclude,
  });
};

export const getLabTestOrderById = (id: number) => prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id }, include: detailInclude });

interface ListLabTestOrdersFilters {
  patientId?: string;
  doctorId?: number;
  consultationId?: number;
  status?: string;
  priority?: string;
  testId?: number;
  from?: Date;
  to?: Date;
  search?: string;
  page?: number;
  limit?: number;
}

// A pending order must never disappear from a patient's history (business rules #3/#4) — this
// is a plain filtered list, nothing here ever excludes a row except by explicit status filter.
export const listLabTestOrders = async (filters: ListLabTestOrdersFilters) => {
  const page = filters.page && filters.page > 0 ? filters.page : 1;
  const limit = filters.limit && filters.limit > 0 && filters.limit <= 100 ? filters.limit : 20;

  const where: Prisma.LabTestOrderWhereInput = {};
  if (filters.patientId) where.patient_id = filters.patientId;
  if (filters.doctorId) where.doctor_id = filters.doctorId;
  if (filters.consultationId) where.consultation_id = filters.consultationId;
  if (filters.status) where.status = filters.status;
  if (filters.priority) where.priority = filters.priority;
  if (filters.testId) where.catalog_test_id = filters.testId;
  if (filters.from || filters.to) {
    where.order_date = { ...(filters.from ? { gte: filters.from } : {}), ...(filters.to ? { lte: filters.to } : {}) };
  }
  if (filters.search) {
    const term = filters.search.trim();
    where.OR = [
      { test_name: { contains: term } },
      { request_number: { contains: term } },
      { patient: { full_name: { contains: term } } },
      { patient: { patient_id: { contains: term } } },
    ];
  }

  const [total, data] = await Promise.all([
    prisma.labTestOrder.count({ where }),
    prisma.labTestOrder.findMany({
      where,
      orderBy: { order_date: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
      include: {
        patient: { select: { patient_id: true, full_name: true, gender: true, dob: true } },
        doctor: { select: { user_id: true, username: true } },
        report_received_by_user: { select: { user_id: true, username: true } },
        completed_by_user: { select: { user_id: true, username: true } },
        results: { orderBy: { entered_at: 'asc' } },
      },
    }),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// ---- Lab test catalog (Add Lab Test super-search) ------------------------------------------

export const searchLabTestCatalog = (search?: string) => {
  const where: Prisma.LabTestCatalogWhereInput = { is_active: true };
  if (search) {
    const term = search.trim();
    where.OR = [{ test_name: { contains: term } }, { test_code: { contains: term } }, { category: { contains: term } }, { abbreviation: { contains: term } }];
  }
  return prisma.labTestCatalog.findMany({ where, orderBy: { test_name: 'asc' } });
};

export const getLabTestCatalogParameters = async (testId: number) => {
  const test = await prisma.labTestCatalog.findUnique({ where: { test_id: testId } });
  if (!test) throw new NotFoundError('Lab test not found in catalog');
  return prisma.labTestParameter.findMany({ where: { test_id: testId, is_active: true }, orderBy: { display_order: 'asc' } });
};

// ---- Status lifecycle: Pending -> Report Received -> Completed (or -> Cancelled) -----------

// Reception/Doctor/Admin may record that the physical report is back — this deliberately never
// touches a clinical value, only that the paperwork exists (business rule: Reception must not
// enter or edit lab results, only mark receipt of the physical report).
interface MarkReceivedInput {
  note?: string;
  report_file?: { filename: string } | null;
}

export const markReportReceived = async (id: number, input: MarkReceivedInput, actor: Actor) => {
  const order = await prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id } });
  if (!order) throw new NotFoundError('Lab test order not found');
  if (order.status !== 'Pending') throw new ValidationError(`Cannot mark a report received for an order that is ${order.status}`);

  return prisma.labTestOrder.update({
    where: { lab_test_order_id: id },
    data: {
      status: 'Report Received',
      report_received_at: new Date(),
      report_received_by: actor.user_id,
      received_note: input.note,
      report_file_path: input.report_file ? `/uploads/lab-reports/${input.report_file.filename}` : undefined,
    },
    include: detailInclude,
  });
};

const parseRangeBound = (range: string): { low: number; high: number } | null => {
  const match = range.trim().match(/^(-?\d+(?:\.\d+)?)\s*-\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  return { low: Number(match[1]), high: Number(match[2]) };
};

// Decision-support only (FR-17) — never a diagnosis, just Normal/Low/High so the doctor can
// review faster. Returns null when the range or value isn't a plain numeric range (e.g. a
// qualitative urine parameter like "Negative"), matching the spec's "where configured" caveat.
const flagResult = (value: string, referenceRange?: string | null): string | null => {
  if (!referenceRange) return null;
  const bounds = parseRangeBound(referenceRange);
  if (!bounds) return null;
  const num = Number(value);
  if (!Number.isFinite(num)) return null;
  if (num < bounds.low) return 'Low';
  if (num > bounds.high) return 'High';
  return 'Normal';
};

interface CompleteResultInput {
  results: { parameter_id?: number; parameter_name: string; unit?: string; reference_range?: string; result_value: string }[];
  doctor_notes?: string;
  interpretation?: string;
}

// The doctor's single "enter values + review + finalize" action (FR-13-19) — replaces the old
// two-step enterResult/review flow. Only reachable from Report Received, and only by a doctor
// (or Admin) — this is the enforcement point for "Reception must not finalize lab results".
export const completeLabResult = async (id: number, input: CompleteResultInput, actor: Actor) => {
  const order = await prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id } });
  if (!order) throw new NotFoundError('Lab test order not found');
  if (order.status !== 'Report Received') {
    throw new ValidationError('Only an order whose report has been received can be completed');
  }
  const values = input.results.filter((r) => r.result_value?.trim());
  if (values.length === 0) throw new ValidationError('At least one result value is required to complete this order');

  return prisma.$transaction(async (tx) => {
    await tx.labResult.deleteMany({ where: { lab_test_order_id: id } });
    for (const r of values) {
      await tx.labResult.create({
        data: {
          lab_test_order_id: id,
          parameter_id: r.parameter_id,
          parameter_name: r.parameter_name,
          unit: r.unit,
          reference_range: r.reference_range,
          result_value: r.result_value.trim(),
          result_flag: flagResult(r.result_value.trim(), r.reference_range),
          entered_by: actor.user_id,
        },
      });
    }

    return tx.labTestOrder.update({
      where: { lab_test_order_id: id },
      data: {
        status: 'Completed',
        completed_at: new Date(),
        completed_by: actor.user_id,
        review_notes: input.doctor_notes,
        interpretation: input.interpretation,
        entered_by: actor.user_id,
        entered_at: new Date(),
      },
      include: detailInclude,
    });
  });
};

// A doctor/admin may correct a completed order's values without re-opening the whole lifecycle
// (medical records get amended, not silently rewritten with no trace — same entered_by/at stamp
// updates so it's clear who touched it last).
export const updateCompletedResult = async (id: number, input: CompleteResultInput, actor: Actor) => {
  const order = await prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id } });
  if (!order) throw new NotFoundError('Lab test order not found');
  if (order.status !== 'Completed') throw new ValidationError('Only a completed order can be amended');
  const values = input.results.filter((r) => r.result_value?.trim());
  if (values.length === 0) throw new ValidationError('At least one result value is required');

  return prisma.$transaction(async (tx) => {
    await tx.labResult.deleteMany({ where: { lab_test_order_id: id } });
    for (const r of values) {
      await tx.labResult.create({
        data: {
          lab_test_order_id: id,
          parameter_id: r.parameter_id,
          parameter_name: r.parameter_name,
          unit: r.unit,
          reference_range: r.reference_range,
          result_value: r.result_value.trim(),
          result_flag: flagResult(r.result_value.trim(), r.reference_range),
          entered_by: actor.user_id,
        },
      });
    }
    return tx.labTestOrder.update({
      where: { lab_test_order_id: id },
      data: { review_notes: input.doctor_notes, interpretation: input.interpretation, entered_by: actor.user_id, entered_at: new Date() },
      include: detailInclude,
    });
  });
};

export const cancelLabTestOrder = async (id: number) => {
  const order = await prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id } });
  if (!order) throw new NotFoundError('Lab test order not found');
  if (order.status === 'Completed') throw new ValidationError('Cannot cancel a completed order');
  if (order.status === 'Cancelled') throw new ValidationError('This order is already cancelled');

  return prisma.labTestOrder.update({ where: { lab_test_order_id: id }, data: { status: 'Cancelled' }, include: detailInclude });
};

// Printing never changes status — only stamps who/when for audit (business rule: printing a
// request letter is not a clinical action).
export const stampPrinted = (id: number, actor: Actor) =>
  prisma.labTestOrder.update({ where: { lab_test_order_id: id }, data: { printed_at: new Date(), printed_by: actor.user_id } });

// ---- Add Lab Test panel context (doctor-frontend consultation workspace) ------------------

export const getLabTestOrderContext = async (consultationId: number) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: consultationId },
    include: {
      appointment: {
        include: {
          patient: true,
          doctor: { select: { user_id: true, username: true, registration_number: true } },
        },
      },
    },
  });
  if (!consultation) throw new NotFoundError('Consultation not found');

  return {
    consultation: { consultationId: consultation.consultation_id, status: consultation.status, diagnosis: consultation.diagnosis },
    appointment: {
      appointmentId: consultation.appointment.appointment_id,
      scheduledAt: consultation.appointment.scheduled_at,
      patient: consultation.appointment.patient,
      doctor: consultation.appointment.doctor,
    },
  };
};

// ---- Dashboard widget: "Pending Lab Reports" — orders whose report is back and needs the
// doctor to actually open it and enter values (Pending alone just means "waiting on the lab/
// patient", not yet actionable by the doctor).
export const countActionableLabReports = (doctorId: number) => prisma.labTestOrder.count({ where: { doctor_id: doctorId, status: 'Report Received' } });
