import rateLimit from "express-rate-limit";

const TAG_PATTERN = /<[^>]*>/g;
const SCRIPT_STYLE_PATTERN = /<(script|style|iframe|object|embed|link|meta)[\s\S]*?>[\s\S]*?<\/\1>/gi;
const EVENT_HANDLER_PATTERN = /\son\w+\s*=\s*(['"]).*?\1/gi;
const JS_URL_PATTERN = /javascript\s*:/gi;

export const MAX_TEXT_LENGTH = 1000;

export function sanitizeString(value) {
  if (typeof value !== "string") return value;

  return value
    .replace(SCRIPT_STYLE_PATTERN, "")
    .replace(EVENT_HANDLER_PATTERN, "")
    .replace(JS_URL_PATTERN, "")
    .replace(TAG_PATTERN, "")
    .trim();
}

export function sanitizeObject(input) {
  if (Array.isArray(input)) {
    return input.map(sanitizeObject);
  }

  if (input && typeof input === "object") {
    return Object.fromEntries(
      Object.entries(input).map(([key, value]) => [key, sanitizeObject(value)])
    );
  }

  return sanitizeString(input);
}

export function sanitizeRequestBody(req, _res, next) {
  req.body = sanitizeObject(req.body || {});
  next();
}

export function validateRequiredText(value, fieldName = "text", maxLength = MAX_TEXT_LENGTH) {
  const cleanValue = sanitizeString(value);

  if (!cleanValue) {
    return { isValid: false, message: `${fieldName} wajib diisi` };
  }

  if (cleanValue.length > maxLength) {
    return { isValid: false, message: `${fieldName} maksimal ${maxLength} karakter` };
  }

  return { isValid: true, value: cleanValue };
}

export function createRateLimiter({ max = 5, windowMs = 60 * 1000, message = "Terlalu banyak permintaan. Silakan coba lagi nanti." } = {}) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: message },
  });
}

export function sendSafeError(res, statusCode = 500, publicMessage = "Terjadi kesalahan") {
  return res.status(statusCode).json({ error: publicMessage });
}
