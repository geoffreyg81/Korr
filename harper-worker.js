// Correcteur anglais Harper, exécuté dans un Worker séparé.
// Le module WebAssembly n'est téléchargé et initialisé qu'au premier texte EN.

import { Dialect, LocalLinter } from "./vendor/harper/index.js";
import { binary } from "./vendor/harper/binary.js";

const linter = new LocalLinter({ binary, dialect: Dialect.American });
let setupPromise = null;

function initialize() {
  if (!setupPromise) setupPromise = linter.setup();
  return setupPromise;
}

async function correctEnglishText(source) {
  const started = performance.now();
  await initialize();
  const lints = await linter.lint(source, { language: "plaintext" });
  const applicable = lints
    .filter((lint) => lint.suggestion_count() > 0)
    .sort((left, right) => right.span().start - left.span().start);

  let text = source;
  let corrections = 0;
  let nextBoundary = Infinity;

  // De droite à gauche, les positions des erreurs restantes ne bougent pas.
  // Les diagnostics qui se chevauchent sont ignorés pour éviter une double
  // modification incertaine de la même portion.
  for (const lint of applicable) {
    const span = lint.span();
    if (span.end > nextBoundary) continue;
    const suggestion = lint.suggestions()[0];
    const updated = await linter.applySuggestion(text, lint, suggestion);
    if (updated !== text) {
      text = updated;
      corrections += 1;
      nextBoundary = span.start;
    }
  }

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
