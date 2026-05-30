import { apiCall } from "../config.js";
import {
  validateConfirmPassword,
  validateEmail,
  validatePassword,
  validateResetCode,
} from "../utils/validation.js";

let passwordResetToken = "";

export function renderForgetPass() {
  return fetch('/views/forgetPasswordView.html')
    .then(res => {
      if (!res.ok) throw new Error("Gagal memuat halaman lupa kata sandi");
      return res.text();
    })
    .then(html => {
      document.getElementById('app').innerHTML = html;
      setupEventListeners();
    })
    .catch(error => {
      console.error("Error loading forget password view:", error);
      showError("Gagal memuat halaman");
    });
}

function setupEventListeners() {
  const sendCodeBtn = document.getElementById("send-code-btn");
  const verifyCodeBtn = document.getElementById("verify-code-btn");
  const resetPasswordBtn = document.getElementById("reset-password-btn");
  const emailStage = document.getElementById("email-stage");
  const codeStage = document.getElementById("code-stage");
  const passwordStage = document.getElementById("password-stage");
  const backToLoginLink = document.getElementById("back-to-login");

  if (sendCodeBtn && emailStage) {
    emailStage.addEventListener("submit", (e) => handleSendCode(e, sendCodeBtn));
  }
  if (verifyCodeBtn && codeStage) {
    codeStage.addEventListener("submit", (e) => handleVerifyCode(e, verifyCodeBtn));
  }
  if (resetPasswordBtn && passwordStage) {
    passwordStage.addEventListener("submit", (e) => handleResetPassword(e, resetPasswordBtn));
  }
  if (backToLoginLink) {
    backToLoginLink.addEventListener("click", (e) => {
      e.preventDefault();
      window.loadView("login");
    });
  }
}

async function handleSendCode(event, button) {
  event.preventDefault(); // Prevent default form submission if applicable
  const emailInput = document.getElementById("loginEmail");
  const email = emailInput?.value.trim();
  clearErrors();

  if (!email) {
    showError("email-error", "Email wajib diisi");
    return;
  }

  if (!validateEmail(email)) {
    showError("email-error", "Format email tidak valid");
    return;
  }

  if (!button) {
    showError("email-error", "Terjadi kesalahan internal");
    return;
  }

  showLoading(true, button);

  try {
    const response = await apiCall("/api/forgot-password/request", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    if (!response.message) {
      throw new Error("Respons server tidak valid");
    }

    toggleStage("code-stage");
    showSuccess("Kode verifikasi telah dikirim ke email Anda");
  } catch (error) {
    showError("email-error", error.message || "Gagal mengirim kode");
  } finally {
    showLoading(false, button);
  }
}

async function handleVerifyCode(event, button) {
  event.preventDefault();
  const email = document.getElementById("loginEmail")?.value.trim();
  const codeInput = document.getElementById("verificationCode");
  const code = codeInput?.value.trim();
  clearErrors();

  if (!code) {
    showError("code-error", "Kode wajib diisi");
    return;
  }

  if (!validateResetCode(code)) {
    showError("code-error", "Kode harus berupa 6 digit angka");
    return;
  }

  if (!button) {
    showError("code-error", "Terjadi kesalahan internal");
    return;
  }

  showLoading(true, button);

  try {
    const response = await apiCall("/api/forgot-password/verify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, code }),
    });

    if (!response.message || !response.resetToken) {
      throw new Error("Respons server tidak valid");
    }

    passwordResetToken = response.resetToken;
    toggleStage("password-stage");
    showSuccess("Kode berhasil diverifikasi");
  } catch (error) {
    showError("code-error", error.message || "Kode tidak valid atau sudah kedaluwarsa");
  } finally {
    showLoading(false, button);
  }
}

async function handleResetPassword(event, button) {
  event.preventDefault();
  const email = document.getElementById("loginEmail")?.value.trim();
  const newPasswordInput = document.getElementById("newPassword");
  const confirmPasswordInput = document.getElementById("confirmPassword");
  const newPassword = newPasswordInput?.value;
  const confirmPassword = confirmPasswordInput?.value;
  clearErrors();

  if (!newPassword || !confirmPassword) {
    if (!newPassword) showError("new-password-error", "Kata sandi baru wajib diisi");
    if (!confirmPassword) showError("confirm-password-error", "Konfirmasi kata sandi wajib diisi");
    return;
  }

  const passwordValidation = validatePassword(newPassword);
  if (!passwordValidation.isValid) {
    showError("new-password-error", passwordValidation.message);
    return;
  }

  const confirmValidation = validateConfirmPassword(newPassword, confirmPassword);
  if (!confirmValidation.isValid) {
    showError("confirm-password-error", confirmValidation.message);
    return;
  }

  if (!passwordResetToken) {
    showError("new-password-error", "Sesi atur ulang kata sandi sudah kedaluwarsa. Silakan verifikasi kode lagi.");
    toggleStage("code-stage");
    return;
  }

  if (!button) {
    showError("new-password-error", "Terjadi kesalahan internal");
    return;
  }

  showLoading(true, button);

  try {
    const response = await apiCall("/api/forgot-password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, newPassword, resetToken: passwordResetToken }),
    });

    if (!response.message) {
      throw new Error("Respons server tidak valid");
    }

    showSuccess("Kata sandi berhasil diatur ulang. Mengarahkan ke halaman masuk...");
    passwordResetToken = "";
    setTimeout(() => window.loadView("login"), 2000);
  } catch (error) {
    showError("new-password-error", error.message || "Gagal mengatur ulang kata sandi");
  } finally {
    showLoading(false, button);
  }
}

function toggleStage(stageId) {
  const stages = ["email-stage", "code-stage", "password-stage"];
  stages.forEach(id => {
    const stage = document.getElementById(id);
    if (stage) stage.classList.add("hidden");
  });
  const activeStage = document.getElementById(stageId);
  if (activeStage) activeStage.classList.remove("hidden");
}

function showError(elementId, message) {
  const errorElement = document.getElementById(elementId);
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.remove("hidden");
  }
}

function clearErrors() {
  const errorElements = document.querySelectorAll("[id$='-error']");
  errorElements.forEach(el => {
    el.textContent = "";
    el.classList.add("hidden");
  });
}

function showSuccess(message) {
  clearErrors();
  const emailError = document.getElementById("email-error");
  if (emailError) {
    emailError.textContent = message;
    emailError.classList.remove("hidden", "text-red-600");
    emailError.classList.add("text-green-600");
  }
}

function showLoading(isLoading, button) {
  if (isLoading) {
    button.disabled = true;
    button.textContent = "Memproses...";
  } else {
    button.disabled = false;
    button.textContent = button.id === "send-code-btn" ? "Kirim Kode" : 
                         button.id === "verify-code-btn" ? "Verifikasi Kode" : "Atur Ulang Kata Sandi";
  }
}
