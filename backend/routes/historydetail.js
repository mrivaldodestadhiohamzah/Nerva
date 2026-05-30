import express from "express";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendSafeError } from "../utils/security.js";
import { decryptHistoryEntry } from "../utils/encryption.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

router.get("/history/:historyId", authenticateToken, async (req, res) => {
  try {
    const { historyId } = req.params;

    const { data: historyItem, error } = await supabase
      .from("history")
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
      .eq("history_id", historyId)
      .eq("user_id", req.user.user_id)
      .single();

    if (error) {
      logger.warn("History detail fetch failed", { message: error.message, code: error.code });
      if (error.code === "PGRST116") {
        return sendSafeError(res, 404, "Item riwayat tidak ditemukan");
      }
      throw error;
    }

    res.json(decryptHistoryEntry(historyItem));
  } catch (error) {
    logger.error("Error fetching history item", { message: error.message, code: error.code });
    sendSafeError(res, 500, "Gagal mengambil item riwayat");
  }
});

export default router;
