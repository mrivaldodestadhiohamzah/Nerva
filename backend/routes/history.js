import express from "express";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { generateId } from "../utils/helpers.js";
import { DateTime } from "luxon";
import { createRateLimiter, sendSafeError, validateRequiredText } from "../utils/security.js";
import { decryptHistoryEntries, decryptHistoryEntry, encryptText } from "../utils/encryption.js";
import {
  calculateDynamicFusion,
  getDassAnswerCompleteness,
  getStressLabel,
} from "../utils/dynamicWeighting.js";
import { buildRecommendationAnalysis } from "../utils/recommendations.js";
import { buildVideoRecommendations } from "../utils/videoRecommendations.js";

const router = express.Router();
const PROTECTED_FIELD_MARKER = "[protected in encrypted metadata]";

const DASS_QUESTIONS = [
  "stress", "anxiety", "depression", "anxiety", "depression", "stress", "anxiety",
  "stress", "anxiety", "depression", "stress", "stress", "depression", "stress",
  "anxiety", "depression", "depression", "stress", "anxiety", "anxiety", "depression"
];

function scoreDass21(answers = []) {
  const raw = { depression: 0, anxiety: 0, stress: 0 };

  DASS_QUESTIONS.forEach((scale, index) => {
    const answer = answers[index];
    const value = typeof answer === "object" ? Number(answer.value) : Number(answer);
    raw[scale] += Number.isFinite(value) ? Math.min(Math.max(value, 0), 3) : 0;
  });

  const doubled = {
    depression: raw.depression * 2,
    anxiety: raw.anxiety * 2,
    stress: raw.stress * 2,
  };

  return {
    raw,
    doubled,
    stressPercent: Math.round((doubled.stress / 42) * 100),
    dominantScale: Object.keys(doubled).sort((a, b) => doubled[b] - doubled[a])[0],
  };
}

function validateDass21Answers(answers = []) {
  if (!Array.isArray(answers) || answers.length !== 21) {
    return { isValid: false, message: "Jawaban DASS-21 harus lengkap" };
  }

  const hasInvalidAnswer = answers.some(answer => {
    const value = typeof answer === "object" ? Number(answer.value) : Number(answer);
    return !Number.isInteger(value) || value < 0 || value > 3;
  });

  if (hasInvalidAnswer) {
    return { isValid: false, message: "Jawaban DASS-21 harus bernilai 0 sampai 3" };
  }

  return { isValid: true };
}

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

function buildHistoryMetadata({ text, feedback, stressLabel, fusedPercent, dass, fusion, mlResult, recommendations = [], recommendation, videoRecommendation }) {
  const mlPrediction = mlResult.predicted_stress || {};
  const safeRecommendations = normalizeRecommendations(recommendations);

  return {
    version: 1,
    method: fusion.method,
    protected_fields: {
      text,
      feedback,
      stress_level: stressLabel,
      stress_percent: fusedPercent,
    },
    final_result: {
      stress_level: stressLabel,
      stress_percent: fusedPercent,
    },
    predicted_stress: {
      label: stressLabel,
      confidence: fusion.fusionConfidence,
    },
    dass21: {
      ...dass,
      resultLabel: getStressLabel(dass.stressPercent),
    },
    curhat: {
      predictedLabel: mlPrediction.label || null,
      stressPercent: Math.round(fusion.mlStressPercent),
      confidence: fusion.mlConfidence,
    },
    fusion,
    recommended_videos: {
      recommendations: safeRecommendations,
    },
    video_recommendation: videoRecommendation,
    recommendation,
  };
}

function buildVideoPayload(recommendations = [], metadata) {
  const safeRecommendations = normalizeRecommendations(recommendations);

  return {
    recommendations: safeRecommendations,
    protected_metadata: encryptText(JSON.stringify(metadata)),
  };
}

async function insertHistoryRow(payload) {
  const insert = (candidate) => supabase
    .from('history')
    .insert(candidate)
    .select()
    .single();

  const candidates = buildInsertCandidates(payload);
  let lastResult = null;

  for (const candidate of candidates) {
    const result = await insert(candidate);
    if (!result.error) return result;
    lastResult = result;
  }

  return lastResult;
}

