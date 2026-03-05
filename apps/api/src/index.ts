import "dotenv/config";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import multer from "multer";
import { logger } from "./lib/logger.js";
import authRouter from "./routes/auth.js";
import farmerRouter from "./routes/farmer.js";
import vendorRouter from "./routes/vendor.js";
import {
  attachRequestContext,
  logRequestLifecycle,
} from "./middleware/request-context.js";

const app = express();
const PORT = process.env.PORT ?? 3001;
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: "10mb" }));
app.use(helmet());
app.use(attachRequestContext);
app.use(logRequestLifecycle);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/v1/auth", authRouter);
app.use("/api/v1/farmer", farmerRouter);
app.use("/api/v1/vendor", vendorRouter);

// 404
app.use((_req, res) => {
  res.status(404).json({ success: false, error: "Route not found" });
});

function formatMulterFileSizeError(field?: string) {
  switch (field) {
    case "avatar":
      return "Avatar file is too large. Max size is 5MB.";
    case "audio":
      return "Audio file is too large. Max size is 12MB.";
    case "file":
      return "Uploaded file is too large. Max size is 12MB.";
    default:
      return "Uploaded file is too large.";
  }
}

// Global error handler
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          success: false,
          error: formatMulterFileSizeError(err.field ?? undefined),
          requestId: req.requestId ?? "unknown",
          details: {
            code: err.code,
            field: err.field ?? null,
          },
        });
        return;
      }

      res.status(422).json({
        success: false,
        error: "Invalid file upload request.",
        requestId: req.requestId ?? "unknown",
        details: {
          code: err.code,
          field: err.field ?? null,
        },
      });
      return;
    }

    logger.error("unhandled_error", {
      requestId: req.requestId ?? "unknown",
      err,
    });
    res.status(500).json({
      success: false,
      error: "Internal server error",
      requestId: req.requestId ?? "unknown",
    });
  },
);

app.listen(PORT, () => {
  logger.info(`AgriSetu API running on http://localhost:${PORT}`);
});

export default app;
