import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';
import { NotFoundError, ValidationError } from './errors';

const prisma = new PrismaClient();

// backend/prisma/dev.db, resolved from this file's own location rather than process.cwd() —
// DATABASE_URL="file:./dev.db" resolves relative to prisma/schema.prisma's directory, a
// recurring gotcha (backend/dev.db is NOT the real file).
const DEV_DB_PATH = path.resolve(__dirname, '../../../prisma/dev.db');
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

export const MASTER_DATA_TYPES = ['MedicineCategory', 'PaymentMethod', 'DiscountType'] as const;
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

const timestampedFilename = (prefix: string) => `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.db`;

export const createBackup = async (actor: Actor) => {
  ensureBackupsDir();
  if (!fs.existsSync(DEV_DB_PATH)) throw new ValidationError('No database file found to back up');

  const filename = timestampedFilename('backup');
  const destPath = path.join(BACKUPS_DIR, filename);
  await fs.promises.copyFile(DEV_DB_PATH, destPath);
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

// Opens the backup file (not the live DB) as its own SQLite datasource and runs SQLite's
// built-in integrity check — a backup file existing on disk is not itself proof it's restorable.
export const verifyBackup = async (backupId: number) => {
  const backup = await prisma.dbBackup.findUnique({ where: { backup_id: backupId } });
  if (!backup) throw new NotFoundError('Backup not found');

  const backupPath = path.join(BACKUPS_DIR, backup.filename);
  if (!fs.existsSync(backupPath)) throw new ValidationError('Backup file is missing from disk');

  const checkClient = new PrismaClient({ datasources: { db: { url: `file:${backupPath}` } } });
  let ok = false;
  try {
    const result = await checkClient.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check');
    ok = result.length === 1 && result[0].integrity_check === 'ok';
  } catch {
    ok = false;
  } finally {
    await checkClient.$disconnect();
  }

  return prisma.dbBackup.update({ where: { backup_id: backupId }, data: { verified: ok, verified_at: new Date() } });
};

// Restores by atomic rename (write to a temp file on the same volume, then rename over the
// live DB) rather than an in-place copy — minimizes the window where a concurrent reader could
// see a half-written file. Always takes a fresh pre-restore safety backup first, since restore
// is the one operation here with no undo once complete.
export const restoreBackup = async (backupId: number, actor: Actor) => {
  const backup = await prisma.dbBackup.findUnique({ where: { backup_id: backupId } });
  if (!backup) throw new NotFoundError('Backup not found');

  const backupPath = path.join(BACKUPS_DIR, backup.filename);
  if (!fs.existsSync(backupPath)) throw new ValidationError('Backup file is missing from disk');

  const safetyBackup = await createBackup(actor);
  await prisma.dbBackup.update({ where: { backup_id: safetyBackup.backup_id }, data: { filename: safetyBackup.filename.replace('backup-', 'pre-restore-') } });
  await fs.promises.rename(path.join(BACKUPS_DIR, safetyBackup.filename), path.join(BACKUPS_DIR, safetyBackup.filename.replace('backup-', 'pre-restore-')));

  const tmpPath = `${DEV_DB_PATH}.restoring`;
  await fs.promises.copyFile(backupPath, tmpPath);
  await fs.promises.rename(tmpPath, DEV_DB_PATH);

  await prisma.auditLog.create({ data: { user_id: actor.user_id, action: 'RESTORE', entity: 'DbBackup', entity_id: String(backupId) } });

  return {
    restoredFromBackupId: backupId,
    restoredFilename: backup.filename,
    warning: 'The database file has been replaced on disk. Restart the backend process for all connections to see the restored state consistently.',
  };
};
