import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import authRouter from "./routes/auth.js";
import farmerRouter from "./routes/farmer.js";
import vendorRouter from "./routes/vendor.js";

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: "*", credentials: true }));
app.use(express.json({ limit: "10mb" }));

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
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    if (err instanceof multer.MulterError) {
      if (err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({
          success: false,
          error: formatMulterFileSizeError(err.field ?? undefined),
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
        details: {
          code: err.code,
          field: err.field ?? null,
        },
      });
      return;
    }

    console.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  },
);

app.listen(PORT, () => {
  console.log(`AgriSetu API running on http://localhost:${PORT}`);
});

export default app;
