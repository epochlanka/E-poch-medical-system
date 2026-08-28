import { PrismaClient } from '@prisma/client';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { Response } from 'express';
import { NotFoundError, ValidationError, ForbiddenError, DocxError } from './errors';
import {
  assertValidDocx,
  extractPlaceholders,
  buildPlaceholderReport,
  fillDocx,
  PlaceholderReport,
} from './docx';
import {
  buildPlaceholderData,
  buildSamplePlaceholderData,
  TemplateLetterhead,
} from './placeholderData';
import { convertDocxToPdf } from './libreoffice';

const prisma = new PrismaClient();

// uploads/letter-templates holds every uploaded template version; uploads/issued-letters holds
// the frozen .docx + .pdf of each issued letter. Both are served ONLY through the authenticated
// routes in this module — never the public /uploads static handler — since letters are patient
// documents.
const backendRoot = path.join(__dirname, '..', '..', '..');
export const templatesDir = path.join(backendRoot, 'uploads', 'letter-templates');
export const issuedDir = path.join(backendRoot, 'uploads', 'issued-letters');
export const blankTemplatePath = path.join(__dirname, 'assets', 'blank-letter-template.docx');
fs.mkdirSync(templatesDir, { recursive: true });
fs.mkdirSync(issuedDir, { recursive: true });

interface Actor {
  user_id: number;
  role: string;
  username: string;
  registration_number?: string | null;
}

const assertAdmin = (actor: Actor) => {
  if (actor.role !== 'Admin') throw new ForbiddenError('Only an Admin can manage letter templates');
};

// ---- Template metadata (Admin only) -----------------------------------------------------

export interface TemplateMetaInput {
  name?: string;
  letter_type?: string;
  clinic_name?: string | null;
  clinic_address?: string | null;
  phone_number?: string | null;
  doctor_name?: string | null;
  doctor_qualification?: string | null;
  doctor_department?: string | null;
  registration_number?: string | null;
}

const cleanMeta = (input: TemplateMetaInput) => {
  const s = (v: string | null | undefined) => {
    if (v === undefined) return undefined;
    const t = (v ?? '').trim();
    return t.length ? t : null;
  };
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.letter_type !== undefined ? { letter_type: input.letter_type.trim() || 'General' } : {}),
    clinic_name: s(input.clinic_name),
    clinic_address: s(input.clinic_address),
    phone_number: s(input.phone_number),
    doctor_name: s(input.doctor_name),
    doctor_qualification: s(input.doctor_qualification),
    doctor_department: s(input.doctor_department),
    registration_number: s(input.registration_number),
  };
};

const templateInclude = {
  current_version: {
    select: { version_id: true, version_number: true, original_filename: true, placeholder_report_json: true, uploaded_at: true },
  },
  _count: { select: { versions: true, issued_letters: true } },
} as const;

const toTemplateDto = (t: any) => ({
  letter_template_id: t.letter_template_id,
  name: t.name,
  letter_type: t.letter_type,
  is_active: t.is_active,
  clinic_name: t.clinic_name,
  clinic_address: t.clinic_address,
  phone_number: t.phone_number,
  doctor_name: t.doctor_name,
  doctor_qualification: t.doctor_qualification,
  doctor_department: t.doctor_department,
  registration_number: t.registration_number,
  created_at: t.created_at,
  updated_at: t.updated_at,
  version_count: t._count?.versions ?? 0,
  issued_count: t._count?.issued_letters ?? 0,
  current_version: t.current_version
    ? {
        version_id: t.current_version.version_id,
        version_number: t.current_version.version_number,
        original_filename: t.current_version.original_filename,
        uploaded_at: t.current_version.uploaded_at,
        placeholder_report: JSON.parse(t.current_version.placeholder_report_json) as PlaceholderReport,
      }
    : null,
});

export const listTemplates = async (activeOnly = false) => {
  const rows = await prisma.letterTemplate.findMany({
    where: activeOnly ? { is_active: true } : {},
    include: templateInclude,
    orderBy: { name: 'asc' },
  });
  return rows.map(toTemplateDto);
};

