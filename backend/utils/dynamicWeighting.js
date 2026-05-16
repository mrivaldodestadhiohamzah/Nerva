const DEFAULT_DASS_DURATION_SECONDS = 60;
const DASS_TIME_K = 0.08;
const DASS_TIME_THRESHOLD_SECONDS = 60;
const DASS_SIGMA_IDEAL = 1.2;
const DASS_PRIOR_WEIGHT = 0.65;
const TEXT_PRIOR_WEIGHT = 0.35;

const DISTRESS_KEYWORDS_HIGH = [
  "bunuh diri", "mengakhiri hidup", "tidak ingin hidup", "menyakiti diri",
  "putus asa", "hancur", "tidak sanggup", "panik", "depresi",
];

const DISTRESS_KEYWORDS_MEDIUM = [
  "stres", "stress", "cemas", "khawatir", "takut", "sedih", "capek",
  "lelah", "tertekan", "menangis", "gelisah", "marah", "kesepian",
  "overthinking", "sulit tidur", "pusing",
];

const POSITIVE_KEYWORDS = [
  "senang", "bahagia", "tenang", "rileks", "relax", "lega", "bersyukur",
  "semangat", "baik", "nyaman", "damai", "puas", "stabil", "aman",
];

const NOISE_WORDS = ["wkwk", "haha", "hehe", "lol", "test", "tes"];

export function clamp(value, min = 0, max = 1) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return min;
  return Math.min(Math.max(numeric, min), max);
}

export function sigmoid(value) {
  return 1 / (1 + Math.exp(-value));
}

export function standardDeviation(values = []) {
  const numbers = values.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) return 0;

  const mean = numbers.reduce((sum, value) => sum + value, 0) / numbers.length;
  const variance = numbers.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / numbers.length;
  return Math.sqrt(variance);
}

function round4(value) {
  return Number(clamp(value).toFixed(4));
}

function roundPercent(value) {
  return Math.round(clamp(value) * 100);
}

function normalizeProbability(value, fallback = 0) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return clamp(numeric > 1 ? numeric / 100 : numeric);
}

function getAnswerValues(answers = []) {
  return (Array.isArray(answers) ? answers : [])
    .map(answer => (typeof answer === "object" ? Number(answer.value) : Number(answer)))
    .filter(value => Number.isFinite(value));
}

function tokenize(text = "") {
  return String(text).toLowerCase().trim().match(/[\p{L}\p{N}]+/gu) || [];
}

function countPhraseMatches(text, phrases) {
  const lowerText = String(text).toLowerCase();
  return phrases.reduce((count, phrase) => count + (lowerText.includes(phrase) ? 1 : 0), 0);
}

function countByValue(values = []) {
  return [0, 1, 2, 3].reduce((counts, value) => {
    counts[value] = values.filter(answer => answer === value).length;
    return counts;
  }, {});
}

function longestRunRatio(values = []) {
  if (values.length === 0) return 0;

  let longest = 1;
  let current = 1;
  for (let index = 1; index < values.length; index += 1) {
    if (values[index] === values[index - 1]) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 1;
    }
  }

  return longest / values.length;
}

function collectNumericProbabilities(value, output = []) {
  if (Array.isArray(value)) {
    value.forEach(item => collectNumericProbabilities(item, output));
    return output;
  }

  if (value && typeof value === "object") {
    Object.entries(value).forEach(([key, nested]) => {
      if (/prob|confidence|softmax|score/i.test(key)) {
        collectNumericProbabilities(nested, output);
      }
    });
    return output;
  }

  const numeric = Number(value);
  if (Number.isFinite(numeric)) output.push(normalizeProbability(numeric));
  return output;
}

export function normalizeMlStressPercent(mlResult = {}) {
  const stressPercent =
    mlResult.stress_level?.stress_level ??
    mlResult.stress_percent ??
    mlResult.predicted_stress?.stress_percent;

  const numeric = Number(stressPercent);
  return Number.isFinite(numeric) ? clamp(numeric, 0, 100) : 50;
}

