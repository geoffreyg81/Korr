// Hôte persistant des moteurs hors ligne de Korr.

"use strict";

const WORKER_TIMEOUT_MS = 60_000;

function createWorkerClient(url, options, onFatal) {
  const worker = new Worker(url, options);
  const pending = new Map();
  let nextId = 1;
  let failed = false;

  const fail = (message) => {
    if (failed) return;
    failed = true;
    worker.terminate();
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
    fail(`Moteur indisponible : ${event.message}`);
  });

  return (type, text) => new Promise((resolve) => {
    if (failed) {
      resolve({ ok: false, error: "Moteur indisponible." });
      return;
    }
    const id = nextId++;
    const timer = setTimeout(() => fail("Le moteur a mis trop de temps à répondre."), WORKER_TIMEOUT_MS);
    pending.set(id, { resolve, timer });
    worker.postMessage({ id, type, text });
  });
}

let askFrench = null;
let askEnglish = null;

function frenchClient() {
  if (!askFrench) {
    askFrench = createWorkerClient("grammalecte-worker.js", undefined, () => { askFrench = null; });
  }
  return askFrench;
}

function englishClient() {
  if (!askEnglish) {
    askEnglish = createWorkerClient("harper-worker.js", { type: "module" }, () => { askEnglish = null; });
  }
  return askEnglish;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;

  if (message.type === "PING") {
    frenchClient()("PING").then(sendResponse);
    return true;
  }

  const requested = ["fr", "en"].includes(message.language) ? message.language : "auto";
  const language = requested === "auto"
    ? globalThis.korrLanguage.detectLanguage(message.text)
    : requested;
  if (language === "mixed") {
    sendResponse({
      ok: true,
      text: String(message.text || ""),
      corrections: 0,
      durationMs: 0,
      engine: "mixed",
      language,
      fallback: "Texte français et anglais mélangé : choisissez la langue manuellement."
    });
    return false;
  }
  const ask = language === "en" ? englishClient() : frenchClient();

  ask("CORRECT", message.text).then((result) => sendResponse({ ...result, language }));
  return true;
});
