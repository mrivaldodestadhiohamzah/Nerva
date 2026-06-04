
import { authenticatedApiCall } from '../config.js';
import { hideGlobalLoading, renderPageLoading, showGlobalLoading } from '../utils/loading.js';

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

function extractSuggestion(feedback = '') {
  const text = String(feedback || '').trim();
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

function getVideoRecommendations(data = {}) {
  const sources = [
    data.recommended_videos?.recommendations,
    data.recommended_videos,
    data.video_link,
    data.metadata?.recommended_videos?.recommendations,
    data.metadata?.recommended_videos,
    data.ml_result?.recommended_videos?.recommendations,
    data.ml_result?.recommended_videos,
    data.ml_result?.recommendations,
    data.ml_result?.videos,
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

function renderVideoRecommendations(data) {
  const container = document.getElementById('video-recommendations');
  if (!container) return;

  const recommendations = getVideoRecommendations(data).filter(isSafeVideoUrl);
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

export async function renderHistoryDetail(historyId) {
  
  // Validate historyId first
  if (!historyId || historyId === 'undefined' || historyId === 'null') {
    console.error('Invalid historyId:', historyId);
    showErrorMessage('ID riwayat tidak valid');
    return;
  }

  document.getElementById("app").innerHTML = renderPageLoading(
    'Memuat detail riwayat...',
    'Sebentar ya, detail hasil Anda sedang disiapkan.'
  );

  try {
    fetch("/views/historyDetailView.html")
      .then((res) => {
        if (!res.ok) throw new Error("Gagal memuat historyDetailView.html");
        return res.text();
      })
      .then((html) => {
        document.getElementById("app").innerHTML = html;
        
        // Setup navigation similar to feedback presenter
        setupNavigation();
        loadHistoryDetail(historyId);
      })
      .catch((err) => {
        console.error("Error loading history detail view:", err);
        showErrorMessage(`Gagal memuat detail riwayat: ${err.message}`);
      });
  } catch (error) {
    console.error("Error rendering history detail:", error);
    showErrorMessage(`Gagal menampilkan detail riwayat: ${error.message}`);
  }
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

async function loadHistoryDetail(historyId) {
  try {
    showGlobalLoading({
      title: 'Memuat detail riwayat...',
      message: 'Sebentar ya, detail hasil Anda sedang disiapkan.',
    });
    const historyData = await authenticatedApiCall(`/api/history/${historyId}`);
    if (historyData) {
      displayHistoryDetail(historyData);
    } else {
      showNoDataMessage();
    }
  } catch (error) {
    console.error("Error loading history detail:", error);
    showErrorMessage(`Gagal memuat detail riwayat: ${error.message}`);
  } finally {
    hideGlobalLoading();
  }
}

function displayHistoryDetail(data) {
  const percentageElement = document.getElementById("percentage");
  const stressTitleElement = document.getElementById("stress-title");
  const userInputElement = document.getElementById("user-input");
  const analysisTextElement = document.getElementById("analysis-text");
  const fusionDetailsElement = document.getElementById("fusion-details");
  const fusionSummaryElement = document.getElementById("fusion-summary");

  const stressPercent = toPercent(data.stress_percent);
  if (percentageElement) percentageElement.textContent = `${stressPercent.toFixed(1)}%`;

  if (percentageElement && percentageElement.parentElement) {
    const donutContainer = percentageElement.parentElement;
    
    let strokeColor;
    if (stressPercent > 66) {
      strokeColor = '#dc2626'; 
    } else if (stressPercent > 33) {
      strokeColor = '#eab308';
    } else {
      strokeColor = '#16a34a'; 
    }

    const svgSize = 112;
    const strokeWidth = 8;
    const radius = (svgSize - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (stressPercent / 100) * circumference;

    donutContainer.innerHTML = `
      <div class="relative flex h-28 w-28 shrink-0 items-center justify-center sm:h-32 sm:w-32">
        <svg class="absolute inset-0 h-full w-full transform -rotate-90" viewBox="0 0 ${svgSize} ${svgSize}" aria-hidden="true">
          <!-- Background circle -->
          <circle
            cx="${svgSize / 2}"
            cy="${svgSize / 2}"
            r="${radius}"
            stroke="#e5e7eb"
            stroke-width="${strokeWidth}"
            fill="transparent"
          />
          <!-- Progress circle -->
          <circle
            cx="${svgSize / 2}"
            cy="${svgSize / 2}"
            r="${radius}"
            stroke="${strokeColor}"
            stroke-width="${strokeWidth}"
            fill="transparent"
            stroke-dasharray="${strokeDasharray}"
            stroke-dashoffset="${strokeDashoffset}"
            stroke-linecap="round"
            class="transition-all duration-1000 ease-out"
          />
        </svg>
        <div class="relative z-10 text-center">
          <div class="rounded-full bg-white/85 px-1 text-lg font-bold leading-none text-gray-800 sm:text-xl">${stressPercent.toFixed(1)}%</div>
        </div>
      </div>
    `;
  }

  if (stressTitleElement) {
    let stressLevelText = "Tidak diketahui";
    
    if (data.stress_level) {
      const level = data.stress_level.toLowerCase();
      switch (level) {
        case 'low':
        case 'rendah':
          stressLevelText = "Stres Rendah";
          break;
        case 'medium':
        case 'sedang':
          stressLevelText = "Stres Sedang";
          break;
        case 'high':
        case 'tinggi':
          stressLevelText = "Stres Tinggi";
          break;
        default:
          stressLevelText = data.stress_level.charAt(0).toUpperCase() + data.stress_level.slice(1);
      }
    }
    
    stressTitleElement.textContent = stressLevelText;
  }

  if (userInputElement) {
    userInputElement.textContent = data.text || "Tidak ada teks yang diberikan.";
  }

  if (analysisTextElement && data.feedback) {
    analysisTextElement.innerHTML = escapeHtml(extractSuggestion(data.feedback)).replace(/\n/g, '<br>');
  } else if (analysisTextElement) {
    analysisTextElement.textContent = "Belum ada saran tersedia.";
  }

  if (fusionSummaryElement) {
    fusionSummaryElement.innerHTML = buildFusionSummary(data);
  }

  if (fusionDetailsElement) {
    fusionDetailsElement.innerHTML = buildFusionDetails(data);
  }

  renderVideoRecommendations(data);
}

function buildFusionSummary(data) {
  const fusion = data.fusion || data.metadata?.fusion;
  if (!fusion) {
    return '<p class="text-sm text-gray-600">Rincian fusion belum tersedia untuk data ini.</p>';
  }

  return `
    <div class="space-y-3 text-sm text-gray-700">
      <p>
      DASS-21 ${formatPercent(fusion.dassWeight)} (${formatPercent(fusion.dassStressPercent)})
      + Curhat ${formatPercent(fusion.curhatWeight ?? fusion.mlWeight)} (${formatPercent(fusion.mlStressPercent)})
      = ${formatPercent(fusion.fusedStressPercent ?? data.stress_percent)}.
      </p>
      <p>${escapeHtml(buildFriendlyFusionExplanation(fusion))}</p>
    </div>
  `;
}

function buildFusionDetails(data) {
  const fusion = data.fusion || data.metadata?.fusion;
  const dass21 = data.dass21 || data.metadata?.dass21;
  const curhat = data.curhat_result || data.metadata?.curhat;

  if (!fusion && !dass21 && !curhat) {
    return '';
  }

  const dassWeight = fusion?.dassWeight ?? 70;
  const curhatWeight = fusion?.curhatWeight ?? fusion?.mlWeight ?? 30;
  const mlConfidence = fusion?.mlConfidence ?? curhat?.confidence;

  return `
    <div class="rounded-lg border border-violet-100 bg-violet-50 p-4 text-sm text-gray-700">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><span class="font-medium">DASS-21:</span> ${formatPercent(dass21?.stressPercent ?? fusion?.dassStressPercent)}</div>
        <div><span class="font-medium">Curhat ML:</span> ${formatPercent(curhat?.stressPercent ?? fusion?.mlStressPercent)}</div>
        <div><span class="font-medium">Bobot DASS-21:</span> ${formatPercent(dassWeight)}</div>
        <div><span class="font-medium">Bobot Curhat:</span> ${formatPercent(curhatWeight)}</div>
        <div><span class="font-medium">Hasil Akhir:</span> ${formatPercent(fusion?.fusedStressPercent ?? data.stress_percent)}</div>
      </div>
    </div>
  `;
}



function showNoDataMessage() {
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 py-8 text-center">
        <div class="text-gray-400 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
          </svg>
        </div>
        <p class="text-gray-500 text-lg">Detail riwayat tidak tersedia</p>
        <button onclick="loadView('history')" class="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
          Kembali ke Riwayat
        </button>
      </div>
    `;
  }
}

function showErrorMessage(message) {
  const app = document.getElementById("app");
  if (app) {
    app.innerHTML = `
      <div class="max-w-6xl mx-auto px-4 py-8 text-center">
        <div class="text-red-400 mb-4">
          <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
          </svg>
        </div>
        <p class="text-red-500 text-lg">${message}</p>
        <button onclick="loadView('history')" class="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
          Kembali ke Riwayat
        </button>
      </div>
    `;
  }
}

window.loadView = loadView;
