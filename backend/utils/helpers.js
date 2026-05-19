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

export function validateEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[cC][oO][mM]$/;
  return emailRegex.test(email);
}

export function validatePassword(password) {
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/;
  return {
    isValid: password.length >= 6 && passwordRegex.test(password),
    message: "Kata sandi minimal 6 karakter dan harus berisi huruf besar, huruf kecil, serta angka"
  };
}

export function validateName(name) {
  const trimmedName = name.trim();
  return {
    isValid: trimmedName.length >= 2 && trimmedName.length <= 50,
    message: "Nama harus terdiri dari 2 sampai 50 karakter",
    value: trimmedName
  };
}