const getTemplateRow = async (id: number) => {
  const t = await prisma.letterTemplate.findUnique({ where: { letter_template_id: id }, include: templateInclude });
  if (!t) throw new NotFoundError('Letter template not found');
  return t;
};

export const getTemplate = async (id: number) => toTemplateDto(await getTemplateRow(id));

const writeVersionFile = (templateId: number, versionNumber: number, buf: Buffer) => {
  const filename = `t${templateId}-v${versionNumber}-${Date.now()}.docx`;
  fs.writeFileSync(path.join(templatesDir, filename), buf);
  return filename;
};

// Validates the upload, records a version, and returns the report so the caller can surface
// warnings (unknown placeholders, no {{LETTER_BODY}}) without blocking the save.
const ingestDocx = (buf: Buffer): { placeholders: string[]; report: PlaceholderReport } => {
  assertValidDocx(buf);
  const placeholders = extractPlaceholders(buf);
  return { placeholders, report: buildPlaceholderReport(placeholders) };
};

export const createTemplate = async (
  meta: TemplateMetaInput,
  docxBuf: Buffer | undefined,
  originalFilename: string | undefined,
  actor: Actor
) => {
  assertAdmin(actor);
  if (!meta.name?.trim()) throw new ValidationError('Template name is required');
  if (!docxBuf) throw new ValidationError('A .docx template file is required');

  const { report } = ingestDocx(docxBuf);

  const template = await prisma.letterTemplate.create({
    data: {
      name: meta.name.trim(),
      letter_type: meta.letter_type?.trim() || 'General',
      ...cleanMeta({ ...meta, name: undefined, letter_type: undefined }),
      created_by: actor.user_id,
    },
  });

  const filename = writeVersionFile(template.letter_template_id, 1, docxBuf);
  const version = await prisma.letterTemplateVersion.create({
    data: {
      letter_template_id: template.letter_template_id,
      version_number: 1,
      docx_filename: filename,
      original_filename: originalFilename || `${meta.name.trim()}.docx`,
      placeholder_report_json: JSON.stringify(report),
      uploaded_by: actor.user_id,
    },
  });
  await prisma.letterTemplate.update({
    where: { letter_template_id: template.letter_template_id },
    data: { current_version_id: version.version_id },
  });

  return getTemplate(template.letter_template_id);
};

export const updateTemplateMeta = async (id: number, meta: TemplateMetaInput, actor: Actor) => {
  assertAdmin(actor);
  await getTemplateRow(id);
  if (meta.name !== undefined && !meta.name.trim()) throw new ValidationError('Template name is required');
  await prisma.letterTemplate.update({
    where: { letter_template_id: id },
    data: { ...cleanMeta(meta), updated_by: actor.user_id },
  });
  return getTemplate(id);
};

export const replaceTemplateDocx = async (
  id: number,
  docxBuf: Buffer | undefined,
  originalFilename: string | undefined,
  actor: Actor
) => {
  assertAdmin(actor);
  const template = await getTemplateRow(id);
  if (!docxBuf) throw new ValidationError('A .docx template file is required');

  const { report } = ingestDocx(docxBuf);
  const nextNumber = (await prisma.letterTemplateVersion.count({ where: { letter_template_id: id } })) + 1;
  const filename = writeVersionFile(id, nextNumber, docxBuf);

  const version = await prisma.letterTemplateVersion.create({
    data: {
      letter_template_id: id,
      version_number: nextNumber,
      docx_filename: filename,
      original_filename: originalFilename || `${template.name}.docx`,
      placeholder_report_json: JSON.stringify(report),
      uploaded_by: actor.user_id,
    },
  });
  await prisma.letterTemplate.update({
    where: { letter_template_id: id },
    data: { current_version_id: version.version_id, updated_by: actor.user_id },
  });
  return getTemplate(id);
};

