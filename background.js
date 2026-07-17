// Service worker : aiguille les corrections vers le moteur local (embarqué) ou
// vers le backend Ollama quand un style de réécriture est demandé.
//
// Le moteur local vit dans un document offscreen, seul endroit d'une extension
// MV3 où Grammalecte peut tourner : le service worker n'a pas XMLHttpRequest et
// s'arrête tout seul après quelques secondes.

const BACKEND_URL = "http://127.0.0.1:8787";
const DEFAULT_MODEL = "gemma3:4b";
const DEFAULT_STYLE = "corriger";
const MAX_INPUT_CHARACTERS = 20_000;
const BACKEND_PROBE_TIMEOUT_MS = 1_500;

let offscreenReady = null;

async function ensureOffscreen() {
  if (offscreenReady) return offscreenReady;

  offscreenReady = (async () => {
    const contexts = await chrome.runtime.getContexts({ contextTypes: ["OFFSCREEN_DOCUMENT"] });
    if (contexts.length) return;
    await chrome.offscreen.createDocument({
      url: "offscreen.html",
      reasons: ["WORKERS"],
      justification: "Faire tourner le correcteur Grammalecte hors ligne."
    });
  })();

  try {
    await offscreenReady;
  } catch (error) {
    // Une création concurrente a pu gagner la course ; on réessaiera sinon.
    offscreenReady = null;
    if (!/single offscreen/i.test(error?.message || "")) throw error;
  }
  return offscreenReady;
}

async function correctLocally(text) {
  await ensureOffscreen();
  const result = await chrome.runtime.sendMessage({ target: "offscreen", type: "CORRECT", text });
  if (!result?.ok) throw new Error(result?.error || "Le moteur local n'a pas répondu.");
  return result;
}

// Le backend n'est pas nécessaire : on ne le sollicite que pour les styles de
// réécriture, et son absence se traduit par un repli sur le moteur local.
async function isBackendAvailable() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/health`, {
      signal: AbortSignal.timeout(BACKEND_PROBE_TIMEOUT_MS)
    });
    if (!response.ok) return false;
    const data = await response.json();
    return Boolean(data?.ollama);
  } catch {
    return false;
  }
}

async function correctWithBackend(text, style) {
  const response = await fetch(`${BACKEND_URL}/api/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "deep", style, model: DEFAULT_MODEL, text })
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || `Erreur du backend (${response.status}).`);
  if (!data.text) throw new Error("Le backend n'a renvoyé aucun texte.");
  return { text: data.text, engine: data.engine, style: data.style, durationMs: data.durationMs, fallback: data.fallback };
}

async function correctText(rawText) {
  const text = typeof rawText === "string" ? rawText : "";
  if (!text.trim()) throw new Error("Aucun texte à corriger.");
  if (text.length > MAX_INPUT_CHARACTERS) {
    throw new Error(`Le texte est trop long (maximum ${MAX_INPUT_CHARACTERS.toLocaleString("fr-FR")} caractères).`);
  }

  const { style = DEFAULT_STYLE } = await chrome.storage.local.get("style");
  if (style === DEFAULT_STYLE) return correctLocally(text);

  // Style de réécriture : il exige l'IA, donc le backend.
  try {
    return await correctWithBackend(text, style);
  } catch {
    const local = await correctLocally(text);
    return { ...local, fallback: "Backend IA indisponible · corrigé par le moteur local." };
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.target === "offscreen") return false;

  if (message?.type === "CHECK_BACKEND") {
    isBackendAvailable()
      .then((ollama) => sendResponse({ ok: true, ollama }))
      .catch(() => sendResponse({ ok: true, ollama: false }));
    return true;
  }

  if (message?.type !== "CORRECT_TEXT") return false;

  correctText(message.text)
    .then((result) => sendResponse({ ok: true, ...result }))
    .catch((error) => sendResponse({ ok: false, error: error.message }));

  return true;
});

chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "correct-text") return;

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;

  try {
    await chrome.tabs.sendMessage(tab.id, { type: "TRIGGER_CORRECTION" });
  } catch {
    // Les pages internes du navigateur n'autorisent pas les scripts d'extension.
  }
});

// Prépare le moteur dès l'installation et au démarrage du navigateur : la
// première correction n'attend pas les deux secondes de chargement.
chrome.runtime.onInstalled.addListener(() => { ensureOffscreen().catch(() => {}); });
chrome.runtime.onStartup.addListener(() => { ensureOffscreen().catch(() => {}); });
