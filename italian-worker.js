// Correcteur italien, exécuté dans un Worker séparé.
// Aucun dictionnaire n'est téléchargé : l'italien fonctionne uniquement avec
// les règles de italian-rules.js, ce qui le rend disponible instantanément.

import "./italian-rules.js";

self.addEventListener("message", (event) => {
  const { id, type, text } = event.data || {};
  try {
    if (type === "PING") {
      self.postMessage({ id, ok: true, ready: true, engine: "korr-it" });
      return;
    }
    if (type !== "CORRECT") throw new Error("Requête inconnue.");
    const result = globalThis.korrItalianRules.correctItalianText(String(text || ""));
    self.postMessage({ id, ok: true, ...result, engine: "korr-it" });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error?.message || "Le moteur italien a échoué." });
  }
});
