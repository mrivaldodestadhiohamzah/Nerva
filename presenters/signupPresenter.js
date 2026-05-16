import { apiCall } from '../config.js';

export function renderSignup() {
  fetch("views/signupView.html")
    .then((res) => res.text())
    .then((html) => {
      document.getElementById("app").innerHTML = html;
      attachSignupListeners();
    })
    .catch((error) => {
      console.error('Error loading signup view:', error);
      document.getElementById("app").innerHTML = '<p>Gagal memuat halaman daftar</p>';
    });
}

function attachSignupListeners() {
  const signupButton = document.getElementById("signupButton");
  const signupForm = document.getElementById("signupForm");
  const errorMessageDiv = document.getElementById("errorMessage");

  if (!signupButton || !signupForm || !errorMessageDiv) {
    console.error('Signup elements not found');
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

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();

    const name = document.getElementById("signupName")?.value.trim();
    const email = document.getElementById("signupEmail")?.value.trim();
    const password = document.getElementById("signupPassword")?.value.trim();
    const confirmPassword = document.getElementById("signupConfirmPassword")?.value.trim();
    const termsAccepted = document.getElementById("termsCheckbox")?.checked;

    if (!name || !email || !password || !confirmPassword) {
      showError("Harap isi semua kolom.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      showError("Masukkan alamat email yang valid.");
      return;
    }

    if (password !== confirmPassword) {
      showError("Kata sandi tidak cocok.");
      return;
    }

    if (!termsAccepted) {
      showError("Anda harus menyetujui Syarat & Ketentuan serta Kebijakan Privasi.");
      return;
    }

    try {
      signupButton.disabled = true;
      signupButton.textContent = "Membuat akun...";

      const data = await apiCall('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({ name, email, password }),
      });

      clearError();
      
      if (window.loadView) {
        window.loadView('login');
      }

    } catch (error) {
      console.error('Registration error:', error);
      showError(error.message);
    } finally {
      signupButton.disabled = false;
      signupButton.textContent = "Daftar";
    }
  });

  const loginLink = document.getElementById("loginLink");
  if (loginLink) {
    loginLink.addEventListener("click", (e) => {
      e.preventDefault();
      if (window.loadView) {
        window.loadView('login');
      }
    });
  }
}
