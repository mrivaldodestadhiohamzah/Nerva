export const PASSWORD_RULE_MESSAGE =
  "Kata sandi minimal 8 karakter dan harus berisi huruf besar, huruf kecil, angka, serta simbol";

export function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

export function validateEmail(email) {
  const cleanEmail = normalizeEmail(email);
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanEmail);
}

export function validatePassword(password = "") {
  const value = String(password);
  const isValid =
    value.length >= 8 &&
    value.length <= 128 &&
    /[a-z]/.test(value) &&
    /[A-Z]/.test(value) &&
    /\d/.test(value) &&
    /[^A-Za-z0-9]/.test(value);

  return {
    isValid,
    message: PASSWORD_RULE_MESSAGE,
  };
}

export function validateConfirmPassword(password, confirmPassword) {
  return {
    isValid: password === confirmPassword,
    message: "Konfirmasi kata sandi tidak cocok",
  };
}

export function validateCurhatText(text = "") {
  const value = String(text).trim();
  if (!value) {
    return { isValid: false, message: "Silakan tulis curhat Anda terlebih dahulu.", value };
  }

  if (value.length < 50) {
    return {
      isValid: false,
      message: "Silakan tulis minimal 50 karakter agar hasil analisis lebih akurat.",
      value,
    };
  }

  if (value.length > 1000) {
    return {
      isValid: false,
      message: "Curhat maksimal 1000 karakter.",
      value,
    };
  }

  return { isValid: true, message: "", value };
}

export function validateResetCode(code = "") {
  return /^\d{6}$/.test(String(code).trim());
}
