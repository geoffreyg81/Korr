// Moteur italien pour Node : installe les règles et expose
// correctItalianText(). Contrairement à l'espagnol, l'italien n'utilise aucun
// dictionnaire Hunspell (nspell ne parvient pas à compiler dictionary-it en un
// temps raisonnable) : tout repose sur les règles de italian-rules.js. Le
// pendant navigateur est italian-worker.js ; les deux partagent le même fichier
// de règles.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));

let engine = null;

export function initializeItalianEngine() {
  if (engine) return engine;

  // italian-rules.js est un script classique qui s'installe sur globalThis.
  const source = fs.readFileSync(path.join(PROJECT_DIR, "italian-rules.js"), "utf8");
  new Function(source).call(globalThis);

  engine = { rules: globalThis.korrItalianRules };
  return engine;
}

export function correctItalianText(text) {
  return initializeItalianEngine().rules.correctItalianText(text);
}
