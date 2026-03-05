import { randomUUID } from "crypto";
import { type NextFunction, type Request, type Response } from "express";
import { logger } from "../lib/logger.js";

const REQUEST_ID_HEADER = "x-request-id";

declare global {
  namespace Express {
    interface Request {
      requestId?: string;
    }
  }
}

function resolveIncomingRequestId(req: Request): string | null {
  const headerValue = req.headers[REQUEST_ID_HEADER];
  if (typeof headerValue === "string" && headerValue.trim().length > 0) {
    return headerValue.trim();
  }
  if (Array.isArray(headerValue) && headerValue.length > 0) {
    const first = headerValue[0];
    if (typeof first === "string" && first.trim().length > 0) {
      return first.trim();
    }
  }
  return null;
}

export function attachRequestContext(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const requestId = resolveIncomingRequestId(req) ?? randomUUID();
  req.requestId = requestId;
  res.setHeader(REQUEST_ID_HEADER, requestId);
  next();
}

export function logRequestLifecycle(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const startedAt = Date.now();
  res.on("finish", () => {
    logger.info("http_request", {
      requestId: req.requestId ?? "unknown",
      method: req.method,
      path: req.originalUrl,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
}
