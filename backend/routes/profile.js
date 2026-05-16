import express from "express";
import bcrypt from "bcrypt";
import multer from "multer";
import { supabase } from "../supabaseClient.js";
import { authenticateToken } from "../middleware/auth.js";
import { sendSafeError, validateRequiredText } from "../utils/security.js";

const router = express.Router();
const PROFILE_IMAGE_BUCKET = "profile-img";
const ALLOWED_PROFILE_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
let cachedCanUseUserImageColumn = null;

// Configure multer for image uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    console.log("File filter check:", file.mimetype);
    if (ALLOWED_PROFILE_IMAGE_TYPES.has(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Format gambar harus JPG, PNG, WEBP, atau GIF"), false);
    }
  },
});

function handleProfileImageUpload(req, res, next) {
  upload.single("profileImage")(req, res, (error) => {
    if (!error) {
      return next();
    }

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return sendSafeError(res, 400, "Ukuran gambar terlalu besar (maksimal 5MB)");
    }

    return sendSafeError(res, 400, error.message || "Gagal membaca gambar profil");
  });
}

// GET /api/profile - Fetch user profile
router.get("/", authenticateToken, async (req, res) => {
  console.log("GET /api/profile called with user:", req.user.user_id);
  try {
    const imgColumnAvailable = await canUseUserImageColumn();
    const { data: user, error } = await supabase
      .from("users")
      .select(imgColumnAvailable ? "user_id, name, email, img" : "user_id, name, email")
      .eq("user_id", req.user.user_id)
      .single();

    if (error || !user) {
      console.error("User fetch error:", error?.message || "Pengguna tidak ditemukan");
      return res.json({
        user: {
          user_id: req.user.user_id,
          name: req.user.name || "Pengguna",
          email: req.user.email || "",
          img: await getStoredProfileImageUrl(req.user.user_id),
        },
      });
    }

    const profileImageUrl = await resolveProfileImageUrl(user.img, user.user_id);

    res.json({
      user: {
        user_id: user.user_id,
        name: user.name,
        email: user.email,
        img: profileImageUrl,
      },
    });
  } catch (error) {
    console.error("Error fetching profile:", {
      message: error.message,
      stack: error.stack
    });
    sendSafeError(res, 500, "Gagal mengambil profil");
  }
});

// PUT /api/profile - Update user profile
router.put("/", authenticateToken, handleProfileImageUpload, async (req, res) => {
  console.log("PUT /api/profile called for user:", req.user.user_id);
  try {
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("password")
      .eq("user_id", req.user.user_id)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", userError?.message || "Pengguna tidak ditemukan");
      return sendSafeError(res, 404, "Pengguna tidak ditemukan");
    }

    const updates = {};
    let savedProfileImage = null;

    if (req.body.name) {
      const nameValidation = validateRequiredText(req.body.name, "Nama", 50);
      if (!nameValidation.isValid) {
        return sendSafeError(res, 400, nameValidation.message);
      }
      updates.name = nameValidation.value;
    }

    if (req.body.newPassword && req.body.currentPassword) {
      const isValidPassword = await bcrypt.compare(req.body.currentPassword, user.password);
      if (!isValidPassword) {
        return sendSafeError(res, 400, "Kata sandi saat ini tidak valid");
      }

      const passwordValidation = validatePassword(req.body.newPassword);
      if (!passwordValidation.isValid) {
        return sendSafeError(res, 400, passwordValidation.message);
      }

      const isSamePassword = await bcrypt.compare(req.body.newPassword, user.password);
      if (isSamePassword) {
        return sendSafeError(res, 400, "Kata sandi baru tidak boleh sama dengan kata sandi saat ini");
      }

      const passwordHash = await bcrypt.hash(req.body.newPassword, 12);
      updates.password = passwordHash;
    }

    if (req.file) {
      try {
        if (req.file.size > 5 * 1024 * 1024) {
          return sendSafeError(res, 400, "Ukuran gambar terlalu besar (maksimal 5MB)");
        }

        savedProfileImage = await saveProfileImage(req.user.user_id, req.file);

        const imgColumnAvailable = await canUseUserImageColumn();
        if (imgColumnAvailable) {
          updates.img = savedProfileImage.path;
        }

        console.log(`Image uploaded: ${req.file.mimetype}, size: ${req.file.size} bytes`);
      } catch (error) {
        console.error("Image processing error:", error.message);
        return sendSafeError(res, 500, error.message || "Gagal memproses gambar");
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.json({
        message: "Tidak ada perubahan profil untuk disimpan",
        user: {
          user_id: req.user.user_id,
          name: req.user.name || "Pengguna",
          email: req.user.email || "",
          img: savedProfileImage?.url || await getStoredProfileImageUrl(req.user.user_id),
        },
      });
    }

    const imgColumnAvailable = await canUseUserImageColumn();
    const { data: updatedUser, error: updateError } = await supabase
      .from("users")
      .update(updates)
      .eq("user_id", req.user.user_id)
      .select(imgColumnAvailable ? "user_id, name, email, img" : "user_id, name, email")
      .single();

    if (updateError) {
      console.error("Update error:", updateError.message);
      return sendSafeError(res, 500, "Gagal memperbarui profil");
    }

    const profileImageUrl = savedProfileImage?.url || await resolveProfileImageUrl(updatedUser.img, updatedUser.user_id);

    res.json({
      message: "Profil pengguna berhasil diperbarui",
      user: {
        user_id: updatedUser.user_id,
        name: updatedUser.name,
        email: updatedUser.email,
        img: profileImageUrl,
      },
    });
  } catch (error) {
    console.error("Update profile error:", {
      message: error.message,
      stack: error.stack
    });
    sendSafeError(res, 500, "Gagal memperbarui profil");
  }
});

