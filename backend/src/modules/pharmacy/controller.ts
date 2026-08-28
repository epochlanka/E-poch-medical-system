import { Request, Response } from 'express';
import * as service from './service';
import { streamDispenseLabel } from './label';
import { NotFoundError, ValidationError } from './errors';
import { respondWithServerError } from '../../errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };
const prescriptionIdParam = (req: Request) => Number(req.params.prescriptionId);

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  return respondWithServerError(req, res, error, 'pharmacy');
};

export const queue = async (req: Request, res: Response) => {
  try {
    const { status } = req.query as any;
    const result = await service.getQueue(status);
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const batchSuggestions = async (req: Request, res: Response) => {
  try {
    const suggestions = await service.getBatchSuggestions(prescriptionIdParam(req));
    res.status(200).json(suggestions);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const setPreparing = async (req: Request, res: Response) => {
  try {
    const prescription = await service.setPreparing(prescriptionIdParam(req));
    res.status(200).json(prescription);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const dispense = async (req: Request, res: Response) => {
  try {
    const prescription = await service.dispense(prescriptionIdParam(req), req.body.items, actor(req));
    res.status(200).json(prescription);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const collect = async (req: Request, res: Response) => {
  try {
    const prescription = await service.collectPrescription(prescriptionIdParam(req));
    res.status(200).json(prescription);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const label = async (req: Request, res: Response) => {
  try {
    const prescription = await service.getPrescriptionForLabel(prescriptionIdParam(req));
    if (!prescription) return res.status(404).json({ message: 'Prescription not found' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="RX${String(prescription.prescription_id).padStart(6, '0')}-label.pdf"`);
    streamDispenseLabel(prescription, res);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const createSubstitution = async (req: Request, res: Response) => {
  try {
    const { medicine_id, substitute_medicine_id, priority, type } = req.body;
    const rule = await service.createSubstitution(medicine_id, substitute_medicine_id, actor(req).user_id, { priority, type });
    res.status(201).json(rule);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const updateSubstitution = async (req: Request, res: Response) => {
  try {
    const rule = await service.updateSubstitution(Number(req.params.substitutionId), req.body);
    res.status(200).json(rule);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listSubstitutions = async (req: Request, res: Response) => {
  try {
    const { medicineId, status } = req.query as any;
    const rules = await service.listSubstitutions({ medicineId: medicineId ? Number(medicineId) : undefined, status });
    res.status(200).json(rules);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const substitutionStats = async (req: Request, res: Response) => {
  try {
    const data = await service.getSubstitutionStats();
    res.status(200).json(data);
  } catch (error) {
    handleError(req, res, error);
  }
};
