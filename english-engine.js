// Moteur anglais partagé par le backend Node et l'application Windows.
// Harper reste chargé en mémoire après la première correction pour que les
// appels suivants soient rapides. Le binaire WASM intégré évite les problèmes
// de chemin rencontrés avec un fichier .wasm séparé sous Windows.

import "./english-rules.js";

let setupPromise = null;
let linter = null;

export async function initializeEnglishEngine() {
  if (!setupPromise) setupPromise = createLinter();
  await setupPromise;
  return linter;
}

export async function correctEnglishText(source) {
  const started = performance.now();
  const textSource = String(source || "");
  const activeLinter = await initializeEnglishEngine();
  const { text, corrections } = await globalThis.korrEnglishRules.correctWithHarper(activeLinter, textSource);

  return {
    text,
    corrections,
    durationMs: Math.round(performance.now() - started)
  };
}

async function createLinter() {
  let harper;
  let binaryModule;

  try {
    [harper, binaryModule] = await Promise.all([
      import("harper.js"),
      import("harper.js/binaryInlined")
    ]);
  } catch {
    // Le paquet Windows autonome n'embarque pas node_modules. Le build copie
    // seulement les trois fichiers Harper nécessaires dans vendor/harper.
    [harper, binaryModule] = await Promise.all([
      import("./vendor/harper/index.js"),
      import("./vendor/harper/binaryInlined.js")
    ]);
  }

  linter = new harper.LocalLinter({
    binary: binaryModule.binaryInlined,
    dialect: harper.Dialect.American
  });
  await linter.setup();
  await globalThis.korrEnglishRules.configureHarper(linter);
}
