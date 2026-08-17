import { Request, Response } from 'express';
import * as service from './service';
import { streamPatientHistoryPdf } from './pdf';
import { NotFoundError, ValidationError, DuplicatePatientError } from './errors';

const actorId = (req: Request): number => (req.user as any).user_id;
const patientIdParam = (req: Request): string => req.params.patientId as string;

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  if (error instanceof DuplicatePatientError) {
    return res.status(409).json({ message: error.message, conflictingPatient: error.conflictingPatient });
  }
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

const parseTypes = (types?: string) => (types ? (types.split(',').map((t) => t.trim()) as any) : undefined);

export const list = async (req: Request, res: Response) => {
  try {
    const { search, status, gender, bloodGroup, ageFrom, ageTo, familyId, page, limit } = req.query as any;
    const result = await service.listPatients({
      search,
      status,
      gender,
      bloodGroup,
      ageFrom: ageFrom ? Number(ageFrom) : undefined,
      ageTo: ageTo ? Number(ageTo) : undefined,
      familyId: familyId ? Number(familyId) : undefined,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const stats = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.getPatientStats());
  } catch (error) {
    handleError(req, res, error);
  }
};

export const checkDuplicate = async (req: Request, res: Response) => {
  try {
    const { nic, guardianNic, dob } = req.query as any;
    const result = await service.checkDuplicate({ nic, guardianNic, dob: dob ? new Date(dob) : undefined });
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const register = async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = await service.registerPatient(
      {
        full_name: body.full_name,
        dob: new Date(body.dob),
        gender: body.gender,
        nic: body.nic,
        guardian_nic: body.guardian_nic,
        phone: body.phone,
        blood_group: body.blood_group,
        allergies: body.allergies,
        nationality: body.nationality,
        marital_status: body.marital_status,
        occupation: body.occupation,
        employer_school: body.employer_school,
        relationship_to_head: body.relationship_to_head,
        chronic_conditions: body.chronic_conditions,
        current_medications: body.current_medications,
        emergency_contact_name: body.emergency_contact_name,
        emergency_contact_phone: body.emergency_contact_phone,
        family_id: body.family_id,
        new_family: body.new_family,
      },
      actorId(req)
    );
    res.status(201).json({ patient: result.patient, duplicateFlags: result.duplicateFlags });
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const patient = await service.getPatientById(patientIdParam(req));
    if (!patient) return res.status(404).json({ message: 'Patient not found' });
    res.status(200).json(patient);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const patient = await service.updatePatient(patientIdParam(req), req.body, actorId(req));
    res.status(200).json(patient);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const setStatus = async (req: Request, res: Response) => {
  try {
    const { is_active, reason } = req.body;
    const patient = await service.setPatientActive(patientIdParam(req), is_active, actorId(req), reason);
    res.status(200).json(patient);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const uploadPhoto = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No photo file provided' });
    const photoUrl = `/uploads/patients/${req.file.filename}`;
    const patient = await service.setPatientPhoto(patientIdParam(req), photoUrl, actorId(req));
    res.status(200).json(patient);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const history = async (req: Request, res: Response) => {
  try {
    const { from, to, types } = req.query as any;
    const events = await service.getPatientHistory(patientIdParam(req), {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      types: parseTypes(types),
    });
    res.status(200).json(events);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const historyPdf = async (req: Request, res: Response) => {
  try {
    const { from, to, types } = req.query as any;
    const patient = await service.getPatientById(patientIdParam(req));
    if (!patient) return res.status(404).json({ message: 'Patient not found' });

    const events = await service.getPatientHistory(patientIdParam(req), {
      from: from ? new Date(from) : undefined,
      to: to ? new Date(to) : undefined,
      types: parseTypes(types),
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${patient.patient_id}-history.pdf"`);
    streamPatientHistoryPdf(patient, events, res);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const auditLog = async (req: Request, res: Response) => {
  try {
    const { page, limit } = req.query as any;
    const result = await service.getPatientAuditLog(patientIdParam(req), page ? Number(page) : undefined, limit ? Number(limit) : undefined);
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listDuplicates = async (req: Request, res: Response) => {
  try {
    const { status, search, matchBand, dateFrom, dateTo, reviewedBy, page, limit } = req.query as any;
    const flags = await service.listDuplicateFlags({
      status,
      search,
      matchBand,
      dateFrom: dateFrom ? new Date(dateFrom) : undefined,
      dateTo: dateTo ? new Date(dateTo) : undefined,
      reviewedBy,
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    res.status(200).json(flags);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const duplicateStats = async (req: Request, res: Response) => {
  try {
    const stats = await service.getDuplicateFlagStats();
    res.status(200).json(stats);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const dismissDuplicate = async (req: Request, res: Response) => {
  try {
    const flag = await service.dismissDuplicateFlag(Number(req.params.flagId), actorId(req));
    res.status(200).json(flag);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const mergeDuplicate = async (req: Request, res: Response) => {
  try {
    const flag = await service.mergeDuplicateFlag(Number(req.params.flagId), req.body.primaryPatientId, actorId(req));
    res.status(200).json(flag);
  } catch (error) {
    handleError(req, res, error);
  }
};
