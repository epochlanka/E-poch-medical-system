import PizZip from 'pizzip';
import Docxtemplater from 'docxtemplater';
import { DocxError } from './errors';

// Placeholder replacement is done by editing the DOCX's own XML in place (docxtemplater on top
// of the zip), never by rebuilding the document. Everything the admin put in Word — styles,
// colours, fonts, spacing, alignment, header/footer, logos, borders, tables, stamp areas,
// page size and orientation — is therefore left exactly as authored. The only text the system
// ever writes into the document is the value of a placeholder.

export const KNOWN_PLACEHOLDERS = [
  'CLINIC_NAME',
  'CLINIC_ADDRESS',
  'PHONE',
  'PATIENT_NAME',
  'PATIENT_AGE',
  'DATE',
  'DOCTOR_NAME',
  'DOCTOR_QUALIFICATION',
  'DOCTOR_DEPARTMENT',
  'REGISTRATION_NO',
  'LETTER_BODY',
] as const;

export type PlaceholderKey = (typeof KNOWN_PLACEHOLDERS)[number];
export type PlaceholderData = Record<string, string>;

export interface PlaceholderReport {
  found: string[]; // every distinct {{TAG}} in the document (body + headers + footers)
  unknown: string[]; // tags that aren't in KNOWN_PLACEHOLDERS — they'll render empty
  missingBody: boolean; // no {{LETTER_BODY}} — the doctor would have nowhere to type
}

const loadZip = (buf: Buffer): PizZip => {
  try {
    return new PizZip(buf);
  } catch {
    throw new DocxError('The uploaded file is not a valid .docx (could not read it as a Word document).');
  }
};

const newDoc = (zip: PizZip): Docxtemplater => {
  try {
    return new Docxtemplater(zip, {
      delimiters: { start: '{{', end: '}}' },
      paragraphLoop: true,
      linebreaks: true, // a "\n" in {{LETTER_BODY}} becomes a real <w:br/>, so layout never breaks
      nullGetter: () => '', // an unfilled placeholder disappears rather than throwing or printing "undefined"
    });
  } catch (err: any) {
    const msg = err?.properties?.errors?.map((e: any) => e.properties?.explanation).filter(Boolean).join('; ');
    throw new DocxError(msg || err?.message || 'The .docx could not be parsed. Check the placeholder syntax.');
  }
};

/** Assert the buffer really is a Word document; throws DocxError otherwise. */
export const assertValidDocx = (buf: Buffer): void => {
  const zip = loadZip(buf);
  if (!zip.files['[Content_Types].xml'] || !zip.files['word/document.xml']) {
    throw new DocxError('The uploaded file is not a valid .docx (missing word/document.xml).');
  }
  newDoc(zip); // surfaces malformed / unbalanced {{ }} tags at upload time
};

/** Every distinct placeholder across the body, headers and footers. */
export const extractPlaceholders = (buf: Buffer): string[] => {
  const doc = newDoc(loadZip(buf));
  // getTags() is present at runtime (docxtemplater 3.x) but absent from the shipped typings.
  const tags = (doc as any).getTags() as {
    headers: { tags: Record<string, unknown> }[];
    footers: { tags: Record<string, unknown> }[];
    document: { tags: Record<string, unknown> };
  };
  const all = new Set<string>();
  Object.keys(tags.document?.tags ?? {}).forEach((t) => all.add(t));
  [...(tags.headers ?? []), ...(tags.footers ?? [])].forEach((part) =>
    Object.keys(part?.tags ?? {}).forEach((t) => all.add(t))
  );
  return [...all];
};

export const buildPlaceholderReport = (found: string[]): PlaceholderReport => {
  const known = new Set<string>(KNOWN_PLACEHOLDERS);
  return {
    found,
    unknown: found.filter((t) => !known.has(t)),
    missingBody: !found.includes('LETTER_BODY'),
  };
};

/** Fill a template buffer with data and return the resulting .docx buffer. */
export const fillDocx = (templateBuf: Buffer, data: PlaceholderData): Buffer => {
  const doc = newDoc(loadZip(templateBuf));
  try {
    doc.render(data);
  } catch (err: any) {
    const msg = err?.properties?.errors?.map((e: any) => e.properties?.explanation).filter(Boolean).join('; ');
    throw new DocxError(msg || err?.message || 'Failed to fill the letter template.');
  }
  return doc.toBuffer() as Buffer;
};
