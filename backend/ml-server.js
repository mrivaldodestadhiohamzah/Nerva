import express from "express";
import cors from "cors";
import "./utils/env.js";
import { runLocalPrediction } from "./utils/localPredictor.js";

const app = express();
const PORT = process.env.ML_LOCAL_PORT || 8000;

const allowedOrigins = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
  "http://localhost:5001",
  "http://127.0.0.1:5001",
]);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));
app.use(express.json({ limit: "25kb" }));

app.get("/", (_req, res) => {
  res.json({ message: "NERVA local ML API is running" });
});

app.post("/predict/analyze", async (req, res) => {
  const text = String(req.body?.text || "").trim();

  if (!text) {
    return res.status(400).json({ message: "Text is required" });
  }

  try {
    const prediction = await runLocalPrediction(text);
    return res.json(prediction);
  } catch (error) {
    console.error("Local ML prediction failed:", error.message);
    return res.status(500).json({
      message: "Local ML prediction failed",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Local ML API is running on http://localhost:${PORT}`);
});
