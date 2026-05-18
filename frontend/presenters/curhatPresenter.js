import { apiCall } from '../config.js';

export function renderCurhat() {
  fetch("views/curhat.html")
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

      if (!submitButton || !curhatForm || !curhatInput) {
        console.warn("Required form elements not found in curhat.html.");
        return;
      }

      curhatForm.addEventListener("submit", async (event) => {
        event.preventDefault();
        const text = curhatInput.value.trim();

        if (!text) {
          alert("Silakan tulis curhat Anda terlebih dahulu.");
          return;
        }

        if (text.length < 50) {
          alert("Silakan tulis minimal 50 karakter agar hasil analisis lebih akurat.");
          return;
        }

        console.log("Submitting curhat text:", { length: text.length });

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

          console.log("Curhat analysis response received");

          if (!result || typeof result !== 'object') {
            throw new Error('Format respons server tidak valid');
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

          console.log("Curhat analysis prepared for DASS-21");

          sessionStorage.setItem("curhatResult", JSON.stringify(enhancedResult));
          
          curhatInput.value = "";

          if (window.loadView) {
            console.log("Navigating to DASS-21 view");
            window.loadView("dass21");
          } else {
            console.error("window.loadView function not found");
          }

        } catch (error) {
          console.error("Error occurred:", error);
          
          let errorMessage = "Gagal memproses curhat Anda. ";
          
          if (error.message.includes('Failed to fetch') || error.message.includes('NetworkError')) {
            errorMessage += "Pastikan server backend berjalan di localhost:5001.";
          }
          else if (error.message.includes('timeout')) {
            errorMessage += "Permintaan terlalu lama. Layanan ML mungkin sedang lambat. Silakan coba lagi.";
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
        }
      });
    })
    .catch((error) => {
      console.error("Error loading curhat view:", error);
    });
}

function showLoading() {
  const spinner = document.getElementById("spinner");
  if (spinner) {
    spinner.classList.remove("hidden");
  }
  
  const submitButton = document.getElementById("submitCurhat");
  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "Memproses...";
  }
}

function hideLoading() {
  const spinner = document.getElementById("spinner");
  if (spinner) {
    spinner.classList.add("hidden");
  }
  
  const submitButton = document.getElementById("submitCurhat");
  if (submitButton) {
    submitButton.disabled = false;
    submitButton.textContent = "Kirim";
  }
}
