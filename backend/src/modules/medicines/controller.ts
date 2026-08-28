import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';
import { respondWithServerError } from '../../errors';

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  return respondWithServerError(req, res, error, 'medicines');
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

export const stats = async (req: Request, res: Response) => {
  try {
    const data = await service.getMedicineStats();
    res.status(200).json(data);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listStock = async (req: Request, res: Response) => {
  try {
    const { search, category, status, supplierId, page, limit } = req.query as any;
    const data = await service.listMedicineStock({
      search,
      category,
      status,
      supplierId: supplierId ? Number(supplierId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(data);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const catalogMeta = async (req: Request, res: Response) => {
  try {
    const data = await service.getCatalogMeta();
    res.status(200).json(data);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listCatalog = async (req: Request, res: Response) => {
  try {
    const { search, category, form, manufacturer, status, page, limit } = req.query as any;
    const data = await service.listMedicineCatalog({
      search,
      category,
      form,
      manufacturer,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(data);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const importMedicines = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No CSV file provided' });
    const result = await service.importMedicinesFromCsv(req.file.buffer.toString('utf-8'));
    res.status(200).json(result);
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
