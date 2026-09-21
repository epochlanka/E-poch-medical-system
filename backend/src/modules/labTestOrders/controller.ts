import { Request, Response } from 'express';
import * as service from './service';
import { streamLabTestRequestPdf, streamLabResultReportPdf } from './pdf';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';
import { respondWithServerError } from '../../errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  return respondWithServerError(req, res, error, 'labTestOrders');
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
    const { patientId, doctorId, consultationId, status, priority, testId, from, to, search, page, limit } = req.query as any;
    const result = await service.listLabTestOrders({
      patientId,
      doctorId: doctorId ? Number(doctorId) : undefined,
      consultationId: consultationId ? Number(consultationId) : undefined,
      status,
      priority,
      testId: testId ? Number(testId) : undefined,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      search,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const searchCatalog = async (req: Request, res: Response) => {
  try {
    const results = await service.searchLabTestCatalog((req.query.search as string) || undefined);
    res.status(200).json(results);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const catalogParameters = async (req: Request, res: Response) => {
  try {
    const params = await service.getLabTestCatalogParameters(Number(req.params.testId));
    res.status(200).json(params);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const markReceived = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file as { filename: string } | undefined;
    const order = await service.markReportReceived(
      Number(req.params.labTestOrderId),
      { note: req.body.note || undefined, report_file: file ?? null },
      actor(req)
    );
    res.status(200).json(order);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const complete = async (req: Request, res: Response) => {
  try {
    const order = await service.completeLabResult(
      Number(req.params.labTestOrderId),
      { results: req.body.results, doctor_notes: req.body.doctor_notes, interpretation: req.body.interpretation },
      actor(req)
    );
    res.status(200).json(order);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const amendCompleted = async (req: Request, res: Response) => {
  try {
    const order = await service.updateCompletedResult(
      Number(req.params.labTestOrderId),
      { results: req.body.results, doctor_notes: req.body.doctor_notes, interpretation: req.body.interpretation },
      actor(req)
    );
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
    await service.stampPrinted(order.lab_test_order_id, actor(req));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="LabTestRequest-${order.lab_test_order_id}.pdf"`);
    streamLabTestRequestPdf(order, res);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const printResult = async (req: Request, res: Response) => {
  try {
    const order = await service.getLabTestOrderById(Number(req.params.labTestOrderId));
    if (!order) return res.status(404).json({ message: 'Lab test order not found' });
    if (order.status !== 'Completed') return res.status(400).json({ message: 'This order has no completed result to print yet' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `inline; filename="LabResult-${order.lab_test_order_id}.pdf"`);
    streamLabResultReportPdf(order, res);
  } catch (error) {
    handleError(req, res, error);
  }
};
