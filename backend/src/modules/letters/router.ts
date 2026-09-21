import { Router, Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import multer from 'multer';
import path from 'path';
import { validate } from '../../middlewares/validate';
import { requireAuth, requireRole } from '../../middlewares/auth';
import * as controller from './controller';

const router = Router();

router.use(requireAuth);

const ADMIN_ONLY = ['Admin'];
const READ_ROLES = ['Admin', 'Doctor', 'Receptionist'];
const ISSUE_ROLES = ['Admin', 'Doctor'];

// ---- .docx upload (Multer, in-memory — the service writes the file itself) --------------

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const okExt = path.extname(file.originalname).toLowerCase() === '.docx';
    if (file.mimetype !== DOCX_MIME && !okExt) return cb(new Error('Only Microsoft Word .docx files are allowed'));
    cb(null, true);
  },
});

const uploadDocx = (req: Request, res: Response, next: NextFunction) => {
  upload.single('file')(req, res, (err: unknown) => {
    if (err) return res.status(400).json({ message: err instanceof Error ? err.message : 'Upload failed' });
    next();
  });
};

// ---- Validation schemas (JSON routes only; multipart bodies are checked in the service) --

const templateIdParams = z.object({ templateId: z.coerce.number().int().positive() });
const setActiveSchema = z.object({ params: templateIdParams, body: z.object({ is_active: z.boolean() }) });
const letterActionSchema = z.object({
  body: z.object({
    templateId: z.coerce.number().int().positive(),
    appointmentId: z.coerce.number().int().positive(),
    bodyContent: z.string().optional(),
  }),
});
const issuedIdParamsSchema = z.object({ params: z.object({ issuedLetterId: z.coerce.number().int().positive() }) });
const listIssuedSchema = z.object({ query: z.object({ patientId: z.string().min(1) }) });

// ---- Routes ---------------------------------------------------------------------------
// Static segments before the generic /:templateId catch-all, per this codebase's convention.

router.get('/templates/blank.docx', requireRole(ADMIN_ONLY), controller.downloadBlankTemplate);

router.get('/templates', requireRole(READ_ROLES), controller.listTemplates);
router.post('/templates', requireRole(ADMIN_ONLY), uploadDocx, controller.createTemplate);
router.get('/templates/:templateId', requireRole(READ_ROLES), validate(z.object({ params: templateIdParams })), controller.getTemplate);
router.put('/templates/:templateId', requireRole(ADMIN_ONLY), validate(z.object({ params: templateIdParams })), controller.updateTemplate);
router.post('/templates/:templateId/docx', requireRole(ADMIN_ONLY), validate(z.object({ params: templateIdParams })), uploadDocx, controller.replaceTemplateDocx);
router.patch('/templates/:templateId/active', requireRole(ADMIN_ONLY), validate(setActiveSchema), controller.setTemplateActive);
router.delete('/templates/:templateId', requireRole(ADMIN_ONLY), validate(z.object({ params: templateIdParams })), controller.deleteTemplate);
router.get('/templates/:templateId/preview.pdf', requireRole(READ_ROLES), validate(z.object({ params: templateIdParams })), controller.previewTemplateSample);

router.post('/preview', requireRole(ISSUE_ROLES), validate(letterActionSchema), controller.previewLetter);
router.post('/issue', requireRole(ISSUE_ROLES), validate(letterActionSchema), controller.issueLetter);

router.get('/issued', requireRole(READ_ROLES), validate(listIssuedSchema), controller.listIssuedLettersForPatient);
router.get('/issued/:issuedLetterId', requireRole(READ_ROLES), validate(issuedIdParamsSchema), controller.getIssuedLetterDetail);
router.get('/issued/:issuedLetterId/pdf', requireRole(READ_ROLES), validate(issuedIdParamsSchema), controller.streamIssuedLetterPdf);

export default router;
