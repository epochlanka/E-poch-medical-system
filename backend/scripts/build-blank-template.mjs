// Builds backend/src/modules/letters/assets/blank-letter-template.docx — the starter Word
// document an Admin downloads, edits on their PC, and re-uploads. It is a minimal but valid
// OOXML package (Word and LibreOffice both open it) containing every supported placeholder
// plus short instructions. Regenerate with:  node scripts/build-blank-template.mjs
import PizZip from 'pizzip';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, '..', 'src', 'modules', 'letters', 'assets', 'blank-letter-template.docx');

const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// One paragraph. opts: { bold, size (half-points), align, spaceAfter }
const p = (text, opts = {}) => {
  const { bold, size, align, spaceAfter = 120 } = opts;
  const rPr =
    (bold ? '<w:b/>' : '') + (size ? `<w:sz w:val="${size}"/><w:szCs w:val="${size}"/>` : '');
  const pPr =
    `<w:pPr><w:spacing w:after="${spaceAfter}"/>` +
    (align ? `<w:jc w:val="${align}"/>` : '') +
    '</w:pPr>';
  const runs = text === '' ? '' : `<w:r>${rPr ? `<w:rPr>${rPr}</w:rPr>` : ''}<w:t xml:space="preserve">${esc(text)}</w:t></w:r>`;
  return `<w:p>${pPr}${runs}</w:p>`;
};

const body = [
  p('{{CLINIC_NAME}}', { bold: true, size: 32, align: 'center', spaceAfter: 0 }),
  p('{{CLINIC_ADDRESS}}', { size: 18, align: 'center', spaceAfter: 0 }),
  p('Tel: {{PHONE}}', { size: 18, align: 'center' }),
  p('', {}),
  p('LETTER TITLE', { bold: true, size: 28, align: 'center' }),
  p('', {}),
  p('Date: {{DATE}}'),
  p('Patient: {{PATIENT_NAME}}  (Age: {{PATIENT_AGE}})'),
  p('', {}),
  p('{{LETTER_BODY}}'),
  p('', {}),
  p('', {}),
  p('{{DOCTOR_NAME}}', { bold: true, spaceAfter: 0 }),
  p('{{DOCTOR_QUALIFICATION}}', { size: 18, spaceAfter: 0 }),
  p('{{DOCTOR_DEPARTMENT}}', { size: 18, spaceAfter: 0 }),
  p('Reg. No: {{REGISTRATION_NO}}', { size: 18 }),
  p('', {}),
  p('— — — — — — — — — — — — — — — — — — — — — — — — — — — —', { size: 16, spaceAfter: 0 }),
  p('HOW TO USE THIS TEMPLATE (delete this section before uploading):', { bold: true, size: 16 }),
  p('Design this document in Microsoft Word exactly as you want it printed — fonts, colours, logo, header/footer, tables, borders, page size (A4/A5) and orientation are all preserved.', { size: 16 }),
  p('Insert any of these placeholders where you want live data; the system fills them in:', { size: 16 }),
  p('{{CLINIC_NAME}}  {{CLINIC_ADDRESS}}  {{PHONE}}  {{PATIENT_NAME}}  {{PATIENT_AGE}}  {{DATE}}  {{DOCTOR_NAME}}  {{DOCTOR_QUALIFICATION}}  {{DOCTOR_DEPARTMENT}}  {{REGISTRATION_NO}}', { size: 16 }),
  p('{{LETTER_BODY}} is the ONLY part the doctor edits when issuing a letter — put it where the letter content should go.', { size: 16 }),
].join('');

const documentXml =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">` +
  `<w:body>${body}` +
  `<w:sectPr>` +
  `<w:pgSz w:w="11906" w:h="16838"/>` + // A4 portrait (twips)
  `<w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/>` +
  `</w:sectPr>` +
  `</w:body></w:document>`;

const contentTypes =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>` +
  `<Default Extension="xml" ContentType="application/xml"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>` +
  `</Types>`;

const rootRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>` +
  `</Relationships>`;

const docRels =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
  `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;

const zip = new PizZip();
zip.file('[Content_Types].xml', contentTypes);
zip.file('_rels/.rels', rootRels);
zip.file('word/document.xml', documentXml);
zip.file('word/_rels/document.xml.rels', docRels);

const buf = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, buf);
console.log(`Wrote ${outPath} (${buf.length} bytes)`);
