import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';
import { PERMISSION_MATRIX } from './permissionMatrix';
import { respondWithServerError } from '../../errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  return respondWithServerError(req, res, error, 'security');
};

export const listUsers = async (req: Request, res: Response) => {
  try {
    const { includeInactive } = req.query as any;
    res.status(200).json(await service.listUsers(includeInactive === 'true'));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getUser = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.getUserById(Number(req.params.userId)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const createUser = async (req: Request, res: Response) => {
  try {
    res.status(201).json(await service.createUser(req.body, actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.updateUser(Number(req.params.userId), req.body, actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const resetPassword = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.resetPassword(Number(req.params.userId), req.body.newPassword, actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const unlockUser = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.unlockUser(Number(req.params.userId), actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listSessions = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.listActiveSessions());
  } catch (error) {
    handleError(req, res, error);
  }
};

export const revokeSession = async (req: Request, res: Response) => {
  try {
    await service.revokeSession(Number(req.params.sessionId), actor(req));
    res.status(204).send();
  } catch (error) {
    handleError(req, res, error);
  }
};

export const permissionMatrix = (_req: Request, res: Response) => {
  res.status(200).json(PERMISSION_MATRIX);
};
