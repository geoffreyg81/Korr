// Worker de correction : Grammalecte et les règles de Korr, chargés
// dans le navigateur - sans backend Node.
//
// Grammalecte a été conçu pour tourner ici : « helpers.loadFile » lit ses
// données par XMLHttpRequest synchrone, ce qui n'est autorisé que dans un
// Worker. C'est aussi pourquoi le service worker MV3 ne peut pas héberger le
// moteur : il n'a pas XMLHttpRequest.

"use strict";

const GRAMMALECTE_DIR = "vendor/grammalecte/";

// Même ordre que le chargeur Node : chaque script s'appuie sur le précédent.
importScripts(
  GRAMMALECTE_DIR + "graphspell/helpers.js",
  GRAMMALECTE_DIR + "graphspell/str_transform.js",
  GRAMMALECTE_DIR + "graphspell/char_player.js",
  GRAMMALECTE_DIR + "graphspell/lexgraph_fr.js",
  GRAMMALECTE_DIR + "graphspell/ibdawg.js",
  GRAMMALECTE_DIR + "graphspell/spellchecker.js",
  GRAMMALECTE_DIR + "text.js",
  GRAMMALECTE_DIR + "graphspell/tokenizer.js",
  GRAMMALECTE_DIR + "fr/conj.js",
  GRAMMALECTE_DIR + "fr/mfsp.js",
  GRAMMALECTE_DIR + "fr/phonet.js",
  GRAMMALECTE_DIR + "fr/cregex.js",
  GRAMMALECTE_DIR + "fr/gc_options.js",
  GRAMMALECTE_DIR + "fr/gc_functions.js",
  GRAMMALECTE_DIR + "fr/gc_rules.js",
  GRAMMALECTE_DIR + "fr/gc_rules_graph.js",
  GRAMMALECTE_DIR + "fr/gc_engine.js"
);

let ready = false;

function initialize() {
  if (ready) return;

  // Les fichiers de données se lisent par la même voie que les scripts.
  const load = (relativePath) => helpers.loadFile(GRAMMALECTE_DIR + relativePath);
  conj.init(load("fr/conj_data.json"));
  phonet.init(load("fr/phonet_data.json"));
  mfsp.init(load("fr/mfsp_data.json"));
  gc_engine.load("JavaScript", "aHSL", GRAMMALECTE_DIR + "graphspell/_dictionaries");

  // Les règles trouvent « gc_engine » dans la portée globale du Worker,
  // exactement comme dans le contexte « vm » du backend Node.
  importScripts("grammar-rules.js");
  ready = true;
}

self.addEventListener("message", (event) => {
  const { id, type, text } = event.data || {};

  try {
    initialize();
  } catch (error) {
    self.postMessage({ id, ok: false, error: `Chargement du moteur impossible : ${error.message}` });
    return;
  }

  if (type === "PING") {
    self.postMessage({ id, ok: true, ready: true });
    return;
  }

  if (type !== "CORRECT") {
    self.postMessage({ id, ok: false, error: "Requête inconnue." });
    return;
  }

  try {
    const result = self.korrRules.correctFrenchText(text);
    self.postMessage({ id, ok: true, ...result, engine: "grammalecte" });
  } catch (error) {
    self.postMessage({ id, ok: false, error: error.message });
  }
});
