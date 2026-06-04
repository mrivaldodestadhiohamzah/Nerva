const mascotAssetModules = import.meta.glob("../assets/{click,scroll,curhat,feedback}.{webm,mp4}", {
  eager: true,
  query: "?url",
  import: "default",
});

function getMascotAsset(name, preferredFormats = ["webm", "mp4"]) {
  for (const format of preferredFormats) {
    const matchedKey = Object.keys(mascotAssetModules).find((key) => key.endsWith(`/${name}.${format}`));
    if (matchedKey) return mascotAssetModules[matchedKey];
  }
  return "";
}

const loadingMascotUrl = "/assets/loading.webm";
const clickMascotUrl = getMascotAsset("click", ["webm", "mp4"]);
const scrollMascotUrl = getMascotAsset("scroll", ["mp4", "webm"]);
const curhatMascotUrl = getMascotAsset("curhat", ["webm", "mp4"]);
const feedbackMascotUrl = getMascotAsset("feedback", ["webm", "mp4"]);

const CTA_SELECTORS = [
  "#start-button",
  "#loginButton",
  "#signupButton",
  "#submitCurhat",
  "#dass21Form button[type='submit']",
  "a[onclick*=\"loadView('signup')\"]",
];

const SCROLL_IDLE_HIDE_MS = 2200;
const AUTH_CLICK_VIEWS = new Set(["login", "signup"]);
const PAGE_MASCOT_CONFIG = {
  curhat: {
    src: curhatMascotUrl,
    targetSelector: ".curhat-container",
    placement: "outside-right",
    label: "Maskot NERVA menemani pengguna menulis curhat",
  },
  feedback: {
    src: feedbackMascotUrl,
    targetSelector: ".feedback-sections",
    placement: "edge-overlay",
    label: "Maskot NERVA mengajak pengguna membaca hasil dan memberi masukan",
  },
};

function createMascotVideo(src, className, label) {
  if (!src) return null;

  const video = document.createElement("video");
  video.className = className;
  video.src = src;
  video.autoplay = true;
  video.muted = true;
  video.defaultMuted = true;
  video.loop = true;
  video.playsInline = true;
  video.controls = false;
  video.disablePictureInPicture = true;
  video.setAttribute("aria-label", label);
  video.setAttribute("muted", "");
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.setAttribute("preload", "auto");
  video.addEventListener("error", () => {
    const container = video.closest("[data-mascot-element]");
    if (container) container.remove();
  });
  return video;
}

function requestVideoPlayback(video) {
  if (!video) return;
  window.requestAnimationFrame(() => {
    const playPromise = video.play();
    if (playPromise?.catch) {
      playPromise.catch(() => {});
    }
  });
}

function revealAfterMount(element) {
  if (!element) return;
  window.requestAnimationFrame(() => {
    element.classList.add("is-visible");
  });
}

class MascotAssistant {
  constructor() {
    this.splash = null;
    this.clickHelper = null;
    this.scrollButton = null;
    this.pageHelper = null;
    this.activeCta = null;
    this.hasHiddenSplash = false;
    this.scrollIdleTimer = null;
    this.boundUpdateClickPosition = () => this.updateClickHelperPosition();
    this.boundHandleScroll = () => this.handleScroll();
  }

  mount() {
    this.createSplash();
    this.createClickHelper();
    this.createScrollButton();
    window.addEventListener("scroll", this.boundHandleScroll, { passive: true });
    window.addEventListener("resize", this.boundUpdateClickPosition);
    this.handleScroll();
  }

  createSplash() {
    if (this.splash) return;

    this.splash = document.createElement("div");
    this.splash.className = "mascot-splash";
    this.splash.dataset.mascotElement = "splash";
    this.splash.innerHTML = `
      <div class="mascot-splash-card" role="status" aria-live="polite">
        <div class="mascot-splash-video"></div>
      </div>
    `;
    const video = createMascotVideo(loadingMascotUrl, "mascot-video", "Animasi maskot NERVA sedang memuat");
    if (video) {
      this.splash.querySelector(".mascot-splash-video").appendChild(video);
      requestVideoPlayback(video);
    }
    document.body.appendChild(this.splash);
    revealAfterMount(this.splash);
  }

  hideSplash() {
    if (!this.splash || this.hasHiddenSplash) return;
    this.hasHiddenSplash = true;

    window.setTimeout(() => {
      this.splash?.classList.add("is-hidden");
      window.setTimeout(() => {
        this.splash?.remove();
        this.splash = null;
      }, 520);
    }, 850);
  }

  createClickHelper() {
    if (this.clickHelper) return;

    this.clickHelper = document.createElement("div");
    this.clickHelper.className = "mascot-click-helper is-hidden";
    this.clickHelper.dataset.mascotElement = "click-helper";
    const video = createMascotVideo(clickMascotUrl, "mascot-video", "Maskot NERVA menunjuk tombol aksi");
    if (!video) {
      this.clickHelper = null;
      return;
    }
    this.clickHelper.appendChild(video);
    document.body.appendChild(this.clickHelper);
    requestVideoPlayback(video);
    revealAfterMount(this.clickHelper);
  }

