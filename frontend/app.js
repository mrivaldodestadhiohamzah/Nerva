import { renderHome } from './presenters/homePresenter.js';
import { renderLogin } from './presenters/loginPresenter.js';
import { renderSignup } from './presenters/signupPresenter.js';
import { renderCurhat } from './presenters/curhatPresenter.js';
import { renderFeedback } from './presenters/feedbackPresenter.js';
import { renderDashboard } from './presenters/dashboardPresenter.js';
import { renderForgetPass } from './presenters/forgetPassPresenter.js';
import { renderHistory } from './presenters/historyPresenter.js';
import { renderAccount } from './presenters/accountPresenter.js';
import {
    apiCall,
    clearAuthSession,
    getAuthToken,
    setAuthSession,
} from './config.js';
import { renderDass21 } from './presenters/dass21Presenter.js';
import { mascotAssistant } from './components/MascotAssistant.js';

const nervaLogoUrl = new URL('./assets/NervaLogo.png', import.meta.url).href;

if ('scrollRestoration' in window.history) {
    window.history.scrollRestoration = 'manual';
}

function hasValidAuthSession() {
    return sessionStorage.getItem('isLoggedIn') === 'true' && !!getAuthToken();
}

function normalizeAuthSession() {
    const hasLoginFlag = sessionStorage.getItem('isLoggedIn') === 'true';
    const hasToken = !!getAuthToken();

    if (hasLoginFlag && !hasToken) {
        clearAuthSession();
        return false;
    }

    return hasLoginFlag && hasToken;
}

window.openInNewTab = function(view) {
    const newTab = window.open(window.location.origin + window.location.pathname + '#' + view, '_blank');
    
    if (newTab) {
        newTab.focus();
    }
};


function handleProfileImageDisplay(imageElement, userImage) {
    const defaultImage = 'https://cdn.pixabay.com/photo/2015/10/05/22/37/blank-profile-picture-973460_960_720.png';
    try {
        if (!userImage) {
            imageElement.src = defaultImage;
            return;
        }
        if (typeof userImage === 'string') {
            if (userImage.startsWith('http') || userImage.startsWith('data:image/')) {
                imageElement.src = userImage;
                return;
            }
            if (userImage.startsWith('\\x')) {
                try {
                    const hexString = userImage.substring(2);
                    const url = hexString.match(/.{2}/g)?.map(hex => String.fromCharCode(parseInt(hex, 16))).join('') || '';
                    if (url.startsWith('http')) {
                        imageElement.src = url;
                        return;
                    }
                } catch {}
            }
        }
        if (userImage && typeof userImage === 'object' && userImage.data) {
            const base64String = convertBinaryToBase64(userImage.data);
            if (base64String) {
                imageElement.src = base64String;
                return;
            }
        }
        imageElement.src = defaultImage;
        imageElement.onerror = () => {
            imageElement.src = defaultImage;
            imageElement.onerror = null;
        };
    } catch {
        imageElement.src = defaultImage;
    }
}

function convertBinaryToBase64(binaryData) {
    try {
        if (!binaryData) return null;
        let binary = '';
        let bytes;
        if (binaryData instanceof ArrayBuffer) {
            bytes = new Uint8Array(binaryData);
        } else if (binaryData instanceof Uint8Array) {
            bytes = binaryData;
        } else if (Array.isArray(binaryData)) {
            bytes = new Uint8Array(binaryData);
        } else {
            return null;
        }
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
            const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
            binary += String.fromCharCode.apply(null, chunk);
        }
        return 'data:image/jpeg;base64,' + btoa(binary);
    } catch {
        return null;
    }
}

