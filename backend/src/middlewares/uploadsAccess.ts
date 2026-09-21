import { NextFunction, Request, Response } from 'express';
import express from 'express';
import path from 'path';
import { UPLOADS_DIR } from '../config/paths';
import { requireAuth, requireRole } from './auth';

// Patient files (photos, consultation attachments, lab reports) are protected health
// information. They are served only to an authenticated session whose role could already read
// the same record through the API — the file URL itself is never the authorization boundary.
//
// Default-deny: a directory that is not listed here is not served at all. Letter templates and
// issued letters are never served from here — they only go out through the authenticated
// /api/v1/letters routes.
const PUBLIC_DIRS = new Set(['settings']); // clinic logo: branding printed on slips, not patient data
const ROLES_BY_DIR: Record<string, string[]> = {
  patients: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'],
  consultations: ['Admin', 'Receptionist', 'Doctor', 'Pharmacist'],
  'lab-reports': ['Admin', 'Doctor', 'Receptionist'],
};


const decode = (p: string): string | null => {
  try {
    return decodeURIComponent(p);
  } catch {
    return null;
  }
};

const gate = (req: Request, res: Response, next: NextFunction) => {
  const decoded = decode(req.path);
  if (decoded === null || /(^|[\\/])\.\.([\\/]|$)|\\|\0/.test(decoded)) return res.status(404).end();

  const dir = decoded.split('/')[1];
  if (PUBLIC_DIRS.has(dir)) return next();

  const roles = ROLES_BY_DIR[dir];
  if (!roles) return res.status(404).end();

  requireAuth(req, res, (err?: unknown) => {
    if (err) return next(err);
    requireRole(roles)(req, res, next);
  });
};

const setHeaders = (res: Response, filePath: string) => {
  // The portals are separate origins, so the images must be embeddable cross-origin — but only
  // for a session that passed the gate above. Never let a shared workstation's browser or a
  // proxy keep patient files around after logout.
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  if (!filePath.includes(`${path.sep}settings${path.sep}`)) {
    res.setHeader('Cache-Control', 'private, no-store');
  }
};

export const uploadsHandler = [
  gate,
  express.static(UPLOADS_DIR, { dotfiles: 'deny', index: false, redirect: false, setHeaders }),
];
