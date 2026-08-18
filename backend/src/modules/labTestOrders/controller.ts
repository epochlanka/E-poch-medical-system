import { Request, Response } from 'express';
import * as service from './service';
import { streamLabTestRequestPdf } from './pdf';
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
    const order = await service.createLabTestOrder(req.body, actor(req));
    res.status(201).json(order);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const order = await service.getLabTestOrderById(Number(req.params.labTestOrderId));
    if (!order) return res.status(404).json({ message: 'Lab test order not found' });
    res.status(200).json(order);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const context = async (req: Request, res: Response) => {
  try {
    const result = await service.getLabTestOrderContext(Number(req.params.consultationId));
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const list = async (req: Request, res: Response) => {
  try {
    const { patientId, doctorId, consultationId, status, priority, page, limit } = req.query as any;
    const result = await service.listLabTestOrders({
      patientId,
      doctorId: doctorId ? Number(doctorId) : undefined,
      consultationId: consultationId ? Number(consultationId) : undefined,
      status,
      priority,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const enterResult = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body.result_value || !String(body.result_value).trim()) {
      return res.status(400).json({ message: 'Result value is required' });
    }
    const file = (req as any).file as { filename: string } | undefined;
    const order = await service.enterLabTestResult(
      Number(req.params.labTestOrderId),
      {
        result_value: body.result_value,
        unit: body.unit || undefined,
        reference_range: body.reference_range || undefined,
        result_date: body.result_date ? new Date(body.result_date) : undefined,
        result_notes: body.result_notes || undefined,
        laboratory_name: body.laboratory_name || undefined,
        report_file: file ?? null,
      },
      actor(req)
    );
    res.status(200).json(order);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const review = async (req: Request, res: Response) => {
  try {
    const order = await service.reviewLabTestOrder(Number(req.params.labTestOrderId), req.body.review_notes, actor(req));
    res.status(200).json(order);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const cancel = async (req: Request, res: Response) => {
  try {
    const order = await service.cancelLabTestOrder(Number(req.params.labTestOrderId));
    res.status(200).json(order);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const printRequest = async (req: Request, res: Response) => {
  try {
    const order = await service.getLabTestOrderById(Number(req.params.labTestOrderId));
    if (!order) return res.status(404).json({ message: 'Lab test order not found' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="LabTestRequest-${order.lab_test_order_id}.pdf"`);
    streamLabTestRequestPdf(order, res);
  } catch (error) {
    handleError(req, res, error);
  }
};
