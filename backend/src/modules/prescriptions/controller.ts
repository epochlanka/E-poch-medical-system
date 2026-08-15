import { Request, Response } from 'express';
import * as service from './service';
import { streamPrescriptionPdf } from './pdf';
import { NotFoundError, ValidationError, ForbiddenError, AllergyConflictError } from './errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };
const idParam = (req: Request) => Number(req.params.prescriptionId);

// A Doctor caller is always scoped to their own prescriptions, regardless of any doctorId
// query param they might pass — mirrors appointments/consultations controllers' doctorScope
// helper. Other roles may use doctorId to filter, or omit it to see every doctor's.
const doctorScope = (req: Request): number | undefined => {
  const user = actor(req);
  if (user?.role === 'Doctor') return user.user_id;
  const queryDoctorId = req.query.doctorId;
  return queryDoctorId ? Number(queryDoctorId) : undefined;
};

// A Doctor may only read a prescription (detail or PDF) tied to their own consultation —
// same ownership boundary create() already enforces, just for reads.
const assertDoctorOwnsIfDoctor = (req: Request, prescription: { consultation: { appointment: { doctor_id: number } } }) => {
  const user = actor(req);
  if (user?.role === 'Doctor' && user.user_id !== prescription.consultation.appointment.doctor_id) {
    throw new ForbiddenError('You do not have permission to view this prescription');
  }
};

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ message: error.message });
  if (error instanceof AllergyConflictError) return res.status(409).json({ message: error.message, conflicts: error.conflicts });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

export const create = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const prescription = await service.createPrescription(
      {
        consultation_id: body.consultation_id,
        items: body.items,
        refill_of_prescription_id: body.refill_of_prescription_id,
        allergyAck: body.allergyAck,
        notes: body.notes,
      },
      actor(req)
    );
    res.status(201).json(prescription);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const prescription = await service.getPrescriptionById(idParam(req));
    if (!prescription) return res.status(404).json({ message: 'Prescription not found' });
    assertDoctorOwnsIfDoctor(req, prescription);
    res.status(200).json(prescription);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getPdf = async (req: Request, res: Response) => {
  try {
    const prescription = await service.getPrescriptionById(idParam(req));
    if (!prescription) return res.status(404).json({ message: 'Prescription not found' });
    assertDoctorOwnsIfDoctor(req, prescription);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="RX${String(prescription.prescription_id).padStart(6, '0')}.pdf"`);
    streamPrescriptionPdf(prescription, res);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const context = async (req: Request, res: Response) => {
  try {
    const result = await service.getPrescriptionContext(Number(req.params.consultationId));
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

// z.coerce.boolean() only validates that the raw query value is coercible — it doesn't tell us
// which way it went (Boolean("false") is true), so the actual true/false read comes from the
// raw string here, same workaround already used for consultations' followUpOnly.
const isRefillFilter = (req: Request): boolean | undefined => {
  const raw = req.query.isRefill;
  if (raw === undefined) return undefined;
  return raw === 'true';
};

export const stats = async (req: Request, res: Response) => {
  try {
    const data = await service.getPrescriptionStats(doctorScope(req), isRefillFilter(req));
    res.status(200).json(data);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const list = async (req: Request, res: Response) => {
  try {
    const { patientId, status, medicineId, search, from, to, page, limit } = req.query as any;
    const result = await service.listPrescriptions({
      patientId,
      doctorId: doctorScope(req),
      status,
      medicineId: medicineId ? Number(medicineId) : undefined,
      search,
      isRefill: isRefillFilter(req),
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};
