(function () {
  "use strict";

  var STORAGE_KEY = "pt_cookie_consent_v1";
  var NOTICE_VERSION = "1.0";
  var POLICY_VERSION = "1.0";
  var VALIDITY_DAYS = 180;
  var OPTIONAL_CATEGORIES = ["analytics", "functional", "advertising"];
  var consent = null;
  var draft = { necessary: true, analytics: false, functional: false, advertising: false };
  var banner;
  var dialog;
  var status;
  var widget;
  var icon;
  var previousFocus = null;
  var floatTween = null;
  var animationTimeline = null;
  var motionPreference = window.matchMedia("(prefers-reduced-motion: reduce)");

  function addStylesheet() {
    if (document.getElementById("pt-cookie-styles")) return;
    var link = document.createElement("link");
    link.id = "pt-cookie-styles";
    link.rel = "stylesheet";
    link.href = "/consent.css";
    document.head.appendChild(link);
  }

  function isValidRecord(record) {
    if (!record || typeof record !== "object" ||
        record.noticeVersion !== NOTICE_VERSION ||
        record.policyVersion !== POLICY_VERSION ||
        !record.categories || record.categories.necessary !== true) {
      return false;
    }
    if (OPTIONAL_CATEGORIES.some(function (category) {
      return typeof record.categories[category] !== "boolean";
    })) {
      return false;
    }
    var savedAt = Date.parse(record.savedAt);
    var expiresAt = Date.parse(record.expiresAt);
    return Number.isFinite(savedAt) && Number.isFinite(expiresAt) &&
      expiresAt > Date.now() && expiresAt > savedAt;
  }

  function parseRecord(value) {
    if (value === null) return null;
    try {
      var record = JSON.parse(value);
      if (isValidRecord(record)) return record;
      console.warn("Preferências de cookies inválidas ou expiradas; será solicitada uma nova escolha.");
    } catch (error) {
      console.error("Não foi possível ler as preferências de cookies armazenadas.", error);
    }
    return null;
  }

  function loadConsent() {
    try {
      var storedValue = window.localStorage.getItem(STORAGE_KEY);
      var record = parseRecord(storedValue);
      if (storedValue !== null && !record) {
        window.localStorage.removeItem(STORAGE_KEY);
      }
      return record;
    } catch (error) {
      console.error("Não foi possível acessar o armazenamento local das preferências de cookies.", error);
      return null;
    }
  }

  function currentPreferences() {
    if (consent) {
      return {
        necessary: true,
        analytics: consent.categories.analytics,
        functional: consent.categories.functional,
        advertising: consent.categories.advertising
      };
    }
    return {
      necessary: true,
      analytics: false,
      functional: false,
      advertising: false
    };
  }

  function emitChange() {
    var detail = {
      categories: currentPreferences(),
      savedAt: consent ? consent.savedAt : null,
      expiresAt: consent ? consent.expiresAt : null,
      noticeVersion: NOTICE_VERSION,
      policyVersion: POLICY_VERSION
    };
    window.dispatchEvent(new CustomEvent("potiguar:cookie-consent-change", { detail: detail }));
  }

  function showStatus(message) {
    status.textContent = message;
  }

  function recordChoice(categories) {
    var savedAt = new Date();
    var expiresAt = new Date(savedAt.getTime() + VALIDITY_DAYS * 24 * 60 * 60 * 1000);
    var record = {
      noticeVersion: NOTICE_VERSION,
      policyVersion: POLICY_VERSION,
      savedAt: savedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
      categories: {
        necessary: true,
        analytics: categories.analytics === true,
        functional: categories.functional === true,
        advertising: categories.advertising === true
      }
    };
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(record));
    } catch (error) {
      console.error("Não foi possível salvar as preferências de cookies.", error);
      showStatus("Não foi possível salvar sua escolha neste navegador. Verifique as permissões de armazenamento e tente novamente.");
      return false;
    }
    consent = record;
    updateBanner();
    emitChange();
    return true;
  }

  function syncDraft() {
    OPTIONAL_CATEGORIES.forEach(function (category) {
      var input = dialog.querySelector('[name="' + category + '"]');
      draft[category] = input.checked;
    });
    draft.necessary = true;
  }

  function renderDraft(categories) {
    OPTIONAL_CATEGORIES.forEach(function (category) {
      var input = dialog.querySelector('[name="' + category + '"]');
      input.checked = categories[category] === true;
    });
  }

  function updateBanner() {
    banner.hidden = Boolean(consent);
  }

  function openPreferences(trigger, initialDraft) {
    previousFocus = trigger || document.activeElement;
    draft = initialDraft || currentPreferences();
    renderDraft(draft);
    showStatus("");
    banner.hidden = true;
    if (dialog.open) return;
    dialog.showModal();
    dialog.querySelector(".cc-dialog__close").focus();
    animateAttention();
  }

  function closePreferences() {
    if (dialog.open) dialog.close();
  }

  function startFloat() {
    if (!window.gsap || motionPreference.matches || !icon) return;
    if (floatTween) floatTween.kill();
    floatTween = window.gsap.to(icon, {
      y: -2,
      duration: 2.4,
      repeat: -1,
      yoyo: true,
      ease: "sine.inOut"
    });
  }

  function animateEntry() {
    if (!window.gsap || motionPreference.matches) return;
    animationTimeline = window.gsap.timeline({ onComplete: startFloat });
    animationTimeline.fromTo(icon,
      { autoAlpha: 0, scale: 0.76, rotation: -16 },
      { autoAlpha: 1, scale: 1, rotation: 0, duration: 0.65, ease: "back.out(1.5)" }
    );
  }

  function animateAttention() {
    if (!window.gsap || motionPreference.matches || !icon) return;
    if (animationTimeline) {
      animationTimeline.kill();
      window.gsap.set(icon, { clearProps: "transform,opacity,visibility" });
    }
    if (floatTween) floatTween.kill();
    animationTimeline = window.gsap.timeline({ onComplete: startFloat });
    animationTimeline.to(icon, { rotation: 16, duration: 0.18, ease: "power1.out" })
      .to(icon, { rotation: 0, duration: 0.28, ease: "power2.out" });
  }

  function resetAnimation() {
    if (animationTimeline) animationTimeline.kill();
    if (floatTween) floatTween.kill();
    animationTimeline = null;
    floatTween = null;
    if (window.gsap && icon) window.gsap.set(icon, { clearProps: "transform,opacity,visibility" });
  }

  function createInterface() {
    var root = document.createElement("div");
    root.innerHTML =
      '<section class="cc-banner" id="pt-cookie-banner" aria-labelledby="pt-cookie-title" aria-describedby="pt-cookie-description" hidden>' +
        '<div class="cc-banner__inner">' +
          '<div class="cc-banner__copy">' +
            '<h2 id="pt-cookie-title">Privacidade e cookies</h2>' +
            '<p id="pt-cookie-description">Utilizamos cookies necessários para o funcionamento deste site. Com sua autorização, também poderemos utilizar cookies opcionais para analisar a navegação, aprimorar funcionalidades e, se aplicável, personalizar conteúdos e publicidade. Você pode aceitar, recusar os cookies opcionais ou personalizar suas preferências a qualquer momento.</p>' +
            '<p><a href="/politica-de-cookies">Consulte nossa Política de Cookies para obter mais informações.</a></p>' +
          '</div>' +
          '<div class="cc-banner__actions" aria-label="Ações de privacidade">' +
            '<button class="cc-button" type="button" data-choice="accept">Aceitar todos</button>' +
            '<button class="cc-button cc-button--secondary" type="button" data-choice="reject">Recusar opcionais</button>' +
            '<button class="cc-button cc-button--secondary" type="button" data-open-preferences>Personalizar preferências</button>' +
          '</div>' +
        '</div>' +
      '</section>' +
      '<dialog class="cc-dialog" data-lenis-prevent id="pt-cookie-dialog" aria-labelledby="pt-cookie-dialog-title" aria-describedby="pt-cookie-dialog-description">' +
        '<div class="cc-dialog__content">' +
          '<div class="cc-dialog__heading">' +
            '<div><span class="cc-dialog__eyebrow">Privacidade e cookies</span><h2 id="pt-cookie-dialog-title">Central de preferências</h2>' +
            '<p id="pt-cookie-dialog-description">Escolha quais categorias opcionais autoriza. Você pode alterar ou retirar sua escolha a qualquer momento.</p></div>' +
            '<button class="cc-dialog__close" type="button" aria-label="Fechar preferências">&times;</button>' +
          '</div>' +
          '<div class="cc-categories">' +
            '<section class="cc-category"><div><h3>Necessários</h3><p>Essenciais para registrar e aplicar esta escolha e para recursos solicitados pelo visitante. Permanecem ativos somente na medida necessária.</p></div><label class="cc-category__control"><input type="checkbox" checked disabled aria-label="Cookies necessários sempre ativos"><span>Sempre ativos</span></label></section>' +
            '<section class="cc-category"><div><h3>Analíticos</h3><p>Podem medir audiência, desempenho e utilização do site, se ferramentas dessa finalidade forem implementadas.</p></div><label class="cc-category__control"><input type="checkbox" name="analytics"><span>Autorizar</span></label></section>' +
            '<section class="cc-category"><div><h3>Funcionais</h3><p>Podem habilitar personalização e conveniência além do funcionamento essencial, se recursos dessa finalidade forem implementados.</p></div><label class="cc-category__control"><input type="checkbox" name="functional"><span>Autorizar</span></label></section>' +
            '<section class="cc-category"><div><h3>Publicidade</h3><p>Podem medir campanhas ou personalizar anúncios, caso tais tecnologias sejam implementadas.</p></div><label class="cc-category__control"><input type="checkbox" name="advertising"><span>Autorizar</span></label></section>' +
          '</div>' +
          '<p class="cc-dialog__status" role="status" aria-live="polite"></p>' +
          '<div class="cc-dialog__actions">' +
            '<button class="cc-button cc-button--secondary" type="button" data-choice="reject">Recusar opcionais</button>' +
            '<button class="cc-button cc-button--secondary" type="button" data-choice="accept">Aceitar todos</button>' +
            '<button class="cc-button" type="button" data-choice="save">Salvar preferências</button>' +
          '</div>' +
        '</div>' +
      '</dialog>' +
      '<button class="cc-widget" type="button" aria-label="Abrir preferências de cookies">' +
        '<svg class="cc-widget__icon" viewBox="0 0 40 40" aria-hidden="true" focusable="false">' +
          '<path d="M22.1 4.1c-.6 2.3.1 4.9 1.9 6.7 1.9 1.9 4.6 2.5 7 1.8.8 1.5 2 2.7 3.5 3.4.5 1.3.8 2.7.8 4.2A15.8 15.8 0 1 1 19.5 4.4c.9-.2 1.8-.3 2.6-.3Z" fill="#ffc900" stroke="#f5f5f2" stroke-width="1.5" stroke-linejoin="round"/>' +
          '<circle cx="13.5" cy="15.5" r="2" fill="#101010"/><circle cx="22.5" cy="20.5" r="2.2" fill="#101010"/><circle cx="15.5" cy="27" r="1.7" fill="#101010"/><circle cx="27.5" cy="29" r="1.6" fill="#101010"/>' +
        '</svg><span>Preferências de cookies</span>' +
      '</button>';
    document.body.appendChild(root);

    banner = document.getElementById("pt-cookie-banner");
    dialog = document.getElementById("pt-cookie-dialog");
    status = dialog.querySelector(".cc-dialog__status");
    widget = root.querySelector(".cc-widget");
    icon = root.querySelector(".cc-widget__icon");

    var footer = document.querySelector("footer");
    var footerControls = document.createElement("div");
    footerControls.className = "cc-page-footer";
    footerControls.innerHTML = '<a href="/politica-de-cookies">Política de Cookies</a><button type="button">Preferências de cookies</button>';
    if (footer) {
      var existingFooterContent = footer.querySelector(".fg");
      (existingFooterContent || footer).appendChild(footerControls);
    } else {
      var generatedFooter = document.createElement("footer");
      generatedFooter.className = "cc-generated-footer";
      generatedFooter.appendChild(footerControls);
      document.body.appendChild(generatedFooter);
    }

    footerControls.querySelector("button").addEventListener("click", function (event) {
      openPreferences(event.currentTarget);
    });
    widget.addEventListener("click", function (event) {
      openPreferences(event.currentTarget);
    });
    root.querySelector(".cc-dialog__close").addEventListener("click", closePreferences);
    document.querySelectorAll("[data-open-preferences]").forEach(function (button) {
      button.addEventListener("click", function (event) {
        openPreferences(event.currentTarget);
      });
    });
    root.querySelectorAll('[data-choice="accept"]').forEach(function (button) {
      button.addEventListener("click", function () {
        draft = { necessary: true, analytics: true, functional: true, advertising: true };
        renderDraft(draft);
        if (recordChoice(draft)) closePreferences();
        else {
          var message = status.textContent;
          openPreferences(button, draft);
          showStatus(message);
        }
      });
    });
    root.querySelectorAll('[data-choice="reject"]').forEach(function (button) {
      button.addEventListener("click", function () {
        draft = { necessary: true, analytics: false, functional: false, advertising: false };
        renderDraft(draft);
        if (recordChoice(draft)) closePreferences();
        else {
          var message = status.textContent;
          openPreferences(button, draft);
          showStatus(message);
        }
      });
    });
    root.querySelector('[data-choice="save"]').addEventListener("click", function () {
      syncDraft();
      if (recordChoice(draft)) closePreferences();
    });
    dialog.addEventListener("close", function () {
      updateBanner();
      resetAnimation();
      startFloat();
      var focusTarget = previousFocus && typeof previousFocus.focus === "function" &&
        document.contains(previousFocus) && !previousFocus.closest("[hidden]")
        ? previousFocus
        : widget;
      previousFocus = null;
      window.setTimeout(function () {
        if (document.contains(focusTarget) && !focusTarget.closest("[hidden]")) {
          focusTarget.focus();
        }
      }, 0);
    });
    dialog.addEventListener("keydown", function (event) {
      if (event.key === "Escape" && dialog.open) {
        event.preventDefault();
        closePreferences();
      }
    });
    dialog.addEventListener("cancel", function (event) {
      event.preventDefault();
      showStatus("");
      closePreferences();
    });
    OPTIONAL_CATEGORIES.forEach(function (category) {
      dialog.querySelector('[name="' + category + '"]').addEventListener("change", function () {
        syncDraft();
        showStatus("");
      });
    });
    animateEntry();
  }

  addStylesheet();
  consent = loadConsent();
  if (consent) {
    draft = currentPreferences();
  }
  createInterface();
  updateBanner();
  emitChange();

  window.PotiguarCookieConsent = Object.freeze({
    getPreferences: currentPreferences,
    hasConsent: function (category) {
      return category === "necessary" || OPTIONAL_CATEGORIES.indexOf(category) !== -1 &&
        Boolean(consent && consent.categories[category]);
    },
    open: function () {
      openPreferences(document.activeElement);
    }
  });

  window.addEventListener("storage", function (event) {
    if (event.key !== STORAGE_KEY) return;
    consent = parseRecord(event.newValue);
    draft = currentPreferences();
    updateBanner();
    emitChange();
  });

  function onMotionChange() {
    resetAnimation();
    if (!motionPreference.matches) animateEntry();
  }

  if (typeof motionPreference.addEventListener === "function") {
    motionPreference.addEventListener("change", onMotionChange);
  } else if (typeof motionPreference.addListener === "function") {
    motionPreference.addListener(onMotionChange);
  }
})();
