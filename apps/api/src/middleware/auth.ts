import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt.js";

export const AUTH_SESSION_COOKIE = "agrisetu_session";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
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

  if (!token) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }

  try {
    const payload = verifyToken(token);
    req.user = payload;
    next();
  } catch {
    res.status(401).json({ success: false, error: "Invalid or expired token" });
  }
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
