import { apiCall } from '../config.js';
import { hideGlobalLoading, setButtonLoading, showGlobalLoading } from '../utils/loading.js';
import { validateCurhatText } from '../utils/validation.js';

export function renderCurhat() {
  return fetch("/views/curhat.html")
    .then((res) => {
      if (!res.ok) throw new Error("Gagal memuat curhat.html");
      return res.text();
    })
    .then((html) => {
      document.getElementById("app").innerHTML = html;

      const usernameSpan = document.getElementById("username");
      const user = JSON.parse(sessionStorage.getItem("user") || "{}");
      const username = user.name || "Pengguna";
      if (usernameSpan) usernameSpan.textContent = username;

      const logoutLink = document.querySelector(".nav-links a[href='#']");
      if (logoutLink) {
        logoutLink.addEventListener("click", (e) => {
          e.preventDefault();
          if (window.logout) {
            window.logout();
          }
        });
      }

      const submitButton = document.getElementById("submitCurhat");
      const curhatForm = document.getElementById("curhatForm");
      const curhatInput = document.getElementById("curhatInput");
      const result = document.getElementById("result");
      const charCounter = document.getElementById("charCounter");
      const validationMessage = document.getElementById("curhatValidation");
      const fileInput = document.getElementById("curhatFileInput");
      const filePreview = document.getElementById("filePreview");

      if (!submitButton || !curhatForm || !curhatInput) {
        return;
      }

      const updateCurhatState = () => {
        const text = curhatInput.value;
        const trimmed = text.trim();
        const validation = validateCurhatText(trimmed);
        const length = text.length;

        if (charCounter) {
          charCounter.textContent = `${length}/1000`;
          charCounter.classList.toggle("text-red-600", length > 1000);
          charCounter.classList.toggle("text-slate-500", length <= 1000);
        }

        if (validationMessage) {
          validationMessage.textContent = validation.isValid
            ? "Curhat sudah cukup untuk dianalisis."
            : validation.message;
          validationMessage.classList.toggle("text-emerald-700", validation.isValid);
          validationMessage.classList.toggle("text-amber-700", !validation.isValid);
        }

        submitButton.disabled = !validation.isValid;
      };

      curhatInput.addEventListener("input", updateCurhatState);
      updateCurhatState();

      if (fileInput && filePreview) {
        fileInput.addEventListener("change", () => {
          const file = fileInput.files?.[0];
          if (!file) {
            filePreview.classList.add("hidden");
            filePreview.innerHTML = "";
            return;
          }

          const isImage = /^image\/(jpeg|png|webp)$/.test(file.type);
          filePreview.classList.remove("hidden");
          filePreview.innerHTML = `
            <div class="flex items-start justify-between gap-3">
              <div class="min-w-0">
                <p class="truncate font-medium text-slate-800">${escapeHtml(file.name)}</p>
                <p class="mt-1 text-xs ${isImage ? 'text-emerald-700' : 'text-red-600'}">
                  ${isImage ? 'Siap ditinjau sebagai lampiran opsional.' : 'Format file belum didukung.'}
                </p>
              </div>
              <button type="button" id="removeFilePreview" class="shrink-0 rounded-md px-2 py-1 text-xs font-semibold text-violet-800 hover:bg-violet-50">
                Hapus
              </button>
            </div>
          `;
          document.getElementById("removeFilePreview")?.addEventListener("click", () => {
            fileInput.value = "";
            filePreview.classList.add("hidden");
            filePreview.innerHTML = "";
          });
        });
      }

      curhatForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        if (submitButton.disabled) return;
        const text = curhatInput.value.trim();
        const textValidation = validateCurhatText(text);
        if (!textValidation.isValid) {
          alert(textValidation.message);
          return;
        }

        showLoading();

        try {
          const result = await apiCall('/api/curhat', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({ 
              text: text
            }),
          });

          if (!result || typeof result !== 'object') {
            throw new Error('Format respons tidak valid');
          }

          const enhancedResult = {
            user_input: text,
            predicted_stress: result.predicted_stress || { label: 'medium' },
            stress_level: result.stress_level || { stress_level: 50 },
            analysis: result.analysis || 'Saran: Analisis berhasil diproses.',
            keywords: result.keywords || [],
            recommended_videos: result.recommended_videos || { recommendations: [] },
            timestamp: new Date().toISOString(),
            saved_to_history: result.saved_to_history || false,
            history_id: result.history_id || null,
            pending_dass21: result.pending_dass21 || true
          };

          sessionStorage.setItem("curhatResult", JSON.stringify(enhancedResult));
          
          curhatInput.value = "";

          if (window.loadView) {
            window.loadView("dass21");
          } else {
            console.error("window.loadView function not found");
          }

        } catch (error) {
          let errorMessage = "Gagal memproses curhat Anda. ";
          
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMessage += "Periksa koneksi Anda lalu coba lagi.";
          }
          else if (error.message.includes('timeout')) {
            errorMessage += "Proses analisis membutuhkan waktu lebih lama dari biasanya. Silakan coba lagi.";
          }
          else if (error.message.includes('ML API')) {
            errorMessage += "Layanan analisis ML sedang bermasalah. Silakan coba lagi nanti.";
          }
          else {
            errorMessage += `Detail: ${error.message}`;
          }
          
          alert(errorMessage);
          
        } finally {
          hideLoading();
          updateCurhatState();
        }
      });
    })
    .catch((error) => {
      console.error("Error loading curhat view:", error);
    });
}

function showLoading() {
  showGlobalLoading({
    title: 'Menganalisis curhat...',
    message: 'Sebentar ya, cerita Anda sedang dianalisis dengan hati-hati.',
  });

  const submitButton = document.getElementById("submitCurhat");
  setButtonLoading(submitButton, true, 'Menganalisis...');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function hideLoading() {
  hideGlobalLoading();

  const submitButton = document.getElementById("submitCurhat");
  setButtonLoading(submitButton, false);
}
