import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

export const validate = (schema: z.ZodTypeAny) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync({
        body: req.body,
        query: req.query,
        params: req.params,
      });
      return next();
    } catch (error: any) {
      if (error && Array.isArray(error.issues)) {
        return res.status(400).json({
          error: 'Validation failed',
          details: error.issues.map((e: any) => ({
            path: e.path?.join('.'),
            message: e.message,
          })),
        });
      }
      return res.status(400).json({ error: 'Validation failed' });
    }
  };
};
