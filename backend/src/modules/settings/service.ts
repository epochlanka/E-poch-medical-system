import { prisma } from '../../lib/prisma';
import fs from 'fs';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NotFoundError, ValidationError } from './errors';

const execFileAsync = promisify(execFile);
const BACKUPS_DIR = path.resolve(__dirname, '../../../backups');

interface Actor {
  user_id: number;
  role: string;
}

// ---- Clinic Settings (single row, id=1) ----------------------------------------------------

// Lazily creates the default row on first read so a fresh/migrated DB always has one,
// without needing a seed-time dependency for every environment this runs in.
export const getClinicSettings = async () => {
  return prisma.clinicSettings.upsert({
    where: { id: 1 },
    update: {},
    create: { id: 1 },
    include: { updater: { select: { username: true } } },
  });
};

interface UpdateClinicSettingsInput {
  clinic_name?: string;
  clinic_address?: string;
  registration_number?: string;
  logo_url?: string;
  default_consultation_fee?: number;
  expiry_alert_threshold_days?: number;
  session_timeout_minutes?: number;
  account_lockout_minutes?: number;
}

export const updateClinicSettings = async (input: UpdateClinicSettingsInput, actor: Actor) => {
  if (input.clinic_name !== undefined && !input.clinic_name.trim()) throw new ValidationError('Clinic name cannot be empty');
  if (input.default_consultation_fee !== undefined && input.default_consultation_fee < 0) {
    throw new ValidationError('Default consultation fee cannot be negative');
  }
  if (input.expiry_alert_threshold_days !== undefined && input.expiry_alert_threshold_days < 1) {
    throw new ValidationError('Expiry alert threshold must be at least 1 day');
  }
  if (input.session_timeout_minutes !== undefined && input.session_timeout_minutes < 1) {
    throw new ValidationError('Session timeout must be at least 1 minute');
  }
  if (input.account_lockout_minutes !== undefined && input.account_lockout_minutes < 1) {
    throw new ValidationError('Account lockout duration must be at least 1 minute');
  }

  await prisma.clinicSettings.upsert({
    where: { id: 1 },
    update: { ...input, updated_by: actor.user_id },
    create: { id: 1, ...input, updated_by: actor.user_id },
  });

  return getClinicSettings();
};

// Read directly by other modules (e.g. Billing) via `prisma.clinicSettings` rather than
// importing this module — matches the project's no-cross-module-coupling convention.
export const getEffectiveConsultationFee = async (): Promise<number> => {
  const settings = await prisma.clinicSettings.findUnique({ where: { id: 1 } });
  return settings?.default_consultation_fee ?? 500;
};

// ---- Master Data Lists (medicine categories, payment methods, discount types) ---------------

export const MASTER_DATA_TYPES = ['MedicineCategory', 'PaymentMethod', 'DiscountType', 'MedicalCondition', 'DosageForm'] as const;
export type MasterDataType = (typeof MASTER_DATA_TYPES)[number];

interface ListMasterDataFilters {
  type?: string;
  includeInactive?: boolean;
}

export const listMasterData = async (filters: ListMasterDataFilters) => {
  return prisma.masterDataItem.findMany({
    where: { ...(filters.type ? { type: filters.type } : {}), ...(filters.includeInactive ? {} : { is_active: true }) },
    orderBy: [{ type: 'asc' }, { sort_order: 'asc' }, { value: 'asc' }],
  });
};

interface CreateMasterDataInput {
  type: string;
  value: string;
  sort_order?: number;
}

export const createMasterDataItem = async (input: CreateMasterDataInput) => {
  if (!MASTER_DATA_TYPES.includes(input.type as MasterDataType)) {
    throw new ValidationError(`type must be one of ${MASTER_DATA_TYPES.join(', ')}`);
  }
  if (!input.value.trim()) throw new ValidationError('value is required');

  const existing = await prisma.masterDataItem.findUnique({ where: { type_value: { type: input.type, value: input.value } } });
  if (existing) throw new ValidationError(`"${input.value}" already exists under ${input.type}`);

  return prisma.masterDataItem.create({ data: { type: input.type, value: input.value, sort_order: input.sort_order ?? 0 } });
};

interface UpdateMasterDataInput {
  value?: string;
  sort_order?: number;
  is_active?: boolean;
}

export const updateMasterDataItem = async (itemId: number, updates: UpdateMasterDataInput) => {
  const existing = await prisma.masterDataItem.findUnique({ where: { item_id: itemId } });
  if (!existing) throw new NotFoundError('Master data item not found');

  if (updates.value !== undefined) {
    if (!updates.value.trim()) throw new ValidationError('value cannot be empty');
    const clash = await prisma.masterDataItem.findUnique({ where: { type_value: { type: existing.type, value: updates.value } } });
    if (clash && clash.item_id !== itemId) throw new ValidationError(`"${updates.value}" already exists under ${existing.type}`);
  }

  return prisma.masterDataItem.update({ where: { item_id: itemId }, data: updates });
};

