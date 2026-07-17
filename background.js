const BACKEND_URL = "http://127.0.0.1:8787";
const DEFAULT_MODEL = "gemma3:4b";
const DEFAULT_MODE = "instant";
const DEFAULT_STYLE = "corriger";
const MAX_INPUT_CHARACTERS = 20_000;

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === "CHECK_BACKEND") {
    checkBackend()
      .then((data) => sendResponse({ ok: true, ...data }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
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

async function correctText(rawText) {
  const text = typeof rawText === "string" ? rawText : "";
  if (!text.trim()) throw new Error("Aucun texte à corriger.");
  if (text.length > MAX_INPUT_CHARACTERS) {
    throw new Error(`Le texte est trop long (maximum ${MAX_INPUT_CHARACTERS.toLocaleString("fr-FR")} caractères).`);
  }

  const { mode = DEFAULT_MODE, style = DEFAULT_STYLE } =
    await chrome.storage.local.get(["mode", "style"]);

  let response;
  try {
    response = await fetch(`${BACKEND_URL}/api/correct`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        mode,
        style,
        model: DEFAULT_MODEL,
        text
      })
    });
  } catch {
    throw new Error("Backend local inaccessible. Lance d'abord « npm start » dans le dossier du projet.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error || `Erreur du backend (${response.status}).`);
  }

  const correctedText = data.text;
  if (!correctedText) {
    throw new Error("Le correcteur local n'a renvoyé aucun texte corrigé.");
  }

  return {
    text: correctedText,
    engine: data.engine || "ollama",
    style: data.style,
    durationMs: data.durationMs,
    fallback: data.fallback
  };
}

async function checkBackend() {
  let response;
  try {
    response = await fetch(`${BACKEND_URL}/api/health`);
  } catch {
    throw new Error("Backend arrêté");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error || "Backend indisponible");
  return data;
}
