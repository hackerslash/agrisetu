import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET ?? "agrisetu_secret_dev";

export type JwtPayload = {
  id: string;
  role: "farmer" | "vendor";
};

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "30d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}
