import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';

const actorId = (req: Request): number => (req.user as any).user_id;
const familyIdParam = (req: Request): number => Number(req.params.familyId);

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

export const list = async (req: Request, res: Response) => {
  try {
    const { search, status, familyType, city, page, limit } = req.query as any;
    const result = await service.listFamilies({
      search,
      status,
      familyType,
      city,
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
    res.status(200).json(await service.getFamilyStats());
  } catch (error) {
    handleError(req, res, error);
  }
};

export const create = async (req: Request, res: Response) => {
  try {
    const family = await service.createFamily(req.body, actorId(req));
    res.status(201).json(family);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getById = async (req: Request, res: Response) => {
  try {
    const family = await service.getFamilyById(familyIdParam(req));
    if (!family) return res.status(404).json({ message: 'Family not found' });
    res.status(200).json(family);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const update = async (req: Request, res: Response) => {
  try {
    const family = await service.updateFamily(familyIdParam(req), req.body, actorId(req));
    res.status(200).json(family);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const members = async (req: Request, res: Response) => {
  try {
    const result = await service.getFamilyMembers(familyIdParam(req));
    res.status(200).json(result);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const setHead = async (req: Request, res: Response) => {
  try {
    const family = await service.setHeadOfFamily(familyIdParam(req), req.body.patient_id, actorId(req));
    res.status(200).json(family);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const merge = async (req: Request, res: Response) => {
  try {
    const { primaryFamilyId, secondaryFamilyId, reason } = req.body;
    const family = await service.mergeFamilies(primaryFamilyId, secondaryFamilyId, actorId(req), reason);
    res.status(200).json(family);
  } catch (error) {
    handleError(req, res, error);
  }
};