function buildInsertCandidates(payload) {
  const candidates = [payload];
  const shouldUseNullPercent =
    typeof payload.stress_percent === "string" &&
    payload.stress_percent.startsWith("enc:v1:");
  const shouldUseArrayVideoLink =
    payload.video_link &&
    typeof payload.video_link === "object" &&
    !Array.isArray(payload.video_link);

  if (shouldUseNullPercent) {
    candidates.push({
      ...payload,
      // Some existing Supabase schemas keep stress_percent as numeric.
      // In that case the actual percent remains encrypted in protected_metadata.
      stress_percent: null,
    });
  }

  if (shouldUseArrayVideoLink) {
    const arrayCompatiblePayload = {
      ...payload,
      // Fallback for older schemas that stored only an array of video URLs.
      // Dynamic details are still present in encrypted feedback text.
      video_link: payload.video_link.recommendations || [],
    };
    candidates.push(arrayCompatiblePayload);

    if (shouldUseNullPercent) {
      candidates.push({
        ...arrayCompatiblePayload,
        stress_percent: null,
      });
    }
  }

  return candidates;
}

function normalizeHistoryId(value) {
  const historyId = String(value || "").trim();
  if (!historyId || historyId === "undefined" || historyId === "null" || historyId.length > 128) {
    return null;
  }
  return historyId;
}

router.post("/fusion", createRateLimiter(), authenticateToken, async (req, res) => {
  const { text, ml_result, dass21_answers, dass21_duration_seconds } = req.body;
  const textValidation = validateRequiredText(text, "Teks");
  const dassValidation = validateDass21Answers(dass21_answers);

  if (!textValidation.isValid) {
    return sendSafeError(res, 400, textValidation.message);
  }

  if (!ml_result || typeof ml_result !== "object") {
    return sendSafeError(res, 400, "Hasil ML wajib tersedia");
  }

  if (!dassValidation.isValid) {
    return sendSafeError(res, 400, dassValidation.message);
  }

  try {
    const dass = {
      ...scoreDass21(dass21_answers),
      completeness: Number(getDassAnswerCompleteness(dass21_answers).toFixed(4)),
    };
    const fusion = calculateDynamicFusion({
      text: textValidation.value,
      dass,
      mlResult: ml_result,
      dassAnswers: dass21_answers,
      dassDurationSeconds: dass21_duration_seconds,
    });
    const fusedPercent = fusion.fusedStressPercent;
    const stressLabel = getStressLabel(fusedPercent);
    const recommendation = buildRecommendationAnalysis({
      text: textValidation.value,
      stressLabel,
      dass,
      fusion,
      mlResult: ml_result,
    });
    const analysis = recommendation.analysis;
    const history_id = generateId();
    const videoRecommendation = buildVideoRecommendations({
      mlResult: ml_result,
      fusion,
      dass,
      stressLabel,
      fusedPercent,
    });
    const recommendations = videoRecommendation.recommendations;
    const historyMetadata = buildHistoryMetadata({
      text: textValidation.value,
      feedback: analysis,
      stressLabel,
      fusedPercent,
      dass,
      fusion,
      mlResult: ml_result,
      recommendations,
      recommendation,
      videoRecommendation,
    });

    const responseData = {
      user_input: textValidation.value,
      predicted_stress: {
        label: stressLabel,
        confidence: fusion.fusionConfidence,
      },
      stress_level: { stress_level: fusedPercent },
      final_result: {
        stress_level: stressLabel,
        stress_percent: fusedPercent,
      },
      analysis,
      recommended_videos: {
        recommendations,
        source: videoRecommendation.source,
        basis: videoRecommendation.basis,
      },
      dass21: dass,
      fusion,
      recommendation,
      ml_result,
    };

    const { data: historyEntry, error } = await insertHistoryRow({
      history_id,
      user_id: req.user.user_id,
      stress_level: encryptText(stressLabel),
      stress_percent: encryptText(String(fusedPercent)),
      text: encryptText(PROTECTED_FIELD_MARKER),
      feedback: encryptText(PROTECTED_FIELD_MARKER),
      video_link: buildVideoPayload(recommendations, historyMetadata),
      created_at: DateTime.now().setZone("Asia/Jakarta").toISO()
    });

    if (error) throw error;

    responseData.saved_to_history = true;
    responseData.history_id = historyEntry.history_id;
    return res.status(201).json(responseData);
  } catch (error) {
    console.error("Error saving fused history:", error);
    return sendSafeError(res, 500, "Gagal menyimpan hasil akhir");
  }
});

