import express from "express";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendSafeError } from "../utils/security.js";
import { decryptHistoryEntry } from "../utils/encryption.js";

const router = express.Router();

router.get("/history/:historyId", authenticateToken, async (req, res) => {
  try {
    const { historyId } = req.params;

    console.log(`Fetching history item: historyId=${historyId}, userId=${req.user.user_id}`);

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
      console.error("Supabase error:", error);
      if (error.code === "PGRST116") {
        return sendSafeError(res, 404, "Item riwayat tidak ditemukan");
      }
      throw error;
    }

    res.json(decryptHistoryEntry(historyItem));
  } catch (error) {
    console.error("Error fetching history item:", error.message, error.stack);
    sendSafeError(res, 500, "Gagal mengambil item riwayat");
  }
});

export default router;
