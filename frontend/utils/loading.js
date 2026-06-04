function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

const GLOBAL_LOADING_ID = 'global-loading-overlay';
const LOADING_MASCOT_URL = '/assets/loading.webm';
const LOADING_EXIT_MS = 440;

function playLoadingVideos(container) {
  container.querySelectorAll('video').forEach((video) => {
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.play?.().catch?.(() => {});
  });
}

export function renderMascotLoading({
  title = 'Memuat...',
  message = '',
  size = 'md',
  textColor = 'text-gray-700',
} = {}) {
  const sizeClass = {
    xs: 'h-6 w-6',
    sm: 'h-10 w-10',
    md: 'h-24 w-24 sm:h-28 sm:w-28',
    lg: 'h-32 w-32 sm:h-40 sm:w-40',
  }[size] || size;

  return `
    <div class="mascot-loading inline-flex flex-col items-center justify-center text-center" role="status" aria-live="polite">
      <video
        class="${sizeClass} object-contain"
        autoplay
        muted
        loop
        playsinline
        webkit-playsinline
        preload="auto"
        aria-label="${escapeHtml(title)}"
      >
        <source src="${LOADING_MASCOT_URL}" type="video/webm">
      </video>
      ${title ? `<p class="mt-2 text-base font-semibold ${textColor}">${escapeHtml(title)}</p>` : ''}
      ${message ? `<p class="mt-1 text-sm leading-relaxed text-gray-600">${escapeHtml(message)}</p>` : ''}
    </div>
  `;
}

export function showGlobalLoading({
  title = 'Memuat...',
  message = 'Sebentar ya, data sedang disiapkan.',
} = {}) {
  let overlay = document.getElementById(GLOBAL_LOADING_ID);

  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = GLOBAL_LOADING_ID;
    overlay.className = 'mascot-loading-overlay is-hidden fixed inset-0 hidden flex items-center justify-center bg-white bg-opacity-80 px-4';
    overlay.style.zIndex = '9999';
    overlay.setAttribute('role', 'status');
    overlay.setAttribute('aria-live', 'polite');
    document.body.appendChild(overlay);
  }

  const nextTitle = String(title);
  const nextMessage = String(message);
  const shouldRender =
    !overlay.innerHTML.trim() ||
    overlay.dataset.loadingTitle !== nextTitle ||
    overlay.dataset.loadingMessage !== nextMessage;

  if (shouldRender) {
    overlay.innerHTML = renderMascotLoading({ title, message, size: 'lg' });
    overlay.dataset.loadingTitle = nextTitle;
    overlay.dataset.loadingMessage = nextMessage;
  }

  overlay.classList.remove('hidden');
  window.requestAnimationFrame(() => {
    overlay.classList.remove('is-hidden');
    overlay.classList.add('is-visible');
  });
  playLoadingVideos(overlay);
}

export function hideGlobalLoading() {
  const overlay = document.getElementById(GLOBAL_LOADING_ID);
  if (!overlay) return;

  overlay.classList.remove('is-visible');
  overlay.classList.add('is-hidden');
  window.setTimeout(() => {
    if (overlay.classList.contains('is-hidden')) {
      overlay.classList.add('hidden');
    }
  }, LOADING_EXIT_MS);
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
        <video
          class="h-6 w-6 object-contain"
          autoplay
          muted
          loop
          playsinline
          webkit-playsinline
          preload="auto"
          aria-hidden="true"
        >
          <source src="${LOADING_MASCOT_URL}" type="video/webm">
        </video>
        <span>${escapeHtml(loadingText)}</span>
      </span>
    `;
    playLoadingVideos(button);
    return;
  }

  button.disabled = false;
  button.removeAttribute('aria-busy');
  button.classList.remove('cursor-not-allowed', 'opacity-80');
  button.textContent = button.dataset.defaultText || 'Kirim';
}

export function renderPageLoading(
  title = 'Memuat data...',
  message = 'Sebentar ya, data sedang disiapkan.'
) {
  return `
    <main class="min-h-screen bg-gray-50 px-4 py-10 flex items-center justify-center">
      ${renderMascotLoading({ title, message, size: 'lg' })}
    </main>
  `;
}
