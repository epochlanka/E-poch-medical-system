import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

export const search = async (req: Request, res: Response) => {
  try {
    const { search, category, includeInactive } = req.query as any;
    const medicines = await service.searchMedicines({ search, category, includeInactive: includeInactive === 'true' });
    res.status(200).json(medicines);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const medicine = await service.getMedicineById(Number(req.params.medicineId));
    if (!medicine) return res.status(404).json({ message: 'Medicine not found' });
    res.status(200).json(medicine);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const medicine = await service.createMedicine(req.body);
    res.status(201).json(medicine);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const medicine = await service.updateMedicine(Number(req.params.medicineId), req.body);
    res.status(200).json(medicine);
  } catch (error) {
    handleError(req, res, error);
  }
};
