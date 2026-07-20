// Correcteur anglais Harper, exécuté dans un Worker séparé.
// Le module WebAssembly n'est téléchargé et initialisé qu'au premier texte EN.

import { Dialect, LocalLinter } from "./vendor/harper/index.js";
import { binary } from "./vendor/harper/binary.js";
import "./language-detection.js";
import "./english-rules.js";

const linter = new LocalLinter({ binary, dialect: Dialect.American });
let setupPromise = null;

function initialize() {
  if (!setupPromise) {
    setupPromise = linter.setup().then(() => globalThis.korrEnglishRules.configureHarper(linter));
  }
  return setupPromise;
}

async function correctEnglishText(source) {
  const started = performance.now();
  await initialize();
  const { text, corrections } = await globalThis.korrEnglishRules.correctWithHarper(linter, source);

  return {
    text,
    corrections,
    durationMs: Math.round(performance.now() - started)
  };
}

self.addEventListener("message", async (event) => {
  const { id, type, text } = event.data || {};
  try {
    if (type === "PING") {
      await initialize();
      self.postMessage({ id, ok: true, ready: true, engine: "harper" });
      return;
    }
    if (type !== "CORRECT") throw new Error("Requête inconnue.");
    const result = await correctEnglishText(String(text || ""));
    self.postMessage({ id, ok: true, ...result, engine: "harper" });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || "Le moteur anglais a échoué." });
  }
});
