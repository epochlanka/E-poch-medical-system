import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError, ForbiddenError } from './errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };
const idParam = (req: Request) => Number(req.params.consultationId);

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

export const create = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const consultation = await service.createConsultation(
      {
        appointment_id: body.appointment_id,
        vitals: body.vitals,
        complaint: body.complaint,
        history_of_present_illness: body.history_of_present_illness,
        examination_findings: body.examination_findings,
        medical_history: body.medical_history,
        diagnosis: body.diagnosis,
        icd10_code: body.icd10_code,
        notes: body.notes,
        follow_up_date: body.follow_up_date ? new Date(body.follow_up_date) : undefined,
        allergies_ack: body.allergies_ack,
      },
      actor(req)
    );
    res.status(201).json(consultation);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const consultation = await service.getConsultationById(idParam(req));
    if (!consultation) return res.status(404).json({ message: 'Consultation not found' });
    res.status(200).json(consultation);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const consultation = await service.updateConsultation(
      idParam(req),
      {
        vitals: body.vitals,
        complaint: body.complaint,
        history_of_present_illness: body.history_of_present_illness,
        examination_findings: body.examination_findings,
        medical_history: body.medical_history,
        diagnosis: body.diagnosis,
        icd10_code: body.icd10_code,
        notes: body.notes,
        follow_up_date: body.follow_up_date !== undefined ? (body.follow_up_date ? new Date(body.follow_up_date) : null) : undefined,
        allergies_ack: body.allergies_ack,
      },
      actor(req)
    );
    res.status(200).json(consultation);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const finalize = async (req: Request, res: Response) => {
  try {
    const consultation = await service.finalizeConsultation(idParam(req), actor(req));
    res.status(200).json(consultation);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const amend = async (req: Request, res: Response) => {
  try {
    const consultation = await service.amendConsultation(idParam(req), req.body, actor(req));
    res.status(200).json(consultation);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const amendments = async (req: Request, res: Response) => {
  try {
    const entries = await service.listAmendments(idParam(req), actor(req));
    res.status(200).json(entries);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const context = async (req: Request, res: Response) => {
  try {
    const appointmentId = Number(req.params.appointmentId);
    const result = await service.getConsultationContext(appointmentId, actor(req));
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const uploadDocument = async (req: Request, res: Response) => {
  try {
    const file = (req as any).file;
    if (!file) return res.status(400).json({ message: 'No file uploaded' });
    const doc = await service.addDocument(idParam(req), file, actor(req).user_id);
    res.status(201).json(doc);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listDocuments = async (req: Request, res: Response) => {
  try {
    const docs = await service.listDocuments(idParam(req));
    res.status(200).json(docs);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const deleteDocument = async (req: Request, res: Response) => {
  try {
    await service.deleteDocument(Number(req.params.documentId));
    res.status(204).send();
  } catch (error) {
    handleError(req, res, error);
  }
};

// A Doctor caller is always scoped to their own consultations, regardless of any doctorId
// query param they might pass — mirrors appointments controller's doctorScope helper. Other
// roles may use doctorId to filter, or omit it to see every doctor's consultations.
const doctorScope = (req: Request): number | undefined => {
  const user = req.user as any as { user_id: number; role: string };
  if (user?.role === 'Doctor') return user.user_id;
  const queryDoctorId = req.query.doctorId;
  return queryDoctorId ? Number(queryDoctorId) : undefined;
};

export const list = async (req: Request, res: Response) => {
  try {
    const { patientId, status, from, to, diagnosisKeyword, search, followUpOnly, page, limit } = req.query as any;
    const result = await service.listConsultations({
      patientId,
      doctorId: doctorScope(req),
      status,
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      diagnosisKeyword,
      search,
      followUpOnly: followUpOnly === true || followUpOnly === 'true',
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};