router.post("/", createRateLimiter(), authenticateToken, async (req, res) => {
  const {
    text,
    stress_level,
    stress_percent,
    feedback,
    video_link = []
  } = req.body;

  const textValidation = validateRequiredText(text, "Teks");
  const feedbackValidation = validateRequiredText(feedback || "Belum ada masukan", "Masukan");

  if (!textValidation.isValid) {
    return sendSafeError(res, 400, textValidation.message);
  }

  if (!feedbackValidation.isValid) {
    return sendSafeError(res, 400, feedbackValidation.message);
  }

  if (stress_percent === undefined || !stress_level) {
    return sendSafeError(res, 400, "Hasil riwayat belum lengkap");
  }

  const normalizedStressPercent = Number(stress_percent);
  if (!Number.isFinite(normalizedStressPercent) || normalizedStressPercent < 0 || normalizedStressPercent > 100) {
    return sendSafeError(res, 400, "Persentase stres harus berupa angka 0 sampai 100");
  }

  try {
    const history_id = generateId();
    const recommendations = normalizeRecommendations(video_link);
    const historyMetadata = {
      version: 1,
      method: "legacy_history",
      protected_fields: {
        text: textValidation.value,
        feedback: feedbackValidation.value,
        stress_level: String(stress_level),
        stress_percent: Math.round(normalizedStressPercent),
      },
      final_result: {
        stress_level: String(stress_level),
        stress_percent: Math.round(normalizedStressPercent),
      },
      recommended_videos: {
        recommendations,
      },
    };
    const { data: historyEntry, error } = await insertHistoryRow({
      history_id,
      user_id: req.user.user_id,
      stress_level: encryptText(String(stress_level)),
      stress_percent: encryptText(String(Math.round(normalizedStressPercent))),
      text: encryptText(PROTECTED_FIELD_MARKER),
      feedback: encryptText(PROTECTED_FIELD_MARKER),
      video_link: buildVideoPayload(recommendations, historyMetadata),
      created_at: DateTime.now().setZone("Asia/Jakarta").toISO()
    });

    if (error) throw error;

    res.status(201).json(decryptHistoryEntry(historyEntry));
  } catch (error) {
    console.error("Error saving history:", error);
    sendSafeError(res, 500, "Gagal menyimpan riwayat");
  }
});

// Get user's history
router.get("/", authenticateToken, async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('history')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) throw error;

    res.json(decryptHistoryEntries(history));
  } catch (error) {
    console.error("Error fetching history:", error);
    sendSafeError(res, 500, "Gagal mengambil riwayat");
  }
});

// Delete one history item owned by the authenticated user
async function deleteHistoryById(req, res) {
  console.log("DELETE history hit:", req.params.id);
  const historyId = normalizeHistoryId(req.params.id);

  if (!historyId) {
    return res.status(400).json({
      success: false,
      message: "ID riwayat tidak valid",
    });
  }

  try {
    const { data: deletedEntries, error } = await supabase
      .from("history")
      .delete()
      .eq("history_id", historyId)
      .eq("user_id", req.user.user_id)
      .select("history_id");

    if (error) throw error;

    const deletedEntry = Array.isArray(deletedEntries) ? deletedEntries[0] : null;
    if (!deletedEntry) {
      return res.status(404).json({
        success: false,
        message: "Riwayat tidak ditemukan",
      });
    }

    return res.json({
      success: true,
      message: "Riwayat berhasil dihapus",
      history_id: deletedEntry.history_id,
    });
  } catch (error) {
    console.error("Error deleting history:", error);
    return res.status(500).json({
      success: false,
      message: "Gagal menghapus riwayat",
    });
  }
}

console.log("DELETE /api/history/:id route loaded");
router.delete("/:id", authenticateToken, deleteHistoryById);
// Compatibility for older server mounts that used app.use("/api", historyRoutes).
router.delete("/history/:id", authenticateToken, deleteHistoryById);

// Get single history item by ID
router.get("/:historyId", authenticateToken, async (req, res) => {
  try {
    const historyId = normalizeHistoryId(req.params.historyId);
    console.log(`Fetching history item: historyId=${historyId}, userId=${req.user.user_id}`);

    if (!historyId) {
      return sendSafeError(res, 400, "ID riwayat tidak valid");
    }

    const { data: historyItem, error } = await supabase
      .from('history')
      .select(`
        history_id,
        user_id,
        stress_level,
        stress_percent,
        text,
        feedback,
        video_link,
        created_at
      `)
      .eq('history_id', historyId)
      .eq('user_id', req.user.user_id)
      .single();

    if (error) {
      console.error('Supabase error:', error);
      if (error.code === 'PGRST116') {
        return sendSafeError(res, 404, "Item riwayat tidak ditemukan");
      }
      throw error;
    }

    console.log('History item found');
    res.json(decryptHistoryEntry(historyItem));
  } catch (error) {
    console.error("Error fetching history item:", error.message, error.stack);
    sendSafeError(res, 500, "Gagal mengambil item riwayat");
  }
});

export default router;
