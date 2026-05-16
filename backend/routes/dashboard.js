import express from "express";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendSafeError } from "../utils/security.js";
import { decryptHistoryEntries, decryptHistoryEntry } from "../utils/encryption.js";

const router = express.Router();
const DEFAULT_DASHBOARD_TIME_ZONE = "Asia/Jakarta";
const DASHBOARD_HISTORY_SELECTS = [
  "history_id, stress_level, stress_percent, created_at, text, feedback, video_link",
  "history_id, stress_level, stress_percent, created_at, text, feedback",
  "history_id, stress_level, stress_percent, created_at",
];

function clampDays(value, fallback = 30) {
  const numeric = parseInt(value, 10);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(numeric, 1), 365);
}

function getRequestedTimeZone(timeZone) {
  if (!timeZone || typeof timeZone !== "string") {
    return DEFAULT_DASHBOARD_TIME_ZONE;
  }

  try {
    Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return DEFAULT_DASHBOARD_TIME_ZONE;
  }
}

function getRangeStart(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function getLocalDateKey(date, timeZone) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return null;
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const lookup = Object.fromEntries(parts.map(part => [part.type, part.value]));

  return lookup.year && lookup.month && lookup.day
    ? `${lookup.year}-${lookup.month}-${lookup.day}`
    : null;
}

function normalizeDashboardEntry(entry) {
  const createdDate = new Date(entry.created_at);
  const stressPercent = Number(entry.stress_percent);

  if (Number.isNaN(createdDate.getTime()) || !Number.isFinite(stressPercent)) {
    return null;
  }

  return {
    ...entry,
    createdDate,
    stress_percent: Math.min(Math.max(stressPercent, 0), 100),
  };
}

function buildStressHistory(entries, timeZone) {
  const dailyData = new Map();

  entries.forEach(entry => {
    const dateKey = getLocalDateKey(entry.createdDate, timeZone);
    if (!dateKey) return;

    const existing = dailyData.get(dateKey) || {
      total: 0,
      count: 0,
      min: 100,
      max: 0,
      latestTimestamp: 0,
    };

    existing.total += entry.stress_percent;
    existing.count += 1;
    existing.min = Math.min(existing.min, entry.stress_percent);
    existing.max = Math.max(existing.max, entry.stress_percent);
    existing.latestTimestamp = Math.max(existing.latestTimestamp, entry.createdDate.getTime());
    dailyData.set(dateKey, existing);
  });

  return [...dailyData.entries()]
    .sort(([dateA], [dateB]) => dateA.localeCompare(dateB))
    .map(([date, value]) => {
      const average = Math.round(value.total / value.count);
      return {
        date,
        value: average,
        stress_percent: average,
        count: value.count,
        min: Math.round(value.min),
        max: Math.round(value.max),
        latest_created_at: new Date(value.latestTimestamp).toISOString(),
      };
    });
}

async function fetchDashboardHistory({ userId, since }) {
  let lastError = null;

  for (const selectFields of DASHBOARD_HISTORY_SELECTS) {
    const { data, error } = await supabase
      .from("history")
      .select(selectFields)
      .eq("user_id", userId)
      .gte("created_at", since.toISOString())
      .order("created_at", { ascending: false });

    if (!error) {
      if (lastError) {
        console.warn("Dashboard history query used fallback columns:", selectFields);
      }
      return data || [];
    }

    lastError = error;
    if (!isMissingColumnError(error)) {
      throw error;
    }

    console.warn("Dashboard history optional column missing, retrying with fallback:", error.message);
  }

  throw lastError;
}

function isMissingColumnError(error) {
  const message = String(error?.message || "");
  return error?.code === "42703" || /column .* does not exist/i.test(message);
}

