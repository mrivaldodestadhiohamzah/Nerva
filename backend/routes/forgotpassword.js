import express from "express";
import bcrypt from "bcrypt";
import nodemailer from "nodemailer";
import "../utils/env.js";
import { supabase } from "../supabaseClient.js";
import { createRateLimiter, sendSafeError, validateRequiredText } from "../utils/security.js";

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
      console.error("SMTP configuration error:", error.message);
    } else {
      console.log("SMTP server is ready to send emails");
    }
  });
} else {
  console.log("SMTP is not configured. Forgot-password email sending is disabled.");
}

// Generate a 6-digit code
function generateCode() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Validate password (same as profile.js)
function validatePassword(password) {
  const minLength = 8;
  const hasLetter = /[a-zA-Z]/.test(password);
  const hasNumber = /\d/.test(password);
  const hasSymbol = /[!@#$%^&*(),.?":{}|<>]/.test(password);

  if (password.length < minLength || !(hasLetter && hasNumber && hasSymbol)) {
    return {
      isValid: false,
      message: "Kata sandi minimal 8 karakter dan harus berisi kombinasi huruf, angka, dan simbol.",
    };
  }
  return { isValid: true, message: "" };
}

// POST /api/forgot-password/request - Send verification code
router.post("/request", async (req, res) => {
  const { email } = req.body;
  const emailValidation = validateRequiredText(email, "Email", 254);
  if (!emailValidation.isValid) {
    return sendSafeError(res, 400, emailValidation.message);
  }
  const cleanEmail = emailValidation.value;

  try {
    if (!transporter) {
      return sendSafeError(res, 503, "Layanan email belum dikonfigurasi");
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, email")
      .eq("email", cleanEmail)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError?.message || "Pengguna tidak ditemukan");
      return sendSafeError(res, 404, "Email tidak ditemukan");
    }

    // Generate code and set expiration
    const code = generateCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store code in reset_codes table
    const { error: codeError } = await supabase
      .from("reset_codes")
      .insert({
        email: cleanEmail,
        code,
        expires_at: expiresAt,
      });

    if (codeError) {
      console.error("Error storing reset code:", codeError.message, codeError.details, codeError.code);
      return res.status(500).json({
        error: "Gagal mengirim kode",
      });
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
      console.log("Kode verifikasi telah dikirim");
      return res.status(200).json({ message: "Kode verifikasi telah dikirim" });
    } catch (mailError) {
      console.error("Email sending failed:", mailError.message, mailError.stack);
      return res.status(500).json({
        error: "Gagal mengirim kode",
      });
    }
  } catch (error) {
    console.error("Error in forgot password request:", error.message, error.stack);
    return res.status(500).json({
      error: "Terjadi kesalahan server",
    });
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

  try {
    // Check if code is valid
    const { data: resetCode, error: codeError } = await supabase
      .from("reset_codes")
      .select("id, code, expires_at, used")
      .eq("email", emailValidation.value)
      .eq("code", codeValidation.value)
      .eq("used", false)
      .gte("expires_at", new Date().toISOString())
      .single();

    if (codeError || !resetCode) {
      console.error("Code verification error:", codeError?.message || "Kode tidak valid atau sudah kedaluwarsa");
      return sendSafeError(res, 400, "Kode tidak valid atau sudah kedaluwarsa");
    }

    // Mark code as used
    const { error: updateError } = await supabase
      .from("reset_codes")
      .update({ used: true })
      .eq("id", resetCode.id);

    if (updateError) {
      console.error("Error marking code as used:", updateError.message);
      return sendSafeError(res, 500, "Gagal memverifikasi kode");
    }

    console.log("Kode berhasil diverifikasi");
    return res.status(200).json({ message: "Kode berhasil diverifikasi" });
  } catch (error) {
    console.error("Error in code verification:", error.message);
    return sendSafeError(res, 500, "Terjadi kesalahan server");
  }
});

// POST /api/forgot-password/reset - Reset password
router.post("/reset", async (req, res) => {
  const { email, newPassword } = req.body;
  const emailValidation = validateRequiredText(email, "Email", 254);
  const passwordLengthValidation = validateRequiredText(newPassword, "Kata sandi baru", 128);
  if (!emailValidation.isValid || !passwordLengthValidation.isValid) {
    return sendSafeError(res, 400, "Email dan kata sandi baru wajib diisi");
  }

  try {
    // Validate password
    const passwordValidation = validatePassword(newPassword);
    if (!passwordValidation.isValid) {
      return sendSafeError(res, 400, passwordValidation.message);
    }

    // Check if user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id, password")
      .eq("email", emailValidation.value)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError?.message || "Pengguna tidak ditemukan");
      return sendSafeError(res, 404, "Pengguna tidak ditemukan");
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
      console.error("Error updating password:", updateError.message);
      return sendSafeError(res, 500, "Gagal mengatur ulang kata sandi");
    }

    console.log("Password reset completed");
    return res.status(200).json({ message: "Kata sandi berhasil diatur ulang" });
  } catch (error) {
    console.error("Error in password reset:", error.message);
    return sendSafeError(res, 500, "Terjadi kesalahan server");
  }
});

export default router;
