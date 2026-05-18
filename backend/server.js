import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { backendRootDir, frontendRootDir } from "./utils/env.js";

import profileRoutes from "./routes/profile.js";
import authRoutes from "./routes/auth.js";
import curhatRoutes from "./routes/curhat.js";
import historyRoutes from "./routes/history.js";
import dashboardRoutes from "./routes/dashboard.js";
import feedbackRoutes from "./routes/feedback.js";
import historyDetailRouter from "./routes/historydetail.js";
import forgotPasswordRouter from "./routes/forgotpassword.js";
import { isSupabaseConfigured } from "./supabaseClient.js";
import { createRateLimiter, sanitizeRequestBody, sendSafeError } from "./utils/security.js";

const app = express();
const PORT = process.env.PORT || 5001;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || 'http://localhost:3000,http://127.0.0.1:3000')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
);

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true
}));
app.use(express.json({ limit: "25kb" }));
app.use(express.urlencoded({ extended: true, limit: "25kb" }));
app.use(sanitizeRequestBody);
app.use("/api", createRateLimiter({ max: 100, windowMs: 60 * 1000 }));

if (fs.existsSync(frontendRootDir)) {
  app.use('/presenters', express.static(path.join(frontendRootDir, 'presenters')));
  app.use('/views', express.static(path.join(frontendRootDir, 'public', 'views')));
  app.use('/assets', express.static(path.join(frontendRootDir, 'assets')));
}

app.set("view engine", "ejs");
app.set("views", path.join(backendRootDir, "views"));

app.get("/", (req, res) => {
  res.json({
    message: "Hidden Mood API is running",
    databaseConfigured: isSupabaseConfigured
  });
});

app.use("/api", (req, res, next) => {
  if (!isSupabaseConfigured && !req.path.startsWith('/auth')) {
    return sendSafeError(res, 503, "Backend database is not configured");
  }

  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", curhatRoutes);
app.use("/api", historyRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", feedbackRoutes);
app.use("/api", historyDetailRouter);
app.use("/api/forgot-password", forgotPasswordRouter); // Moved here

app.use((err, req, res, _next) => {
  console.error("Unhandled backend error:", {
    path: req.path,
    method: req.method,
    message: err.message,
  });

  sendSafeError(res, err.status || 500, "Request failed");
});

app.listen(PORT, () => {
  console.log(`Backend server is running on http://localhost:${PORT}`);
});
