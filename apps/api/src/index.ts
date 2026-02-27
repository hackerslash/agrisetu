import "dotenv/config";
import express from "express";
import cors from "cors";
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

// Global error handler
app.use(
  (
    err: Error,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    console.error(err);
    res.status(500).json({ success: false, error: "Internal server error" });
  },
);

app.listen(PORT, () => {
  console.log(`AgriSetu API running on http://localhost:${PORT}`);
});

export default app;
