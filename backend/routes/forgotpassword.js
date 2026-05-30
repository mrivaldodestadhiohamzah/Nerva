import express from "express";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import crypto from "crypto";
import "../utils/env.js";
import { isSupabaseConfigured, supabase } from "../supabaseClient.js";
import { createRateLimiter, sendSafeError, validateRequiredText } from "../utils/security.js";
import { getJwtSecret, normalizeEmail, validateEmail, validatePassword } from "../utils/helpers.js";
import { logger } from "../utils/logger.js";

const router = express.Router();

router.use(createRateLimiter({ max: 5, windowMs: 60 * 1000 }));

const isSmtpConfigured = Boolean(process.env.SMTP_EMAIL && process.env.SMTP_PASSWORD);
const transporter = isSmtpConfigured
  ? nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.SMTP_EMAIL,
        pass: process.env.SMTP_PASSWORD,
      },
    })
  : null;

if (transporter) {
  transporter.verify((error) => {
    if (error) {
      logger.warn("SMTP configuration error", { message: error.message });
    } else {
      logger.info("SMTP server is ready to send emails");
    }
  });
} else {
  logger.warn("SMTP is not configured. Forgot-password email sending is disabled.");
}

const resetTokenStore = new Map();
const RESET_CODE_TTL_MS = 10 * 60 * 1000;
const RESET_TOKEN_TTL_MS = 10 * 60 * 1000;

// Generate a 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function getResetSecret() {
  return process.env.DATA_ENCRYPTION_KEY || getJwtSecret() || "nerva-local-reset-secret";
}

function hashSecret(value) {
  return crypto.createHmac("sha256", getResetSecret()).update(String(value)).digest("hex");
}

