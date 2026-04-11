import rateLimit, { type Options } from "express-rate-limit";
import { error } from "../lib/response.js";

function computeRetryAfterSeconds(resetTime?: Date) {
  if (!resetTime) return 15 * 60;
  return Math.max(1, Math.ceil((resetTime.getTime() - Date.now()) / 1000));
}

function createLimiter(options: {
  max: number;
  message: string;
  windowMs?: number;
}): ReturnType<typeof rateLimit> {
  const config: Partial<Options> = {
    windowMs: options.windowMs ?? 15 * 60 * 1000,
    max: options.max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      const rateLimitState = req as typeof req & {
        rateLimit?: { resetTime?: Date };
      };
      const retryAfterSeconds = computeRetryAfterSeconds(
        rateLimitState.rateLimit?.resetTime,
      );
      res.setHeader("Retry-After", retryAfterSeconds.toString());
      error(res, options.message, 429, { retryAfterSeconds });
    },
  };

  return rateLimit(config as Options);
}

export const authLimiter = createLimiter({
  max: 50,
  message: "Too many requests from this IP, please try again after 15 minutes.",
});

export const apiLimiter = createLimiter({
  max: 1000,
  message: "Too many requests from this IP, please try again after 15 minutes.",
});

export const otpRequestLimiter = createLimiter({
  max: 5,
  message: "Too many OTP requests. Please try again after 15 minutes.",
});

export const otpVerifyLimiter = createLimiter({
  max: 10,
  message: "Too many OTP verification attempts. Please try again after 15 minutes.",
});
