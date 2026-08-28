import { Request, Response } from 'express';
import * as service from './service';
import { ExternalApiError } from './errors';
import { respondWithServerError } from '../../errors';

export const search = async (req: Request, res: Response) => {
  try {
    const results = await service.searchIcd11(req.query.q as string);
    res.status(200).json(results);
  } catch (error) {
    if (error instanceof ExternalApiError) return res.status(502).json({ message: error.message });
    return respondWithServerError(req, res, error, 'icd11');
  }
};
