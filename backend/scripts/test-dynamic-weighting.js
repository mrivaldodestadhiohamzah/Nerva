import assert from "node:assert/strict";
import { calculateDynamicFusion } from "../utils/dynamicWeighting.js";

function runScenario({
  name,
  text,
  mlStressPercent,
  mlConfidence = 0.85,
  dassStressPercent,
  answers,
  durationSeconds = 95,
  expect,
}) {
  const fusion = calculateDynamicFusion({
    text,
    mlResult: {
      stress_percent: mlStressPercent,
      confidence: mlConfidence,
      probabilities: [1 - mlConfidence, mlConfidence],
    },
    dass: { stressPercent: dassStressPercent },
    dassAnswers: answers,
    dassDurationSeconds: durationSeconds,
  });

  expect(fusion);

  return {
    name,
    w_text: fusion.w_text,
    w_dass: fusion.w_dass,
    R_text: fusion.R_text,
    R_dass: fusion.R_dass,
    P_text: fusion.P_text,
    P_dass: fusion.P_dass,
    P_final: fusion.P_final,
    suspiciousPatterns: fusion.suspiciousPatterns,
    contradiction: fusion.contradiction.type,
    spamLike: fusion.curhatQuality.spamLike,
    shortButEmotional: fusion.curhatQuality.shortButEmotional,
    explanation: fusion.explanation,
  };
}

const balancedAnswers = [1, 2, 1, 2, 0, 2, 1, 3, 1, 2, 0, 2, 1, 2, 1, 3, 0, 2, 1, 2, 1];
const lowAnswers = Array(21).fill(0);
const highAnswers = Array(21).fill(3);
const repeatedAnswers = [2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2, 2, 2, 1, 2, 2, 2, 2, 2];

const results = [
  runScenario({
    name: "positive curhat + extreme high DASS",
    text: "Hari ini aku merasa tenang, senang, bahagia, dan lebih rileks setelah ngobrol dengan teman.",
    mlStressPercent: 18,
    dassStressPercent: 96,
    answers: highAnswers,
    expect(fusion) {
      assert.ok(fusion.suspiciousPatterns.includes("almost_all_highest_answers"));
      assert.ok(fusion.suspiciousPatterns.includes("dass_text_emotional_contradiction"));
      assert.ok(fusion.w_dass <= 0.55, "Suspicious high DASS should be capped at 55% when text is reliable");
      assert.ok(fusion.w_text >= 0.45);
    },
  }),
  runScenario({
    name: "distressed curhat + extreme low DASS",
    text: "Aku capek banget, cemas, panik, dan merasa tidak sanggup menghadapi semua tekanan ini.",
    mlStressPercent: 91,
    dassStressPercent: 8,
    answers: lowAnswers,
    expect(fusion) {
      assert.ok(fusion.suspiciousPatterns.includes("almost_all_lowest_answers"));
      assert.ok(fusion.suspiciousPatterns.includes("dass_text_emotional_contradiction"));
      assert.ok(fusion.w_dass <= 0.55);
      assert.ok(fusion.w_text >= 0.45);
    },
  }),
  runScenario({
    name: "repetitive questionnaire pattern",
    text: "Aku sedang banyak tekanan kuliah, sering cemas, dan sulit tidur beberapa hari ini.",
    mlStressPercent: 72,
    dassStressPercent: 70,
    answers: repeatedAnswers,
    expect(fusion) {
      assert.ok(fusion.suspiciousPatterns.includes("uniform_repetitive_answers"));
      assert.ok(fusion.R_dass < 0.6, "Repetitive questionnaire should reduce DASS reliability");
    },
  }),
  runScenario({
    name: "short but emotionally strong curhat",
    text: "Aku capek banget...",
    mlStressPercent: 78,
    mlConfidence: 0.88,
    dassStressPercent: 55,
    answers: balancedAnswers,
    expect(fusion) {
      assert.equal(fusion.curhatQuality.shortButEmotional, true);
      assert.ok(fusion.w_text >= 0.35, "Short emotional curhat should keep meaningful influence");
    },
  }),
  runScenario({
    name: "spam/repetitive curhat",
    text: "halo halo halo halo halo halo halo halo halo halo",
    mlStressPercent: 62,
    mlConfidence: 0.9,
    dassStressPercent: 58,
    answers: balancedAnswers,
    expect(fusion) {
      assert.equal(fusion.curhatQuality.spamLike, true);
      assert.ok(fusion.w_text <= 0.25, "Spam-like curhat should be capped");
    },
  }),
  runScenario({
    name: "realistic balanced input",
    text: "Aku akhir-akhir ini agak stres karena tugas menumpuk, tetapi masih bisa istirahat dan cerita ke teman.",
    mlStressPercent: 54,
    mlConfidence: 0.72,
    dassStressPercent: 58,
    answers: balancedAnswers,
    durationSeconds: 140,
    expect(fusion) {
      assert.equal(fusion.suspiciousPatterns.length, 0);
      assert.ok(fusion.w_dass >= 0.6, "Normal questionnaire keeps DASS as the primary clinical instrument");
      assert.ok(fusion.w_text >= 0.2);
    },
  }),
];

console.table(results.map(({ explanation, ...result }) => result));

console.log("\nDetailed explanations:");
results.forEach((result) => {
  console.log(`\n[${result.name}]`);
  console.log(result.explanation);
});
