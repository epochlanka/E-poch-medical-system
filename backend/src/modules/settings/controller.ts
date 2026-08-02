import { Request, Response } from 'express';
import path from 'path';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

// ---- Clinic Settings ----

export const getSettings = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.getClinicSettings());
  } catch (error) {
    handleError(req, res, error);
  }
};

export const updateSettings = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.updateClinicSettings(req.body, actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

// ---- Master Data ----

export const listMasterData = async (req: Request, res: Response) => {
  try {
    const { type, includeInactive } = req.query as any;
    res.status(200).json(await service.listMasterData({ type, includeInactive: includeInactive === 'true' }));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const createMasterDataItem = async (req: Request, res: Response) => {
  try {
    res.status(201).json(await service.createMasterDataItem(req.body));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const updateMasterDataItem = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.updateMasterDataItem(Number(req.params.itemId), req.body));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const deleteMasterDataItem = async (req: Request, res: Response) => {
  try {
    await service.deleteMasterDataItem(Number(req.params.itemId));
    res.status(204).send();
  } catch (error) {
    handleError(req, res, error);
  }
};

// ---- Backup & Restore ----

export const createBackup = async (req: Request, res: Response) => {
  try {
    res.status(201).json(await service.createBackup(actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const listBackups = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.listBackups());
  } catch (error) {
    handleError(req, res, error);
  }
};

export const verifyBackup = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.verifyBackup(Number(req.params.backupId)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const restoreBackup = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.restoreBackup(Number(req.params.backupId), actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const downloadBackup = async (req: Request, res: Response) => {
  try {
    const backups = await service.listBackups();
    const backup = backups.find((b) => b.backup_id === Number(req.params.backupId));
    if (!backup) return res.status(404).json({ message: 'Backup not found' });
    res.download(path.resolve(__dirname, '../../../backups', backup.filename), backup.filename);
  } catch (error) {
    handleError(req, res, error);
  }
};
