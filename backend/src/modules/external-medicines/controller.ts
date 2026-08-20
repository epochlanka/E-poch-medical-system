import { Request, Response } from 'express';
import * as service from './service';
import { streamExternalMedicineSlipPdf } from './pdf';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

export const create = async (req: Request, res: Response) => {
  try {
    const row = await service.createExternalMedicine(Number(req.params.prescriptionId), req.body, actor(req));
    res.status(201).json(row);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const bulkCreate = async (req: Request, res: Response) => {
  try {
    const rows = await service.bulkCreateExternalMedicines(Number(req.params.prescriptionId), req.body.items, actor(req));
    res.status(201).json(rows);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listByPrescription = async (req: Request, res: Response) => {
  try {
    const rows = await service.listByPrescription(Number(req.params.prescriptionId));
    res.status(200).json(rows);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listByPatient = async (req: Request, res: Response) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search : undefined;
    const rows = await service.listByPatient(String(req.params.patientId), search);
    res.status(200).json(rows);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const row = await service.updateExternalMedicine(Number(req.params.extItemId), req.body, actor(req));
    res.status(200).json(row);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const remove = async (req: Request, res: Response) => {
  try {
    await service.removeExternalMedicine(Number(req.params.extItemId), actor(req));
    res.status(204).send();
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getSlip = async (req: Request, res: Response) => {
  try {
    const prescription = await service.getPrescriptionForSlip(Number(req.params.prescriptionId));
    if (prescription.external_medicines.length === 0) {
      return res.status(400).json({ message: 'This prescription has no external medicines to print' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="RX${String(prescription.prescription_id).padStart(6, '0')}-external-medicine-slip.pdf"`);
    streamExternalMedicineSlipPdf(prescription, res);
  } catch (error) {
    handleError(req, res, error);
  }
};
