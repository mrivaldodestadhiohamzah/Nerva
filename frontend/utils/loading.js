function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const GLOBAL_LOADING_ID = 'global-loading-overlay';

export function showGlobalLoading({
  title = 'Menghubungkan ke server...',
  message = 'Server sedang dinyalakan, mohon tunggu sebentar.',
} = {}) {
  let overlay = document.getElementById(GLOBAL_LOADING_ID);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = GLOBAL_LOADING_ID;
    overlay.className = 'fixed inset-0 hidden flex items-center justify-center bg-white bg-opacity-80 px-4 backdrop-blur-sm';
    overlay.style.zIndex = '9999';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    document.body.appendChild(overlay);
  }

  overlay.innerHTML = `
    <div class="w-full max-w-sm rounded-2xl border border-violet-100 bg-white p-6 text-center shadow-xl">
      <div class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-violet-100 border-t-violet-700"></div>
      <p class="text-base font-semibold text-gray-800">${escapeHtml(title)}</p>
      <p class="mt-2 text-sm leading-relaxed text-gray-600">${escapeHtml(message)}</p>
    </div>
  `;
  overlay.classList.remove('hidden');
}

export function hideGlobalLoading() {
  const overlay = document.getElementById(GLOBAL_LOADING_ID);
  if (overlay) overlay.classList.add('hidden');
}

export function setButtonLoading(button, isLoading, loadingText = 'Memproses...') {
  if (!button) return;

  if (isLoading) {
    if (!button.dataset.defaultText) {
      button.dataset.defaultText = button.textContent.trim();
    }

    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    button.classList.add('cursor-not-allowed', 'opacity-80');
    button.innerHTML = `
      <span class="inline-flex items-center justify-center gap-2">
        <span class="h-4 w-4 animate-spin rounded-full border-2 border-white border-opacity-40 border-t-white"></span>
        <span>${escapeHtml(loadingText)}</span>
      </span>
    `;
    return;
  }

  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.classList.remove('cursor-not-allowed', 'opacity-80');
  button.textContent = button.dataset.defaultText || 'Kirim';
}

export function renderPageLoading(
  title = 'Memuat data...',
  message = 'Server sedang dinyalakan, mohon tunggu sebentar.'
) {
  return `
    <main class="min-h-screen bg-gray-50 px-4 py-10 flex items-center justify-center">
      <section class="w-full max-w-md rounded-2xl border border-violet-100 bg-white p-6 text-center shadow-sm">
        <div class="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-violet-100 border-t-violet-700"></div>
        <h1 class="text-lg font-semibold text-gray-800">${escapeHtml(title)}</h1>
        <p class="mt-2 text-sm leading-relaxed text-gray-600">${escapeHtml(message)}</p>
      </section>
    </main>
  `;
}
