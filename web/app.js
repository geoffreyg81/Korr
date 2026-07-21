// Interface du correcteur français et anglais, entièrement hors ligne.

"use strict";

const input = document.getElementById("input");
const output = document.getElementById("output");
const result = document.getElementById("result");
const summary = document.getElementById("summary");
const engineState = document.getElementById("engine-state");
const correctButton = document.getElementById("correct");
const mixedChoice = document.getElementById("mixed-choice");
const copyButton = document.getElementById("copy");
const reuseButton = document.getElementById("reuse");
const sampleButton = document.getElementById("sample");
const languageSelect = document.getElementById("language");
const installButton = document.getElementById("install");
const installHint = document.getElementById("install-hint");
const i18n = globalThis.korrI18n;
const t = (key, values) => i18n.t(key, values);
const PWA_REFRESH_DRAFT = "korr-pwa-refresh-draft";

const FRENCH_SAMPLE = `Salut, je ne peux pas venir à la réunion demain, désolé pour le retard.

Les décisions importantes que la direction a pris la semaine dernière, nous nous sommes rendus compte trop tard qu'elles étaient mauvaises. Si j'aurais su, je n'y serai pas aller. Bien que le directeur a validé le projet, j'ai préféré de ne rien dire.`;
const ENGLISH_SAMPLE = `Hello, I have went home yesterday and I could of called you sooner. This solution is alot better, but their is still a few problems to solve.`;

let stateTranslation = { key: "loading", values: {}, className: "" };
let summaryTranslation = null;
const WORKER_TIMEOUT_MS = 60_000;

importSharedText();
restoreRefreshDraft();

function setState(key, values = {}, className = "") {
  stateTranslation = { key, values, className };
  engineState.textContent = t(key, values);
  engineState.className = `engine-state ${className}`.trim();
}

window.addEventListener("korr:locale", () => {
  const { key, values, className } = stateTranslation;
  setState(key, values, className);
  if (summaryTranslation) {
    summary.textContent = t(summaryTranslation.key, summaryTranslation.values);
  }
});

function createWorkerClient(url, options, onFatal) {
  const worker = new Worker(url, options);
  const pending = new Map();
  let nextId = 1;
  let failed = false;

  const fail = (message) => {
    if (failed) return;
    failed = true;
    worker.terminate();
    setState("loadError", { error: message }, "is-error");
    for (const [id, entry] of pending) {
      clearTimeout(entry.timer);
      entry.resolve({ ok: false, error: message });
      pending.delete(id);
    }
    onFatal?.();
  };

  worker.addEventListener("message", (event) => {
    const { id, ...payload } = event.data || {};
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    entry.resolve(payload);
  });

  worker.addEventListener("error", (event) => {
    fail(event.message || t("engineUnavailable"));
  });

  return (type, text) => new Promise((resolve) => {
    if (failed) {
      resolve({ ok: false, error: t("engineUnavailable") });
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => fail(t("engineTimeout")), WORKER_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    worker.postMessage({ id, type, text });
  });
}

let askFrench = null;
let askEnglish = null;
let englishReady = false;

function englishClient() {
  if (!askEnglish) {
    askEnglish = createWorkerClient("harper-worker.js", { type: "module" }, () => {
      askEnglish = null;
      englishReady = false;
    });
  }
  return askEnglish;
}

function frenchClient() {
  if (!askFrench) {
    askFrench = createWorkerClient("grammalecte-worker.js", undefined, () => {
      askFrench = null;
    });
  }
  return askFrench;
}

// Espagnol : moteur isolé, chargé seulement à la première demande, sans aucune
// incidence sur les chemins français et anglais.
let askSpanish = null;
function spanishClient() {
  if (!askSpanish) {
    askSpanish = createWorkerClient("spanish-worker.js", { type: "module" }, () => {
      askSpanish = null;
    });
  }
  return askSpanish;
}

// Italien : même principe, mais sans dictionnaire (règles seules), donc prêt
// instantanément à la première correction.
let askItalian = null;
function italianClient() {
  if (!askItalian) {
    askItalian = createWorkerClient("italian-worker.js", { type: "module" }, () => {
      askItalian = null;
    });
  }
  return askItalian;
}

(async () => {
  await prepareOfflineRuntime();
  // L'interface devient utilisable avant la chauffe du français. Ainsi, une
  // panne isolée de Grammalecte ne bloque jamais une correction anglaise.
  correctButton.disabled = false;
  const started = performance.now();
  const response = await frenchClient()("PING");
  if (!response.ok) {
    setState("loadError", { error: response.error || t("engineUnavailable") }, "is-error");
    return;
  }
  setState("readyMs", { ms: Math.round(performance.now() - started) }, "is-ready");
})();

languageSelect.value = localStorage.getItem("korr-language") || "auto";
languageSelect.addEventListener("change", () => {
  localStorage.setItem("korr-language", languageSelect.value);
  setState(languageSelect.value === "en" && !englishReady ? "harperFirst" : "ready", {}, "is-ready");
});

// « forced » court-circuite la détection : c'est ce que renvoient les deux
// boutons proposés quand le texte est réellement bilingue.
async function runCorrection(forced) {
  const text = input.value;
  if (!text.trim()) {
    input.focus();
    return;
  }
  correctButton.disabled = true;
  correctButton.textContent = t("correcting");

  const language = forced
    || (languageSelect.value === "auto"
      ? globalThis.korrLanguage.detectLanguage(text)
      : languageSelect.value);
  if (language === "mixed") {
    // Envoyer un texte bilingue à un seul dictionnaire ferait « corriger » les
    // mots de l'autre langue. Plutôt que de renvoyer l'utilisateur vers le
    // menu déroulant, on lui pose directement la question.
    correctButton.disabled = false;
    correctButton.textContent = t("correct");
    setState("mixedDetected", {}, "is-warning");
    mixedChoice.hidden = false;
    result.hidden = true;
    mixedChoice.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  mixedChoice.hidden = true;
  if (language === "en" && !englishReady) correctButton.textContent = t("loadingHarper");
  const client = language === "en" ? englishClient()
    : language === "es" ? spanishClient()
    : language === "it" ? italianClient()
    : frenchClient();
  const response = await client("CORRECT", text);
  if (language === "en" && response.ok) englishReady = true;

  correctButton.disabled = false;
  correctButton.textContent = t("correct");

  if (!response.ok) {
    setState("correctionFailed", {}, "is-error");
    return;
  }

  const engineState = language === "en" ? "engineEnglish"
    : language === "es" ? "engineSpanish"
    : language === "it" ? "engineItalian"
    : "engineFrench";
  setState(engineState, {}, "is-ready");
  output.value = response.text;
  result.hidden = false;
  const count = Number(response.corrections) || 0;
  summaryTranslation = response.text === text
    ? { key: "noErrors", values: {} }
    : {
      key: count === 1 ? "correctionOne" : "correctionMany",
      values: { count, ms: Math.round(response.durationMs) }
    };
  summary.textContent = t(summaryTranslation.key, summaryTranslation.values);
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

correctButton.addEventListener("click", () => runCorrection());
// Le choix explicite se retient : l'utilisateur qui écrit régulièrement en
// bilingue n'a pas à répondre à la même question à chaque correction.
for (const [id, locale] of [["force-fr", "fr"], ["force-en", "en"]]) {
  document.getElementById(id)?.addEventListener("click", () => {
    languageSelect.value = locale;
    localStorage.setItem("korr-language", locale);
    mixedChoice.hidden = true;
    runCorrection(locale);
  });
}
input.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runCorrection();
  }
});
sampleButton.addEventListener("click", () => {
  const useEnglishSample = languageSelect.value === "en" ||
    (languageSelect.value === "auto" && i18n.locale === "en");
  input.value = useEnglishSample ? ENGLISH_SAMPLE : FRENCH_SAMPLE;
  input.focus();
  runCorrection();
});
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyButton.textContent = t("copied");
  } catch {
    output.select();
    copyButton.textContent = t("selected");
  }
  setTimeout(() => { copyButton.textContent = t("copy"); }, 1800);
});
reuseButton.addEventListener("click", () => {
  input.value = output.value;
  result.hidden = true;
  input.focus();
});

let installPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  installPrompt = event;
  installButton.hidden = false;
  installHint.hidden = true;
});
installButton.addEventListener("click", async () => {
  if (!installPrompt) return;
  installPrompt.prompt();
  await installPrompt.userChoice;
  installPrompt = null;
  installButton.hidden = true;
});
window.addEventListener("appinstalled", () => {
  installButton.hidden = true;
  installHint.dataset.i18n = "installed";
  installHint.textContent = t("installed");
  installHint.hidden = false;
});

if (window.matchMedia("(display-mode: standalone)").matches) {
  installHint.dataset.i18n = "installed";
  installHint.textContent = t("installed");
}

function importSharedText() {
  const url = new URL(window.location.href);
  const title = url.searchParams.get("title")?.trim() || "";
  const text = url.searchParams.get("text")?.trim() || "";
  const shared = [title, text].filter(Boolean).join("\n\n");
  if (!shared) return;
  input.value = shared;
  url.searchParams.delete("title");
  url.searchParams.delete("text");
  history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
}

async function prepareOfflineRuntime() {
  if (!("serviceWorker" in navigator)) return;
  let hadController = Boolean(navigator.serviceWorker.controller);
  let refreshing = false;
  const refreshForNewWorker = () => {
    // La première installation ne recharge pas la page. Pour une mise à jour,
    // le nouveau worker doit recharger une fois les scripts déjà chargés par
    // l'ancien worker. Le garde empêche toute boucle de rechargement.
    if (!hadController) {
      hadController = true;
      return;
    }
    if (refreshing) return;
    refreshing = true;
    preserveRefreshDraft();
    window.location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", refreshForNewWorker);
  try {
    const registration = await navigator.serviceWorker.register("sw.js", { updateViaCache: "none" });
    registration.waiting?.postMessage({ type: "SKIP_WAITING" });
  } catch {
    navigator.serviceWorker.removeEventListener("controllerchange", refreshForNewWorker);
    // Le correcteur reste utilisable en ligne même si le cache PWA échoue.
  }
}

function preserveRefreshDraft() {
  try {
    if (input.value) sessionStorage.setItem(PWA_REFRESH_DRAFT, input.value);
  } catch {
    // Le stockage peut être désactivé sans empêcher la mise à jour.
  }
}

function restoreRefreshDraft() {
  try {
    const draft = sessionStorage.getItem(PWA_REFRESH_DRAFT);
    sessionStorage.removeItem(PWA_REFRESH_DRAFT);
    if (!input.value && draft) input.value = draft;
  } catch {
    // Rien à restaurer lorsque le stockage est désactivé.
  }
}
