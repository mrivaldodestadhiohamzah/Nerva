import express from "express";
import cors from "cors";
import helmet from "helmet";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { backendRootDir, frontendRootDir } from "./utils/env.js";
import { logger } from "./utils/logger.js";

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

const defaultAllowedOrigins = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173',
  'https://nervargd.vercel.app',
];

const allowedOrigins = new Set(
  [
    ...defaultAllowedOrigins,
    process.env.FRONTEND_URL,
    process.env.CORS_ORIGIN,
    ...(process.env.CORS_ORIGINS || '').split(','),
    ...(process.env.ALLOWED_ORIGINS || '').split(','),
  ]
    .map(origin => String(origin || '').trim())
    .filter(Boolean)
);

function isAllowedOrigin(origin) {
  if (!origin) return true;
  if (allowedOrigins.has(origin)) return true;

  try {
    const { protocol, hostname } = new URL(origin);
    return (
      protocol === 'https:' &&
      /^nervargd-[a-z0-9-]+\.vercel\.app$/i.test(hostname)
    );
  } catch {
    return false;
  }
}

const corsMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const corsAllowedHeaders = ['Content-Type', 'Authorization'];

const corsOptions = {
  origin(origin, callback) {
    if (isAllowedOrigin(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
  methods: corsMethods,
  allowedHeaders: corsAllowedHeaders,
  optionsSuccessStatus: 204,
};

function applyCorsHeaders(req, res, next) {
  const origin = req.headers.origin;

  if (origin && isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods', corsMethods.join(','));
    res.setHeader(
      'Access-Control-Allow-Headers',
      req.headers['access-control-request-headers'] || corsAllowedHeaders.join(',')
    );
  }

  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }

  next();
}

app.use(applyCorsHeaders);
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors(corsOptions));
app.options(/.*/, cors(corsOptions));
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
    message: "NERVA API is running",
    databaseConfigured: isSupabaseConfigured
  });
});

app.use("/api", (req, res, next) => {
  const routeHandlesOwnConfig =
    req.path.startsWith('/auth') || req.path.startsWith('/forgot-password');

  if (!isSupabaseConfigured && !routeHandlesOwnConfig) {
    return sendSafeError(res, 503, "Backend database is not configured");
  }

  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api", curhatRoutes);
app.use("/api/history", historyRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api", feedbackRoutes);
app.use("/api", historyDetailRouter);
app.use("/api/forgot-password", forgotPasswordRouter); // Moved here

app.use("/api", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Endpoint API tidak ditemukan",
  });
});

app.use((err, req, res, _next) => {
  logger.error("Unhandled backend error", {
    path: req.path,
    method: req.method,
    message: err.message,
  });

  sendSafeError(res, err.status || 500, "Request failed");
});

const isMainModule =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMainModule) {
  app.listen(PORT, () => {
    logger.info(`Backend server is running on http://localhost:${PORT}`);
  });
}

export { app };