window.updateNavbar = async function () {
    const navbarContainer = document.getElementById('navbar-container');
    if (!navbarContainer) {
        return;
    }
    const isLoggedIn = window.isUserLoggedIn();
    const navbarFile = isLoggedIn ? '/views/navbarLogin.html' : '/views/navbarNotLogin.html';
    try {
        const response = await fetch(navbarFile);
        if (!response.ok) throw new Error(`Failed to load navbar: ${navbarFile}`);
        const html = await response.text();
        navbarContainer.innerHTML = html;
        const navbarLogo = navbarContainer.querySelector('[data-navbar-logo]');
        if (navbarLogo) {
            navbarLogo.src = nervaLogoUrl;
        }
        setupNavbarLinkHandling(navbarContainer);
        setActiveNavLink();
        const menuToggle = document.getElementById('menu-toggle');
        const navbarMenu = document.getElementById('navbar-menu');
        if (menuToggle && navbarMenu) {
            menuToggle.removeEventListener('click', window.toggleMobileMenu);
            window.toggleMobileMenu = () => {
                navbarMenu.classList.toggle('hidden');
            };
            menuToggle.addEventListener('click', window.toggleMobileMenu);
        }
        if (isLoggedIn) {
            const cachedUser = window.getCurrentUser();
            if (cachedUser) {
                updateNavbarUI(cachedUser);
            }
            fetchUserProfile().catch(() => {});
        }
    } catch (error) {
        console.error('Error updating navbar:', error);
    }
};

function setupNavbarLinkHandling(navbarContainer) {
    navbarContainer.querySelectorAll('a[href="#"]').forEach((link) => {
        link.addEventListener('click', (event) => {
            event.preventDefault();
        });
    });

    navbarContainer.querySelectorAll('[data-nav-view]').forEach((link) => {
        link.addEventListener('click', () => {
            setTimeout(setActiveNavLink, 0);
        });
    });
}

function getCurrentViewName() {
    const hash = window.location.hash ? window.location.hash.substring(1) : '';
    return (hash.split('?')[0] || 'home').trim();
}

function getActiveNavView(viewName) {
    const aliases = {
        dass21: 'curhat',
        feedback: 'curhat',
        historydetail: 'history',
        account: 'account',
        profile: 'account',
    };

    return aliases[viewName] || viewName || 'home';
}

function setActiveNavLink() {
    const currentView = getActiveNavView(getCurrentViewName());

    document.querySelectorAll('[data-nav-view]').forEach((link) => {
        const isActive = link.dataset.navView === currentView;
        link.classList.toggle('bg-violet-100', isActive);
        link.classList.toggle('text-violet-900', isActive);
        link.classList.toggle('shadow-sm', isActive);
        link.classList.toggle('text-gray-700', !isActive);

        if (isActive) {
            link.setAttribute('aria-current', 'page');
        } else {
            link.removeAttribute('aria-current');
        }
    });
}

function updateNavbarUI(user) {
    if (!user) {
        return;
    }
    const profileImage = document.getElementById("profile-image");
    const dropdownUsername = document.getElementById("dropdown-username");
    const dropdownEmail = document.getElementById("dropdown-email");
    if (profileImage) {
        handleProfileImageDisplay(profileImage, user.img);
    }
    if (dropdownUsername) dropdownUsername.textContent = user.name || "User";
    if (dropdownEmail) dropdownEmail.textContent = user.email || "";
}

async function fetchUserProfile() {
    const token = getAuthToken();
    if (!token) return;
    try {
        const result = await apiCall('/api/profile', {
            method: 'GET',
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });
        if (result.user) {
            sessionStorage.setItem('user', JSON.stringify(result.user));
            updateNavbarUI(result.user);
        }
    } catch {}
}

function normalizeSectionTarget(sectionTarget) {
    if (!sectionTarget) return null;

    const aliases = {
        about: 'visi-misi',
        tentang: 'visi-misi',
        visi: 'visi-misi',
        'visi-misi': 'visi-misi',
        contact: 'contact',
        kontak: 'contact',
        footer: 'contact',
    };

    return aliases[String(sectionTarget).toLowerCase()] || String(sectionTarget);
}

function scrollToPageSection(sectionTarget) {
    const targetId = normalizeSectionTarget(sectionTarget);
    if (!targetId) return;

    requestAnimationFrame(() => {
        window.setTimeout(() => {
            const target = document.getElementById(targetId);
            if (!target) return;

            const navbar = document.getElementById('navbar-container');
            const navbarOffset = navbar ? navbar.offsetHeight : 0;
            const targetTop = target.getBoundingClientRect().top + window.pageYOffset - navbarOffset - 12;

            window.scrollTo({
                top: Math.max(targetTop, 0),
                behavior: 'smooth',
            });
        }, 80);
    });
}

