import express from "express";
import axios from "axios";
import { authenticateToken } from "../middleware/auth.js";
import { createRateLimiter, sendSafeError, validateRequiredText } from "../utils/security.js";

const router = express.Router();
const ML_API_URL = `${process.env.ML_API_URL || "https://capstonetelu-production.up.railway.app"}/predict/analyze`;

function normalizeRecommendations(value) {
  if (!value) return [];

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      return normalizeRecommendations(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeRecommendations);
  }

  if (typeof value === "object") {
    return normalizeRecommendations(
      value.recommendations ??
      value.video_link ??
      value.videos ??
      value.urls ??
      value.url
    );
  }

  return [];
}

function extractVideoRecommendations(mlResult = {}) {
  const sources = [
    mlResult.recommended_videos?.recommendations,
    mlResult.recommended_videos,
    mlResult.recommendations,
    mlResult.videos,
    mlResult.video_link,
  ];

  return [...new Set(
    sources
      .flatMap(normalizeRecommendations)
      .map(url => String(url).trim())
      .filter(Boolean)
  )];
}

router.post("/curhat", createRateLimiter(), authenticateToken, async (req, res) => {
  const { text } = req.body;
  const user_id = req.user.user_id; // Get from authenticated token

  console.log("Received curhat request:", {
    user_id: user_id || "No user_id",
    textLength: text ? text.length : 0
  });

  const textValidation = validateRequiredText(text, "Teks");
  if (!textValidation.isValid) {
    return sendSafeError(res, 400, textValidation.message);
  }

  const cleanText = textValidation.value;

  if (cleanText.length < 10) {
    return sendSafeError(res, 400, "Teks minimal 10 karakter");
  }

  try {
    console.log("Calling ML API:", ML_API_URL);
    const { data: mlResult } = await axios.post(
      ML_API_URL,
      { text: cleanText },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
        maxContentLength: 1024 * 1024,
        maxBodyLength: 1024 * 1024,
      }
    );
    console.log("ML API Success");

    // Validate ML response structure
    if (!mlResult || typeof mlResult !== 'object') {
      console.error("Invalid ML response format:", typeof mlResult);
      return sendSafeError(res, 500, "Respons dari ML API tidak valid");
    }

    const recommendations = extractVideoRecommendations(mlResult);

    // Extract and validate data with more robust fallbacks
    const responseData = {
      predicted_stress: mlResult.predicted_stress || { 
        label: 'medium', 
        confidence: 0.5 
      },
      stress_level: mlResult.stress_level || { 
        stress_level: 50 
      },
      analysis: mlResult.analysis || 'Your text has been analyzed successfully.',
      recommended_videos: { recommendations }
    };

    console.log("Processed response data:", {
      stress_label: responseData.predicted_stress.label,
      stress_percent: responseData.stress_level.stress_level,
      videos_count: recommendations.length
    });

    responseData.saved_to_history = false;
    responseData.pending_dass21 = true;

    console.log("Sending response to frontend");
    res.json(responseData);

  } catch (error) {
    console.error("Error in /api/curhat:", error.message);
    
    if (error.code === 'ECONNABORTED') {
      console.error("ML API request timed out");
      return sendSafeError(res, 408, "ML API terlalu lama merespons. Silakan coba lagi.");
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      console.error("Tidak dapat terhubung ke ML API");
      return sendSafeError(res, 503, "Tidak dapat terhubung ke ML API");
    }
    
    if (error.response) {
      console.error("ML API Error Response Status:", error.response.status);
      
      return sendSafeError(res, 500, "ML API mengembalikan kesalahan");
    }
    
    return sendSafeError(res, 500, "Gagal memproses curhat");
  }
});

export default router;
