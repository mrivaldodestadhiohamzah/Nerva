export function renderHome() {
  return fetch('/views/homeView.html')
    .then(res => res.text())
    .then(html => {
      document.getElementById('app').innerHTML = html;
      setupStartButton();
      if (window.AOS) {
        window.requestAnimationFrame(() => window.AOS.refreshHard());
      }
    });
}

function isCurrentSessionAuthenticated() {
  const hasLoginFlag = sessionStorage.getItem('isLoggedIn') === 'true';
  const hasToken = Boolean(
    typeof window.getAuthToken === 'function'
      ? window.getAuthToken()
      : sessionStorage.getItem('token')
  );

  if (hasLoginFlag && !hasToken) {
    sessionStorage.removeItem('isLoggedIn');
    sessionStorage.removeItem('user');
    if (window.updateNavbar) window.updateNavbar();
    return false;
  }

  if (typeof window.isUserLoggedIn === 'function') {
    return window.isUserLoggedIn();
  }

  return hasLoginFlag && hasToken;
}

function setupStartButton() {
  const startButton = document.getElementById('start-button');
  if (!startButton) return;

  startButton.addEventListener('click', (event) => {
    event.preventDefault();
    const nextView = isCurrentSessionAuthenticated() ? 'curhat' : 'signup';

    scrollToStartTarget(() => {
      if (typeof window.loadView === 'function') {
        window.loadView(nextView);
      }
    });
  });
}

function getNavbarOffset() {
  const navbar = document.getElementById('navbar-container');
  return navbar ? navbar.offsetHeight : 0;
}

function refreshScrollAnimations() {
  if (!window.AOS) return;

  window.requestAnimationFrame(() => {
    window.AOS.refreshHard();
    window.setTimeout(() => window.AOS.refreshHard(), 360);
  });
}

function scrollToStartTarget(onComplete) {
  const target = document.getElementById('mulai-sekarang-target');

  if (!target) {
    onComplete?.();
    return;
  }

  const targetTop = target.getBoundingClientRect().top + window.pageYOffset - getNavbarOffset() - 12;
  window.scrollTo({
    top: Math.max(targetTop, 0),
    behavior: 'smooth',
  });

  refreshScrollAnimations();

  window.setTimeout(() => {
    refreshScrollAnimations();
    onComplete?.();
  }, 620);
}
