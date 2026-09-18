import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError } from './errors';
import { respondWithServerError } from '../../errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
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
// Disabled after the migration to Supabase (Postgres): the old implementation worked by
// copying the local SQLite file directly (see settings/service.ts), which has no equivalent
// against a networked Postgres database. Rework with pg_dump/pg_restore (or rely on Supabase's
// own backups) before re-enabling.

const backupUnavailable = (_req: Request, res: Response) =>
  res.status(503).json({ message: 'Backup & restore is unavailable since the move to Supabase (Postgres).' });

export const createBackup = backupUnavailable;
export const listBackups = backupUnavailable;
export const verifyBackup = backupUnavailable;
export const restoreBackup = backupUnavailable;
export const downloadBackup = backupUnavailable;
