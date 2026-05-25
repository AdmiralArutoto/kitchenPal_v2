import type { ErrorRequestHandler, RequestHandler } from 'express';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof HttpError) {
    // Log 5xx upstream/server-side HttpErrors so the cause is visible in dev logs.
    // 4xx are client errors and stay quiet.
    if (err.status >= 500) {
      req.log?.error({ status: err.status, message: err.message }, 'upstream error');
    }
    res.status(err.status).json({ error: err.message });
    return;
  }
  req.log?.error({ err }, 'unhandled error');
  res.status(500).json({ error: 'Internal server error' });
};

export const notFoundHandler: RequestHandler = (_req, res) => {
  res.status(404).json({ error: 'Not found' });
};