// DELETE /api/profile - Delete user account
router.delete("/", authenticateToken, async (req, res) => {
  console.log("=== DELETE /api/profile called for user:", req.user.user_id);
  try {
    // Verify user exists
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("user_id")
      .eq("user_id", req.user.user_id)
      .single();

    if (userError || !user) {
      console.error("User fetch error:", {
        message: userError?.message || "Pengguna tidak ditemukan",
        details: userError?.details,
        code: userError?.code,
        hint: userError?.hint
      });
      return sendSafeError(res, 404, "Pengguna tidak ditemukan");
    }

    console.log("User found:", user.user_id);

    // Delete history records
    const { data: historyData, error: historyError } = await supabase
      .from("history")
      .delete()
      .eq("user_id", req.user.user_id)
      .select("history_id"); // Return deleted record IDs for logging

    if (historyError) {
      console.error("History delete error:", {
        message: historyError.message,
        details: historyError.details,
        code: historyError.code,
        hint: historyError.hint
      });
      return sendSafeError(res, 500, "Gagal menghapus data riwayat");
    }

    console.log("History records deleted:", historyData?.length || 0);

    // Delete user
    const { data: userData, error: userDeleteError } = await supabase
      .from("users")
      .delete()
      .eq("user_id", req.user.user_id)
      .select("user_id")
      .single();

    if (userDeleteError) {
      console.error("User delete error:", {
        message: userDeleteError.message,
        details: userDeleteError.details,
        code: userDeleteError.code,
        hint: userDeleteError.hint
      });
      return sendSafeError(res, 500, "Gagal menghapus akun pengguna");
    }

    if (!userData) {
      console.warn("Pengguna tidak ditemukan with user_id:", req.user.user_id);
      return sendSafeError(res, 404, "Akun pengguna tidak ditemukan");
    }

    console.log("Akun berhasil dihapus for user:", req.user.user_id);
    return res.status(200).json({ message: "Akun berhasil dihapus" });
  } catch (error) {
    console.error("Delete account error:", {
      message: error.message,
      details: error.details,
      code: error.code,
      hint: error.hint,
      stack: error.stack
    });
    return sendSafeError(res, 500, "Gagal menghapus akun");
  }
});

async function canUseUserImageColumn() {
  if (cachedCanUseUserImageColumn !== null) {
    return cachedCanUseUserImageColumn;
  }

  const { error } = await supabase
    .from("users")
    .select("img")
    .limit(1);

  cachedCanUseUserImageColumn = !error;
  return cachedCanUseUserImageColumn;
}

async function ensureProfileImageBucket() {
  const { data: buckets, error: listError } = await supabase.storage.listBuckets();
  if (!listError && buckets?.some((bucket) => bucket.name === PROFILE_IMAGE_BUCKET)) {
    return;
  }

  const { error: createError } = await supabase.storage.createBucket(PROFILE_IMAGE_BUCKET, {
    public: true,
  });

  if (createError && !/already exists/i.test(createError.message || "")) {
    console.error("Profile image bucket error:", createError.message);
    throw new Error("Gagal menyiapkan penyimpanan gambar profil");
  }
}

async function saveProfileImage(userId, file) {
  await ensureProfileImageBucket();

  const folder = getProfileImageFolder(userId);
  const extension = getImageExtension(file.mimetype);
  const filePath = `${folder}/avatar.${extension}`;

  await removeExistingProfileImages(folder);

  const { error: uploadError } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .upload(filePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    console.error("Image upload error:", uploadError.message);
    throw new Error("Gagal mengunggah gambar profil");
  }

  return {
    path: filePath,
    url: await getProfileImageUrl(filePath),
  };
}

async function removeExistingProfileImages(folder) {
  const { data: files, error } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .list(folder);

  if (error || !files?.length) {
    return;
  }

  const paths = files.map((file) => `${folder}/${file.name}`);
  await supabase.storage.from(PROFILE_IMAGE_BUCKET).remove(paths);
}

async function resolveProfileImageUrl(value, userId) {
  if (typeof value === "string" && (value.startsWith("http") || value.startsWith("data:image/"))) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const url = await getProfileImageUrl(value);
    if (url) return url;
  }

  return getStoredProfileImageUrl(userId);
}

async function getStoredProfileImageUrl(userId) {
  try {
    const folder = getProfileImageFolder(userId);
    const { data: files, error } = await supabase.storage
      .from(PROFILE_IMAGE_BUCKET)
      .list(folder, {
        limit: 20,
      });

    if (error || !files?.length) {
      return null;
    }

    const avatarFile = files.find((file) => file.name.startsWith("avatar.")) || files[0];
    return getProfileImageUrl(`${folder}/${avatarFile.name}`);
  } catch (error) {
    console.warn("Failed to load stored profile image:", error.message);
    return null;
  }
}

async function getProfileImageUrl(filePath) {
  const { data: signedData, error: signedError } = await supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .createSignedUrl(filePath, 60 * 60 * 24 * 7);

  if (!signedError && signedData?.signedUrl) {
    return signedData.signedUrl;
  }

  const { data: publicData } = supabase.storage
    .from(PROFILE_IMAGE_BUCKET)
    .getPublicUrl(filePath);

  return publicData?.publicUrl || null;
}

function getProfileImageFolder(userId) {
  return `users/${String(userId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
}

function getImageExtension(mimetype) {
  const extension = mimetype.split("/")[1]?.toLowerCase() || "jpg";
  if (extension === "jpeg" || extension === "jpg") return "jpg";
  if (extension === "png") return "png";
  if (extension === "webp") return "webp";
  if (extension === "gif") return "gif";
  return "jpg";
}

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

export default router;
