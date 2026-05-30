import express from "express";
import axios from "axios";
import { authenticateToken } from "../middleware/auth.js";
import { createRateLimiter, sendSafeError, validateRequiredText } from "../utils/security.js";
import { buildVideoRecommendations } from "../utils/videoRecommendations.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

function buildMlAnalyzeUrl() {
  const configuredUrl = String(process.env.ML_API_URL || "").trim();

  if (!configuredUrl) {
    return "";
  }

  const normalizedUrl = configuredUrl.replace(/\/+$/, "");
  return normalizedUrl.endsWith("/predict/analyze")
    ? normalizedUrl
    : `${normalizedUrl}/predict/analyze`;
}

router.post("/curhat", createRateLimiter(), authenticateToken, async (req, res) => {
  const { text } = req.body;

  const textValidation = validateRequiredText(text, "Teks");
  if (!textValidation.isValid) {
    return sendSafeError(res, 400, textValidation.message);
  }

  const cleanText = textValidation.value;

  if (cleanText.length < 50) {
    return sendSafeError(res, 400, "Teks minimal 50 karakter");
  }

  try {
    const mlAnalyzeUrl = buildMlAnalyzeUrl();

    if (!mlAnalyzeUrl) {
      return sendSafeError(res, 503, "ML API belum dikonfigurasi");
    }

    const { data: mlResult } = await axios.post(
      mlAnalyzeUrl,
      { text: cleanText },
      {
        headers: { "Content-Type": "application/json" },
        timeout: 120000,
        maxContentLength: 1024 * 1024,
        maxBodyLength: 1024 * 1024,
      }
    );
    // Validate ML response structure
    if (!mlResult || typeof mlResult !== 'object') {
      logger.error("Invalid ML response format", { type: typeof mlResult });
      return sendSafeError(res, 500, "Respons dari ML API tidak valid");
    }

    const videoRecommendation = buildVideoRecommendations({ mlResult });
    const recommendations = videoRecommendation.recommendations;

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
      recommended_videos: {
        recommendations,
        source: videoRecommendation.source,
        basis: videoRecommendation.basis,
      }
    };

    logger.debug("ML curhat analysis completed", {
      stress_label: responseData.predicted_stress.label,
      stress_percent: responseData.stress_level.stress_level,
      videos_count: recommendations.length,
    });

    responseData.saved_to_history = false;
    responseData.pending_dass21 = true;

    res.json(responseData);

  } catch (error) {
    logger.error("Error in /api/curhat", { message: error.message });
    
    if (error.code === 'ECONNABORTED') {
      return sendSafeError(res, 408, "ML API terlalu lama merespons. Silakan coba lagi.");
    }
    
    if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      return sendSafeError(res, 503, "Tidak dapat terhubung ke ML API");
    }
    
    if (error.response) {
      logger.warn("ML API returned an error", { status: error.response.status });
      return sendSafeError(res, 500, "ML API mengembalikan kesalahan");
    }
    
    return sendSafeError(res, 500, "Gagal memproses curhat");
  }
});

export default router;
