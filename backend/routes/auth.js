import express from "express";
import bcrypt from "bcrypt";
import multer from "multer";
import { isSupabaseConfigured, supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { generateToken, generateId, validateEmail, validatePassword, validateName } from "../utils/helpers.js";
import { createRateLimiter, sendSafeError, validateRequiredText } from "../utils/security.js";

const router = express.Router();
const authLimiter = createRateLimiter();

function createLocalDevUser({ name = "Pengguna Lokal", email }) {
    return {
        user_id: `local_${Buffer.from(email).toString('base64url')}`,
        name,
        email,
        img: null,
        localDev: true
    };
}

function normalizeEmailValue(email) {
    return String(email || '').trim().toLowerCase();
}

async function verifyStoredPassword(inputPassword, storedPassword) {
    if (!storedPassword || typeof inputPassword !== 'string') {
        return false;
    }

    if (String(storedPassword).startsWith('$2')) {
        return bcrypt.compare(inputPassword, storedPassword);
    }

    // Backward compatibility for old development rows that were saved before bcrypt.
    return inputPassword === storedPassword;
}

// Configure multer for image uploads with better error handling
const storage = multer.memoryStorage();
const upload = multer({
    storage: storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        console.log("File filter check:", file.mimetype);
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar yang diperbolehkan'), false);
        }
    }
});

// User Registration
router.post("/register", authLimiter, async (req, res) => {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        return sendSafeError(res, 400, "Semua kolom wajib diisi");
    }

    const emailValidation = validateRequiredText(email, "Email", 254);
    const passwordValidationLength = validateRequiredText(password, "Kata sandi", 128);
    if (!emailValidation.isValid) {
        return sendSafeError(res, 400, emailValidation.message);
    }
    if (!passwordValidationLength.isValid) {
        return sendSafeError(res, 400, passwordValidationLength.message);
    }

    const normalizedEmail = normalizeEmailValue(emailValidation.value);

    if (!validateEmail(normalizedEmail)) {
        return sendSafeError(res, 400, "Masukkan alamat email yang valid");
    }

    const nameValidation = validateName(name);
    if (!nameValidation.isValid) {
        return sendSafeError(res, 400, nameValidation.message);
    }

    const passwordValidation = validatePassword(password);
    if (!passwordValidation.isValid) {
        return sendSafeError(res, 400, passwordValidation.message);
    }

    if (!isSupabaseConfigured) {
        const user = createLocalDevUser({ name: nameValidation.value, email: normalizedEmail });
        const token = generateToken(user);

        return res.status(201).json({
            message: "Akun pengembangan lokal berhasil dibuat",
            user,
            token
        });
    }

    try {
        // Check if user exists (use maybeSingle to avoid throwing on no results)
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('email')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (checkError) {
            console.error("Database check error:", checkError);
            return sendSafeError(res, 500, "Terjadi kesalahan database");
        }

        if (existingUser) {
            return sendSafeError(res, 400, "Email sudah terdaftar");
        }

        // Hash password
        const passwordHash = await bcrypt.hash(password, 12);

        // Generate user_id
        const user_id = generateId();

        // Create user
        const { data: newUser, error } = await supabase
            .from('users')
            .insert({
                user_id,
                name: nameValidation.value,
                email: normalizedEmail,
                password: passwordHash
            })
            .select('user_id, name, email')
            .single();

        if (error) throw error;

        const token = generateToken(newUser);

        res.status(201).json({
            message: "Akun berhasil dibuat",
            user: newUser,
            token
        });
    } catch (error) {
        console.error("Registration error:", error);
        sendSafeError(res, 500, "Pendaftaran gagal");
    }
});

    

router.post("/login", authLimiter, async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        return sendSafeError(res, 400, "Email dan kata sandi wajib diisi");
    }

    const emailValidation = validateRequiredText(email, "Email", 254);
    const passwordValidationLength = validateRequiredText(password, "Kata sandi", 128);
    if (!emailValidation.isValid) {
        return sendSafeError(res, 400, emailValidation.message);
    }
    if (!passwordValidationLength.isValid) {
        return sendSafeError(res, 400, passwordValidationLength.message);
    }

    const normalizedEmail = normalizeEmailValue(emailValidation.value);

    if (!isSupabaseConfigured) {
        if (!validateEmail(normalizedEmail)) {
            return sendSafeError(res, 400, "Masukkan alamat email yang valid");
        }

        const user = createLocalDevUser({
            name: normalizedEmail.split('@')[0] || "Pengguna Lokal",
            email: normalizedEmail
        });
        const token = generateToken(user);

        return res.json({
            message: "Berhasil masuk dalam mode pengembangan lokal",
            user,
            token
        });
    }

    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('user_id, name, email, password')
            .eq('email', normalizedEmail)
            .maybeSingle();

        if (error) {
            console.error("Terjadi kesalahan database:", error);
            return sendSafeError(res, 500, "Terjadi kesalahan database");
        }

        if (!user) {
            return sendSafeError(res, 401, "Email atau kata sandi tidak valid");
        }

        const isValidPassword = await verifyStoredPassword(password, user.password);
        if (!isValidPassword) {
            return sendSafeError(res, 401, "Email atau kata sandi tidak valid");
        }

        if (!String(user.password).startsWith('$2')) {
            const upgradedHash = await bcrypt.hash(password, 12);
            await supabase
                .from('users')
                .update({ password: upgradedHash })
                .eq('user_id', user.user_id);
        }

        const token = generateToken(user);
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            message: "Berhasil masuk",
            user: userWithoutPassword,
            token
        });
    } catch (error) {
        console.error("Login error:", error);
        sendSafeError(res, 500, "Gagal masuk");
    }
});

export default router;
