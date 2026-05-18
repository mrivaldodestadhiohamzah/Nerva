export function renderFeedback() {
  fetch("views/feedbackView.html")
    .then((res) => {
      if (!res.ok) throw new Error("Gagal memuat feedbackView.html");
      return res.text();
    })
    .then((html) => {
      document.getElementById("app").innerHTML = html;

      const userName = localStorage.getItem("username") || "Pengguna";
      const usernameEl = document.getElementById("username");
      if (usernameEl) usernameEl.textContent = userName;

      setupNavigation();
      loadFeedbackResult();
    })
    .catch((err) => {
      console.error("Error loading feedback view:", err);
    });
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function toPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function formatPercent(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? `${Math.round(numeric)}%` : 'Tidak tersedia';
}

function formatConfidence(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 'Tidak tersedia';
  return formatPercent(numeric > 1 ? numeric : numeric * 100);
}

function extractSuggestion(analysis = '') {
  const text = String(analysis || '').trim();
  if (!text) return 'Belum ada saran tersedia.';

  const markers = ['Saran:', 'Suggestions:'];
  for (const marker of markers) {
    const markerIndex = text.indexOf(marker);
    if (markerIndex !== -1) {
      const suggestion = text.slice(markerIndex + marker.length).trim();
      return suggestion || 'Belum ada saran tersedia.';
    }
  }

  if (text.startsWith("Why you're getting this result:") || text.startsWith('Mengapa hasil ini muncul:')) {
    return 'Belum ada saran tersedia.';
  }

  return text;
}

function normalizeRecommendations(value) {
  if (!value) return [];

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return [];

    try {
      return normalizeRecommendations(JSON.parse(trimmed));
    } catch {
      return [trimmed];
    }
  }

  if (Array.isArray(value)) {
    return value.flatMap(normalizeRecommendations);
  }

  if (typeof value === 'object') {
    return normalizeRecommendations(
      value.recommendations ??
      value.video_link ??
      value.videos ??
      value.urls ??
      value.url
    );
  }

  return [];
}

function getVideoRecommendations(result = {}) {
  const sources = [
    result.recommended_videos?.recommendations,
    result.recommended_videos,
    result.video_link,
    result.metadata?.recommended_videos?.recommendations,
    result.metadata?.recommended_videos,
    result.ml_result?.recommended_videos?.recommendations,
    result.ml_result?.recommended_videos,
    result.ml_result?.recommendations,
    result.ml_result?.videos,
  ];

  return [...new Set(
    sources
      .flatMap(normalizeRecommendations)
      .map(url => String(url).trim())
      .filter(Boolean)
  )];
}

function toVideoEmbedUrl(rawUrl) {
  const value = String(rawUrl || '').trim();
  if (!value) return null;

  try {
    const url = new URL(value, window.location.origin);
    const host = url.hostname.replace(/^www\./, '');

    if (host === 'youtu.be') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }

    if (host.endsWith('youtube.com') || host.endsWith('youtube-nocookie.com')) {
      if (url.pathname.includes('/embed/')) return value;
      if (url.pathname.includes('/shorts/')) {
        const id = url.pathname.split('/shorts/')[1]?.split('/')[0];
        return id ? `https://www.youtube.com/embed/${id}` : null;
      }

      const id = url.searchParams.get('v');
      return id ? `https://www.youtube.com/embed/${id}` : null;
    }
  } catch {
    return null;
  }

  return null;
}

