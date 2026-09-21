import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError, RestoreDisabledError } from './errors';
import { respondWithServerError } from '../../errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  if (error instanceof RestoreDisabledError) return res.status(501).json({ message: error.message });
  return respondWithServerError(req, res, error, 'settings');
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

export const uploadLogo = async (req: Request, res: Response) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'No logo file provided' });
    const logo_url = `/uploads/settings/${req.file.filename}`;
    res.status(200).json(await service.updateClinicSettings({ logo_url }, actor(req)));
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
// Reworked for Supabase (Postgres) using pg_dump/pg_restore — the original implementation
// copied a local SQLite file directly, which has no equivalent against a networked Postgres
// database. This is a second, independent copy alongside Supabase's own managed backups
// (different failure modes: this survives a Supabase account/project issue, theirs survives
// this machine's disk failing).

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
    const { path, filename } = await service.getBackupFile(Number(req.params.backupId));
    res.download(path, filename);
  } catch (error) {
    handleError(req, res, error);
  }
};
