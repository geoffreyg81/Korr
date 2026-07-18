// Interface du correcteur en ligne.
//
// Le moteur est exactement celui de l'extension : grammalecte-worker.js charge
// Grammalecte puis grammar-rules.js dans un Web Worker. La page ne fait aucune
// requête vers un serveur d'analyse — il n'y en a pas.

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
const installButton = document.getElementById("install");
const installHint = document.getElementById("install-hint");

const SAMPLE = `slt, jpe pa venir a la réunion dmn dsl pour le retard.

Les décisions importantes que la direction a pris la semaine dernière, nous nous sommes rendus compte trop tard qu'elles étaient mauvaises. Si j'aurais su, je n'y serai pas aller. Bien que le directeur a validé le projet, j'ai préféré de ne rien dire. Il faut pallier aux problèmes rapidement!`;

const worker = new Worker("grammalecte-worker.js");
const pending = new Map();
let nextId = 1;
let ready = false;

worker.addEventListener("message", (event) => {
  const { id, ...payload } = event.data || {};
  const resolve = pending.get(id);
  if (!resolve) return;
  pending.delete(id);
  resolve(payload);
});

worker.addEventListener("error", (event) => {
  setState(`Le correcteur n'a pas pu se charger : ${event.message}`, "is-error");
  correctButton.disabled = true;
  for (const [id, resolve] of pending) {
    resolve({ ok: false, error: "moteur indisponible" });
    pending.delete(id);
  }
});

function ask(type, text) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    worker.postMessage({ id, type, text });
  });
}

function setState(message, className = "") {
  engineState.textContent = message;
  engineState.className = `engine-state ${className}`.trim();
}

// Le chargement du dictionnaire est le seul moment un peu long : on le lance
// tout de suite pour qu'il soit terminé avant la première correction.
(async () => {
  const started = performance.now();
  const response = await ask("PING");
  if (!response.ok) {
    setState(response.error || "Le correcteur n'a pas pu se charger.", "is-error");
    return;
  }
  ready = true;
  correctButton.disabled = false;
  setState(`Correcteur prêt en ${Math.round(performance.now() - started)} ms · hors ligne`, "is-ready");
})();

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

  const response = await ask("CORRECT", text);

  correctButton.disabled = false;
  correctButton.textContent = previousLabel;

  if (!response.ok) {
    setState(response.error || "La correction a échoué.", "is-error");
    return;
  }

  output.value = response.text;
  result.hidden = false;

  const count = Number(response.corrections) || 0;
  summary.textContent = response.text === text
    ? "Aucune faute détectée"
    : `${count} correction${count > 1 ? "s" : ""} · ${Math.round(response.durationMs)} ms`;
  result.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

correctButton.addEventListener("click", runCorrection);

// Ctrl+Entrée depuis la zone de saisie.
input.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    event.preventDefault();
    runCorrection();
  }
});

sampleButton.addEventListener("click", () => {
  input.value = SAMPLE;
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

// Installation en application (PWA).
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

// Mise en cache hors ligne.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("sw.js").catch(() => {
      // Sans service worker, le site fonctionne, mais uniquement en ligne.
    });
  });
}
