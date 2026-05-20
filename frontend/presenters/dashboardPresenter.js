import { authenticatedApiCall } from '../config.js';

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

function clampPercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return null;
  return Math.min(Math.max(numeric, 0), 100);
}

function getBrowserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  } catch {
    return 'Asia/Jakarta';
  }
}

function parseDateKey(dateKey) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(dateKey || ''));
  if (!match) return null;

  const [, year, month, day] = match.map(Number);
  return {
    sortValue: Date.UTC(year, month - 1, day),
    labelDate: new Date(year, month - 1, day),
  };
}

function formatChartDateLabel(dateValue) {
  const parsedDateKey = parseDateKey(dateValue);
  const date = parsedDateKey?.labelDate || new Date(dateValue);

  if (Number.isNaN(date.getTime())) {
    return 'Tanggal tidak valid';
  }

  return date.toLocaleDateString('id-ID', { month: 'short', day: 'numeric' });
}

function normalizeStressHistoryForChart(history = []) {
  return history
    .map(item => {
      const rawPercent = item.value ?? item.stress_percent ?? item.stressPercent ?? item.final_result?.stress_percent;
      const value = clampPercent(rawPercent);
      if (value === null) return null;

      const parsedDateKey = parseDateKey(item.date);
      const timestamp = parsedDateKey?.sortValue ?? new Date(item.date || item.created_at || item.latest_created_at).getTime();
      if (!Number.isFinite(timestamp)) return null;

      return {
        ...item,
        value,
        sortValue: timestamp,
        label: formatChartDateLabel(item.date || item.created_at || item.latest_created_at),
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.sortValue - b.sortValue);
}

function formatStressLevel(level) {
  const normalized = String(level || '').toLowerCase();
  const labels = {
    low: 'Rendah',
    medium: 'Sedang',
    high: 'Tinggi',
    rendah: 'Rendah',
    sedang: 'Sedang',
    tinggi: 'Tinggi',
  };
  return labels[normalized] || String(level || 'Tidak tersedia');
}

function extractSuggestionItems(feedback = '', maxItems = 3) {
  const text = String(feedback || '').trim();
  if (!text) return [];

  const lowerText = text.toLowerCase();
  const markerIndex = lowerText.indexOf('saran:') !== -1
    ? lowerText.indexOf('saran:')
    : lowerText.indexOf('suggestions:');

  const suggestionText = markerIndex === -1
    ? text
    : text.slice(markerIndex).replace(/^(saran|suggestions)[:\-]\s*/i, '').trim();

  return suggestionText
    .split(/\n\s*\n|\r?\n/)
    .map(item => item.replace(/^(saran|suggestions)[:\-]\s*/i, '').trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

export function renderDashboard() {
  return fetch("/views/dashboardView.html")
    .then((res) => {
      if (!res.ok) throw new Error("Gagal memuat dashboardView.html");
      return res.text();
    })
    .then((html) => {
      document.getElementById("app").innerHTML = html;


      return loadChartJS().then(() => {
        setupNavigation();
        initializeDashboard();
      });
    })
    .catch((err) => {
      console.error("Error loading dashboard:", err);
      showError("Gagal memuat dasbor. Silakan coba lagi.");
    });
}

// Load Chart.js dynamically
function loadChartJS() {
  return new Promise((resolve, reject) => {
    if (window.Chart) {
      resolve();
      return;
    }
    
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js';
    script.onload = resolve;
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Global dashboard data
let dashboardData = {
  averageStress: 0,
  stressHistory: [],
  recentPredictions: [],
  tips: [],
  totalSessions: 0,
  weeklyStressLevel: '',
  recentActivity: []
};

let chartInstances = {};
let pendingDashboardDeleteId = null;
let isDashboardDeleting = false;

async function initializeDashboard() {
  try {
    showLoadingState('Menyiapkan dasbor...');
    
    await Promise.all([
      loadDashboardSummary(),
      loadRecentHistory()
    ]);

    await loadStressTips();

    updateStressLevel();
    updateQuickStats();
    updateStressChart();
    updatePredictionsTable();
    updateTips();
    updateRecentActivity();
    
    setupEventListeners();
    
    hideLoadingState();
    
  } catch (error) {
    console.error('Error initializing dashboard:', error);
    hideLoadingState();
    showError('Gagal memuat data dasbor. Silakan segarkan halaman.');
  }
}


async function loadDashboardSummary() {
  try {
    const days = getCurrentFilterDays();
    const chartDays = getChartFilterDays();
    const params = new URLSearchParams({
      days: String(days),
      chartDays: String(chartDays),
      tz: getBrowserTimeZone(),
      _: String(Date.now()),
    });
    const data = await authenticatedApiCall(`/api/dashboard/summary?${params.toString()}`, 'GET');
    
    dashboardData.averageStress = data.averageStress || 0;
    dashboardData.stressHistory = data.stressHistory || [];
    dashboardData.totalSessions = data.totalCount || 0;
    dashboardData.weeklyStressLevel = formatStressLevel(data.mostCommonStressLevel || 'Low');
    
  } catch (error) {
    console.error('Error loading dashboard summary:', error);
    throw error;
  }
}

async function loadRecentHistory(limit = 10) {
  try {
    const data = await authenticatedApiCall(`/api/dashboard/recent?limit=${limit}`, 'GET');
    
    dashboardData.recentPredictions = data.map(item => ({
      date: item.created_at,
      stress_level: item.stress_level,
      stress_percent: toPercent(item.stress_percent),
      text: item.text,
      feedback: item.feedback,
      history_id: item.history_id
    }));

    // Extract recent activity (just text)
    dashboardData.recentActivity = data.slice(0, 5).map(item => ({
      date: item.created_at,
      text: item.text,
      history_id: item.history_id,
    }));
    
  } catch (error) {
    console.error('Error loading recent history:', error);
    throw error;
  }
}

async function loadStressTips() {
  try {
    const tips = [];

    // Get only the most recent feedback (first item since it's already sorted by most recent)
    if (dashboardData.recentPredictions.length > 0 && dashboardData.recentPredictions[0].feedback) {
      const feedback = dashboardData.recentPredictions[0].feedback;
      tips.push(...extractSuggestionItems(feedback));
    }

    // Set the formatted tips
    dashboardData.tips = tips;
    
    // Fallback to default tips if none found
    if (dashboardData.tips.length === 0) {
      dashboardData.tips = [
        'Ambil jeda singkat secara berkala sepanjang hari',
        'Latih pernapasan perlahan saat merasa tegang',
        'Jaga jadwal tidur yang konsisten',
        'Lakukan aktivitas fisik ringan',
        'Coba meditasi atau latihan mindfulness'
      ];
    }
    
  } catch (error) {
    console.error('Error loading stress tips:', error);
    // Use fallback tips
    dashboardData.tips = [
      'Ambil jeda singkat secara berkala sepanjang hari',
      'Latih pernapasan perlahan saat merasa tegang',
      'Jaga jadwal tidur yang konsisten',
      'Lakukan aktivitas fisik ringan'
    ];
  }
}





function updateStressLevel() {
  const stressEl = document.getElementById('stress-percentage');
  if (!stressEl) return;
  
  stressEl.textContent = `${dashboardData.averageStress}%`;
  
  // Update stress level color based on percentage
  if (dashboardData.averageStress >= 70) {
    stressEl.className = 'text-4xl sm:text-6xl font-bold text-red-600 mb-3 sm:mb-4';
  } else if (dashboardData.averageStress >= 40) {
    stressEl.className = 'text-4xl sm:text-6xl font-bold text-yellow-600 mb-3 sm:mb-4';
  } else {
    stressEl.className = 'text-4xl sm:text-6xl font-bold text-green-600 mb-3 sm:mb-4';
  }
}


function updateQuickStats() {
  // Total Sessions
  const totalEl = document.getElementById('total-predictions');
  if (totalEl) totalEl.textContent = dashboardData.totalSessions;

  // This Week (most frequent stress level)
  const weekEl = document.getElementById('week-predictions');
  if (weekEl) weekEl.textContent = dashboardData.weeklyStressLevel;

}

function updateStressChart() {
  const ctx = document.getElementById('stress-chart');
  if (!ctx || !window.Chart) return;
  
  // Clean up existing chart
  if (chartInstances.stressChart) {
    chartInstances.stressChart.destroy();
  }
  
  const chartContext = ctx.getContext('2d');
  
  const chartPoints = normalizeStressHistoryForChart(dashboardData.stressHistory);

  if (chartPoints.length === 0) {
    // Show empty state
    chartContext.clearRect(0, 0, ctx.width, ctx.height);
    chartContext.fillStyle = '#6b7280';
    chartContext.font = '14px sans-serif';
    chartContext.textAlign = 'center';
    chartContext.fillText('Data stres belum tersedia', ctx.width / 2, ctx.height / 2);
    return;
  }
  
  // Process the stress history data
  const labels = chartPoints.map(item => item.label);
  const data = chartPoints.map(item => item.value);

  chartInstances.stressChart = new Chart(chartContext, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Tingkat Stres (%)',
        data: data,
        borderColor: '#ef4444',
        backgroundColor: 'rgba(239, 68, 68, 0.1)',
        tension: 0.4,
        fill: true,
        pointBackgroundColor: data.map(value => {
          if (value >= 70) return '#dc2626'; // High - red
          if (value >= 40) return '#f59e0b'; // Medium - amber
          return '#10b981'; // Low - green
        }),
        pointBorderColor: '#ffffff',
        pointBorderWidth: 2,
        pointRadius: 4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      resizeDelay: 150,
      plugins: {
        legend: {
          display: false
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          ticks: {
            callback: function(value) {
              return value + '%';
            }
          }
        },
        x: {
          grid: {
            display: false
          },
          ticks: {
            autoSkip: true,
            maxRotation: 0
          }
        }
      }
    }
  });
}

function updatePredictionsTable() {
  const tbody = document.getElementById('predictions-table');
  if (!tbody) return;
  
  tbody.innerHTML = '';

  const recentPredictions = dashboardData.recentPredictions.slice(0, 5);
  
  if (recentPredictions.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="5" class="px-6 py-8 text-center text-gray-500">
          Belum ada analisis
        </td>
      </tr>
    `;
    return;
  }

  recentPredictions.forEach(prediction => {
    const row = document.createElement('tr');
    row.className = 'border-b hover:bg-gray-50';
    
    const stressColor = prediction.stress_percent >= 70 ? 'text-red-600' : 
                       prediction.stress_percent >= 40 ? 'text-yellow-600' : 'text-green-600';

    let suggestion = extractSuggestionItems(prediction.feedback, 1)[0] || 'Belum ada saran';
    if (suggestion.length > 50) {
      suggestion = suggestion.substring(0, 50) + '...';
    }

    // Truncate text preview
    let textPreview = prediction.text || 'Belum ada teks';
    if (textPreview.length > 60) {
      textPreview = textPreview.substring(0, 60) + '...';
    }

    // Format date properly
    let formattedDate;
    try {
      const date = new Date(prediction.date);
      formattedDate = date.toLocaleDateString('id-ID', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      });
    } catch (e) {
      formattedDate = 'Tanggal tidak valid';
    }

    row.innerHTML = `
      <td class="px-4 sm:px-6 py-4 text-sm text-gray-900 whitespace-nowrap">
        ${formattedDate}
      </td>
      <td class="px-4 sm:px-6 py-4 text-sm text-gray-500 max-w-xs break-words" title="${escapeHtml(prediction.text)}">
        ${escapeHtml(textPreview)}
      </td>
      <td class="px-4 sm:px-6 py-4 text-sm font-medium ${stressColor} whitespace-nowrap">
        ${escapeHtml(formatStressLevel(prediction.stress_level || 'Tidak tersedia'))} (${Math.round(prediction.stress_percent || 0)}%)
      </td>
      <td class="px-4 sm:px-6 py-4 text-sm text-gray-500 max-w-xs break-words" title="${escapeHtml(suggestion)}">
        ${escapeHtml(suggestion.length > 40 ? suggestion.substring(0, 40) + '...' : suggestion)}
      </td>
      <td class="px-4 sm:px-6 py-4 text-right whitespace-nowrap">
        <button type="button" class="delete-dashboard-history inline-flex h-9 w-9 items-center justify-center rounded-full text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 transition" data-history-id="${escapeHtml(prediction.history_id || '')}" aria-label="Hapus riwayat" title="Hapus riwayat">
          <svg class="h-4 w-4 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m3 0V5a2 2 0 012-2h0a2 2 0 012 2v2"></path>
          </svg>
        </button>
      </td>
    `;
    tbody.appendChild(row);
  });

  attachDashboardDeleteHandlers();
}

function updateTips() {
  const tipsEl = document.getElementById('stress-tips');
  if (!tipsEl) return;
  
  tipsEl.innerHTML = '';
  dashboardData.tips.forEach(tip => {
    const li = document.createElement('li');
    li.className = 'flex items-start rounded-xl bg-violet-50 px-3 py-3';
    li.innerHTML = `
      <span class="flex-shrink-0 w-2 h-2 bg-violet-600 rounded-full mt-2 mr-3"></span>
      <span class="text-sm leading-relaxed text-gray-700">${escapeHtml(tip)}</span>
    `;
    tipsEl.appendChild(li);
  });
}

function updateRecentActivity() {
  const activityEl = document.getElementById('recent-activity');
  if (!activityEl) return;
  
  activityEl.innerHTML = '';
  
  if (dashboardData.recentActivity.length === 0) {
    activityEl.innerHTML = '<div class="text-sm text-gray-500 text-center py-4">Belum ada aktivitas terbaru</div>';
    return;
  }
  
  dashboardData.recentActivity.forEach(activity => {
    const div = document.createElement('div');
    div.className = 'flex items-start space-x-3 p-3 bg-gray-50 rounded-xl border border-gray-100';
    
    let textPreview = activity.text || 'Belum ada teks';
    if (textPreview.length > 80) {
      textPreview = textPreview.substring(0, 80) + '...';
    }
    
    // Format date properly
    let formattedDate;
    try {
      const date = new Date(activity.date);
      formattedDate = date.toLocaleDateString('id-ID', { 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch (e) {
      formattedDate = 'Tanggal tidak valid';
    }
    
    div.innerHTML = `
      <div class="flex-1 min-w-0">
        <p class="text-sm text-gray-900 break-words">${escapeHtml(textPreview)}</p>
        <p class="text-xs text-gray-500">${formattedDate}</p>
      </div>
    `;
    activityEl.appendChild(div);
  });
}

// Event Handlers
function setupEventListeners() {
  // Time filter change handler
  const timeFilter = document.getElementById('time-filter');
  if (timeFilter) {
    timeFilter.addEventListener('change', async function(e) {
      await refreshDashboardData();
    });
  }

  // Chart filter change handler
  const chartFilter = document.getElementById('chart-filter');
  if (chartFilter) {
    chartFilter.addEventListener('change', async function(e) {
      await refreshDashboardData();
    });
  }

  // Refresh button
  const refreshBtn = document.getElementById('refresh-dashboard');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', async () => {
      await initializeDashboard();
    });
  }
}

function getCurrentFilterDays() {
  const timeFilter = document.getElementById('time-filter');
  return timeFilter ? parseInt(timeFilter.value) : 30;
}

function attachDashboardDeleteHandlers() {
  document.querySelectorAll('.delete-dashboard-history').forEach(button => {
    button.addEventListener('click', () => {
      const historyId = button.dataset.historyId;
      if (!historyId) {
        showError('ID riwayat tidak valid');
        return;
      }
      pendingDashboardDeleteId = historyId;
      openDashboardDeleteModal();
    });
  });
}

function ensureDashboardDeleteModal() {
  let modal = document.getElementById('dashboard-delete-modal');
  if (modal) return modal;

  modal = document.createElement('div');
  modal.id = 'dashboard-delete-modal';
  modal.tabIndex = -1;
  modal.className = 'hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4';
  modal.innerHTML = `
    <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
      <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
        <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"></path>
        </svg>
      </div>
      <h3 class="text-center text-lg font-semibold text-gray-900">Hapus Riwayat</h3>
      <p class="mt-2 text-center text-sm leading-relaxed text-gray-600">Apakah Anda yakin ingin menghapus riwayat ini?</p>
      <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
        <button type="button" id="dashboard-delete-cancel" class="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300">
          Batal
        </button>
        <button type="button" id="dashboard-delete-confirm" class="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300">
          Hapus
        </button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) closeDashboardDeleteModal();
  });
  modal.addEventListener('keydown', (event) => {
    if (modal.classList.contains('hidden')) return;
    if (event.key === 'Escape') closeDashboardDeleteModal();
    if (event.key === 'Enter') confirmDashboardDelete();
  });
  modal.querySelector('#dashboard-delete-cancel')?.addEventListener('click', closeDashboardDeleteModal);
  modal.querySelector('#dashboard-delete-confirm')?.addEventListener('click', confirmDashboardDelete);

  return modal;
}

function openDashboardDeleteModal() {
  const modal = ensureDashboardDeleteModal();
  modal.classList.remove('hidden');
  modal.querySelector('#dashboard-delete-confirm')?.focus();
}

function closeDashboardDeleteModal() {
  if (isDashboardDeleting) return;
  pendingDashboardDeleteId = null;
  document.getElementById('dashboard-delete-modal')?.classList.add('hidden');
}

function setDashboardDeleteLoading(isLoading) {
  const confirmButton = document.getElementById('dashboard-delete-confirm');
  const cancelButton = document.getElementById('dashboard-delete-cancel');
  if (!confirmButton) return;

  confirmButton.disabled = isLoading;
  if (cancelButton) cancelButton.disabled = isLoading;
  confirmButton.classList.toggle('opacity-75', isLoading);
  confirmButton.classList.toggle('cursor-not-allowed', isLoading);
  confirmButton.textContent = isLoading ? 'Menghapus...' : 'Hapus';
}

async function confirmDashboardDelete() {
  const historyId = pendingDashboardDeleteId;
  if (!historyId || isDashboardDeleting) return;

  try {
    isDashboardDeleting = true;
    setDashboardDeleteLoading(true);
    await authenticatedApiCall(`/api/history/${encodeURIComponent(historyId)}`, {
      method: 'DELETE',
    });

    dashboardData.recentPredictions = dashboardData.recentPredictions.filter(item => item.history_id !== historyId);
    dashboardData.recentActivity = dashboardData.recentActivity.filter(item => item.history_id !== historyId);
    updatePredictionsTable();
    updateRecentActivity();
    document.getElementById('dashboard-delete-modal')?.classList.add('hidden');
    pendingDashboardDeleteId = null;
    showSuccess('Riwayat berhasil dihapus');
    await refreshDashboardData();
  } catch (error) {
    console.error('Error deleting dashboard history:', error);
    showError(error.message || 'Gagal menghapus riwayat');
  } finally {
    isDashboardDeleting = false;
    setDashboardDeleteLoading(false);
  }
}

function getChartFilterDays() {
  const chartFilter = document.getElementById('chart-filter');
  return chartFilter ? parseInt(chartFilter.value) : getCurrentFilterDays();
}

async function refreshDashboardData() {
  try {
    showLoadingState('Menyegarkan data dasbor...');
    
    // Load dashboard summary and recent history first
    await Promise.all([
      loadDashboardSummary(),
      loadRecentHistory()
    ]);
    
    // Then load stress tips
    await loadStressTips();
    
    updateStressLevel();
    updateQuickStats();
    updateStressChart();
    updatePredictionsTable();
    updateTips(); // Don't forget to update the tips UI
    updateRecentActivity();
    
    hideLoadingState();
  } catch (error) {
    console.error('Error refreshing dashboard:', error);
    hideLoadingState();
    showError('Gagal menyegarkan data dasbor');
  }
}


function setDashboardControlsDisabled(isDisabled) {
  document.querySelectorAll('#refresh-dashboard, #time-filter, #chart-filter').forEach(control => {
    control.disabled = isDisabled;
    control.classList.toggle('opacity-60', isDisabled);
    control.classList.toggle('cursor-not-allowed', isDisabled);
  });
}

function showLoadingState(message = 'Memuat data...') {
  const messageEl = document.getElementById('dashboard-loading-message');
  if (messageEl) messageEl.textContent = message;

  const loadingElements = document.querySelectorAll('.loading-placeholder');
  loadingElements.forEach(el => el.classList.remove('hidden'));
  setDashboardControlsDisabled(true);
}

function hideLoadingState() {
  const loadingElements = document.querySelectorAll('.loading-placeholder');
  loadingElements.forEach(el => el.classList.add('hidden'));
  setDashboardControlsDisabled(false);
}

function showError(message) {
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 bg-red-500 text-white px-4 py-2 rounded shadow-lg z-50';
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 5000);
}

// Navigation Functions
function setupNavigation() {
  const navLinks = [
    { selector: 'a[href="#home"]', view: 'home' },
    { selector: 'a[href="#curhat"]', view: 'curhat' },
    { selector: 'a[href="#feedback"]', view: 'feedback' },
    { selector: 'a[href="#dashboard"]', view: 'dashboard' },
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
  // Clean up charts before logout
  Object.values(chartInstances).forEach(chart => {
    if (chart && typeof chart.destroy === 'function') {
      chart.destroy();
    }
  });
  chartInstances = {};
  
  localStorage.clear();
  sessionStorage.removeItem("isLoggedIn");
  console.log("User logged out, session cleared");
  loadView("home");
}

function loadView(view) {
  // Clean up charts when leaving dashboard
  if (view !== 'dashboard') {
    Object.values(chartInstances).forEach(chart => {
      if (chart && typeof chart.destroy === 'function') {
        chart.destroy();
      }
    });
    chartInstances = {};
  }
  
  switch (view) {
    case 'home':
      import('./homePresenter.js').then(module => module.renderHome());
      break;
    case 'curhat':
      import('./curhatPresenter.js').then(module => module.renderCurhat());
      break;
    case 'feedback':
      import('./feedbackPresenter.js').then(module => module.renderFeedback());
      break;
    case 'dashboard':
      renderDashboard();
      break;
    default:
      console.warn("View tidak dikenali:", view);
      break;
  }
}

function showSuccess(message) {
  const notification = document.createElement('div');
  notification.className = 'fixed top-4 right-4 bg-green-600 text-white px-4 py-2 rounded shadow-lg z-50';
  notification.textContent = message;
  document.body.appendChild(notification);

  setTimeout(() => {
    if (document.body.contains(notification)) {
      document.body.removeChild(notification);
    }
  }, 4000);
}
