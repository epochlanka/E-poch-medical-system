import { execFile } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';
import { ConversionError } from './errors';

// Turning a filled .docx into a faithful PDF is done by LibreOffice in headless mode — it is
// the one engine that reproduces the admin's Word layout (fonts, colours, header/footer,
// logos, borders, tables, A4/A5, portrait/landscape) instead of re-drawing it. The same
// pipeline runs for both preview and issue, so what the doctor previews is byte-for-byte
// what gets printed and archived.

const WIN = process.platform === 'win32';

// On Windows the console binary `soffice.com` blocks until conversion finishes; `soffice.exe`
// returns immediately and would race us reading a half-written PDF. Elsewhere `soffice` is fine.
const CANDIDATES = [
  process.env.LIBREOFFICE_PATH,
  WIN ? 'C:\\Program Files\\LibreOffice\\program\\soffice.com' : undefined,
  WIN ? 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.com' : undefined,
  WIN ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : undefined,
  '/usr/bin/soffice',
  '/usr/local/bin/soffice',
  '/opt/libreoffice/program/soffice',
  '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  WIN ? 'soffice.com' : 'soffice', // last resort: rely on PATH
].filter(Boolean) as string[];

let cachedBin: string | null | undefined;

/** Resolve the LibreOffice binary once. Returns null if none is found. */
export const findLibreOffice = (): string | null => {
  if (cachedBin !== undefined) return cachedBin;
  for (const c of CANDIDATES) {
    // A bare command name (no separator) is left for the OS PATH lookup to resolve.
    if (!c.includes(path.sep) && !c.includes('/')) {
      cachedBin = c;
      return cachedBin;
    }
    if (fs.existsSync(c)) {
      cachedBin = c;
      return cachedBin;
    }
  }
  cachedBin = null;
  return cachedBin;
};

/** Logged once at startup so a misconfigured server is obvious before the first letter. */
export const libreOfficeStatus = (): { ok: boolean; path: string | null } => {
  const bin = findLibreOffice();
  return { ok: !!bin, path: bin };
};

export const convertDocxToPdf = (docx: Buffer): Promise<Buffer> => {
  const bin = findLibreOffice();
  if (!bin) {
    return Promise.reject(
      new ConversionError(
        'LibreOffice is not installed on the server. Install LibreOffice (or set LIBREOFFICE_PATH) to generate letters.'
      )
    );
  }

  const id = crypto.randomUUID();
  const workDir = path.join(os.tmpdir(), `epoch-letter-${id}`);
  const profileDir = path.join(workDir, 'lo-profile'); // a private user profile per call = safe concurrency
  const inputPath = path.join(workDir, 'letter.docx');
  const outputPath = path.join(workDir, 'letter.pdf');

  return new Promise<Buffer>((resolve, reject) => {
    try {
      fs.mkdirSync(profileDir, { recursive: true });
      fs.writeFileSync(inputPath, docx);
    } catch (err) {
      return reject(new ConversionError(`Could not stage the document for conversion: ${(err as Error).message}`));
    }

    const args = [
      `-env:UserInstallation=file:///${profileDir.replace(/\\/g, '/')}`,
      '--headless',
      '--nologo',
      '--nofirststartwizard',
      '--convert-to',
      'pdf:writer_pdf_Export',
      '--outdir',
      workDir,
      inputPath,
    ];

    execFile(bin, args, { timeout: 30_000, windowsHide: true }, (error, _stdout, stderr) => {
      const cleanup = () => fs.rm(workDir, { recursive: true, force: true }, () => undefined);
      if (error) {
        cleanup();
        return reject(new ConversionError(`LibreOffice failed to render the letter: ${error.message || stderr}`));
      }
      fs.readFile(outputPath, (readErr, pdf) => {
        cleanup();
        if (readErr || !pdf || pdf.length === 0) {
          return reject(new ConversionError('LibreOffice produced no PDF output for the letter.'));
        }
        if (pdf.subarray(0, 5).toString('latin1') !== '%PDF-') {
          return reject(new ConversionError('LibreOffice output was not a valid PDF.'));
        }
        resolve(pdf);
      });
    });
  });
};
