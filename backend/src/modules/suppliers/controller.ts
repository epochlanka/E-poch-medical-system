import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';
import { respondWithServerError } from '../../errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  return respondWithServerError(req, res, error, 'suppliers');
};

export const listSuppliers = async (req: Request, res: Response) => {
  try {
    const { search, includeInactive } = req.query as any;
    const suppliers = await service.listSuppliers({ search, includeInactive: includeInactive === 'true' });
    res.status(200).json(suppliers);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getSupplierStats = async (req: Request, res: Response) => {
  try {
    const stats = await service.getSupplierStats();
    res.status(200).json(stats);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const createSupplier = async (req: Request, res: Response) => {
  try {
    const supplier = await service.createSupplier(req.body);
    res.status(201).json(supplier);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getSupplierById = async (req: Request, res: Response) => {
  try {
    const supplier = await service.getSupplierById(Number(req.params.supplierId));
    res.status(200).json(supplier);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const updateSupplier = async (req: Request, res: Response) => {
  try {
    const supplier = await service.updateSupplier(Number(req.params.supplierId), req.body);
    res.status(200).json(supplier);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const createPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const po = await service.createPurchaseOrder(req.body, actor(req));
    res.status(201).json(po);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listPurchaseOrders = async (req: Request, res: Response) => {
  try {
    const { search, supplierId, status, page, limit } = req.query as any;
    const result = await service.listPurchaseOrders({
      search,
      supplierId: supplierId ? Number(supplierId) : undefined,
      status,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getPurchaseOrderStats = async (req: Request, res: Response) => {
  try {
    const { range } = req.query as any;
    const stats = await service.getPurchaseOrderStats(range);
    res.status(200).json(stats);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getTopSuppliers = async (req: Request, res: Response) => {
  try {
    const { range, limit } = req.query as any;
    const result = await service.getTopSuppliers(range, limit ? Number(limit) : undefined);
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const cancelPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const po = await service.cancelPurchaseOrder(Number(req.params.poId));
    res.status(200).json(po);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getPurchaseOrderById = async (req: Request, res: Response) => {
  try {
    const po = await service.getPurchaseOrderById(Number(req.params.poId));
    res.status(200).json(po);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const submitPurchaseOrder = async (req: Request, res: Response) => {
  try {
    const po = await service.submitPurchaseOrder(Number(req.params.poId));
    res.status(200).json(po);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const closePurchaseOrder = async (req: Request, res: Response) => {
  try {
    const po = await service.closePurchaseOrder(Number(req.params.poId));
    res.status(200).json(po);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const suggestReorder = async (req: Request, res: Response) => {
  try {
    const result = await service.suggestReorder();
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const receiveGrn = async (req: Request, res: Response) => {
  try {
    const grn = await service.receiveGrn(Number(req.params.poId), req.body.items, actor(req));
    res.status(201).json(grn);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getGrnById = async (req: Request, res: Response) => {
  try {
    const grn = await service.getGrnById(Number(req.params.grnId));
    res.status(200).json(grn);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listGrns = async (req: Request, res: Response) => {
  try {
    const { hasDiscrepancy, reviewed } = req.query as any;
    const result = await service.listGrns({
      hasDiscrepancy: hasDiscrepancy !== undefined ? hasDiscrepancy === 'true' : undefined,
      reviewed: reviewed !== undefined ? reviewed === 'true' : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const reviewDiscrepancy = async (req: Request, res: Response) => {
  try {
    const grn = await service.reviewDiscrepancy(Number(req.params.grnId), actor(req), req.body.notes);
    res.status(200).json(grn);
  } catch (error) {
    handleError(req, res, error);
  }
};
