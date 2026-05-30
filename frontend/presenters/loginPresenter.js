import { apiCall, getAuthToken, setAuthSession } from '../config.js';
import { hideGlobalLoading, setButtonLoading, showGlobalLoading } from '../utils/loading.js';
import { validateEmail } from '../utils/validation.js';

export function renderLogin() {
  fetch("/views/loginView.html")
    .then((res) => res.text())
    .then((html) => {
      document.getElementById("app").innerHTML = html;
      attachLoginListeners();
    })
    .catch((error) => {
      console.error('Error loading login view:', error);
      document.getElementById("app").innerHTML = '<p>Gagal memuat halaman masuk</p>';
    });
}

function attachLoginListeners() {
  const loginButton = document.getElementById("loginButton");
  const loginForm = document.getElementById("loginForm");
  const errorMessageDiv = document.getElementById("errorMessage");

  if (!loginButton || !loginForm || !errorMessageDiv) {
    console.error('Login elements not found');
    return;
  }

  function showError(message) {
    errorMessageDiv.textContent = message;
    errorMessageDiv.style.display = 'block';
  }

  function clearError() {
    errorMessageDiv.textContent = "";
    errorMessageDiv.style.display = 'none';
  }

  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (loginButton.disabled) return;
    clearError();

    const email = document.getElementById("loginEmail")?.value.trim();
    const password = document.getElementById("loginPassword")?.value.trim();

    if (!email || !password) {
      showError("Harap isi semua kolom.");
      return;
    }

    if (!validateEmail(email)) {
      showError("Masukkan alamat email yang valid.");
      return;
    }

    try {
      setButtonLoading(loginButton, true, 'Memuat...');
      showGlobalLoading({
        title: 'Memuat...',
        message: 'Sebentar ya, akun Anda sedang diperiksa.',
      });

      // apiCall already handles JSON parsing and error checking
      const data = await apiCall('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // Success - use the updated login function
      if (data.token && data.user) {
        setAuthSession(data.user, data.token);

        // Call the existing login function with user data and token
        if (window.login) {
          window.login(data.user, data.token);
        }

        // Fetch the full user profile to process profile picture
        await fetchUserProfile();

        // Update navbar to reflect the profile picture
        await window.updateNavbar();

        // Redirect to dashboard
        window.loadView('dashboard');
      }

      clearError();
    } catch (error) {
      showError(error.message);
    } finally {
      hideGlobalLoading();
      setButtonLoading(loginButton, false);
    }
  });

  // Handle "Go to Signup" link if it exists
  const signupLink = document.getElementById("signupLink");
  if (signupLink) {
    signupLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.loadView) {
        window.loadView('signup');
      }
    });
  }

  // Handle "Forgot Password" link if it exists
  const forgotPasswordLink = document.getElementById("forgotPasswordLink");
  if (forgotPasswordLink) {
    forgotPasswordLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.loadView) {
        window.loadView('forgetpassword');
      }
    });
  }
}

// Fetch user profile to process profile picture
async function fetchUserProfile() {
  const token = getAuthToken();
  if (!token) {
    return;
  }

  try {
    const profileResponse = await apiCall('/api/profile', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (profileResponse.user) {
      const user = profileResponse.user;
      sessionStorage.setItem('user', JSON.stringify(user));
      updateNavbarUI(user);
    }
  } catch (error) {
    // Fallback to cached user data
    const cachedUser = JSON.parse(sessionStorage.getItem('user') || '{}');
    if (cachedUser) {
      updateNavbarUI(cachedUser);
    }
  }
}

// Reuse handleProfileImageDisplay from account page
function handleProfileImageDisplay(imageElement, user) {
  const defaultImage = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';

  try {
    if (!user?.img) {
      imageElement.src = defaultImage;
      return;
    }

    if (typeof user.img === 'string') {
      if (user.img.startsWith('http') || user.img.startsWith('data:image/')) {
        imageElement.src = user.img;
        return;
      }

      if (user.img.startsWith('\\x')) {
        try {
          const hexString = user.img.substring(2);
          const url = hexString.match(/.{2}/g)?.map(hex => String.fromCharCode(parseInt(hex, 16))).join('') || '';
          if (url.startsWith('http')) {
            imageElement.src = url;
            return;
          }
        } catch {}
      }
    }

    if (user.img && typeof user.img === 'object' && user.img.data) {
      const base64String = convertBinaryToBase64(user.img.data);
      if (base64String) {
        imageElement.src = base64String;
        return;
      }
    }

    imageElement.src = defaultImage;
    imageElement.onerror = () => {
      imageElement.src = defaultImage;
      imageElement.onerror = null;
    };
  } catch (error) {
    imageElement.src = defaultImage;
  }
}

function convertBinaryToBase64(binaryData) {
  try {
    if (!binaryData) return null;

    let binary = '';
    let bytes;

    if (binaryData instanceof ArrayBuffer) {
      bytes = new Uint8Array(binaryData);
    } else if (binaryData instanceof Uint8Array) {
      bytes = binaryData;
    } else if (Array.isArray(binaryData)) {
      bytes = new Uint8Array(binaryData);
    } else {
      return null;
    }

    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
      binary += String.fromCharCode.apply(null, chunk);
    }

    return 'data:image/jpeg;base64,' + btoa(binary);
  } catch (error) {
    return null;
  }
}

function updateNavbarUI(user) {
  if (!user) {
    return;
  }

  const profileImage = document.getElementById('profile-image');
  const dropdownUsername = document.getElementById('dropdown-username');
  const dropdownEmail = document.getElementById('dropdown-email');

  if (profileImage) {
    handleProfileImageDisplay(profileImage, user);
  }
  if (dropdownUsername) {
    dropdownUsername.textContent = user.name || 'Pengguna';
  }
  if (dropdownEmail) {
    dropdownEmail.textContent = user.email || '';
  }
}
