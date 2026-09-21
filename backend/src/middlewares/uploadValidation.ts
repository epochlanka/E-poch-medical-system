import { NextFunction, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';

// multer's `file.mimetype` and `file.originalname` are whatever the client claims. Nothing here
// trusts either: the stored file is opened, its leading bytes are matched against known
// signatures, and the on-disk extension is derived from the DETECTED type. A renamed .html/.svg
// (or an executable) can therefore never be stored under a viewable extension.

export type DetectedType = 'jpeg' | 'png' | 'webp' | 'pdf';

const EXT: Record<DetectedType, string> = { jpeg: '.jpg', png: '.png', webp: '.webp', pdf: '.pdf' };

export const detectFileType = (head: Buffer): DetectedType | null => {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 8 && head.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (head.length >= 12 && head.subarray(0, 4).toString('latin1') === 'RIFF' && head.subarray(8, 12).toString('latin1') === 'WEBP') return 'webp';
  if (head.length >= 5 && head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  return null;
};

const readHead = async (file: string): Promise<Buffer> => {
  const fd = await fs.promises.open(file, 'r');
  try {
    const buf = Buffer.alloc(16);
    const { bytesRead } = await fd.read(buf, 0, 16, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fd.close();
  }
};

const LABELS: Record<DetectedType, string> = { jpeg: 'JPEG', png: 'PNG', webp: 'WEBP', pdf: 'PDF' };

// Run AFTER multer has written req.file to disk. Rejects (and deletes) files whose real content
// is not in `allowed`; otherwise renames the file to its canonical extension and updates
// req.file so downstream controllers store the safe name.
export const enforceUploadedFileType = (allowed: DetectedType[]) => async (req: Request, res: Response, next: NextFunction) => {
  const file = req.file;
  if (!file) return next();

  try {
    const type = detectFileType(await readHead(file.path));
    if (!type || !allowed.includes(type)) {
      await fs.promises.unlink(file.path).catch(() => undefined);
      return res.status(400).json({ message: `Only ${allowed.map((t) => LABELS[t]).join(', ')} files are allowed` });
    }

    const finalName = `${path.basename(file.filename, path.extname(file.filename))}${EXT[type]}`;
    const finalPath = path.join(path.dirname(file.path), finalName);
    if (finalPath !== file.path) await fs.promises.rename(file.path, finalPath);
    file.filename = finalName;
    file.path = finalPath;
    file.mimetype = type === 'pdf' ? 'application/pdf' : `image/${type}`;
    next();
  } catch (err) {
    await fs.promises.unlink(file.path).catch(() => undefined);
    next(err);
  }
};