export const setTemplateActive = async (id: number, isActive: boolean, actor: Actor) => {
  assertAdmin(actor);
  await getTemplateRow(id);
  await prisma.letterTemplate.update({
    where: { letter_template_id: id },
    data: { is_active: isActive, updated_by: actor.user_id },
  });
  return getTemplate(id);
};

export const deleteTemplate = async (id: number, actor: Actor) => {
  assertAdmin(actor);
  const template = await prisma.letterTemplate.findUnique({
    where: { letter_template_id: id },
    include: { versions: true },
  });
  if (!template) throw new NotFoundError('Letter template not found');

  // Break the self-reference, drop the versions, then the template. Issued letters survive:
  // their FK is SetNull and they are served from their own frozen files, not the template.
  await prisma.$transaction([
    prisma.letterTemplate.update({ where: { letter_template_id: id }, data: { current_version_id: null } }),
    prisma.letterTemplateVersion.deleteMany({ where: { letter_template_id: id } }),
    prisma.letterTemplate.delete({ where: { letter_template_id: id } }),
  ]);

  for (const v of template.versions) {
    fs.rm(path.join(templatesDir, v.docx_filename), { force: true }, () => undefined);
  }
};

// ---- Rendering -------------------------------------------------------------------------

const readVersionFile = (docxFilename: string): Buffer => {
  const p = path.join(templatesDir, docxFilename);
  if (!fs.existsSync(p)) throw new NotFoundError('The template file for this version is missing on disk');
  return fs.readFileSync(p);
};

const templateLetterhead = (t: any): TemplateLetterhead => ({
  clinic_name: t.clinic_name,
  clinic_address: t.clinic_address,
  phone_number: t.phone_number,
  doctor_name: t.doctor_name,
  doctor_qualification: t.doctor_qualification,
  doctor_department: t.doctor_department,
  registration_number: t.registration_number,
});

const currentVersionRowOrThrow = async (templateId: number) => {
  const t = await prisma.letterTemplate.findUnique({
    where: { letter_template_id: templateId },
    include: { current_version: true },
  });
  if (!t) throw new NotFoundError('Letter template not found');
  if (!t.current_version) throw new DocxError('This template has no uploaded Word document yet');
  return { template: t, version: t.current_version };
};

// Admin preview — fills the live version with sample data. Never persists anything.
export const previewTemplateSample = async (templateId: number): Promise<Buffer> => {
  const { template, version } = await currentVersionRowOrThrow(templateId);
  const filled = fillDocx(readVersionFile(version.docx_filename), buildSamplePlaceholderData(templateLetterhead(template)));
  return convertDocxToPdf(filled);
};

const loadAppointmentContext = async (appointmentId: number) => {
  const appointment = await prisma.appointment.findUnique({
    where: { appointment_id: appointmentId },
    include: {
      patient: { select: { patient_id: true, full_name: true, dob: true } },
      consultation: { select: { consultation_id: true } },
    },
  });
  if (!appointment) throw new NotFoundError('Appointment not found');
  return appointment;
};

interface LetterActionInput {
  templateId: number;
  appointmentId: number;
  bodyContent: string;
}

const renderLetter = async (input: LetterActionInput, actor: Actor) => {
  const { template, version } = await currentVersionRowOrThrow(input.templateId);
  const appointment = await loadAppointmentContext(input.appointmentId);
  const data = buildPlaceholderData({
    template: templateLetterhead(template),
    appointment: {
      patient: appointment.patient ? { full_name: appointment.patient.full_name, dob: appointment.patient.dob } : null,
      temp_patient_name: appointment.temp_patient_name,
      temp_patient_age: appointment.temp_patient_age,
    },
    actorUser: { username: actor.username, registration_number: actor.registration_number },
    bodyContent: input.bodyContent,
  });
  const filledDocx = fillDocx(readVersionFile(version.docx_filename), data);
  const pdf = await convertDocxToPdf(filledDocx);
  return { template, version, appointment, data, filledDocx, pdf };
};

// Doctor draft preview — same pipeline as issue, but nothing is written.
export const previewLetter = async (input: LetterActionInput, actor: Actor): Promise<Buffer> => {
  const { pdf } = await renderLetter(input, actor);
  return pdf;
};

