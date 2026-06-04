import { authenticatedApiCall, isAuthenticated } from '../config.js';
import { renderHistoryDetail } from './historyDetailPresenter.js';
import { renderPageLoading } from '../utils/loading.js';

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
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

const HISTORY_TIME_ZONE = 'Asia/Jakarta';
const HISTORY_DATE_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: HISTORY_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

function normalizeTimestampValue(value) {
  if (!value) return null;
  if (value instanceof Date) return value;

  if (typeof value === 'string') {
    const trimmed = value.trim();
    const looksLikeSqlTimestamp = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}/.test(trimmed);

    if (looksLikeSqlTimestamp) {
      const isoLike = trimmed.replace(' ', 'T');
      const hasTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(isoLike);
      return new Date(hasTimezone ? isoLike : `${isoLike}Z`);
    }

    return new Date(trimmed);
  }

  return new Date(value);
}

function toJakartaDate(value) {
  const date = normalizeTimestampValue(value);
  if (!date || Number.isNaN(date.getTime())) return null;

  const parts = HISTORY_DATE_FORMATTER.formatToParts(date).reduce((acc, part) => {
    if (part.type !== 'literal') acc[part.type] = Number(part.value);
    return acc;
  }, {});

  return new Date(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour || 0,
    parts.minute || 0,
    parts.second || 0
  );
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function addDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function addMonths(date, months) {
  return new Date(date.getFullYear(), date.getMonth() + months, 1);
}

function getHistoryTimestamp(item = {}) {
  const parsedDate = toJakartaDate(item.created_at || item.createdAt || item.date);
  return parsedDate ? parsedDate.getTime() : 0;
}

function sortHistoryNewestFirst(items = []) {
  return [...items].sort((a, b) => getHistoryTimestamp(b) - getHistoryTimestamp(a));
}

export function renderHistory() {
  return fetch("/views/historyView.html")
    .then((res) => {
      if (!res.ok) throw new Error("Gagal memuat historyView.html");
      return res.text();
    })
    .then((html) => {
      document.getElementById("app").innerHTML = html;
      initializeHistory();
    })
    .catch((err) => {
      console.error("Error loading history view:", err);
      document.getElementById("app").innerHTML = `
        <div class="p-4 text-center">
          <h2 class="text-xl font-bold text-red-600">Gagal Memuat Riwayat</h2>
          <p class="text-gray-600">Gagal memuat halaman riwayat: ${err.message}</p>
        </div>
      `;
    });
}

class HistoryPresenter {
  constructor(view) {
    this.view = view;
    this.allHistory = [];
    this.filteredHistory = {};
    this.currentFilter = 'all';
    this.pendingDeleteId = null;
    this.isDeleting = false;
  }

  async loadHistory() {
    if (!isAuthenticated()) {
      if (window.loadView) {
        window.loadView('login');
        return;
      }

      this.view.renderError('Silakan masuk untuk melihat riwayat Anda.');
      return;
    }

    try {
      this.view.showLoading();
      const history = await authenticatedApiCall("/api/history");
      this.allHistory = sortHistoryNewestFirst(history);
      const groupedFeedbacks = this.groupFeedbacksByPeriod(this.allHistory);
      this.filteredHistory = groupedFeedbacks;
      this.view.renderHistory(groupedFeedbacks);
      this.view.bindDeleteModal({
        onCancel: () => this.cancelDelete(),
        onConfirm: () => this.confirmDelete(),
      });
      this.setupFilterListener();
    } catch (error) {
      console.error('Failed to load feedback history:', error);
      this.view.renderError('Gagal memuat data riwayat. Silakan coba lagi.');
    }
  }

  setupFilterListener() {
    const filterDropdown = document.getElementById('filterDropdown');
    if (filterDropdown) {
      filterDropdown.addEventListener('change', (e) => {
        this.currentFilter = e.target.value;
        this.filterHistory(e.target.value);
      });
    }
  }

  groupFeedbacksByPeriod(feedbacks) {
    const today = startOfDay(toJakartaDate(new Date()));
    const tomorrow = addDays(today, 1);
    const currentMonthStart = startOfMonth(today);
    const nextMonthStart = addMonths(currentMonthStart, 1);
    const lastMonthStart = addMonths(currentMonthStart, -1);
    const currentYearStart = new Date(today.getFullYear(), 0, 1);
    const lastYearStart = new Date(today.getFullYear() - 1, 0, 1);
    const currentDayOfWeek = today.getDay();
    const daysSinceMonday = (currentDayOfWeek + 6) % 7;
    const startOfWeek = addDays(today, -daysSinceMonday);
    const nextWeekStart = addDays(startOfWeek, 7);

    const grouped = {
      today: [],
      thisWeek: [],
      thisMonth: [],
      lastMonth: [],
      earlierThisYear: [],
      lastYear: [],
    };

    sortHistoryNewestFirst(feedbacks).forEach(feedback => {
      const feedbackDate = toJakartaDate(feedback.created_at);
      if (!feedbackDate) return;

      if (feedbackDate >= today && feedbackDate < tomorrow) {
        grouped.today.push(feedback);
      } else if (feedbackDate >= startOfWeek && feedbackDate < nextWeekStart) {
        grouped.thisWeek.push(feedback);
      } else if (feedbackDate >= currentMonthStart && feedbackDate < nextMonthStart) {
        grouped.thisMonth.push(feedback);
      } else if (feedbackDate >= lastMonthStart && feedbackDate < currentMonthStart) {
        grouped.lastMonth.push(feedback);
      } else if (feedbackDate >= currentYearStart && feedbackDate < lastMonthStart) {
        grouped.earlierThisYear.push(feedback);
      } else if (feedbackDate >= lastYearStart && feedbackDate < currentYearStart) {
        grouped.lastYear.push(feedback);
      } else {
        const yearKey = feedbackDate.getFullYear().toString();
        if (!grouped[yearKey]) {
          grouped[yearKey] = [];
        }
        grouped[yearKey].push(feedback);
      }
    });

    return grouped;
  }

  getFilteredHistory(filterValue) {
    const combineGroups = (targetKey, keys) => ({
      [targetKey]: sortHistoryNewestFirst(keys.flatMap(key => this.filteredHistory[key] || [])),
    });

    if (filterValue === 'thisWeek') {
      return combineGroups('thisWeek', ['today', 'thisWeek']);
    }

    if (filterValue === 'thisMonth') {
      return combineGroups('thisMonth', ['today', 'thisWeek', 'thisMonth']);
    }

    const filtered = {};
    if (this.filteredHistory[filterValue] && this.filteredHistory[filterValue].length > 0) {
      filtered[filterValue] = this.filteredHistory[filterValue];
    }
    return filtered;
  }

  filterHistory(filterValue) {
    this.currentFilter = filterValue;
    if (filterValue === 'all') {
      this.view.renderHistoryContent(this.filteredHistory);
    } else {
      this.view.renderHistoryContent(this.getFilteredHistory(filterValue));
    }
    this.setupFilterListener();
    const filterDropdown = document.getElementById('filterDropdown');
    if (filterDropdown) {
      filterDropdown.value = filterValue;
    }
  }

  rerenderCurrentFilter() {
    if (this.currentFilter === 'all') {
      this.view.renderHistoryContent(this.filteredHistory);
      return;
    }

    this.view.renderHistoryContent(this.getFilteredHistory(this.currentFilter));
    const filterDropdown = document.getElementById('filterDropdown');
    if (filterDropdown) filterDropdown.value = this.currentFilter;
  }

  getHistoryItem(historyId) {
    return this.allHistory.find(item => item.history_id === historyId);
  }

  searchHistory(searchTerm) {
    const searchResults = this.allHistory.filter(item =>
      item.text && item.text.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const groupedResults = this.groupFeedbacksByPeriod(sortHistoryNewestFirst(searchResults));
    this.view.renderHistoryContent(groupedResults);
  }

  showDetail(historyId) {
    renderHistoryDetail(historyId);
  }

  requestDelete(historyId) {
    const item = this.getHistoryItem(historyId);
    if (!item) {
      this.view.showToast('Riwayat tidak ditemukan.', 'error');
      return;
    }

    this.pendingDeleteId = historyId;
    this.view.openDeleteModal();
  }

  cancelDelete() {
    this.pendingDeleteId = null;
    this.view.closeDeleteModal();
  }

  async confirmDelete() {
    const historyId = this.pendingDeleteId;
    if (!historyId || this.isDeleting) return;

    try {
      this.isDeleting = true;
      this.view.setDeleteLoading(true);
      await authenticatedApiCall(`/api/history/${encodeURIComponent(historyId)}`, {
        method: 'DELETE',
      });

      this.allHistory = this.allHistory.filter(item => item.history_id !== historyId);
      this.filteredHistory = this.groupFeedbacksByPeriod(this.allHistory);
      this.pendingDeleteId = null;
      this.view.closeDeleteModal();
      this.rerenderCurrentFilter();
      this.view.showToast('Riwayat berhasil dihapus.', 'success');
    } catch (error) {
      console.error('Failed to delete history:', error);
      this.view.showToast(error.message || 'Gagal menghapus riwayat. Silakan coba lagi.', 'error');
    } finally {
      this.isDeleting = false;
      this.view.setDeleteLoading(false);
    }
  }
}

class HistoryView {
  constructor() {
    this.container = null;
    this.presenter = null;
  }

  showLoading() {
    const app = document.getElementById('app');
    app.innerHTML = renderPageLoading(
      'Memuat riwayat...',
      'Sebentar ya, riwayat Anda sedang disiapkan.'
    );
  }

  renderHistory(groupedFeedbacks) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <main class="w-full max-w-6xl mx-auto overflow-x-hidden px-4 py-8 sm:px-6 lg:px-10 xl:py-20">
        <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
          <h1 class="text-2xl font-bold text-gray-600">Riwayat Anda</h1>
          <div class="w-full sm:w-64 lg:w-48">
            <select id="filterDropdown" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-violet-700 focus:border-transparent bg-white text-gray-500 text-sm">
              <option value="all">Semua Waktu</option>
              <option value="today">Hari Ini</option>
              <option value="thisWeek">Minggu Ini</option>
              <option value="thisMonth">Bulan Ini</option>
              <option value="lastMonth">Bulan Lalu</option>
              <option value="earlierThisYear">Awal Tahun Ini</option>
              <option value="lastYear">Tahun Lalu</option>
            </select>
          </div>
        </div>
        <div id="historyContainer" class="w-full min-w-0 overflow-x-hidden"></div>
        ${this.createDeleteModal()}
      </main>
    `;
    this.renderHistoryContent(groupedFeedbacks);
  }

  renderHistoryContent(groupedFeedbacks) {
    const container = document.getElementById('historyContainer');
    if (!container) return;
    this.container = container;
    container.innerHTML = '';

    const sections = [
      { key: 'today', label: 'Hari Ini' },
      { key: 'thisWeek', label: 'Minggu Ini' },
      { key: 'thisMonth', label: 'Bulan Ini' },
      { key: 'lastMonth', label: 'Bulan Lalu' },
      { key: 'earlierThisYear', label: 'Awal Tahun Ini' },
      { key: 'lastYear', label: 'Tahun Lalu' },
      ...Object.keys(groupedFeedbacks)
        .filter(key => !['today', 'thisWeek', 'thisMonth', 'lastMonth', 'earlierThisYear', 'lastYear'].includes(key))
        .sort((a, b) => b - a)
        .map(year => ({ key: year, label: year })),
    ];

    let hasContent = false;

    sections.forEach((section, index) => {
      const data = groupedFeedbacks[section.key];
      if (data && data.length > 0) {
        hasContent = true;
        const sectionId = `history-${section.key.toLowerCase().replace(/\s/g, '-')}`;
        const sectionHtml = `
          <div class="${index > 0 ? 'mt-12' : ''} min-w-0">
            <h2 class="mb-6 text-xl font-semibold text-gray-600 sm:text-2xl">${section.label}</h2>
            <div id="${sectionId}" class="grid min-w-0 gap-4 md:gap-6"></div>
          </div>
        `;
        container.insertAdjacentHTML('beforeend', sectionHtml);
        this.renderSection(sectionId, data);
      }
    });

    if (!hasContent) {
      container.innerHTML = `
        <div class="text-center py-12">
          <div class="text-gray-400 mb-4">
            <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
            </svg>
          </div>
          <p class="text-gray-500 text-lg">Tidak ada riwayat pada periode ini.</p>
          <p class="text-gray-400 text-sm mt-2">Coba pilih periode lain atau periksa kembali nanti.</p>
        </div>
      `;
    }
  }

  renderSection(containerId, data) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = '';

    if (data.length === 0) {
      container.innerHTML = '<p class="text-gray-500 italic">Belum ada data untuk ditampilkan.</p>';
      return;
    }

    data.forEach(item => {
      const card = document.createElement('div');
      card.className = 'w-full min-w-0 overflow-hidden bg-white shadow-md rounded-2xl p-4 sm:p-6 hover:shadow-lg transition-all duration-200 cursor-pointer border border-gray-100';
      card.dataset.historyId = item.history_id;

      const stressPercentage = this.toPercent(item.stress_percent);
      const stressLevel = item.stress_level || 'tidak diketahui';
      const text = item.text || 'Tidak ada deskripsi';
      const date = toJakartaDate(item.created_at) || new Date(item.created_at);
      const fusionSummary = this.createFusionSummary(item);
      const historyId = escapeHtml(item.history_id);

      card.innerHTML = `
        <div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div class="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start">
            <div class="flex flex-shrink-0 justify-center sm:block">
              ${this.createDonutChart(stressPercentage)}
            </div>
            <div class="flex-1 min-w-0">
              <div class="mb-2 flex min-w-0 flex-wrap items-center gap-2">
                <span class="inline-flex max-w-full items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${this.getStressLevelClass(stressLevel)}">
                  Stres ${this.formatStressLevel(stressLevel)}
                </span>
              </div>
              <p class="mb-2 text-sm text-gray-500 break-words">${this.formatDate(date)}</p>
              <p class="line-clamp-2 break-words text-sm leading-relaxed text-gray-700 sm:text-sm">${escapeHtml(text)}</p>
              ${fusionSummary}
            </div>
          </div>
          <div class="flex flex-shrink-0 items-center gap-2 self-end sm:self-center sm:ml-4">
            <button type="button" class="delete-history-button inline-flex h-11 w-11 items-center justify-center rounded-full text-red-600 hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-red-300 transition" data-history-id="${historyId}" aria-label="Hapus riwayat" title="Hapus riwayat">
              <svg class="h-5 w-5 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m2 0H7m3 0V5a2 2 0 012-2h0a2 2 0 012 2v2"></path>
              </svg>
            </button>
            <button type="button" class="detail-button inline-flex h-11 w-11 items-center justify-center rounded-full text-violet-700 hover:bg-violet-50 focus:outline-none focus:ring-2 focus:ring-violet-300 transition" data-history-id="${historyId}" aria-label="Lihat detail riwayat" title="Lihat detail">
              <svg class="h-6 w-6 pointer-events-none" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path>
              </svg>
            </button>
          </div>
        </div>
      `;

      container.appendChild(card);
    });

    this.attachCardActionListeners(containerId);
  }

  attachCardActionListeners(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const detailButtons = container.querySelectorAll('.detail-button');
    detailButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const historyId = button.dataset.historyId;
        this.presenter.showDetail(historyId);
      });
    });

    const deleteButtons = container.querySelectorAll('.delete-history-button');
    deleteButtons.forEach(button => {
      button.addEventListener('click', (e) => {
        e.stopPropagation();
        const historyId = button.dataset.historyId;
        this.presenter.requestDelete(historyId);
      });
    });
  }

  createDeleteModal() {
    return `
      <div id="history-delete-modal" tabindex="-1" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50 p-4">
        <div class="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl">
          <div class="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
            <svg class="h-6 w-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v4m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z"></path>
            </svg>
          </div>
          <h3 class="text-center text-lg font-semibold text-gray-900">Hapus Riwayat</h3>
          <p class="mt-2 text-center text-sm leading-relaxed text-gray-600">Apakah Anda yakin ingin menghapus riwayat ini?</p>
          <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" id="history-delete-cancel" class="inline-flex min-h-11 items-center justify-center rounded-lg border border-gray-300 px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-300">
              Batal
            </button>
            <button type="button" id="history-delete-confirm" class="inline-flex min-h-11 items-center justify-center rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-300">
              Hapus
            </button>
          </div>
        </div>
      </div>
    `;
  }

  bindDeleteModal({ onCancel, onConfirm }) {
    const modal = document.getElementById('history-delete-modal');
    const cancelButton = document.getElementById('history-delete-cancel');
    const confirmButton = document.getElementById('history-delete-confirm');

    if (!modal || !cancelButton || !confirmButton) return;

    cancelButton.addEventListener('click', onCancel);
    confirmButton.addEventListener('click', onConfirm);
    modal.addEventListener('click', (event) => {
      if (event.target === modal) onCancel();
    });
    modal.addEventListener('keydown', (event) => {
      if (modal.classList.contains('hidden')) return;
      if (event.key === 'Escape') onCancel();
      if (event.key === 'Enter') onConfirm();
    });
  }

  openDeleteModal() {
    const modal = document.getElementById('history-delete-modal');
    const confirmButton = document.getElementById('history-delete-confirm');
    if (!modal) return;

    modal.classList.remove('hidden');
    confirmButton?.focus();
  }

  closeDeleteModal() {
    const modal = document.getElementById('history-delete-modal');
    if (modal) modal.classList.add('hidden');
  }

  setDeleteLoading(isLoading) {
    const confirmButton = document.getElementById('history-delete-confirm');
    const cancelButton = document.getElementById('history-delete-cancel');
    if (!confirmButton) return;

    confirmButton.disabled = isLoading;
    if (cancelButton) cancelButton.disabled = isLoading;
    confirmButton.classList.toggle('opacity-75', isLoading);
    confirmButton.classList.toggle('cursor-not-allowed', isLoading);
    confirmButton.innerHTML = isLoading
      ? `
        <span class="inline-flex items-center justify-center gap-2">
          <video class="h-6 w-6 object-contain" autoplay muted loop playsinline webkit-playsinline preload="auto" aria-hidden="true">
            <source src="/assets/loading.webm" type="video/webm">
          </video>
          <span>Menghapus...</span>
        </span>
      `
      : 'Hapus';
    if (isLoading) confirmButton.querySelector('video')?.play?.().catch?.(() => {});
  }

  showToast(message, type = 'success') {
    const toast = document.createElement('div');
    const isError = type === 'error';
    toast.className = `fixed right-4 top-4 z-[60] max-w-sm rounded-xl px-4 py-3 text-sm font-semibold text-white shadow-lg transition ${isError ? 'bg-red-600' : 'bg-green-600'}`;
    toast.setAttribute('role', isError ? 'alert' : 'status');
    toast.textContent = message;
    document.body.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('opacity-0');
      setTimeout(() => toast.remove(), 250);
    }, 3500);
  }

  renderError(message) {
    const app = document.getElementById('app');
    app.innerHTML = `
      <main class="max-w-6xl mx-auto px-4 py-8 sm:px-6 lg:px-10">
        <div class="text-center py-12">
          <div class="text-red-400 mb-4">
            <svg class="w-16 h-16 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 15.5c-.77.833.192 2.5 1.732 2.5z"></path>
            </svg>
          </div>
          <p class="text-red-500 text-lg">${message}</p>
          <button onclick="window.location.reload()" class="mt-4 px-4 py-2 bg-violet-600 text-white rounded-lg hover:bg-violet-700 transition-colors">
            Coba Lagi
          </button>
        </div>
      </main>
    `;
  }

  createDonutChart(percentage) {
    const radius = (64 - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const strokeDasharray = circumference;
    const strokeDashoffset = circumference - (percentage / 100) * circumference;

    let strokeColor = '#10b981';
    if (percentage > 33 && percentage <= 66) {
      strokeColor = '#f59e0b';
    } else if (percentage > 66) {
      strokeColor = '#ef4444';
    }

    return `
      <div class="relative h-16 w-16 shrink-0">
        <svg width="64" height="64" class="h-full w-full transform -rotate-90">
          <circle cx="32" cy="32" r="${radius}" fill="none" stroke="#e5e7eb" stroke-width="4" />
          <circle cx="32" cy="32" r="${radius}" fill="none" stroke="${strokeColor}" stroke-width="4" stroke-linecap="round" stroke-dasharray="${strokeDasharray}" stroke-dashoffset="${strokeDashoffset}" class="transition-all duration-300 ease-in-out" />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-[0.68rem] font-bold leading-none text-gray-700">${percentage.toFixed(1)}%</span>
        </div>
      </div>
    `;
  }

  getStressLevelClass(level) {
    const key = String(level || '').toLowerCase();
    const classes = {
      'Low': 'bg-green-100 text-green-800',
      'Medium': 'bg-yellow-200 text-yellow-800',
      'High': 'bg-red-100 text-red-800',
      'low': 'bg-green-100 text-green-800',
      'medium': 'bg-yellow-200 text-yellow-800',
      'high': 'bg-red-100 text-red-800',
      'rendah': 'bg-green-100 text-green-800',
      'sedang': 'bg-yellow-200 text-yellow-800',
      'tinggi': 'bg-red-100 text-red-800',
    };
    return classes[level] || classes[key] || 'bg-gray-100 text-gray-800';
  }

  toPercent(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Math.round(numeric * 10) / 10 : 0;
  }

  formatStressLevel(level) {
    const normalized = String(level || '').toLowerCase();
    const labels = {
      rendah: 'Rendah',
      sedang: 'Sedang',
      tinggi: 'Tinggi',
      low: 'Rendah',
      medium: 'Sedang',
      high: 'Tinggi',
    };
    return labels[normalized] || this.capitalizeFirst(String(level || 'Tidak diketahui'));
  }

  createFusionSummary(item) {
    const fusion = item.fusion || item.metadata?.fusion;
    const dass21 = item.dass21 || item.metadata?.dass21;
    const curhat = item.curhat_result || item.metadata?.curhat;

    if (!fusion && !dass21 && !curhat) {
      return '';
    }

    const mlConfidence = fusion?.mlConfidence ?? curhat?.confidence;
    return `
      <div class="mt-3 grid min-w-0 grid-cols-1 gap-2 text-xs text-gray-600 sm:grid-cols-3">
        <span class="min-w-0 rounded-md bg-gray-50 px-2 py-1 break-words">DASS ${formatPercent(dass21?.stressPercent ?? fusion?.dassStressPercent)}</span>
        <span class="min-w-0 rounded-md bg-gray-50 px-2 py-1 break-words">Curhat ${formatPercent(curhat?.stressPercent ?? fusion?.mlStressPercent)}</span>
        <span class="min-w-0 rounded-md bg-violet-50 px-2 py-1 break-words text-violet-800">Bobot ${formatPercent(fusion?.dassWeight)}/${formatPercent(fusion?.curhatWeight ?? fusion?.mlWeight)}</span>
      </div>
    `;
  }


  capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  formatDate(date) {
    const jakartaDate = toJakartaDate(date) || date;
    const today = startOfDay(toJakartaDate(new Date()));
    const itemDay = startOfDay(jakartaDate);
    const diffDays = Math.round((today - itemDay) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Hari ini pukul ' + jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Kemarin pukul ' + jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays >= 2 && diffDays <= 7) {
      return jakartaDate.toLocaleDateString('id-ID', { weekday: 'long' }) + ' pukul ' + jakartaDate.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
    } else {
      return jakartaDate.toLocaleDateString('id-ID', { month: 'short', day: 'numeric', year: 'numeric' });
    }
  }
}

const view = new HistoryView();
view.presenter = new HistoryPresenter(view);

function initializeHistory() {
  view.presenter.loadHistory();
}

export { HistoryPresenter, HistoryView, view };
