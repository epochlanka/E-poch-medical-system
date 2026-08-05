import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

export const listBatches = async (req: Request, res: Response) => {
  try {
    const { medicineId, supplierId, batchNo, status, expiryFrom, expiryTo, page, limit } = req.query as any;
    const result = await service.listBatches({
      medicineId: medicineId ? Number(medicineId) : undefined,
      supplierId: supplierId ? Number(supplierId) : undefined,
      batchNo,
      status,
      expiryFrom: expiryFrom ? new Date(expiryFrom) : undefined,
      expiryTo: expiryTo ? new Date(expiryTo) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getBatchById = async (req: Request, res: Response) => {
  try {
    const batch = await service.getBatchById(Number(req.params.batchId));
    res.status(200).json(batch);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getBatchLedger = async (req: Request, res: Response) => {
  try {
    const { page, limit } = req.query as any;
    const result = await service.getBatchLedger(Number(req.params.batchId), page ? Number(page) : undefined, limit ? Number(limit) : undefined);
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const adjustBatch = async (req: Request, res: Response) => {
  try {
    const { delta, reason } = req.body;
    const batch = await service.adjustBatch(Number(req.params.batchId), delta, reason, actor(req));
    res.status(200).json(batch);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const updateBatchLocation = async (req: Request, res: Response) => {
  try {
    const { location } = req.body;
    const batch = await service.updateBatchLocation(Number(req.params.batchId), location);
    res.status(200).json(batch);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const alerts = async (req: Request, res: Response) => {
  try {
    const { days } = req.query as any;
    const parsed = Number(days);
    const result = await service.getAlerts(Number.isFinite(parsed) && parsed > 0 ? parsed : undefined);
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const createStockCount = async (req: Request, res: Response) => {
  try {
    const { items, notes } = req.body;
    const stockCount = await service.createStockCount(items, actor(req), notes);
    res.status(201).json(stockCount);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listStockCounts = async (req: Request, res: Response) => {
  try {
    const { status } = req.query as any;
    const result = await service.listStockCounts(status);
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getStockCountById = async (req: Request, res: Response) => {
  try {
    const stockCount = await service.getStockCountById(Number(req.params.stockCountId));
    res.status(200).json(stockCount);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const postStockCount = async (req: Request, res: Response) => {
  try {
    const stockCount = await service.postStockCount(Number(req.params.stockCountId), actor(req));
    res.status(200).json(stockCount);
  } catch (error) {
    handleError(req, res, error);
  }
};
