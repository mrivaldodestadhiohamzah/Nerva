import jwt from "jsonwebtoken";

export function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NODE_ENV !== 'production') {
    return 'nerva-local-dev-secret';
  }

  return null;
}

export function generateToken(user) {
  const jwtSecret = getJwtSecret();

  if (!jwtSecret) {
    throw new Error('Missing JWT configuration. Add JWT_SECRET to your .env file.');
  }

  return jwt.sign(
    { user_id: user.user_id, name: user.name, email: user.email },
    jwtSecret,
    { expiresIn: '24h' }
  );
}

export function generateId() {
  return 'id_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

export function normalizeEmail(email = "") {
  return String(email).trim().toLowerCase();
}

export function validateEmail(email) {
  const cleanEmail = normalizeEmail(email);
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  return emailRegex.test(cleanEmail);
}

export function validatePassword(password) {
  const value = String(password || "");
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/;
  return {
    isValid: value.length >= 8 && value.length <= 128 && passwordRegex.test(value),
    message: "Kata sandi minimal 8 karakter dan harus berisi huruf besar, huruf kecil, angka, serta simbol"
  };
}

export function validateName(name) {
  const trimmedName = String(name || "").trim();
  return {
    isValid: trimmedName.length >= 2 && trimmedName.length <= 50,
    message: "Nama harus terdiri dari 2 sampai 50 karakter",
    value: trimmedName
  };
}

export function validateConfirmPassword(password, confirmPassword) {
  return {
    isValid: password === confirmPassword,
    message: "Konfirmasi kata sandi tidak cocok",
  };
}
