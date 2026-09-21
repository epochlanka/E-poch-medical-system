import { prisma } from '../../lib/prisma';
import { BACKUPS_DIR, UPLOADS_DIR } from '../../config/paths';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { NotFoundError, ValidationError, RestoreDisabledError } from './errors';

const execFileAsync = promisify(execFile);

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

// ---- Backup ------------------------------------------------------------------------------------
// A backup is ONE archive (.tar) holding everything needed to rebuild the clinic's data:
//   database.dump  - pg_dump custom format of the whole database
//   uploads/       - patient photos, consultation attachments, lab reports, letter templates and
//                    issued letters (these live on this machine's disk, NOT in the database, so a
//                    database-only backup silently loses them)
// Recovery is deliberately NOT a button: restoring rewrites the live database, which must happen
// with the application stopped (deploy/restore.sh). This module only creates, lists, verifies and
// serves archives.

const ARCHIVE_EXT = '.tar';
const LEGACY_DUMP_EXT = '.dump'; // database-only archives made before uploads were included

const ensureDir = (dir: string) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const timestampedFilename = (prefix: string) => `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}${ARCHIVE_EXT}`;

// DIRECT_URL, not DATABASE_URL — pg_dump/pg_restore parse the URL as a plain libpq connection
// string, which doesn't understand Prisma-only query params like DATABASE_URL's
// `connection_limit` and errors out on them.
const pgConnectionString = () => {
  const url = process.env.DIRECT_URL;
  if (!url) throw new ValidationError('DIRECT_URL is not configured — cannot back up the database');
  return url;
};

const BIG = { maxBuffer: 1024 * 1024 * 64 };

const withTempDir = async <T>(fn: (dir: string) => Promise<T>): Promise<T> => {
  const dir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'epoch-backup-'));
  try {
    return await fn(dir);
  } finally {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
};

export const createBackup = async (actor: Actor) => {
  ensureDir(BACKUPS_DIR);
  ensureDir(UPLOADS_DIR);

  const filename = timestampedFilename('backup');
  const destPath = path.join(BACKUPS_DIR, filename);
  const partialPath = `${destPath}.partial`;

  await withTempDir(async (work) => {
    // Custom format (-Fc): compressed, and the only format pg_restore can selectively inspect
    // (--list) or replay (--clean) — a plain SQL dump can't do either.
    await execFileAsync('pg_dump', ['--format=custom', '--file', path.join(work, 'database.dump'), pgConnectionString()], BIG);

    // Stage a directory that references the live uploads folder, then archive it following the
    // link (-h) — portable across GNU tar and the BusyBox tar the production image ships.
    await fs.promises.symlink(UPLOADS_DIR, path.join(work, 'uploads'));
    await execFileAsync('tar', ['-chf', partialPath, '-C', work, 'database.dump', 'uploads'], BIG);
  });
  // Written under a temporary name and renamed only when complete: a half-written archive must
  // never be listed (or later trusted) as a backup.
  await fs.promises.rename(partialPath, destPath);
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

// A backup file existing on disk is not proof it can be restored. This opens the archive, checks it
// really contains the database dump, and asks pg_restore to read that dump's table of contents
// (which fails on a truncated or corrupt file). It does NOT restore anything — a full recovery drill
// into an isolated database is the real proof (deploy/restore.sh --drill).
export const verifyBackup = async (backupId: number) => {
  const backup = await prisma.dbBackup.findUnique({ where: { backup_id: backupId } });
  if (!backup) throw new NotFoundError('Backup not found');

  const backupPath = path.join(BACKUPS_DIR, backup.filename);
  if (!fs.existsSync(backupPath)) throw new ValidationError('Backup file is missing from disk');

  let ok = false;
  try {
    if (backup.filename.endsWith(LEGACY_DUMP_EXT)) {
      const { stdout } = await execFileAsync('pg_restore', ['--list', backupPath], BIG);
      ok = stdout.trim().length > 0;
    } else {
      const { stdout: listing } = await execFileAsync('tar', ['-tf', backupPath], BIG);
      const hasDump = listing.split('\n').some((entry) => entry.trim().replace(/^\.\//, '') === 'database.dump');
      if (hasDump) {
        ok = await withTempDir(async (work) => {
          await execFileAsync('tar', ['-xf', backupPath, '-C', work, 'database.dump'], BIG);
          const { stdout } = await execFileAsync('pg_restore', ['--list', path.join(work, 'database.dump')], BIG);
          return stdout.trim().length > 0;
        });
      }
    }
  } catch {
    ok = false;
  }

  return prisma.dbBackup.update({ where: { backup_id: backupId }, data: { verified: ok, verified_at: new Date() } });
};

// Restore is intentionally not performed by the running application. Replaying a dump into the
// LIVE database while requests are being served is not safe: it drops and recreates tables under
// active connections, cannot be atomic across the archive, and restoring the database also replaces
// the backup catalog (DbBackup) itself. Use deploy/restore.sh, which stops the app, restores inside
// a single transaction, and restores the uploaded files together with the database.
export const restoreBackup = async (_backupId: number, _actor: Actor): Promise<never> => {
  throw new RestoreDisabledError(
    'Restoring from inside the application is disabled: it must be done as a controlled maintenance procedure with the application stopped. See deploy/restore.sh.'
  );
};

export const getBackupFile = async (backupId: number) => {
  const backup = await prisma.dbBackup.findUnique({ where: { backup_id: backupId } });
  if (!backup) throw new NotFoundError('Backup not found');

  const backupPath = path.join(BACKUPS_DIR, backup.filename);
  if (!fs.existsSync(backupPath)) throw new ValidationError('Backup file is missing from disk');

  return { path: backupPath, filename: backup.filename };
};
