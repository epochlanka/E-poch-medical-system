import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';

// Request-shape validation. A failure here is a normal user/client mistake: it returns a
// friendly 400 in the standard `{ success, message, ... }` shape and NEVER triggers an admin
// alert. `error` + `details` are kept for backwards compatibility with existing callers.

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
      const issues: { path: string; message: string }[] = Array.isArray(error?.issues)
        ? error.issues.map((e: any) => ({ path: e.path?.join('.') ?? '', message: e.message }))
        : [];
      const first = issues[0];
      const message = first
        ? first.path
          ? `${first.path}: ${first.message}`
          : first.message
        : 'Some of the submitted values are invalid.';

      return res.status(400).json({
        success: false,
        message,
        error: 'Validation failed', // legacy key
        details: issues, // legacy key
      });
    }
  };
};