function safeEqual(a, b) {
  const left = Buffer.from(String(a || ""));
  const right = Buffer.from(String(b || ""));

  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function matchesStoredSecret(storedSecret, providedSecret) {
  const hashedProvided = hashSecret(providedSecret);
  return safeEqual(storedSecret, hashedProvided) || safeEqual(storedSecret, providedSecret);
}

function cleanupExpiredResetTokens() {
  const now = Date.now();
  for (const [tokenHash, tokenData] of resetTokenStore.entries()) {
    if (tokenData.expiresAt <= now || tokenData.used) {
      resetTokenStore.delete(tokenHash);
    }
  }
}

function createResetToken(email) {
  cleanupExpiredResetTokens();
  const resetToken = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashSecret(resetToken);

  resetTokenStore.set(tokenHash, {
    email,
    expiresAt: Date.now() + RESET_TOKEN_TTL_MS,
    used: false,
  });

  return resetToken;
}

function consumeResetToken(email, resetToken) {
  cleanupExpiredResetTokens();
  const tokenHash = hashSecret(resetToken);
  const tokenData = resetTokenStore.get(tokenHash);

  if (!tokenData || tokenData.used || tokenData.expiresAt <= Date.now()) {
    return false;
  }

  if (tokenData.email !== email) {
    return false;
  }

  tokenData.used = true;
  resetTokenStore.delete(tokenHash);
  return true;
}

// POST /api/forgot-password/request - Send verification code
router.post("/request", async (req, res) => {
  const { email } = req.body;
  const emailValidation = validateRequiredText(email, "Email", 254);
  if (!emailValidation.isValid) {
    return sendSafeError(res, 400, emailValidation.message);
  }
  const cleanEmail = normalizeEmail(emailValidation.value);
  if (!validateEmail(cleanEmail)) {
    return sendSafeError(res, 400, "Format email tidak valid");
  }

  try {
    if (!isSupabaseConfigured) {
      return sendSafeError(res, 503, "Layanan atur ulang kata sandi belum dikonfigurasi");
    }

    if (!transporter) {
      return sendSafeError(res, 503, "Layanan email belum dikonfigurasi");
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, email")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (userError || !user) {
      logger.warn("Forgot-password request skipped for unavailable account", {
        reason: userError?.message || "not_found",
      });
      return res.status(200).json({
        message: "Jika email terdaftar, kode verifikasi akan dikirim.",
      });
    }

    // Generate code and set expiration
    const code = generateCode();
    const expiresAt = new Date(Date.now() + RESET_CODE_TTL_MS).toISOString();

    // Store code in reset_codes table
    const { error: codeError } = await supabase
      .from("reset_codes")
      .insert({
        email: cleanEmail,
        code: hashSecret(code),
        expires_at: expiresAt,
        used: false,
      });

    if (codeError) {
      logger.error("Error storing reset code", { message: codeError.message, code: codeError.code });
      return sendSafeError(res, 500, "Gagal mengirim kode");
    }

    // Send email
    const mailOptions = {
      from: process.env.SMTP_EMAIL,
      to: cleanEmail,
      subject: "Kode Atur Ulang Kata Sandi NERVA",
      text: `Kode verifikasi Anda: ${code}. Kode berlaku selama 10 menit.`,
      html: `<p>Kode verifikasi Anda: <strong>${code}</strong>. Kode berlaku selama 10 menit.</p>`,
    };

    try {
      await transporter.sendMail(mailOptions);
      return res.status(200).json({
        message: "Jika email terdaftar, kode verifikasi akan dikirim.",
      });
    } catch (mailError) {
      logger.error("Email sending failed", { message: mailError.message });
      return sendSafeError(res, 500, "Gagal mengirim kode");
    }
  } catch (error) {
    logger.error("Error in forgot password request", { message: error.message });
    return sendSafeError(res, 500, "Terjadi kesalahan server");
  }
});

// POST /api/forgot-password/verify - Verify code
router.post("/verify", async (req, res) => {
  const { email, code } = req.body;
  const emailValidation = validateRequiredText(email, "Email", 254);
  const codeValidation = validateRequiredText(code, "Kode", 6);
  if (!emailValidation.isValid || !codeValidation.isValid) {
    return sendSafeError(res, 400, "Email dan kode wajib diisi");
  }
  const cleanEmail = normalizeEmail(emailValidation.value);
  const cleanCode = String(codeValidation.value || "").trim();
  if (!validateEmail(cleanEmail) || !/^\d{6}$/.test(cleanCode)) {
    return sendSafeError(res, 400, "Email atau kode tidak valid");
  }

  try {
    if (!isSupabaseConfigured) {
      return sendSafeError(res, 503, "Layanan atur ulang kata sandi belum dikonfigurasi");
    }

    // Check if code is valid
    const { data: resetCodes, error: codeError } = await supabase
      .from("reset_codes")
      .select("id, code, expires_at, used")
      .eq("email", cleanEmail)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(5);

    const resetCode = Array.isArray(resetCodes)
      ? resetCodes.find((row) => matchesStoredSecret(row.code, cleanCode))
      : null;

    if (codeError || !resetCode) {
      logger.warn("Code verification failed", { reason: codeError?.message || "invalid_or_expired" });
      return sendSafeError(res, 400, "Kode tidak valid atau sudah kedaluwarsa");
    }

    // Mark code as used
    const { error: updateError } = await supabase
      .from("reset_codes")
      .update({ used: true })
      .eq("id", resetCode.id);

    if (updateError) {
      logger.error("Error marking code as used", { message: updateError.message });
      return sendSafeError(res, 500, "Gagal memverifikasi kode");
    }

    const resetToken = createResetToken(cleanEmail);
    return res.status(200).json({ message: "Kode berhasil diverifikasi", resetToken });
  } catch (error) {
    logger.error("Error in code verification", { message: error.message });
    return sendSafeError(res, 500, "Terjadi kesalahan server");
  }
});

// POST /api/forgot-password/reset - Reset password
router.post("/reset", async (req, res) => {
  const { email, newPassword, resetToken } = req.body;
  const emailValidation = validateRequiredText(email, "Email", 254);
  const passwordLengthValidation = validateRequiredText(newPassword, "Kata sandi baru", 128);
  const tokenValidation = validateRequiredText(resetToken, "Token reset", 200);
  if (!emailValidation.isValid || !passwordLengthValidation.isValid || !tokenValidation.isValid) {
    return sendSafeError(res, 400, "Email, kata sandi baru, dan token reset wajib diisi");
  }
  const cleanEmail = normalizeEmail(emailValidation.value);
  if (!validateEmail(cleanEmail)) {
    return sendSafeError(res, 400, "Format email tidak valid");
  }

  try {
    // Validate password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return sendSafeError(res, 400, passwordValidation.message);
    }

    if (!isSupabaseConfigured) {
      return sendSafeError(res, 503, "Layanan atur ulang kata sandi belum dikonfigurasi");
    }

    if (!consumeResetToken(cleanEmail, tokenValidation.value)) {
      return sendSafeError(res, 400, "Token reset tidak valid atau sudah kedaluwarsa");
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, password")
      .eq("email", cleanEmail)
      .maybeSingle();

    if (userError || !user) {
      logger.warn("Password reset user lookup failed", { reason: userError?.message || "not_found" });
      return sendSafeError(res, 400, "Token reset tidak valid atau sudah kedaluwarsa");
    }

    // Check if new password is different
    const isSamePassword = await bcrypt.compare(newPassword, user.password);
    if (isSamePassword) {
      return sendSafeError(res, 400, "Kata sandi baru tidak boleh sama dengan kata sandi saat ini");
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 12);

    // Update password
    const { error: updateError } = await supabase
      .from("users")
      .update({ password: passwordHash })
      .eq("user_id", user.user_id);

    if (updateError) {
      logger.error("Error updating password", { message: updateError.message });
      return sendSafeError(res, 500, "Gagal mengatur ulang kata sandi");
    }

    return res.status(200).json({ message: "Kata sandi berhasil diatur ulang" });
  } catch (error) {
    logger.error("Error in password reset", { message: error.message });
    return sendSafeError(res, 500, "Terjadi kesalahan server");
  }
});

export default router;
