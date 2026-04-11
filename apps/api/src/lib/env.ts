const DEFAULT_DEV_ORIGINS = [
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

function isLocalDevelopmentOrigin(origin: string): boolean {
  try {
    const url = new URL(origin);
    return (
      (url.protocol === "http:" || url.protocol === "https:") &&
      (url.hostname === "localhost" || url.hostname === "127.0.0.1")
    );
  } catch {
    return false;
  }
}

function normalizeOrigin(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;

  try {
    return new URL(trimmed).origin;
  } catch {
    return null;
  }
}

function parseOriginList(raw: string | undefined): string[] {
  if (!raw) return [];

  return raw
    .split(",")
    .map((origin) => normalizeOrigin(origin))
    .filter((origin): origin is string => Boolean(origin));
}

export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const IS_PRODUCTION = NODE_ENV === "production";

export function requireEnv(name: string, options?: { minLength?: number }): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }

  if (options?.minLength && value.length < options.minLength) {
    throw new Error(`${name} must be at least ${options.minLength} characters.`);
  }

  return value;
}

const configuredOrigins = parseOriginList(process.env.CORS_ALLOWED_ORIGINS);
const allowedOrigins = new Set(configuredOrigins);

if (!IS_PRODUCTION && allowedOrigins.size === 0) {
  for (const origin of DEFAULT_DEV_ORIGINS) {
    allowedOrigins.add(origin);
  }
}

export function getAllowedCorsOrigins(): string[] {
  return [...allowedOrigins];
}

export function isAllowedCorsOrigin(origin: string): boolean {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return false;

  if (!IS_PRODUCTION && isLocalDevelopmentOrigin(normalized)) {
    return true;
  }

  return allowedOrigins.has(normalized);
}

export function resolveRequestOrigin(input?: string | string[] | null): string | null {
  if (!input) return null;

  const value = Array.isArray(input) ? input[0] : input;
  return value ? normalizeOrigin(value) : null;
}
