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
  entered_by_user: { select: { user_id: true, username: true } },
  reviewed_by_user: { select: { user_id: true, username: true } },
  consultation: { select: { consultation_id: true, diagnosis: true } },
} as const;

interface CreateLabTestOrderInput {
  consultation_id: number;
  test_name: string;
  test_category?: string;
  instructions?: string;
  priority?: string;
  additional_notes?: string;
}

// Only a doctor may order a lab test, and only for their own consultation (business rules #1/#2).
export const createLabTestOrder = async (input: CreateLabTestOrderInput, actor: Actor) => {
  const consultation = await prisma.consultation.findUnique({
    where: { consultation_id: input.consultation_id },
    include: { appointment: true },
  });
  if (!consultation) throw new NotFoundError('Consultation not found');
  assertDoctorOwnsConsultation(actor, consultation.appointment.doctor_id);

  return prisma.labTestOrder.create({
    data: {
      patient_id: consultation.appointment.patient_id,
      doctor_id: consultation.appointment.doctor_id,
      consultation_id: input.consultation_id,
      test_name: input.test_name,
      test_category: input.test_category,
      instructions: input.instructions,
      priority: input.priority || 'Routine',
      additional_notes: input.additional_notes,
    },
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
        entered_by_user: { select: { user_id: true, username: true } },
        reviewed_by_user: { select: { user_id: true, username: true } },
      },
    }),
  ]);

  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

interface EnterResultInput {
  result_value: string;
  unit?: string;
  reference_range?: string;
  result_date?: Date;
  result_notes?: string;
  laboratory_name?: string;
  report_file?: { filename: string } | null;
}

// Always an update to the existing row — never creates a new order (business rule #6). Re-entering
// a result (e.g. correcting a typo) simply overwrites the same result_* fields and audit stamp.
export const enterLabTestResult = async (id: number, input: EnterResultInput, actor: Actor) => {
  const order = await prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id } });
  if (!order) throw new NotFoundError('Lab test order not found');
  if (order.status === 'Cancelled') throw new ValidationError('Cannot enter a result for a cancelled order');

  return prisma.labTestOrder.update({
    where: { lab_test_order_id: id },
    data: {
      result_value: input.result_value,
      unit: input.unit,
      reference_range: input.reference_range,
      result_date: input.result_date ?? new Date(),
      result_notes: input.result_notes,
      laboratory_name: input.laboratory_name,
      report_file_path: input.report_file ? `/uploads/lab-reports/${input.report_file.filename}` : undefined,
      entered_by: actor.user_id,
      entered_at: new Date(),
      status: 'Result Received',
    },
    include: detailInclude,
  });
};

export const reviewLabTestOrder = async (id: number, reviewNotes: string | undefined, actor: Actor) => {
  const order = await prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id } });
  if (!order) throw new NotFoundError('Lab test order not found');
  if (order.status !== 'Result Received') throw new ValidationError('Only an order with a result can be reviewed');

  return prisma.labTestOrder.update({
    where: { lab_test_order_id: id },
    data: { status: 'Reviewed', reviewed_by: actor.user_id, reviewed_date: new Date(), review_notes: reviewNotes },
    include: detailInclude,
  });
};

export const cancelLabTestOrder = async (id: number) => {
  const order = await prisma.labTestOrder.findUnique({ where: { lab_test_order_id: id } });
  if (!order) throw new NotFoundError('Lab test order not found');
  if (order.status === 'Reviewed') throw new ValidationError('Cannot cancel a reviewed order');

  return prisma.labTestOrder.update({ where: { lab_test_order_id: id }, data: { status: 'Cancelled' }, include: detailInclude });
};

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
