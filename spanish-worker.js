// Correcteur espagnol (beta), exécuté dans un Worker séparé.
// Le dictionnaire Hunspell n'est téléchargé qu'au premier texte espagnol.

import nspell from "./vendor/nspell/nspell.js";
import "./spanish-rules.js";

let setupPromise = null;

async function initialize() {
  if (!setupPromise) {
    setupPromise = (async () => {
      const [aff, dic] = await Promise.all([
        fetch("spanish.aff").then((r) => r.text()),
        fetch("spanish.dic").then((r) => r.text())
      ]);
      globalThis.korrSpanishRules.setSpellChecker(nspell(aff, dic));
    })();
  }
  return setupPromise;
}

self.addEventListener("message", async (event) => {
  const { id, type, text } = event.data || {};
  try {
    if (type === "PING") {
      await initialize();
      self.postMessage({ id, ok: true, ready: true, engine: "nspell" });
      return;
    }
    if (type !== "CORRECT") throw new Error("Requête inconnue.");
    await initialize();
    const result = globalThis.korrSpanishRules.correctSpanishText(String(text || ""));
    self.postMessage({ id, ok: true, ...result, engine: "nspell" });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || "Le moteur espagnol a échoué." });
  }
});
