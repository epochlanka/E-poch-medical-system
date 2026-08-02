import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

export const create = async (req: Request, res: Response) => {
  try {
    const invoice = await service.createInvoice(req.body, actor(req));
    res.status(201).json(invoice);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const invoice = await service.getInvoiceById(Number(req.params.invoiceId));
    res.status(200).json(invoice);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const list = async (req: Request, res: Response) => {
  try {
    const { patientId, consultationId, status, from, to, page, limit } = req.query as any;
    const result = await service.listInvoices({
      patientId,
      consultationId: consultationId ? Number(consultationId) : undefined,
      status,
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

export const recordPayments = async (req: Request, res: Response) => {
  try {
    const invoice = await service.recordPayments(Number(req.params.invoiceId), req.body.payments, actor(req));
    res.status(200).json(invoice);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const voidInvoice = async (req: Request, res: Response) => {
  try {
    const invoice = await service.voidInvoice(Number(req.params.invoiceId), req.body.reason, actor(req));
    res.status(200).json(invoice);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const reconciliation = async (req: Request, res: Response) => {
  try {
    const { date } = req.query as any;
    const result = await service.getReconciliation(date ? new Date(date) : new Date());
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};