// Printing IS issuing. For a registered patient the filled .docx and its PDF are frozen to
// disk and an IssuedLetter row is created; a temporary walk-in gets the identical PDF back but
// nothing is persisted and no patient record is created.
export const issueLetter = async (
  input: LetterActionInput,
  actor: Actor
): Promise<{ pdf: Buffer; issuedLetterId: number | null }> => {
  const { template, version, appointment, data, filledDocx, pdf } = await renderLetter(input, actor);

  if (!appointment.patient_id || appointment.is_temporary) {
    return { pdf, issuedLetterId: null };
  }

  const token = crypto.randomUUID();
  const docxName = `issued-${token}.docx`;
  const pdfName = `issued-${token}.pdf`;
  fs.writeFileSync(path.join(issuedDir, docxName), filledDocx);
  fs.writeFileSync(path.join(issuedDir, pdfName), pdf);

  const issued = await prisma.issuedLetter.create({
    data: {
      letter_template_id: template.letter_template_id,
      template_version_id: version.version_id,
      patient_id: appointment.patient_id,
      appointment_id: appointment.appointment_id,
      consultation_id: appointment.consultation?.consultation_id ?? null,
      letter_type_name:
        template.letter_type && template.letter_type !== 'General' && template.letter_type !== template.name
          ? `${template.name} (${template.letter_type})`
          : template.name,
      doctor_id: actor.user_id,
      doctor_name_snapshot: actor.username,
      letter_body: input.bodyContent,
      placeholder_data_json: JSON.stringify(data),
      docx_filename: docxName,
      pdf_filename: pdfName,
    },
  });
  return { pdf, issuedLetterId: issued.issued_letter_id };
};

// ---- Issued-letter history (registered patients only) --------------------------------

export const listIssuedLettersForPatient = async (patientId: string) => {
  const rows = await prisma.issuedLetter.findMany({
    where: { patient_id: patientId },
    select: {
      issued_letter_id: true,
      letter_type_name: true,
      doctor_name_snapshot: true,
      issued_at: true,
      version: { select: { version_number: true } },
    },
    orderBy: { issued_at: 'desc' },
  });
  return rows.map((r) => ({
    issued_letter_id: r.issued_letter_id,
    letter_type_name: r.letter_type_name,
    doctor_name_snapshot: r.doctor_name_snapshot,
    issued_at: r.issued_at,
    template_version: r.version?.version_number ?? null,
  }));
};

const getIssuedOrThrow = async (id: number) => {
  const letter = await prisma.issuedLetter.findUnique({ where: { issued_letter_id: id } });
  if (!letter) throw new NotFoundError('Issued letter not found');
  return letter;
};

export const getIssuedLetterDetail = async (id: number) => {
  const letter = await getIssuedOrThrow(id);
  return {
    issued_letter_id: letter.issued_letter_id,
    letter_type_name: letter.letter_type_name,
    doctor_name: letter.doctor_name_snapshot,
    issued_at: letter.issued_at,
    letter_body: letter.letter_body,
    template_version_id: letter.template_version_id,
    placeholder_data: JSON.parse(letter.placeholder_data_json),
  };
};

// Always the frozen file — never re-rendered — so a later template change can't alter it.
export const streamIssuedLetterPdf = async (id: number, res: Response) => {
  const letter = await getIssuedOrThrow(id);
  const p = path.join(issuedDir, letter.pdf_filename);
  if (!fs.existsSync(p)) throw new NotFoundError('The PDF for this issued letter is missing on disk');
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `inline; filename="letter-${id}.pdf"`);
  fs.createReadStream(p).pipe(res);
};

export const streamBlankTemplate = (res: Response) => {
  if (!fs.existsSync(blankTemplatePath)) throw new NotFoundError('Blank template asset is missing');
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  res.setHeader('Content-Disposition', 'attachment; filename="letter-template-blank.docx"');
  fs.createReadStream(blankTemplatePath).pipe(res);
};
