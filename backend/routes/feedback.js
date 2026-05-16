import express from "express";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { generateId } from "../utils/helpers.js";
import { sendSafeError, validateRequiredText } from "../utils/security.js";
import { decryptHistoryEntries, decryptHistoryEntry, encryptText } from "../utils/encryption.js";

const router = express.Router();
const PROTECTED_FIELD_MARKER = "[protected in encrypted metadata]";

// Get current user's feedback (using history table for now)
router.get("/feedback", authenticateToken, async (req, res) => {
  try {
    const { data: history, error } = await supabase
      .from('history')
      .select('history_id, text, feedback, created_at')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Transform to feedback format
    const feedback = decryptHistoryEntries(history).map(h => ({
      id: h.history_id,
      user_name: 'Anonymous', // Since we don't have user name in history
      text: h.text,
      analysis_result: { feedback: h.feedback },
      created_at: h.created_at
    }));

    res.json(feedback);
  } catch (error) {
    console.error("Error fetching feedback:", error);
    sendSafeError(res, 500, "Gagal mengambil masukan");
  }
});

// Create feedback (save as history entry)
router.post("/feedback", authenticateToken, async (req, res) => {
  const { user_name, text, analysis_result } = req.body;

  const nameValidation = validateRequiredText(user_name, "Nama pengguna", 50);
  const textValidation = validateRequiredText(text, "Teks");
  if (!nameValidation.isValid || !textValidation.isValid) {
    return sendSafeError(res, 400, "Nama pengguna dan teks wajib diisi");
  }

  try {
    const history_id = generateId();
    const feedbackText = analysis_result?.feedback || 'Thank you for your feedback';

    const { data: historyEntry, error } = await supabase
      .from('history')
      .insert({
        history_id,
        user_id: req.user.user_id,
        stress_level: encryptText('unknown'),
        stress_percent: null,
        text: encryptText(PROTECTED_FIELD_MARKER),
        feedback: encryptText(PROTECTED_FIELD_MARKER),
        video_link: {
          recommendations: [],
          protected_metadata: encryptText(JSON.stringify({
            version: 1,
            method: 'feedback',
            protected_fields: {
              text: textValidation.value,
              feedback: feedbackText,
              stress_level: 'unknown',
              stress_percent: 0
            },
            final_result: { stress_level: 'unknown', stress_percent: 0 }
          }))
        },
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) throw error;

    res.status(201).json({
      id: historyEntry.history_id,
      user_name: nameValidation.value,
      text: textValidation.value,
      analysis_result,
      created_at: historyEntry.created_at
    });
  } catch (error) {
    console.error("Error creating feedback:", error);
    sendSafeError(res, 500, "Gagal membuat masukan");
  }
});

// Get feedback by ID
router.get("/feedback/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { data: historyEntry, error } = await supabase
      .from('history')
      .select('*')
      .eq('history_id', id)
      .eq('user_id', req.user.user_id)
      .single();

    if (error || !historyEntry) {
      return sendSafeError(res, 404, "Masukan tidak ditemukan");
    }

    const decryptedEntry = decryptHistoryEntry(historyEntry);
    const feedback = {
      id: decryptedEntry.history_id,
      user_name: 'Anonymous',
      text: decryptedEntry.text,
      analysis_result: { feedback: decryptedEntry.feedback },
      created_at: decryptedEntry.created_at
    };

    res.json(feedback);
  } catch (error) {
    console.error("Error fetching feedback:", error);
    sendSafeError(res, 500, "Gagal mengambil masukan");
  }
});

// Delete feedback
router.delete("/feedback/:id", authenticateToken, async (req, res) => {
  const { id } = req.params;

  try {
    const { error } = await supabase
      .from('history')
      .delete()
      .eq('history_id', id)
      .eq('user_id', req.user.user_id);

    if (error) throw error;

    res.status(204).end();
  } catch (error) {
    console.error("Error deleting feedback:", error);
    sendSafeError(res, 500, "Gagal menghapus masukan");
  }
});

export default router;
