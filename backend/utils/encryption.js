import crypto from "crypto";
import "./env.js";

const ALGORITHM = "aes-256-gcm";
const PREFIX = "enc:v1:";

function getEncryptionKey() {
  const rawKey = process.env.DATA_ENCRYPTION_KEY;

  if (!rawKey) {
    throw new Error("Missing DATA_ENCRYPTION_KEY environment variable");
  }

  const candidates = [
    Buffer.from(rawKey, "base64"),
    Buffer.from(rawKey, "hex"),
    Buffer.from(rawKey, "utf8"),
  ];

  const key = candidates.find(candidate => candidate.length === 32);
  if (!key) {
    throw new Error("DATA_ENCRYPTION_KEY must decode to exactly 32 bytes");
  }

  return key;
}

export function encryptText(value) {
  if (typeof value !== "string") return value;

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString("base64")}.${authTag.toString("base64")}.${ciphertext.toString("base64")}`;
}

export function decryptText(value) {
  if (typeof value !== "string" || !value.startsWith(PREFIX)) {
    return value;
  }

  const payload = value.slice(PREFIX.length).replace(/^\./, "");
  const [ivBase64, authTagBase64, ciphertextBase64] = payload.split(".");

  if (!ivBase64 || !authTagBase64 || !ciphertextBase64) {
    throw new Error("Invalid encrypted payload format");
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    Buffer.from(ivBase64, "base64")
  );
  decipher.setAuthTag(Buffer.from(authTagBase64, "base64"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextBase64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptHistoryEntry(entry) {
  if (!entry) return entry;

  const videoPayload = normalizeVideoPayload(entry.video_link);
  const decrypted = {
    ...entry,
    text: safeDecryptField(entry.text),
    feedback: safeDecryptField(entry.feedback),
    stress_level: safeDecryptField(entry.stress_level),
    stress_percent: normalizeStressPercent(safeDecryptField(entry.stress_percent)),
    emotion: safeDecryptField(entry.emotion),
    video_link: videoPayload.recommendations,
  };

  const metadata = parseHistoryMetadata(decrypted.emotion) || videoPayload.metadata;
  if (!metadata) return decrypted;

  const protectedFields = metadata.protected_fields || {};
  const publicMetadata = {
    ...metadata,
    protected_fields: undefined,
  };
  delete publicMetadata.protected_fields;

  const metadataStressPercent = normalizeStressPercent(
    protectedFields.stress_percent ?? metadata.final_result?.stress_percent
  );
  const metadataStressLevel = protectedFields.stress_level ?? metadata.final_result?.stress_level;
  const hasReadableStressPercent =
    decrypted.stress_percent !== null &&
    decrypted.stress_percent !== undefined &&
    decrypted.stress_percent !== "" &&
    Number.isFinite(Number(decrypted.stress_percent));

  return {
    ...decrypted,
    text: protectedFields.text ?? decrypted.text,
    feedback: protectedFields.feedback ?? decrypted.feedback,
    stress_level: metadataStressLevel ?? decrypted.stress_level,
    stress_percent: hasReadableStressPercent ? decrypted.stress_percent : metadataStressPercent,
    metadata: publicMetadata,
    fusion: publicMetadata.fusion,
    dass21: publicMetadata.dass21,
    curhat_result: publicMetadata.curhat,
    final_result: publicMetadata.final_result,
    predicted_stress: publicMetadata.predicted_stress,
  };
}

export function decryptHistoryEntries(entries = []) {
  return entries.map(decryptHistoryEntry);
}

function safeDecryptField(value) {
  try {
    return decryptText(value);
  } catch (error) {
    console.error("Failed to decrypt protected field:", error.message);
    return "[Data tidak dapat didekripsi]";
  }
}

function normalizeStressPercent(value) {
  if (value === null || value === undefined || value === "") return value;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : value;
}

function parseHistoryMetadata(value) {
  if (typeof value !== "string") return null;

  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function normalizeVideoPayload(value) {
  const parsedValue = parseJsonIfNeeded(value);

  if (Array.isArray(parsedValue)) {
    return { recommendations: parsedValue, metadata: null };
  }

  if (parsedValue && typeof parsedValue === "object") {
    const recommendations = Array.isArray(parsedValue.recommendations)
      ? parsedValue.recommendations
      : [];

    return {
      recommendations,
      metadata: parseProtectedMetadata(parsedValue.protected_metadata),
    };
  }

  return { recommendations: [], metadata: null };
}

function parseJsonIfNeeded(value) {
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseProtectedMetadata(value) {
  if (!value) return null;

  try {
    return parseHistoryMetadata(decryptText(value));
  } catch (error) {
    console.error("Failed to decrypt protected metadata:", error.message);
    return null;
  }
}
