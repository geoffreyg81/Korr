// Interface du correcteur français et anglais, entièrement hors ligne.

"use strict";

const input = document.getElementById("input");
const output = document.getElementById("output");
const result = document.getElementById("result");
const summary = document.getElementById("summary");
const engineState = document.getElementById("engine-state");
const correctButton = document.getElementById("correct");
const copyButton = document.getElementById("copy");
const reuseButton = document.getElementById("reuse");
const sampleButton = document.getElementById("sample");
const languageSelect = document.getElementById("language");
const installButton = document.getElementById("install");
const installHint = document.getElementById("install-hint");
const i18n = globalThis.korrI18n;
const t = (key, values) => i18n.t(key, values);

const FRENCH_SAMPLE = `Salut, je ne peux pas venir à la réunion demain, désolé pour le retard.

Les décisions importantes que la direction a pris la semaine dernière, nous nous sommes rendus compte trop tard qu'elles étaient mauvaises. Si j'aurais su, je n'y serai pas aller. Bien que le directeur a validé le projet, j'ai préféré de ne rien dire.`;
const ENGLISH_SAMPLE = `Hello, I have went home yesterday and I could of called you sooner. This solution is alot better, but their is still a few problems to solve.`;

let stateTranslation = { key: "loading", values: {}, className: "" };
let summaryTranslation = null;
const WORKER_TIMEOUT_MS = 60_000;

importSharedText();

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
let ready = false;
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
      ready = false;
    });
  }
  return askFrench;
}

(async () => {
  await prepareOfflineRuntime();
  const started = performance.now();
  const response = await frenchClient()("PING");
  if (!response.ok) {
    setState("loadError", { error: response.error || t("engineUnavailable") }, "is-error");
    return;
  }
  ready = true;
  correctButton.disabled = false;
  setState("readyMs", { ms: Math.round(performance.now() - started) }, "is-ready");
})();

languageSelect.value = localStorage.getItem("korr-language") || "auto";
languageSelect.addEventListener("change", () => {
  localStorage.setItem("korr-language", languageSelect.value);
  setState(languageSelect.value === "en" && !englishReady ? "harperFirst" : "ready", {}, "is-ready");
});

async function runCorrection() {
  const text = input.value;
  if (!text.trim()) {
    input.focus();
    return;
  }
  if (!ready) return;

  correctButton.disabled = true;
  correctButton.textContent = t("correcting");

  const language = languageSelect.value === "auto"
    ? globalThis.korrLanguage.detectLanguage(text)
    : languageSelect.value;
  if (language === "mixed") {
    correctButton.disabled = false;
    correctButton.textContent = t("correct");
    setState("mixedDetected", {}, "is-warning");
    output.value = text;
    result.hidden = false;
    summaryTranslation = { key: "mixedHelp", values: {} };
    summary.textContent = t(summaryTranslation.key);
    result.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return;
  }
  if (language === "en" && !englishReady) correctButton.textContent = t("loadingHarper");
  const response = await (language === "en" ? englishClient() : frenchClient())("CORRECT", text);
  if (language === "en" && response.ok) englishReady = true;

  correctButton.disabled = false;
  correctButton.textContent = t("correct");

  if (!response.ok) {
    setState("correctionFailed", {}, "is-error");
    return;
  }

  setState(language === "en" ? "engineEnglish" : "engineFrench", {}, "is-ready");
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

correctButton.addEventListener("click", runCorrection);
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
  try {
    await navigator.serviceWorker.register("sw.js");
    await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(resolve, 8_000))
    ]);
    if (!navigator.serviceWorker.controller) {
      await Promise.race([
        new Promise((resolve) => navigator.serviceWorker.addEventListener("controllerchange", resolve, { once: true })),
        new Promise((resolve) => setTimeout(resolve, 2_000))
      ]);
    }
  } catch {
    // Le correcteur reste utilisable en ligne même si le cache PWA échoue.
  }
}
