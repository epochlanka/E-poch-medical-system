import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';
import { toCsv } from './csv';
import { streamReportPdf, ReportPayload } from './pdf';

const actor = (req: Request) => req.user as any as { user_id: number; role: string; username: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

type Format = 'json' | 'csv' | 'pdf';

const parseFormat = (req: Request): Format => {
  const format = String(req.query.format ?? 'json').toLowerCase();
  return format === 'csv' || format === 'pdf' ? format : 'json';
};

const parseDateRange = (req: Request) => {
  const { from, to } = req.query as any;
  return { from: from ? new Date(from) : undefined, to: to ? new Date(to) : undefined };
};

// Content-Disposition filenames must be ASCII-safe — report titles can contain an em dash
// (e.g. "Consultations by Diagnosis — doctor") which is not a valid raw header character.
const fileSlug = (title: string) =>
  title
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .toLowerCase();

// Every report goes through this so json/csv/pdf stay consistent for every endpoint below.
const respond = (req: Request, res: Response, payload: ReportPayload) => {
  const format = parseFormat(req);
  const who = actor(req).username;
  const slug = fileSlug(payload.title);

  if (format === 'csv') {
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.csv"`);
    return res.status(200).send(toCsv(payload.columns, payload.rows));
  }

  if (format === 'pdf') {
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.pdf"`);
    return streamReportPdf(payload, who, res);
  }

  return res.status(200).json(payload);
};

export const patientVolume = async (req: Request, res: Response) => {
  try {
    const result = await service.getPatientVolumeReport(parseDateRange(req));
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const revenue = async (req: Request, res: Response) => {
  try {
    const result = await service.getRevenueReport(parseDateRange(req));
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const topMedicines = async (req: Request, res: Response) => {
  try {
    const { limit } = req.query as any;
    const result = await service.getTopMedicinesReport({ ...parseDateRange(req), limit: limit ? Number(limit) : undefined });
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const auditLog = async (req: Request, res: Response) => {
  try {
    const { userId, entity, action, entityId, page, limit } = req.query as any;
    const result = await service.searchAuditLog({
      ...parseDateRange(req),
      userId: userId ? Number(userId) : undefined,
      entity,
      action,
      entityId,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    respond(req, res, result as any);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const doctorConsultations = async (req: Request, res: Response) => {
  try {
    const who = actor(req);
    const requestedDoctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
    // A Doctor can only ever see their own numbers, regardless of what they pass in the query.
    const doctorId = who.role === 'Doctor' ? who.user_id : requestedDoctorId;
    const result = await service.getDoctorConsultationsReport({ ...parseDateRange(req), doctorId });
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const doctorFollowUpsDue = async (req: Request, res: Response) => {
  try {
    const who = actor(req);
    const requestedDoctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
    const doctorId = who.role === 'Doctor' ? who.user_id : requestedDoctorId;
    const result = await service.getDoctorFollowUpsDueReport(doctorId);
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const doctorPrescriptions = async (req: Request, res: Response) => {
  try {
    const who = actor(req);
    const requestedDoctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
    const doctorId = who.role === 'Doctor' ? who.user_id : requestedDoctorId;
    const result = await service.getDoctorPrescriptionsReport({ ...parseDateRange(req), doctorId });
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const doctorDiagnoses = async (req: Request, res: Response) => {
  try {
    const who = actor(req);
    const requestedDoctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
    const doctorId = who.role === 'Doctor' ? who.user_id : requestedDoctorId;
    const result = await service.getDoctorDiagnosesReport({ ...parseDateRange(req), doctorId });
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const doctorPatientVisits = async (req: Request, res: Response) => {
  try {
    const who = actor(req);
    const requestedDoctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
    const doctorId = who.role === 'Doctor' ? who.user_id : requestedDoctorId;
    const result = await service.getDoctorPatientVisitsReport({ ...parseDateRange(req), doctorId });
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const doctorTopMedicines = async (req: Request, res: Response) => {
  try {
    const who = actor(req);
    const requestedDoctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
    const doctorId = who.role === 'Doctor' ? who.user_id : requestedDoctorId;
    const { limit } = req.query as any;
    const result = await service.getDoctorTopMedicinesReport({ ...parseDateRange(req), doctorId, limit: limit ? Number(limit) : undefined });
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const doctorAppointments = async (req: Request, res: Response) => {
  try {
    const who = actor(req);
    const requestedDoctorId = req.query.doctorId ? Number(req.query.doctorId) : undefined;
    const doctorId = who.role === 'Doctor' ? who.user_id : requestedDoctorId;
    const result = await service.getDoctorAppointmentsReport({ ...parseDateRange(req), doctorId });
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const lowStock = async (req: Request, res: Response) => {
  try {
    const result = await service.getLowStockReport();
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const expiringBatches = async (req: Request, res: Response) => {
  try {
    const { days } = req.query as any;
    const result = await service.getExpiringBatchesReport(days ? Number(days) : undefined);
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const overview = async (req: Request, res: Response) => {
  try {
    const result = await service.getOverviewReport(parseDateRange(req));
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const dispensingVolume = async (req: Request, res: Response) => {
  try {
    const result = await service.getDispensingVolumeReport(parseDateRange(req));
    respond(req, res, result);
  } catch (error) {
    handleError(req, res, error);
  }
};
