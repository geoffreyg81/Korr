// Moteur espagnol pour Node : charge nspell et le dictionnaire, installe les
// règles, et expose correctSpanishText(). Le pendant navigateur est
// spanish-worker.js ; les deux partagent spanish-rules.js.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DICT_DIR = path.join(PROJECT_DIR, "node_modules", "dictionary-es");

let engine = null;

export function initializeSpanishEngine() {
  if (engine) return engine;

  const nspell = require("nspell");
  const aff = fs.readFileSync(path.join(DICT_DIR, "index.aff"));
  const dic = fs.readFileSync(path.join(DICT_DIR, "index.dic"));
  const spell = nspell(aff, dic);

  // spanish-rules.js est un script classique qui s'installe sur globalThis.
  const source = fs.readFileSync(path.join(PROJECT_DIR, "spanish-rules.js"), "utf8");
  new Function(source).call(globalThis);
  globalThis.korrSpanishRules.setSpellChecker(spell);

  engine = { spell, rules: globalThis.korrSpanishRules };
  return engine;
}

export function correctSpanishText(text) {
  return initializeSpanishEngine().rules.correctSpanishText(text);
}
