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

    if (typeof window.loadView === 'function') {
      window.loadView(nextView);
    }
  });
}
