import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt.js";
import { isAllowedCorsOrigin, resolveRequestOrigin } from "../lib/env.js";
import { prisma } from "../lib/prisma.js";

export const AUTH_SESSION_COOKIE = "agrisetu_session";
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
      authSource?: "bearer" | "cookie";
    }
  }
}

function parseCookieToken(cookieHeader?: string) {
  if (!cookieHeader) return null;

  const cookies = cookieHeader.split(";");
  for (const part of cookies) {
    const [rawKey, ...rawValue] = part.trim().split("=");
    if (!rawKey || rawKey !== AUTH_SESSION_COOKIE) continue;
    const joinedValue = rawValue.join("=").trim();
    if (!joinedValue) return null;
    try {
      return decodeURIComponent(joinedValue);
    } catch {
      return joinedValue;
    }
  }

  return null;
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : null;
  const cookieToken = parseCookieToken(req.headers.cookie);
  const token = bearerToken ?? cookieToken;
  const authSource = bearerToken ? "bearer" : cookieToken ? "cookie" : undefined;

  if (!token) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    req.authSource = authSource;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
}

export function requireTrustedOriginForSessionAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.authSource !== "cookie" || SAFE_METHODS.has(req.method)) {
    next();
    return;
  }

  const requestOrigin =
    resolveRequestOrigin(req.headers.origin) ??
    resolveRequestOrigin(req.headers.referer);

  if (!requestOrigin || !isAllowedCorsOrigin(requestOrigin)) {
    res.status(403).json({
      success: false,
      error: "Cross-site session requests are not allowed.",
    });
    return;
  }

  next();
}

export function requireFarmer(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "farmer") {
    res.status(403).json({ success: false, error: "Farmer access required" });
    return;
  }
  next();
}

export function requireVendor(req: Request, res: Response, next: NextFunction) {
  if (req.user?.role !== "vendor") {
    res.status(403).json({ success: false, error: "Vendor access required" });
    return;
  }
  next();
}

export function requireSuperadmin(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== "superadmin") {
    res.status(403).json({ success: false, error: "Superadmin access required" });
    return;
  }
  next();
}

export async function requireActiveVendorAccount(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  if (req.user?.role !== "vendor") {
    res.status(403).json({ success: false, error: "Vendor access required" });
    return;
  }

  try {
    const vendor = await prisma.vendor.findUnique({
      where: { id: req.user.id },
      select: { status: true },
    });

    if (!vendor || vendor.status !== "ACTIVE") {
      res
        .status(403)
        .json({ success: false, error: "Active vendor account required" });
      return;
    }

    next();
  } catch {
    res.status(500).json({ success: false, error: "Internal server error" });
  }
}