// Dashboard summary with stress history
router.get("/summary", authenticateToken, async (req, res) => {
  try {
    const days = clampDays(req.query.days, 30);
    const chartDays = clampDays(req.query.chartDays, days);
    const timeZone = getRequestedTimeZone(req.query.tz);
    const queryDays = Math.max(days, chartDays);
    const queryStart = getRangeStart(queryDays);

    const history = await fetchDashboardHistory({
      userId: req.user.user_id,
      since: queryStart,
    });
    const decryptedHistory = decryptHistoryEntries(history);
    const normalizedHistory = decryptedHistory
      .map(normalizeDashboardEntry)
      .filter(Boolean);
    const summaryStart = getRangeStart(days);
    const chartStart = getRangeStart(chartDays);
    const summaryHistory = normalizedHistory.filter(h => h.createdDate >= summaryStart);
    const chartHistorySource = normalizedHistory.filter(h => h.createdDate >= chartStart);

    if (summaryHistory.length === 0 && chartHistorySource.length === 0) {
      return res.json({
        averageStress: 0,
        stressHistory: [],
        weeklyCount: 0,
        totalCount: 0,
        chartTimeZone: timeZone,
        tips: []
      });
    }

    // Calculate average stress from filtered history
    const totalStress = summaryHistory.reduce((sum, h) => sum + h.stress_percent, 0);
    const averageStress = summaryHistory.length > 0 ? Math.round(totalStress / summaryHistory.length) : 0;


    // Calculate weekly count (last 7 days)
    const weekAgo = getRangeStart(7);
    const weeklyCount = normalizedHistory.filter(h => h.createdDate >= weekAgo).length;
    const levelCounts = summaryHistory.reduce((counts, item) => {
      const level = item.stress_level || 'Rendah';
      counts[level] = (counts[level] || 0) + 1;
      return counts;
    }, {});
    const mostCommonStressLevel = Object.entries(levelCounts)
      .sort((a, b) => b[1] - a[1])[0]?.[0] || 'Rendah';

    // Group stress data by local day for chart.
    // Supabase returns timestamps in UTC, while users read the dashboard by local date.
    const stressHistory = buildStressHistory(chartHistorySource, timeZone);

    // Extract tips from feedback containing "suggestion"
    const tips = [];
    summaryHistory.forEach(h => {
      if (h.feedback) {
        const feedback = h.feedback.toLowerCase();
        const suggestionMatch = feedback.match(/suggestion[s]?[:\-]\s*([^.!?]+)/i);
        if (suggestionMatch) {
          const tip = suggestionMatch[1].trim();
          if (tip.length > 10 && tip.length < 150) {
            tips.push(tip.charAt(0).toUpperCase() + tip.slice(1));
          }
        }
      }
    });

    // Remove duplicates and limit to 5 tips
    const uniqueTips = [...new Set(tips)].slice(0, 5);

    // Default tips if none found
    const defaultTips = [
      'Take regular breaks throughout your day to reduce stress',
      'Practice deep breathing exercises for 5-10 minutes',
      'Try journaling to process your thoughts and emotions',
      'Engage in light physical activity or stretching',
      'Maintain a consistent sleep schedule for better mental health'
    ];

    res.json({ 
      averageStress, 
      stressHistory,
      weeklyCount,
      totalCount: summaryHistory.length,
      mostCommonStressLevel,
      chartTimeZone: timeZone,
      tips: uniqueTips.length > 0 ? uniqueTips : defaultTips
    });
  } catch (error) {
    console.error("Error fetching dashboard summary:", error);
    sendSafeError(res, 500, "Gagal mengambil ringkasan dasbor");
  }
});

// Recent history entries
router.get("/recent", authenticateToken, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit) || 10, 1), 50);

  try {
    const { data: history, error } = await supabase
      .from('history')
      .select('*')
      .eq('user_id', req.user.user_id)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) throw error;

    res.json(decryptHistoryEntries(history));
  } catch (error) {
    console.error("Error fetching recent history:", error);
    sendSafeError(res, 500, "Gagal mengambil riwayat terbaru");
  }
});

// Get detailed history entry by ID
router.get("/detail/:id", authenticateToken, async (req, res) => {
  try {
    const { data: entry, error } = await supabase
      .from('history')
      .select('*')
      .eq('history_id', req.params.id)
      .eq('user_id', req.user.user_id)
      .maybeSingle();

    if (error) {
      console.error("Supabase error:", error);
      return sendSafeError(res, 500, "Terjadi kesalahan database");
    }

    if (!entry) {
      return sendSafeError(res, 404, "Data tidak ditemukan");
    }

    res.json(decryptHistoryEntry(entry));
  } catch (error) {
    console.error("Error fetching entry details:", error);
    sendSafeError(res, 500, "Gagal mengambil detail data");
  }
});

export default router;

