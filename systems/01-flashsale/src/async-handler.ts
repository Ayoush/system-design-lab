// Express 4 does NOT automatically catch a rejected promise from an async
// route handler — it only auto-catches SYNCHRONOUS throws. An async
// handler that rejects with nothing catching it becomes an unhandled
// promise rejection, which crashes the whole Node process, not just that
// request. This wrapper forwards the rejection to next(err) so the error
// middleware in server.ts actually gets to handle it.
import { Request, Response, NextFunction, RequestHandler } from 'express';

export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>): RequestHandler =>
  (req, res, next) => {
    fn(req, res, next).catch(next);
  };
