const SENSITIVE_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "cookie",
  "gstin",
  "pan",
  "phone",
  "email",
  "connectionstring",
  "url",
  "key",
  "apikey",
];

function sanitizeString(str: string): string {
  let sanitized = str;
  // Redact potential connection strings (e.g., postgres://user:password@host)
  sanitized = sanitized.replace(
    /([a-z0-9]+:\/\/)[^:]+:[^@]+@/gi,
    "$1[REDACTED]:[REDACTED]@",
  );
  // Redact potential Bearer tokens
  sanitized = sanitized.replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]");
  return sanitized;
}

function sanitize(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === "string") {
    return sanitizeString(obj);
  }

  if (typeof obj !== "object") {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(sanitize);
  }

  // Handle Error objects specifically to preserve stack trace and message
  if (obj instanceof Error) {
    const sanitizedError: any = {
      name: obj.name,
      message: sanitizeString(obj.message),
      stack: obj.stack ? sanitizeString(obj.stack) : obj.stack,
    };

    // Copy other properties from the error object and sanitize them
    for (const key in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key)) {
        if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
          sanitizedError[key] = "[REDACTED]";
        } else {
          sanitizedError[key] = sanitize((obj as any)[key]);
        }
      }
    }
    return sanitizedError;
  }

  const sanitized: any = {};
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      if (SENSITIVE_KEYS.includes(key.toLowerCase())) {
        sanitized[key] = "[REDACTED]";
      } else {
        sanitized[key] = sanitize(obj[key]);
      }
    }
  }

  return sanitized;
}

export const logger = {
  error: (...args: any[]) => {
    const sanitizedArgs = args.map(sanitize);
    console.error(...sanitizedArgs);
  },
  info: (...args: any[]) => {
    const sanitizedArgs = args.map(sanitize);
    console.log(...sanitizedArgs);
  },
  warn: (...args: any[]) => {
    const sanitizedArgs = args.map(sanitize);
    console.warn(...sanitizedArgs);
  },
};