  createScrollButton() {
    if (this.scrollButton) return;

    this.scrollButton = document.createElement("button");
    this.scrollButton.type = "button";
    this.scrollButton.className = "mascot-scroll-top is-hidden";
    this.scrollButton.dataset.mascotElement = "scroll-top";
    this.scrollButton.setAttribute("aria-label", "Scroll to top");
    const video = createMascotVideo(scrollMascotUrl, "mascot-video", "Maskot NERVA untuk kembali ke atas");
    if (!video) {
      this.scrollButton = null;
      return;
    }
    this.scrollButton.appendChild(video);
    this.scrollButton.addEventListener("click", () => {
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    document.body.appendChild(this.scrollButton);
    requestVideoPlayback(video);
    revealAfterMount(this.scrollButton);
  }

  refresh() {
    this.activeCta = CTA_SELECTORS
      .map((selector) => document.querySelector(selector))
      .find((element) => this.isUsableCta(element));

    this.updateClickHelperPosition();
    this.updatePageHelper();
    this.handleScroll();
  }

  isUsableCta(element) {
    if (!element) return false;
    const rect = element.getBoundingClientRect();
    const style = window.getComputedStyle(element);
    return rect.width > 0 && rect.height > 0 && style.visibility !== "hidden" && style.display !== "none";
  }

  getCurrentViewName() {
    const hash = window.location.hash ? window.location.hash.substring(1) : "";
    return (hash.split("?")[0] || "home").trim();
  }

  shouldKeepClickHelperVisible(rect) {
    const currentView = this.getCurrentViewName();

    if (AUTH_CLICK_VIEWS.has(currentView)) {
      return true;
    }

    if (currentView !== "home" && currentView !== "") {
      return window.scrollY <= 24;
    }

    // On the landing page, keep the guide visible while the main CTA is still in view.
    return rect.bottom > 96;
  }

  updatePageHelper() {
    const currentView = this.getCurrentViewName();
    const config = PAGE_MASCOT_CONFIG[currentView];

    if (!config?.src) {
      this.removePageHelper();
      return;
    }

    const target = document.querySelector(config.targetSelector);
    if (!target) {
      this.removePageHelper();
      return;
    }

    if (!this.pageHelper || this.pageHelper.dataset.mascotVariant !== currentView) {
      this.removePageHelper();
      this.pageHelper = document.createElement("div");
      this.pageHelper.className = `mascot-page-helper mascot-page-helper-${currentView}`;
      this.pageHelper.dataset.mascotElement = "page-helper";
      this.pageHelper.dataset.mascotVariant = currentView;

      const video = createMascotVideo(config.src, "mascot-video", config.label);
      if (!video) {
        this.removePageHelper();
        return;
      }

      this.pageHelper.appendChild(video);
      requestVideoPlayback(video);
    }

    if (!this.pageHelper.isConnected) {
      this.placePageHelper(target, currentView, config);
      revealAfterMount(this.pageHelper);
    }
  }

  placePageHelper(target, currentView, config) {
    if (config.placement === "edge-overlay") {
      target.classList.add(`mascot-page-anchor-${currentView}`);
      target.appendChild(this.pageHelper);
      return;
    }

    const existingLayout = target.closest("[data-mascot-side-layout]");
    if (existingLayout?.dataset.mascotVariant === currentView) {
      existingLayout.appendChild(this.pageHelper);
      return;
    }

    const wrapper = document.createElement("div");
    wrapper.className = `mascot-side-layout mascot-side-layout-${currentView}`;
    wrapper.dataset.mascotSideLayout = "true";
    wrapper.dataset.mascotVariant = currentView;

    target.parentElement?.insertBefore(wrapper, target);
    wrapper.appendChild(target);
    wrapper.appendChild(this.pageHelper);
  }

  removePageHelper() {
    const layout = this.pageHelper?.closest("[data-mascot-side-layout]");
    const target = layout?.querySelector(":scope > :not(.mascot-page-helper)");
    const anchor = this.pageHelper?.parentElement;

    this.pageHelper?.remove();
    this.pageHelper = null;

    anchor?.classList.remove("mascot-page-anchor-feedback");

    if (layout && target && layout.parentElement) {
      layout.parentElement.insertBefore(target, layout);
      layout.remove();
    }
  }

  updateClickHelperPosition() {
    if (!this.clickHelper) return;

    if (!this.activeCta || !this.isUsableCta(this.activeCta)) {
      this.clickHelper.classList.add("is-hidden");
      return;
    }

    const rect = this.activeCta.getBoundingClientRect();
    const helperWidth = this.clickHelper.offsetWidth || 92;
    const helperHeight = this.clickHelper.offsetHeight || 92;
    const isMobile = window.matchMedia("(max-width: 640px)").matches;

    if (!this.shouldKeepClickHelperVisible(rect)) {
      this.clickHelper.classList.add("is-hidden");
      return;
    }

    const gap = isMobile ? 6 : 12;
    const hasSafeLeftSpace = rect.left >= helperWidth + gap + 8;
    const left = hasSafeLeftSpace
      ? Math.max(10, rect.left - helperWidth - gap)
      : Math.max(10, Math.min(window.innerWidth - helperWidth - 10, rect.left));
    const top = hasSafeLeftSpace
      ? Math.max(16, rect.top + rect.height / 2 - helperHeight / 2)
      : Math.min(window.innerHeight - helperHeight - 10, rect.bottom + 10);

    this.clickHelper.style.left = `${left}px`;
    this.clickHelper.style.top = `${top}px`;
    this.clickHelper.classList.remove("is-hidden");
  }

  handleScroll() {
    if (!this.scrollButton) return;

    const isAtTop = window.scrollY <= 0;
    window.clearTimeout(this.scrollIdleTimer);

    if (isAtTop) {
      this.scrollButton.classList.add("is-hidden");
    } else {
      this.scrollButton.classList.remove("is-hidden");
      this.scrollIdleTimer = window.setTimeout(() => {
        this.scrollButton?.classList.add("is-hidden");
      }, SCROLL_IDLE_HIDE_MS);
    }

    this.updateClickHelperPosition();
  }
}

export const mascotAssistant = new MascotAssistant();
