import { Request, Response } from 'express';
import * as service from './service';
import { streamPrescriptionPdf } from './pdf';
import { NotFoundError, ValidationError, ForbiddenError, AllergyConflictError } from './errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };
const idParam = (req: Request) => Number(req.params.prescriptionId);

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
    res.status(200).json(prescription);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getPdf = async (req: Request, res: Response) => {
  try {
    const prescription = await service.getPrescriptionById(idParam(req));
    if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

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

export const list = async (req: Request, res: Response) => {
  try {
    const { patientId, doctorId, status, medicineId, page, limit } = req.query as any;
    const result = await service.listPrescriptions({
      patientId,
      doctorId: doctorId ? Number(doctorId) : undefined,
      status,
      medicineId: medicineId ? Number(medicineId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};
