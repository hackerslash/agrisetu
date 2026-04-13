import jwt from "jsonwebtoken";
import { requireEnv } from "./env.js";

const JWT_SECRET = requireEnv("JWT_SECRET", { minLength: 32 });

export type JwtPayload = {
  id: string;
  role: "farmer" | "vendor" | "superadmin";
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
