// Chargeur Node de Grammalecte.
//
// Il monte Grammalecte dans un contexte « vm », y injecte grammar-rules.js —
// le même fichier de règles que l'extension charge dans son Worker — puis
// expose l'API du moteur. Toute la logique de correction vit dans
// grammar-rules.js ; ce fichier ne s'occupe que du chargement.

import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(PROJECT_DIR, ".vendor", "grammalecte-js");
const GRAMMALECTE_DIR = path.join(ROOT, "grammalecte");
const RULES_PATH = path.join(PROJECT_DIR, "grammar-rules.js");
const V8_CACHE_DIR = path.join(PROJECT_DIR, ".cache", "v8");
// Seuls les gros fichiers méritent un cache de compilation sur disque.
const V8_CACHE_MIN_SOURCE_LENGTH = 128 * 1024;

// L'ordre compte : chaque script s'appuie sur les globales du précédent.
// L'extension charge exactement la même liste dans son Worker.
const SCRIPT_PATHS = [
  "graphspell/helpers.js",
  "graphspell/str_transform.js",
  "graphspell/char_player.js",
  "graphspell/lexgraph_fr.js",
  "graphspell/ibdawg.js",
  "graphspell/spellchecker.js",
  "text.js",
  "graphspell/tokenizer.js",
  "fr/conj.js",
  "fr/mfsp.js",
  "fr/phonet.js",
  "fr/cregex.js",
  "fr/gc_options.js",
  "fr/gc_functions.js",
  "fr/gc_rules.js",
  "fr/gc_rules_graph.js",
  "fr/gc_engine.js"
];

let engine = null;

export function initializeGrammarEngine() {
  if (engine) return engine;

  const silentConsole = {
    log: () => {},
    warn: (...args) => console.warn("[Grammalecte]", ...args),
    error: (...args) => console.error("[Grammalecte]", ...args)
  };
  // Un contexte « vm » ne contient que les intrinsèques du langage.
  // « performance », que les règles utilisent pour se chronométrer, est un
  // objet de l'hôte : le Worker du navigateur le fournit, pas ce contexte.
  const context = vm.createContext({ console: silentConsole, performance });
  context.self = context;

  for (const relativePath of SCRIPT_PATHS) {
    const absolutePath = path.join(GRAMMALECTE_DIR, relativePath);
    const source = fs.readFileSync(absolutePath, "utf8");
    compileWithDiskCache(source, absolutePath, relativePath).runInContext(context);

    if (relativePath === "graphspell/helpers.js") {
      context.helpers.loadFile = (filePath) => fs.readFileSync(filePath, "utf8");
    }
  }

  loadDataFile(context, "conj", "fr/conj_data.json");
  loadDataFile(context, "phonet", "fr/phonet_data.json");
  loadDataFile(context, "mfsp", "fr/mfsp_data.json");
  context.gc_engine.load(
    "JavaScript",
    "aHSL",
    path.join(GRAMMALECTE_DIR, "graphspell", "_dictionaries")
  );

  // Les règles rejoignent le contexte où Grammalecte vient d'être monté :
  // elles y trouvent « gc_engine » comme globale, exactement comme dans le
  // Worker de l'extension.
  const rulesSource = fs.readFileSync(RULES_PATH, "utf8");
  vm.runInContext(rulesSource, context, { filename: RULES_PATH });

  engine = {
    grammar: context.gc_engine,
    spellChecker: context.gc_engine.getSpellChecker(),
    rules: context.korrRules
  };
  return engine;
}

export function correctFrenchText(text) {
  return initializeGrammarEngine().rules.correctFrenchText(text);
}

export function analyzeFrenchText(text) {
  return initializeGrammarEngine().rules.analyzeFrenchText(text);
}

// Compile un script Grammalecte en réutilisant le bytecode V8 mis en cache :
// le plus gros fichier de règles passe ainsi de ~800 ms à ~0 ms de compilation.
// V8 valide lui-même le cache (source ou version de Node modifiée → rejet),
// il est alors régénéré silencieusement.
function compileWithDiskCache(source, absolutePath, relativePath) {
  if (source.length < V8_CACHE_MIN_SOURCE_LENGTH) {
    return new vm.Script(source, { filename: absolutePath });
  }

  const cachePath = path.join(V8_CACHE_DIR, `${relativePath.replace(/[\\/]/gu, "_")}.v8`);
  let cachedData;
  try {
    cachedData = fs.readFileSync(cachePath);
  } catch {
    // Premier démarrage : le cache n'existe pas encore.
  }

  const script = new vm.Script(source, { filename: absolutePath, cachedData });
  if (!cachedData || script.cachedDataRejected) {
    try {
      fs.mkdirSync(V8_CACHE_DIR, { recursive: true });
      fs.writeFileSync(cachePath, script.createCachedData());
    } catch {
      // Disque en lecture seule ou plein : on repart simplement sans cache.
    }
  }
  return script;
}

function loadDataFile(context, moduleName, relativePath) {
  context[moduleName].init(fs.readFileSync(path.join(GRAMMALECTE_DIR, relativePath), "utf8"));
}
