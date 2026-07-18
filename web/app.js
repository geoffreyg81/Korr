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

const SAMPLE = `Salut, je ne peux pas venir à la réunion demain, désolé pour le retard.

Les décisions importantes que la direction a pris la semaine dernière, nous nous sommes rendus compte trop tard qu'elles étaient mauvaises. Si j'aurais su, je n'y serai pas aller. Bien que le directeur a validé le projet, j'ai préféré de ne rien dire.`;

function setState(message, className = "") {
  engineState.textContent = message;
  engineState.className = `engine-state ${className}`.trim();
}

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
    setState(`Le correcteur n'a pas pu se charger : ${event.message}`, "is-error");
    for (const [id, resolve] of pending) {
      resolve({ ok: false, error: "Moteur indisponible." });
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
    setState(response.error || "Le correcteur n'a pas pu se charger.", "is-error");
    return;
  }
  ready = true;
  correctButton.disabled = false;
  setState(`Correcteur prêt en ${Math.round(performance.now() - started)} ms · hors ligne`, "is-ready");
})();

languageSelect.value = localStorage.getItem("korr-language") || "auto";
languageSelect.addEventListener("change", () => {
  localStorage.setItem("korr-language", languageSelect.value);
  setState(languageSelect.value === "en" && !englishReady
    ? "Harper sera chargé à la première correction anglaise · hors ligne"
    : "Correcteur prêt · hors ligne", "is-ready");
});

async function runCorrection() {
  const text = input.value;
  if (!text.trim()) {
    input.focus();
    return;
  }
  if (!ready) return;

  correctButton.disabled = true;
  const previousLabel = correctButton.textContent;
  correctButton.textContent = "Correction…";

  const language = languageSelect.value === "auto"
    ? globalThis.korrLanguage.detectLanguage(text)
    : languageSelect.value;
  if (language === "en" && !englishReady) correctButton.textContent = "Chargement de Harper…";
  const response = await (language === "en" ? englishClient() : askFrench)("CORRECT", text);
  if (language === "en" && response.ok) englishReady = true;

  correctButton.disabled = false;
  correctButton.textContent = previousLabel;

  if (!response.ok) {
    setState(response.error || "La correction a échoué.", "is-error");
    return;
  }

  setState(`${language === "en" ? "Harper · English" : "Grammalecte · Français"} · hors ligne`, "is-ready");
  output.value = response.text;
  result.hidden = false;
  const count = Number(response.corrections) || 0;
  summary.textContent = response.text === text
    ? "Aucune faute détectée"
    : `${count} correction${count > 1 ? "s" : ""} · ${Math.round(response.durationMs)} ms`;
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
  input.value = SAMPLE;
  languageSelect.value = "auto";
  input.focus();
  runCorrection();
});
copyButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(output.value);
    copyButton.textContent = "Copié ✓";
  } catch {
    output.select();
    copyButton.textContent = "Sélectionné";
  }
  setTimeout(() => { copyButton.textContent = "Copier"; }, 1800);
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
  installHint.textContent = "Application installée ✓";
  installHint.hidden = false;
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {});
  });
}
