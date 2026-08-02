import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import { MASTER_DATA_TYPES } from './service';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const READ_ROLES = ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'];
const ADMIN_ONLY = ['Admin'];

const updateSettingsSchema = z.object({
  body: z.object({
    clinic_name: z.string().min(1).optional(),
    clinic_address: z.string().optional(),
    registration_number: z.string().optional(),
    logo_url: z.string().optional(),
    default_consultation_fee: z.number().min(0).optional(),
    expiry_alert_threshold_days: z.number().int().min(1).optional(),
  }),
});

router.get('/', requireRole(READ_ROLES), controller.getSettings);
router.put('/', requireRole(ADMIN_ONLY), validate(updateSettingsSchema), controller.updateSettings);

const masterDataListSchema = z.object({
  query: z.object({ type: z.enum(MASTER_DATA_TYPES).optional(), includeInactive: z.string().optional() }),
});
const masterDataCreateSchema = z.object({
  body: z.object({ type: z.enum(MASTER_DATA_TYPES), value: z.string().min(1), sort_order: z.number().int().optional() }),
});
const masterDataItemParamsSchema = z.object({ params: z.object({ itemId: z.coerce.number().int().positive() }) });
const masterDataUpdateSchema = z.object({
  params: z.object({ itemId: z.coerce.number().int().positive() }),
  body: z.object({ value: z.string().min(1).optional(), sort_order: z.number().int().optional(), is_active: z.boolean().optional() }),
});

router.get('/master-data', requireRole(READ_ROLES), validate(masterDataListSchema), controller.listMasterData);
router.post('/master-data', requireRole(ADMIN_ONLY), validate(masterDataCreateSchema), controller.createMasterDataItem);
router.put('/master-data/:itemId', requireRole(ADMIN_ONLY), validate(masterDataUpdateSchema), controller.updateMasterDataItem);
router.delete('/master-data/:itemId', requireRole(ADMIN_ONLY), validate(masterDataItemParamsSchema), controller.deleteMasterDataItem);

const backupIdParamsSchema = z.object({ params: z.object({ backupId: z.coerce.number().int().positive() }) });

router.post('/backups', requireRole(ADMIN_ONLY), controller.createBackup);
router.get('/backups', requireRole(ADMIN_ONLY), controller.listBackups);
router.post('/backups/:backupId/verify', requireRole(ADMIN_ONLY), validate(backupIdParamsSchema), controller.verifyBackup);
router.post('/backups/:backupId/restore', requireRole(ADMIN_ONLY), validate(backupIdParamsSchema), controller.restoreBackup);
router.get('/backups/:backupId/download', requireRole(ADMIN_ONLY), validate(backupIdParamsSchema), controller.downloadBackup);

export default router;