function isSafeVideoUrl(rawUrl) {
  try {
    const url = new URL(String(rawUrl || '').trim(), window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

function renderVideoRecommendations(result) {
  const container = document.getElementById('video-recommendations');
  if (!container) return;

  const recommendations = getVideoRecommendations(result).filter(isSafeVideoUrl);
  if (recommendations.length === 0) {
    container.innerHTML = `
      <div class="rounded-lg border border-violet-100 bg-violet-50 p-4 text-sm text-gray-600 md:col-span-2">
        Rekomendasi video belum tersedia untuk hasil ini.
      </div>
    `;
    return;
  }

  container.innerHTML = recommendations.map((url, index) => {
    const embedUrl = toVideoEmbedUrl(url);
    const title = `Video rekomendasi ${index + 1}`;

    if (!embedUrl) {
      return `
        <a
          href="${escapeHtml(url)}"
          target="_blank"
          rel="noopener noreferrer"
          class="rounded-lg border border-violet-100 bg-violet-50 p-4 text-sm font-medium text-violet-800 hover:bg-violet-100 transition-colors"
        >
          Buka ${escapeHtml(title)}
        </a>
      `;
    }

    return `
      <div class="overflow-hidden rounded-lg border border-violet-100 bg-violet-50">
        <iframe
          class="w-full aspect-video"
          src="${escapeHtml(embedUrl)}"
          title="${escapeHtml(title)}"
          loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowfullscreen
        ></iframe>
      </div>
    `;
  }).join('');
}

function describeSuspiciousPatterns(patterns = []) {
  const labels = {
    completion_too_fast: 'pengisian terlihat terlalu cepat',
    almost_all_highest_answers: 'banyak jawaban berada di pilihan paling tinggi',
    almost_all_lowest_answers: 'banyak jawaban berada di pilihan paling rendah',
    uniform_repetitive_answers: 'pola jawaban terlihat terlalu seragam',
    long_repeated_answer_run: 'jawaban terlihat berulang dalam waktu berdekatan',
    abnormally_low_answer_variance: 'variasi jawaban terlalu rendah',
    dass_text_emotional_contradiction: 'jawaban kuesioner dan isi curhat menunjukkan gambaran yang berbeda',
  };

  return [...new Set(patterns.map(pattern => labels[pattern]).filter(Boolean))];
}

function buildFriendlyFusionExplanation(fusion = {}) {
  const dassWeight = Number(fusion.dassWeight);
  const curhatWeight = Number(fusion.curhatWeight ?? fusion.mlWeight);
  const patterns = describeSuspiciousPatterns(fusion.suspiciousPatterns || fusion.reliability?.dass?.suspiciousPatterns || []);
  const hasContradiction = fusion.contradiction?.hasContradiction;
  const sentences = [
    'Hasil akhir dihitung dari dua sumber, yaitu jawaban kuesioner dan isi curhat.',
  ];

  if (Number.isFinite(dassWeight) && Number.isFinite(curhatWeight)) {
    if (dassWeight > curhatWeight + 8) {
      sentences.push('Pada hasil ini, sistem lebih banyak mempertimbangkan kuesioner.');
    } else if (curhatWeight > dassWeight + 8) {
      sentences.push('Pada hasil ini, isi curhat mendapat perhatian lebih besar karena membantu menggambarkan kondisi pengguna.');
    } else {
      sentences.push('Pada hasil ini, kedua sumber dipertimbangkan dengan cukup seimbang.');
    }
  }

  if (patterns.length > 0) {
    sentences.push(`Bobot kuesioner disesuaikan karena ${patterns.join(' dan ')}.`);
  } else if (hasContradiction) {
    sentences.push('Bobot disesuaikan karena jawaban kuesioner dan isi curhat menunjukkan gambaran yang berbeda.');
  }

  sentences.push('Isi curhat tetap ikut dipertimbangkan sebagai gambaran tambahan tentang kondisi pengguna.');

  return sentences.join(' ');
}

function setupNavigation() {
  const navLinks = [
    { selector: 'a[href="#dashboard"]', view: 'dashboard' }, 
    { selector: 'a[href="#history"]', view: 'history' },
    { selector: 'a[href="#logout"]', view: 'logout' },
  ];

  navLinks.forEach(({ selector, view }) => {
    const el = document.querySelector(selector);
    if (el) {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        if (view === 'logout') {
          logout();
        } else {
          loadView(view);
        }
      });
    }
  });
}

function logout() {
  localStorage.clear();
  location.reload();
}

function loadView(view) {
  switch (view) {
    case 'dashboard':
      import('./dashboardPresenter.js').then(m => m.renderDashboard());
      break;
    case 'history':
      import('./historyPresenter.js').then(m => m.renderHistory());
      break;
    case 'logout':
      logout();
      break;
    default:
      console.warn(`View '${view}' tidak dikenali`);
  }
}

function loadFeedbackResult() {
  const result = JSON.parse(sessionStorage.getItem("curhatResult"));
  if (!result) {
    console.warn("Data hasil tidak ditemukan di sessionStorage.");
    return;
  }
  displayFeedback(result);
  populateUserInput(result);
  populateResultSections(result);
}

function displayFeedback(result) {
  const stressPercentEl = document.getElementById("percentage");
  const chartContainer = document.querySelector('.result-card .flex > :first-child');
  if (stressPercentEl && chartContainer) {
    const stressLevel = toPercent(result.stress_level?.stress_level);
    stressPercentEl.textContent = `${stressLevel}%`;

    // Create donut chart SVG
    const radius = 50;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (stressLevel / 100) * circumference;

    chartContainer.innerHTML = `
      <svg width="120" height="120" viewBox="0 0 120 120" class="transform -rotate-90">
        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="20" />
        <circle cx="60" cy="60" r="${radius}" fill="none" stroke="url(#gradient)" stroke-width="20" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" />
        <defs>
          <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" style="stop-color:#6b21a8;" />
            <stop offset="100%" style="stop-color:#a78bfa;" />
          </linearGradient>
        </defs>
      </svg>
      <div class="absolute inset-0 flex items-center justify-center text-violet-800 font-bold text-xl">
        <span id="percentage">${Math.round(stressLevel)}%</span>
      </div>
    `;

    // Update styles for positioning
    chartContainer.classList.add('relative');
    chartContainer.style.width = '120px';
    chartContainer.style.height = '120px';
  }

  const stressTitleEl = document.getElementById("stress-title");
  if (stressTitleEl) stressTitleEl.textContent = `Tingkat Stres: ${result.predicted_stress?.label || "Tidak diketahui"}`;

}

function populateUserInput(result) {
  const userInputEl = document.getElementById("user-input");
  if (userInputEl) {
    userInputEl.textContent = result.user_input || "Tidak ada teks yang diberikan.";
  }
}

function populateResultSections(result) {
  const suggestionEl = document.getElementById('suggestion-text');
  if (suggestionEl) {
    suggestionEl.innerHTML = escapeHtml(extractSuggestion(result.analysis)).replace(/\n/g, '<br>');
  }

  const fusionSummaryEl = document.getElementById('fusion-summary');
  if (fusionSummaryEl) {
    fusionSummaryEl.innerHTML = buildFusionSummary(result);
  }

  const fusionDetailsEl = document.getElementById('fusion-details');
  if (fusionDetailsEl) {
    fusionDetailsEl.innerHTML = buildFusionDetails(result);
  }

  renderVideoRecommendations(result);
}

function buildFusionSummary(result) {
  const fusion = result.fusion;
  if (!fusion) {
    return '<p class="text-sm text-gray-600">Rincian fusion belum tersedia untuk data ini.</p>';
  }

  return `
    <div class="space-y-3 text-sm text-gray-700">
      <p>
      DASS-21 ${formatPercent(fusion.dassWeight)} (${formatPercent(fusion.dassStressPercent)})
      + Curhat ${formatPercent(fusion.curhatWeight ?? fusion.mlWeight)} (${formatPercent(fusion.mlStressPercent)})
      = ${formatPercent(fusion.fusedStressPercent)}.
      </p>
      <p>${escapeHtml(buildFriendlyFusionExplanation(fusion))}</p>
    </div>
  `;
}

function buildFusionDetails(result) {
  const fusion = result.fusion;
  const dass21 = result.dass21;
  if (!fusion && !dass21) return '';

  const mlConfidence = fusion?.mlConfidence ?? result.predicted_stress?.confidence;

  return `
    <div class="rounded-lg border border-violet-100 bg-violet-50 p-4 text-sm text-gray-700">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><span class="font-medium">DASS-21:</span> ${formatPercent(dass21?.stressPercent ?? fusion?.dassStressPercent)}</div>
        <div><span class="font-medium">Curhat ML:</span> ${formatPercent(fusion?.mlStressPercent)}</div>
        <div><span class="font-medium">Bobot DASS-21:</span> ${formatPercent(fusion?.dassWeight)}</div>
        <div><span class="font-medium">Bobot Curhat:</span> ${formatPercent(fusion?.curhatWeight ?? fusion?.mlWeight)}</div>
        <div><span class="font-medium">Hasil Akhir:</span> ${formatPercent(fusion?.fusedStressPercent ?? result.stress_level?.stress_level)}</div>
      </div>
    </div>
  `;
}

export class FeedbackPresenter {
  async getFeedbackHistory() {
    try {
      const response = await fetch("http://localhost:5001/api/submissions");
      if (!response.ok) throw new Error("Gagal mengambil riwayat masukan");
      return await response.json();
    } catch (err) {
      console.error(err);
      return [];
    }
  }
}
