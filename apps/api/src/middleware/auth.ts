import { Request, Response, NextFunction } from "express";
import { verifyToken, JwtPayload } from "../lib/jwt.js";

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
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