export const deleteMasterDataItem = async (itemId: number) => {
  const existing = await prisma.masterDataItem.findUnique({ where: { item_id: itemId } });
  if (!existing) throw new NotFoundError('Master data item not found');
  await prisma.masterDataItem.delete({ where: { item_id: itemId } });
};

// ---- Backup & Restore ------------------------------------------------------------------------

const ensureBackupsDir = () => {
  if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true });
};

const timestampedFilename = (prefix: string) => `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.dump`;

// DIRECT_URL, not DATABASE_URL — pg_dump/pg_restore parse the URL as a plain libpq connection
// string, which doesn't understand Prisma-only query params like DATABASE_URL's
// `connection_limit` and errors out on them.
const pgConnectionString = () => {
  const url = process.env.DIRECT_URL;
  if (!url) throw new ValidationError('DIRECT_URL is not configured — cannot back up or restore the database');
  return url;
};

export const createBackup = async (actor: Actor) => {
  ensureBackupsDir();

  const filename = timestampedFilename('backup');
  const destPath = path.join(BACKUPS_DIR, filename);

  // Custom format (-Fc): compressed, and the only format pg_restore can selectively inspect
  // (--list) or replay (--clean) against a live database — a plain SQL dump can't do either.
  await execFileAsync('pg_dump', ['--format=custom', '--file', destPath, pgConnectionString()], {
    maxBuffer: 1024 * 1024 * 64,
  });
  const { size } = await fs.promises.stat(destPath);

  const backup = await prisma.dbBackup.create({
    data: { filename, size_bytes: size, created_by: actor.user_id },
  });
  await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'CREATE', entity: 'DbBackup', entity_id: String(backup.backup_id) } });

  return backup;
};

export const listBackups = async () => {
  return prisma.dbBackup.findMany({ orderBy: { created_at: 'desc' }, include: { creator: { select: { username: true } } } });
};

// Reads the custom-format archive's table of contents without touching any database — a backup
// file existing on disk is not itself proof it's a valid, restorable archive.
export const verifyBackup = async (backupId: number) => {
  const backup = await prisma.dbBackup.findUnique({ where: { backup_id: backupId } });
  if (!backup) throw new NotFoundError('Backup not found');

  const backupPath = path.join(BACKUPS_DIR, backup.filename);
  if (!fs.existsSync(backupPath)) throw new ValidationError('Backup file is missing from disk');

  let ok = false;
  try {
    const { stdout } = await execFileAsync('pg_restore', ['--list', backupPath], { maxBuffer: 1024 * 1024 * 64 });
    ok = stdout.trim().length > 0;
  } catch {
    ok = false;
  }

  return prisma.dbBackup.update({ where: { backup_id: backupId }, data: { verified: ok, verified_at: new Date() } });
};

// Restores in place against the live database: drops existing objects first (--clean --if-exists)
// so pg_restore doesn't fail on "already exists", and skips ownership statements (--no-owner)
// since the pooled connection user isn't a superuser and can't reassign roles. Always takes a
// fresh pre-restore safety backup first, since restore is the one operation here with no undo
// once complete.
export const restoreBackup = async (backupId: number, actor: Actor) => {
  const backup = await prisma.dbBackup.findUnique({ where: { backup_id: backupId } });
  if (!backup) throw new NotFoundError('Backup not found');

  const backupPath = path.join(BACKUPS_DIR, backup.filename);
  if (!fs.existsSync(backupPath)) throw new ValidationError('Backup file is missing from disk');

  const safetyBackup = await createBackup(actor);
  const preRestoreFilename = safetyBackup.filename.replace('backup-', 'pre-restore-');
  await prisma.dbBackup.update({ where: { backup_id: safetyBackup.backup_id }, data: { filename: preRestoreFilename } });
  await fs.promises.rename(path.join(BACKUPS_DIR, safetyBackup.filename), path.join(BACKUPS_DIR, preRestoreFilename));

  await execFileAsync(
    'pg_restore',
    ['--clean', '--if-exists', '--no-owner', '--dbname', pgConnectionString(), backupPath],
    { maxBuffer: 1024 * 1024 * 64 }
  );

  await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'RESTORE', entity: 'DbBackup', entity_id: String(backupId) } });

  return {
    restoredFromBackupId: backupId,
    restoredFilename: backup.filename,
    warning: 'The live database has been replaced. Restart the backend process so every connection in its pool picks up the restored state consistently.',
  };
};

export const getBackupFile = async (backupId: number) => {
  const backup = await prisma.dbBackup.findUnique({ where: { backup_id: backupId } });
  if (!backup) throw new NotFoundError('Backup not found');

  const backupPath = path.join(BACKUPS_DIR, backup.filename);
  if (!fs.existsSync(backupPath)) throw new ValidationError('Backup file is missing from disk');

  return { path: backupPath, filename: backup.filename };
};
