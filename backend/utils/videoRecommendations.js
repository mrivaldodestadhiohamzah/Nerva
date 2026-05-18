const VIDEO_LIBRARY = {
  high: [
    "https://www.youtube.com/embed/Qb3z4Kvrj2o",
    "https://www.youtube.com/embed/-RbilRohcGk",
    "https://www.youtube.com/embed/inpok4MKVLM",
  ],
  medium: [
    "https://www.youtube.com/embed/ZToicYcHIOU",
    "https://www.youtube.com/embed/inpok4MKVLM",
    "https://www.youtube.com/embed/O-6f5wQXSu8",
  ],
  mild: [
    "https://www.youtube.com/embed/ZToicYcHIOU",
    "https://www.youtube.com/embed/O-6f5wQXSu8",
    "https://www.youtube.com/embed/inpok4MKVLM",
  ],
  anxiety: [
    "https://www.youtube.com/embed/ZToicYcHIOU",
    "https://www.youtube.com/embed/inpok4MKVLM",
    "https://www.youtube.com/embed/O-6f5wQXSu8",
  ],
  depression: [
    "https://www.youtube.com/embed/inpok4MKVLM",
    "https://www.youtube.com/embed/O-6f5wQXSu8",
    "https://www.youtube.com/embed/ZToicYcHIOU",
  ],
  stable: [
    "https://www.youtube.com/embed/O-6f5wQXSu8",
    "https://www.youtube.com/embed/ZToicYcHIOU",
    "https://www.youtube.com/embed/inpok4MKVLM",
  ],
};

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

function uniqueRecommendations(recommendations = []) {
  return [...new Set(
    recommendations
      .map(url => String(url || "").trim())
      .filter(Boolean)
  )];
}

function extractMlVideoRecommendations(mlResult = {}) {
  const sources = [
    mlResult.recommended_videos?.recommendations,
    mlResult.recommended_videos,
    mlResult.recommendations,
    mlResult.videos,
    mlResult.video_link,
  ];

  return uniqueRecommendations(sources.flatMap(normalizeRecommendations));
}

function normalizeLabel(value = "") {
  return String(value || "").trim().toLowerCase();
}

function getNumericPercent(...values) {
  for (const value of values) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.min(Math.max(numeric, 0), 100);
  }

  return null;
}

function getMlStressLabel(mlResult = {}) {
  return (
    mlResult.predicted_stress?.label ||
    mlResult.stress_label ||
    mlResult.stressLevel ||
    mlResult.label ||
    ""
  );
}

function getMlEmotionLabel(mlResult = {}) {
  return (
    mlResult.predicted_emotion?.label ||
    mlResult.emotion ||
    mlResult.emotion_label ||
    mlResult.sentiment ||
    mlResult.prediction ||
    ""
  );
}

function getMlStressPercent(mlResult = {}) {
  return getNumericPercent(
    mlResult.stress_level?.stress_level,
    mlResult.stress_percent,
    mlResult.stressPercent,
    mlResult.percent,
    mlResult.score
  );
}

function getStressCategory({ mlResult = {}, stressLabel, fusedPercent, fusion = {} }) {
  const label = normalizeLabel(stressLabel || getMlStressLabel(mlResult));
  const percent = getNumericPercent(
    fusedPercent,
    fusion.fusedStressPercent,
    getMlStressPercent(mlResult)
  );

  if (label.includes("severe") || label.includes("very high") || label.includes("tinggi")) return "high";
  if (label.includes("high")) return "high";
  if (label.includes("medium") || label.includes("moderate") || label.includes("sedang")) return "medium";
  if (label.includes("mild") || label.includes("ringan")) return "mild";

  if (percent !== null) {
    if (percent >= 70) return "high";
    if (percent >= 40) return "medium";
    if (percent >= 20) return "mild";
  }

  return "stable";
}

function getEmotionCategory({ mlResult = {}, dass = {} }) {
  const emotion = normalizeLabel(getMlEmotionLabel(mlResult));
  const dominantScale = normalizeLabel(dass.dominantScale);

  if (
    emotion.includes("anx") ||
    emotion.includes("cemas") ||
    emotion.includes("fear") ||
    emotion.includes("takut") ||
    dominantScale === "anxiety"
  ) {
    return "anxiety";
  }

  if (
    emotion.includes("sad") ||
    emotion.includes("depress") ||
    emotion.includes("sedih") ||
    emotion.includes("murung") ||
    dominantScale === "depression"
  ) {
    return "depression";
  }

  return null;
}

function deterministicOffset(seed = "", modulo = 1) {
  if (modulo <= 1) return 0;

  let hash = 0;
  for (const char of String(seed)) {
    hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  }

  return Math.abs(hash) % modulo;
}

function pickRecommendations(pool = [], seed = "", count = 2) {
  const uniquePool = uniqueRecommendations(pool);
  if (uniquePool.length <= count) return uniquePool;

  const offset = deterministicOffset(seed, uniquePool.length);
  const rotated = [...uniquePool.slice(offset), ...uniquePool.slice(0, offset)];
  return rotated.slice(0, count);
}

export function buildVideoRecommendations({
  mlResult = {},
  fusion = {},
  dass = {},
  stressLabel,
  fusedPercent,
  maxItems = 2,
} = {}) {
  const mlRecommendations = extractMlVideoRecommendations(mlResult);
  const mlStressLabel = getMlStressLabel(mlResult);
  const mlEmotionLabel = getMlEmotionLabel(mlResult);
  const mlLabel = normalizeLabel(mlStressLabel);
  const emotionCategory = getEmotionCategory({ mlResult, dass });
  const stressCategory = getStressCategory({ mlResult, stressLabel, fusedPercent, fusion });
  const percent = getNumericPercent(fusedPercent, fusion.fusedStressPercent, getMlStressPercent(mlResult));
  const seed = [
    mlLabel,
    normalizeLabel(stressLabel),
    emotionCategory,
    stressCategory,
    Math.round(percent || 0),
  ].join("|");

  if (mlRecommendations.length > 0) {
    return {
      recommendations: pickRecommendations(mlRecommendations, seed, maxItems),
      source: "ml_api",
      basis: {
        mlStressLabel: mlStressLabel || null,
        mlEmotionLabel: mlEmotionLabel || null,
        stressCategory,
        emotionCategory,
      },
    };
  }

  const candidatePool = [
    ...(emotionCategory ? VIDEO_LIBRARY[emotionCategory] : []),
    ...VIDEO_LIBRARY[stressCategory],
  ];

  return {
    recommendations: pickRecommendations(candidatePool, seed, maxItems),
    source: "dynamic_rule_fallback",
    basis: {
      mlStressLabel: mlStressLabel || null,
      mlEmotionLabel: mlEmotionLabel || null,
      stressCategory,
      emotionCategory,
      fusedStressPercent: getNumericPercent(fusedPercent, fusion.fusedStressPercent),
    },
  };
}
