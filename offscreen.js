// Hôte du Worker de correction.
//
// Le service worker MV3 ne peut pas héberger Grammalecte : il est arrêté après
// quelques secondes d'inactivité et ne fournit pas XMLHttpRequest, dont
// « helpers.loadFile » a besoin. Ce document offscreen, lui, reste en vie et
// garde le moteur chaud entre deux corrections.

"use strict";

const worker = new Worker("grammalecte-worker.js");
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
  // Une erreur de chargement casse toutes les requêtes en attente.
  for (const [id, resolve] of pending) {
    resolve({ ok: false, error: `Moteur indisponible : ${event.message}` });
    pending.delete(id);
  }
});

function askWorker(type, text) {
  return new Promise((resolve) => {
    const id = nextId++;
    pending.set(id, resolve);
    worker.postMessage({ id, type, text });
  });
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target !== "offscreen") return false;

  askWorker(message.type === "PING" ? "PING" : "CORRECT", message.text).then(sendResponse);
  return true;
});