function resetPageScroll() {
    requestAnimationFrame(() => {
        window.setTimeout(() => {
            window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
        }, 0);
    });
}

window.loadView = function (view, sectionTarget = null) {
    if (!view) {
        const hash = window.location.hash.substring(1);
        view = hash || (window.isUserLoggedIn() ? 'curhat' : 'home');
    }
    
    if (view !== 'home') {
        window.location.hash = view;
    } else {
        window.location.hash = '';
    }

    const isLoggedIn = normalizeAuthSession();
    
    if (view === 'signup' || view === 'login' || view === 'forgetpassword' || view === 'terms' || view === 'privacy') {
        document.body.classList.add('no-navbar');
    } else {
        document.body.classList.remove('no-navbar');
    }
    
    if (view === 'signup' || view === 'login' || view === 'dashboard' || view === 'account' || view === 'history' || view === 'curhat' || view === 'dass21' || view === 'feedback' || view === 'forgetpassword' || view === 'terms' || view === 'privacy') {
        document.body.classList.add('contact');
    } else {
        document.body.classList.remove('contact');
    }
    
    let renderFunction;
    switch (view) {
        case 'home':
            renderFunction = renderHome;
            break;
        case 'login':
            renderFunction = renderLogin;
            break;
        case 'signup':
            renderFunction = renderSignup;
            break;
        case 'curhat':
            renderFunction = isLoggedIn ? renderCurhat : renderLogin;
            break;
        case 'dass21':
            renderFunction = isLoggedIn ? renderDass21 : renderLogin;
            break;
        case 'feedback':
            renderFunction = isLoggedIn ? renderFeedback : renderLogin;
            break;
        case 'dashboard':
            renderFunction = isLoggedIn ? renderDashboard : renderLogin;
            break;
        case 'history':
            renderFunction = isLoggedIn ? renderHistory : renderLogin;
            break;
        case 'account':
            renderFunction = renderAccount;
            break;
        case 'forgetpassword':
            renderFunction = renderForgetPass;
            break;
        case 'terms':
            renderFunction = renderTerms;
            break;
        case 'privacy':
            renderFunction = renderPrivacy;
            break;
        default:
            renderFunction = renderHome;
    }
    
    let renderResult;
    if (renderFunction) {
        try {
            renderResult = renderFunction();
        } catch (error) {
            console.error(`Error rendering view ${view}:`, error);
            renderResult = renderLogin();
        }
    } else {
        console.error(`No render function found for view ${view}`);
        renderResult = renderHome();
    }
    
    Promise.resolve(renderResult).finally(() => window.updateNavbar().then(() => {
        if (isLoggedIn) {
            const cachedUser = window.getCurrentUser();
            if (cachedUser) {
                updateNavbarUI(cachedUser);
            }
        }
    }).catch(error => {
        console.error('Error updating navbar:', error);
    })).finally(() => {
        if (sectionTarget) {
            scrollToPageSection(sectionTarget);
        } else {
            resetPageScroll();
        }
        mascotAssistant.refresh();
        mascotAssistant.hideSplash();
    });
};

window.addEventListener('hashchange', setActiveNavLink);


window.login = async function (userData, token) {
    if (userData && token) {
        setAuthSession(userData, token);
    }
    updateNavbarUI(userData);
    await window.updateNavbar();
    loadView('curhat');
};

window.logout = function () {
    clearAuthSession();
    window.updateNavbar();
    loadView('home');
};

window.getCurrentUser = function () {
    const userStr = sessionStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
};

window.getAuthToken = function () {
    return getAuthToken();
};

window.isUserLoggedIn = function () {
    return hasValidAuthSession();
};

window.addEventListener('DOMContentLoaded', () => {
    mascotAssistant.mount();
    const isLoggedIn = normalizeAuthSession();
    loadView(isLoggedIn ? 'curhat' : 'home');
});
