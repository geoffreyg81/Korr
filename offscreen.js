// Hôte persistant des moteurs hors ligne de Korr.

"use strict";

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
    for (const [id, resolve] of pending) {
      resolve({ ok: false, error: `Moteur indisponible : ${event.message}` });
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

function englishClient() {
  if (!askEnglish) askEnglish = createWorkerClient("harper-worker.js", { type: "module" });
  return askEnglish;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;

  if (message.type === "PING") {
    askFrench("PING").then(sendResponse);
    return true;
  }

  const requested = ["fr", "en"].includes(message.language) ? message.language : "auto";
  const language = requested === "auto"
    ? globalThis.korrLanguage.detectLanguage(message.text)
    : requested;
  const ask = language === "en" ? englishClient() : askFrench;

  ask("CORRECT", message.text).then((result) => sendResponse({ ...result, language }));
  return true;
});
