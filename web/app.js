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

function createWorkerClient(url, options) {
  const worker = new Worker(url, options);
  const pending = new Map();
  let nextId = 1;

  worker.addEventListener("message", (event) => {
    const { id, ...payload } = event.data || {};
    const resolve = pending.get(id);
    if (!resolve) return;
    pending.delete(id);
    resolve(payload);
  });

  worker.addEventListener("error", (event) => {
    setState("loadError", { error: event.message }, "is-error");
    for (const [id, resolve] of pending) {
      resolve({ ok: false, error: t("engineUnavailable") });
      pending.delete(id);
    }
  });

  return (type, text) => new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    worker.postMessage({ id, type, text });
  });
}

const askFrench = createWorkerClient("grammalecte-worker.js");
let askEnglish = null;
let ready = false;
let englishReady = false;

function englishClient() {
  if (!askEnglish) askEnglish = createWorkerClient("harper-worker.js", { type: "module" });
  return askEnglish;
}

(async () => {
  const started = performance.now();
  const response = await askFrench("PING");
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
  if (language === "en" && !englishReady) correctButton.textContent = t("loadingHarper");
  const response = await (language === "en" ? englishClient() : askFrench)("CORRECT", text);
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
  installHint.textContent = t("installed");
  installHint.hidden = false;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
