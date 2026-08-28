import { Request, Response } from 'express';
import * as service from './service';
import { NotFoundError, ValidationError, ForbiddenError, DocxError, ConversionError } from './errors';

const actor = (req: Request) =>
  req.user as any as { user_id: number; role: string; username: string; registration_number?: string | null };

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof NotFoundError) return res.status(404).json({ message: error.message });
  if (error instanceof ForbiddenError) return res.status(403).json({ message: error.message });
  if (error instanceof ValidationError || error instanceof DocxError) return res.status(400).json({ message: error.message });
  if (error instanceof ConversionError) return res.status(503).json({ message: error.message });
  req.log.error(error);
  return res.status(500).json({ message: 'Internal Server Error' });
};

const fileBuf = (req: Request): { buf?: Buffer; name?: string } => {
  const f = (req as any).file;
  return f ? { buf: f.buffer as Buffer, name: f.originalname as string } : {};
};

const metaFromBody = (req: Request) => ({
  name: req.body.name,
  letter_type: req.body.letter_type,
  clinic_name: req.body.clinic_name,
  clinic_address: req.body.clinic_address,
  phone_number: req.body.phone_number,
  doctor_name: req.body.doctor_name,
  doctor_qualification: req.body.doctor_qualification,
  doctor_department: req.body.doctor_department,
  registration_number: req.body.registration_number,
});

// ---- Templates ----------------------------------------------------------------------

export const listTemplates = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.listTemplates(req.query.activeOnly === 'true'));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getTemplate = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.getTemplate(Number(req.params.templateId)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { buf, name } = fileBuf(req);
    res.status(201).json(await service.createTemplate(metaFromBody(req), buf, name, actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.updateTemplateMeta(Number(req.params.templateId), metaFromBody(req), actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const replaceTemplateDocx = async (req: Request, res: Response) => {
  try {
    const { buf, name } = fileBuf(req);
    res.status(200).json(await service.replaceTemplateDocx(Number(req.params.templateId), buf, name, actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const setTemplateActive = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.setTemplateActive(Number(req.params.templateId), req.body.is_active, actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    await service.deleteTemplate(Number(req.params.templateId), actor(req));
    res.status(204).end();
  } catch (error) {
    handleError(req, res, error);
  }
};

export const previewTemplateSample = async (req: Request, res: Response) => {
  try {
    const pdf = await service.previewTemplateSample(Number(req.params.templateId));
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="template-preview.pdf"');
    res.status(200).send(pdf);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const downloadBlankTemplate = async (req: Request, res: Response) => {
  try {
    service.streamBlankTemplate(res);
  } catch (error) {
    handleError(req, res, error);
  }
};

// ---- Issue / preview ---------------------------------------------------------------

export const previewLetter = async (req: Request, res: Response) => {
  try {
    const pdf = await service.previewLetter(
      { templateId: req.body.templateId, appointmentId: req.body.appointmentId, bodyContent: req.body.bodyContent ?? '' },
      actor(req)
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="letter-preview.pdf"');
    res.status(200).send(pdf);
  } catch (error) {
    handleError(req, res, error);
  }
};

export const issueLetter = async (req: Request, res: Response) => {
  try {
    const { pdf, issuedLetterId } = await service.issueLetter(
      { templateId: req.body.templateId, appointmentId: req.body.appointmentId, bodyContent: req.body.bodyContent ?? '' },
      actor(req)
    );
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="letter.pdf"');
    res.setHeader('X-Issued-Letter-Id', issuedLetterId ? String(issuedLetterId) : 'none');
    res.status(200).send(pdf);
  } catch (error) {
    handleError(req, res, error);
  }
};

// ---- Issued-letter history --------------------------------------------------------

export const listIssuedLettersForPatient = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.listIssuedLettersForPatient(String(req.query.patientId)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const getIssuedLetterDetail = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.getIssuedLetterDetail(Number(req.params.issuedLetterId)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const streamIssuedLetterPdf = async (req: Request, res: Response) => {
  try {
    await service.streamIssuedLetterPdf(Number(req.params.issuedLetterId), res);
  } catch (error) {
    handleError(req, res, error);
  }
};
