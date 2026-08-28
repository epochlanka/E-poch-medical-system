import { Request, Response } from 'express';
import * as service from './service';
import { AccountLockedError, InvalidCredentialsError, InvalidTotpError, TotpRequiredError, ValidationError } from './errors';
import { respondWithServerError } from '../../errors';

const actor = (req: Request) => req.user as any as { user_id: number; role: string; username: string; sessionId?: number };

export const login = async (req: Request, res: Response) => {
  try {
    const { username, password, totpToken } = req.body;
    const result = await service.loginUser(username, password, totpToken, {
      userAgent: req.headers['user-agent'],
      ipAddress: req.ip,
    });
    res.status(200).json(result);
  } catch (error: any) {
    req.log.warn(`Login failed for username: ${req.body?.username} - ${error.message}`);

    if (error instanceof TotpRequiredError) return res.status(401).json({ message: error.message, requiresTotp: true });
    if (error instanceof InvalidTotpError) return res.status(401).json({ message: error.message });
    if (error instanceof AccountLockedError) return res.status(403).json({ message: error.message, locked: true });
    // InvalidCredentialsError and anything unexpected both collapse to the same generic
    // message — the original behavior this replaces, kept for username-enumeration safety.
    return res.status(401).json({ message: 'Invalid username or password' });
  }
};

export const logout = async (req: Request, res: Response) => {
  await service.logoutUser(actor(req).sessionId);
  res.status(200).json({ message: 'Logged out successfully' });
};

const handleError = (req: Request, res: Response, error: any) => {
  if (error instanceof InvalidCredentialsError) return res.status(401).json({ message: error.message });
  if (error instanceof InvalidTotpError) return res.status(401).json({ message: error.message });
  if (error instanceof ValidationError) return res.status(400).json({ message: error.message });
  return respondWithServerError(req, res, error, 'auth');
};

export const changePassword = async (req: Request, res: Response) => {
  try {
    await service.changePassword(actor(req), req.body.currentPassword, req.body.newPassword);
    res.status(200).json({ message: 'Password changed successfully' });
  } catch (error) {
    handleError(req, res, error);
  }
};

export const setupTotp = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.setupTotp(actor(req)));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const verifyTotp = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.verifyTotpSetup(actor(req), req.body.token));
  } catch (error) {
    handleError(req, res, error);
  }
};

export const disableTotp = async (req: Request, res: Response) => {
  try {
    res.status(200).json(await service.disableTotp(actor(req), req.body.password));
  } catch (error) {
    handleError(req, res, error);
  }
};