export function normalizeMlConfidence(mlResult = {}) {
  const directConfidence =
    mlResult.predicted_stress?.confidence ??
    mlResult.confidence ??
    mlResult.confidence_score ??
    mlResult.stress_level?.confidence;

  const probabilities = [
    ...collectNumericProbabilities(mlResult.softmax),
    ...collectNumericProbabilities(mlResult.probabilities),
    ...collectNumericProbabilities(mlResult.predicted_stress?.probabilities),
    ...collectNumericProbabilities(mlResult.class_probabilities),
    ...collectNumericProbabilities(mlResult.prediction_probabilities),
  ];

  if (probabilities.length > 0) return round4(Math.max(...probabilities));
  return round4(normalizeProbability(directConfidence, 0.5));
}

export function getStressLabel(percent) {
  if (percent >= 66) return "Tinggi";
  if (percent >= 33) return "Sedang";
  return "Rendah";
}

export function getDassAnswerCompleteness(answers = []) {
  const validAnswers = getAnswerValues(answers).filter(value => Number.isInteger(value) && value >= 0 && value <= 3);
  return clamp(validAnswers.length / 21);
}

export function analyzeCurhatQuality(text = "", confidence = 0.5) {
  const source = String(text);
  const words = tokenize(source);
  const wordCount = words.length;
  const uniqueWords = new Set(words);
  const uniqueRatio = wordCount > 0 ? uniqueWords.size / wordCount : 0;
  const mostCommonRatio = wordCount > 0
    ? Math.max(...[...uniqueWords].map(word => words.filter(item => item === word).length)) / wordCount
    : 0;
  const repeatedCharRatio = source.length > 0 ? ((source.match(/(.)\1{3,}/g) || []).join("").length / source.length) : 0;
  const nonAlphaNumericRatio = source.length > 0
    ? ((source.match(/[^\p{L}\p{N}\s.,!?'"()/\-]/gu) || []).length / source.length)
    : 0;
  const highDistressCount = countPhraseMatches(source, DISTRESS_KEYWORDS_HIGH);
  const mediumDistressCount = countPhraseMatches(source, DISTRESS_KEYWORDS_MEDIUM);
  const positiveCount = countPhraseMatches(source, POSITIVE_KEYWORDS);
  const noiseWordCount = words.filter(word => NOISE_WORDS.includes(word)).length;
  const distressSignal = clamp((highDistressCount * 0.45) + (mediumDistressCount * 0.16), 0, 1);
  const positiveSignal = clamp(positiveCount * 0.18, 0, 1);
  const emotionalIntensity = clamp(distressSignal + positiveSignal + Math.min((source.match(/!/g) || []).length * 0.04, 0.12));
  const sentimentPolarity = clamp((positiveSignal - distressSignal + 1) / 2);
  const noiseLevel = clamp((nonAlphaNumericRatio * 3) + repeatedCharRatio + (noiseWordCount / Math.max(wordCount, 1)));
  const repetitionScore = clamp((mostCommonRatio - 0.25) / 0.55);
  const lexicalDiversity = clamp((uniqueRatio - 0.25) / 0.55);
  const clarity = clamp(1 - noiseLevel);
  const meaningfulness = clamp(
    (0.35 * lexicalDiversity) +
    (0.35 * emotionalIntensity) +
    (0.2 * Math.min(1, wordCount / 18)) +
    (0.1 * clarity) -
    (0.35 * repetitionScore)
  );
  const shortButEmotional = wordCount <= 8 && emotionalIntensity >= 0.16;
  const spamLike = wordCount >= 4 && (mostCommonRatio >= 0.6 || repetitionScore >= 0.75 || meaningfulness < 0.18);
  const emotionallyPositive = positiveSignal >= 0.25 && distressSignal <= 0.2;
  const emotionallyDistressed = distressSignal >= 0.35;
  const R_length = shortButEmotional
    ? Math.max(0.55, Math.min(1, wordCount / 30))
    : Math.min(1, wordCount / 30);
  const R_confidence = normalizeProbability(confidence, 0.5);

  const R_text = clamp(
    (0.3 * R_confidence) +
    (0.2 * meaningfulness) +
    (0.15 * clarity) +
    (0.15 * emotionalIntensity) +
    (0.1 * R_length) +
    (0.1 * (1 - repetitionScore)) -
    (spamLike ? 0.22 : 0)
  );

  return {
    wordCount,
    uniqueRatio: Number(uniqueRatio.toFixed(4)),
    mostCommonRatio: Number(mostCommonRatio.toFixed(4)),
    R_length: round4(R_length),
    R_confidence: round4(R_confidence),
    clarity: round4(clarity),
    emotionalIntensity: round4(emotionalIntensity),
    distressSignal: round4(distressSignal),
    positiveSignal: round4(positiveSignal),
    sentimentPolarity: round4(sentimentPolarity),
    meaningfulness: round4(meaningfulness),
    repetitionScore: round4(repetitionScore),
    noiseLevel: round4(noiseLevel),
    shortButEmotional,
    spamLike,
    emotionallyPositive,
    emotionallyDistressed,
    R_text: round4(R_text),
  };
}

export function detectDassSuspiciousPatterns({
  answers = [],
  durationSeconds = DEFAULT_DASS_DURATION_SECONDS,
  P_text = 0,
  P_dass = 0,
  textQuality = {},
} = {}) {
  const values = getAnswerValues(answers);
  const counts = countByValue(values);
  const answerCount = Math.max(values.length, 1);
  const highRatio = counts[3] / answerCount;
  const lowRatio = counts[0] / answerCount;
  const mostCommonRatio = Math.max(...Object.values(counts)) / answerCount;
  const runRatio = longestRunRatio(values);
  const std = standardDeviation(values);
  const suspiciousPatterns = [];

  if (highRatio >= 0.8) suspiciousPatterns.push("almost_all_highest_answers");
  if (lowRatio >= 0.8) suspiciousPatterns.push("almost_all_lowest_answers");
  if (mostCommonRatio >= 0.85) suspiciousPatterns.push("uniform_repetitive_answers");
  if (runRatio >= 0.45) suspiciousPatterns.push("long_repeated_answer_run");
  if (std <= 0.25) suspiciousPatterns.push("abnormally_low_answer_variance");
  if (durationSeconds > 0 && durationSeconds < 35) suspiciousPatterns.push("completion_too_fast");

  const contradiction = detectContradiction({
    P_text,
    P_dass,
    textQuality,
  });

  if (contradiction.hasContradiction) {
    suspiciousPatterns.push("dass_text_emotional_contradiction");
  }

  return {
    counts,
    highRatio: round4(highRatio),
    lowRatio: round4(lowRatio),
    mostCommonRatio: round4(mostCommonRatio),
    longestRunRatio: round4(runRatio),
    standardDeviation: Number(std.toFixed(4)),
    suspiciousPatterns,
    isSuspicious: suspiciousPatterns.length > 0,
    contradiction,
  };
}

export function detectContradiction({ P_text = 0, P_dass = 0, textQuality = {} } = {}) {
  const mismatch = Math.abs(clamp(P_text) - clamp(P_dass));
  const positiveVsHighDass =
    P_dass >= 0.66 &&
    (P_text <= 0.35 || textQuality.emotionallyPositive) &&
    !textQuality.emotionallyDistressed;
  const distressedVsLowDass =
    P_dass <= 0.33 &&
    (P_text >= 0.66 || textQuality.emotionallyDistressed);
  const strongProbabilityMismatch = mismatch >= 0.45;
  const type = positiveVsHighDass
    ? "positive_curhat_vs_high_dass"
    : distressedVsLowDass
      ? "distressed_curhat_vs_low_dass"
      : strongProbabilityMismatch
        ? "large_probability_gap"
        : "none";

  return {
    hasContradiction: positiveVsHighDass || distressedVsLowDass || strongProbabilityMismatch,
    type,
    mismatch: round4(mismatch),
  };
}

export function calculateDassReliability({
  answers = [],
  durationSeconds = DEFAULT_DASS_DURATION_SECONDS,
  P_text,
  P_dass,
  textQuality = {},
  k = DASS_TIME_K,
  T_threshold = DASS_TIME_THRESHOLD_SECONDS,
  sigma_ideal = DASS_SIGMA_IDEAL,
} = {}) {
  const answerValues = getAnswerValues(answers);
  const T_user = Number.isFinite(Number(durationSeconds))
    ? Math.max(0, Number(durationSeconds))
    : DEFAULT_DASS_DURATION_SECONDS;

  // Time reliability: slower, more deliberate completion is more reliable.
  const R_time = clamp(sigmoid(k * (T_user - T_threshold)));

  // Consistency reliability: abnormal under-variance or over-variance is penalized.
  const std = standardDeviation(answerValues);
  const R_consistency = clamp(1 - (Math.abs(std - sigma_ideal) / sigma_ideal));

  // Agreement reliability: probability disagreement between DASS and text lowers trust.
  const R_agreement = clamp(1 - Math.abs(clamp(P_text) - clamp(P_dass)));

  const behavioral = detectDassSuspiciousPatterns({
    answers,
    durationSeconds: T_user,
    P_text,
    P_dass,
    textQuality,
  });

  const patternPenalty = behavioral.suspiciousPatterns.reduce((penalty, pattern) => {
    const weights = {
      almost_all_highest_answers: 0.32,
      almost_all_lowest_answers: 0.32,
      uniform_repetitive_answers: 0.4,
      long_repeated_answer_run: 0.14,
      abnormally_low_answer_variance: 0.25,
      completion_too_fast: 0.2,
      dass_text_emotional_contradiction: 0.3,
    };
    return penalty + (weights[pattern] || 0.1);
  }, 0);
  const R_behavior = clamp(1 - patternPenalty);

  const baseReliability = clamp(
    (0.22 * R_time) +
    (0.23 * R_consistency) +
    (0.25 * R_agreement) +
    (0.3 * R_behavior)
  );
  const R_dass = clamp(baseReliability - (0.25 * clamp(patternPenalty)));

  return {
    R_time: round4(R_time),
    R_consistency: round4(R_consistency),
    R_agreement: round4(R_agreement),
    R_behavior: round4(R_behavior),
    R_dass: round4(R_dass),
    suspicionSeverity: round4(patternPenalty),
    durationSeconds: T_user,
    standardDeviation: Number(std.toFixed(4)),
    suspiciousPatterns: behavioral.suspiciousPatterns,
    suspiciousPatternDetails: {
      counts: behavioral.counts,
      highRatio: behavioral.highRatio,
      lowRatio: behavioral.lowRatio,
      mostCommonRatio: behavioral.mostCommonRatio,
      longestRunRatio: behavioral.longestRunRatio,
    },
    contradiction: behavioral.contradiction,
  };
}

export function calculateTextReliability({ text = "", confidence = 0.5 } = {}) {
  return analyzeCurhatQuality(text, confidence);
}

export function calculateFusionWeights({
  R_text = 0,
  R_dass = 0,
  suspiciousPatterns = [],
  contradiction = { hasContradiction: false },
  textQuality = {},
} = {}) {
  const adjustedText = clamp(R_text) * TEXT_PRIOR_WEIGHT;
  const adjustedDass = clamp(R_dass) * DASS_PRIOR_WEIGHT;
  const totalReliability = adjustedText + adjustedDass;
  let w_text = totalReliability <= 0 ? 0.5 : adjustedText / totalReliability;
  let w_dass = totalReliability <= 0 ? 0.5 : adjustedDass / totalReliability;

  const hasSuspiciousQuestionnaire = suspiciousPatterns.length > 0;
  const textReliable = textQuality.R_text >= 0.55 && textQuality.R_confidence >= 0.6 && !textQuality.spamLike;
  const textWeak = textQuality.R_text < 0.35 || textQuality.spamLike;

  if (hasSuspiciousQuestionnaire && textReliable) {
    w_text = Math.max(w_text, 0.45);
    w_dass = 1 - w_text;
  }

  if (contradiction.hasContradiction && textReliable) {
    w_text = Math.max(w_text, 0.45);
    w_dass = 1 - w_text;
  }

  if (hasSuspiciousQuestionnaire && !textReliable) {
    w_dass = Math.min(w_dass, 0.62);
    w_text = 1 - w_dass;
  }

  if (textWeak) {
    w_text = Math.min(w_text, 0.25);
    w_dass = 1 - w_text;
  }

  if (!hasSuspiciousQuestionnaire && !contradiction.hasContradiction && !textWeak && R_dass >= 0.65) {
    w_dass = Math.max(w_dass, 0.6);
    w_text = 1 - w_dass;
  }

  if (textQuality.shortButEmotional && textQuality.R_confidence >= 0.6 && !textQuality.spamLike) {
    w_text = Math.max(w_text, 0.35);
    w_dass = 1 - w_text;
  }

  w_text = clamp(w_text, 0.2, 0.45);
  w_dass = 1 - w_text;

  return {
    w_text: round4(w_text),
    w_dass: round4(w_dass),
  };
}

export function calculateFinalPrediction({ P_text = 0, P_dass = 0, w_text = 0.5, w_dass = 0.5 } = {}) {
  return round4((clamp(w_text) * clamp(P_text)) + (clamp(w_dass) * clamp(P_dass)));
}

export function calculateDynamicFusion({
  text,
  dass,
  mlResult,
  dassAnswers,
  dassDurationSeconds,
}) {
  const P_text = round4(normalizeMlStressPercent(mlResult) / 100);
  const P_dass = round4((Number(dass?.stressPercent) || 0) / 100);
  const mlConfidence = normalizeMlConfidence(mlResult);
  const textQuality = calculateTextReliability({ text, confidence: mlConfidence });
  const dassReliability = calculateDassReliability({
    answers: dassAnswers,
    durationSeconds: dassDurationSeconds,
    P_text,
    P_dass,
    textQuality,
  });
  const weights = calculateFusionWeights({
    R_text: textQuality.R_text,
    R_dass: dassReliability.R_dass,
    suspiciousPatterns: dassReliability.suspiciousPatterns,
    contradiction: dassReliability.contradiction,
    textQuality,
  });
  const P_final = calculateFinalPrediction({
    P_text,
    P_dass,
    w_text: weights.w_text,
    w_dass: weights.w_dass,
  });
  const textWeightPercent = roundPercent(weights.w_text);
  const dassWeightPercent = 100 - textWeightPercent;
  const fusedStressPercent = roundPercent(P_final);
  const fusionConfidence = round4(
    (weights.w_text * textQuality.R_text) +
    (weights.w_dass * dassReliability.R_dass)
  );
  const explanation = buildWeightExplanation({
    textWeightPercent,
    dassWeightPercent,
    textQuality,
    dassReliability,
  });

  const apiReady = {
    P_text,
    P_dass,
    R_text: textQuality.R_text,
    R_dass: dassReliability.R_dass,
    w_text: weights.w_text,
    w_dass: weights.w_dass,
    P_final,
  };

  console.log("Behavior-aware reliability fusion calculated:", {
    ...apiReady,
    suspiciousPatterns: dassReliability.suspiciousPatterns,
    contradiction: dassReliability.contradiction,
    spamLikeCurhat: textQuality.spamLike,
    durationSeconds: dassReliability.durationSeconds,
  });

  return {
    ...apiReady,
    method: "behavior_aware_reliability_fusion_v2",
    dassWeight: dassWeightPercent,
    mlWeight: textWeightPercent,
    curhatWeight: textWeightPercent,
    mlStressPercent: roundPercent(P_text),
    dassStressPercent: roundPercent(P_dass),
    fusedStressPercent,
    mlConfidence,
    fusionConfidence,
    mismatch: roundPercent(Math.abs(P_text - P_dass)),
    questionnaireReliabilityScore: dassReliability.R_dass,
    curhatReliabilityScore: textQuality.R_text,
    suspiciousPatterns: dassReliability.suspiciousPatterns,
    contradiction: dassReliability.contradiction,
    curhatQuality: textQuality,
    reliability: {
      text: textQuality,
      dass: dassReliability,
      weights,
    },
    explanation,
  };
}

function buildWeightExplanation({ textWeightPercent, dassWeightPercent, textQuality, dassReliability }) {
  const reasons = [
    `Bobot akhir DASS-21 ${dassWeightPercent}% dan Curhat ${textWeightPercent}% dihitung dari reliabilitas masing-masing modalitas.`,
    `Reliabilitas DASS-21 = ${dassReliability.R_dass}; reliabilitas Curhat = ${textQuality.R_text}.`,
  ];

  if (dassReliability.suspiciousPatterns.length > 0) {
    reasons.push(`Bobot DASS-21 dikurangi karena pola mencurigakan: ${dassReliability.suspiciousPatterns.join(", ")}.`);
  }

  if (dassReliability.contradiction.hasContradiction) {
    reasons.push(`Terdapat kontradiksi ${dassReliability.contradiction.type} antara DASS-21 dan curhat.`);
  }

  if (textQuality.shortButEmotional) {
    reasons.push("Curhat singkat tetap dipertimbangkan karena mengandung indikator emosi yang kuat.");
  }

  if (textQuality.spamLike) {
    reasons.push("Bobot curhat dibatasi karena teks terlihat repetitif atau kurang bermakna.");
  }

  return reasons.join(" ");
}
