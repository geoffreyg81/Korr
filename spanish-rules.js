// Règles de correction espagnoles de Korr — beta.
//
// Contrairement au français (Grammalecte) et à l'anglais (Harper), l'espagnol
// ne dispose pas d'un moteur grammatical hors ligne complet. Cette beta repose
// donc sur deux piliers volontairement prudents :
//   1. un correcteur orthographique Hunspell (nspell + dictionary-es) ;
//   2. un jeu restreint de règles écrites à la main, chacune sans risque de
//      faux positif.
//
// Ce fichier est un script classique, sans import ni export : il s'installe
// sur globalThis, exactement comme grammar-rules.js et english-rules.js. Le
// correcteur orthographique lui est fourni par le Worker (navigateur) ou par
// le moteur Node (tests) via setSpellChecker().

"use strict";

(() => {
  let spell = null;
  const setSpellChecker = (checker) => { spell = checker; };

  const known = (word) => {
    if (!spell) return true; // sans dictionnaire, on ne touche à rien
    try { return spell.correct(word); } catch { return true; }
  };
  const suggest = (word) => {
    if (!spell) return [];
    try { return spell.suggest(word) || []; } catch { return []; }
  };

  // Fautes soudées et graphies qui n'existent pas en espagnol : chaque clé est
  // impossible, la substitution est donc sans ambiguïté.
  const FIXED = new Map(Object.entries({
    aver: "a ver", osea: "o sea", dehecho: "de hecho", enserio: "en serio",
    aveces: "a veces", porfavor: "por favor", almenos: "al menos",
    apartir: "a partir", entonses: "entonces", asike: "así que",
    tambien: "también", asi: "así", haci: "así", despues: "después",
    despues: "después", ademas: "además", quizas: "quizás", mas: "más",
    "por que": "porque", porke: "porque", xq: "porque", pq: "porque",
    tb: "también", tmb: "también", dnd: "dónde", tqm: "te quiero mucho",
    finde: "fin de semana", "de echo": "de hecho", "o sea que": "o sea que",
    aora: "ahora", oy: "hoy", weno: "bueno", vale: "vale"
  }));

  // Retire les diacritiques pour comparer deux graphies « à l'accent près ».
  const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLocaleLowerCase("es-ES");

  // Restaure les accents d'un mot inconnu : on ne garde une suggestion que si
  // elle a exactement les mêmes lettres de base (« corazon » → « corazón »).
  // Un mot déjà valide n'est jamais touché, ce qui protège les noms propres et
  // les emprunts présents au dictionnaire.
  function restoreAccents(word) {
    if (word.length < 3 || known(word)) return word;
    const base = stripDiacritics(word);
    const candidates = new Set(
      suggest(word).filter((s) =>
        stripDiacritics(s) === base && s.toLocaleLowerCase("es-ES") !== word.toLocaleLowerCase("es-ES"))
    );
    return candidates.size === 1 ? preserveCase(word, [...candidates][0]) : word;
  }

  function preserveCase(source, replacement) {
    if (source === source.toLocaleUpperCase("es-ES")) return replacement.toLocaleUpperCase("es-ES");
    if (source[0] === source[0].toLocaleUpperCase("es-ES")) {
      return replacement[0].toLocaleUpperCase("es-ES") + replacement.slice(1);
    }
    return replacement;
  }

  function correctSpanishText(source) {
    const started = now();
    let text = String(source || "").normalize("NFC");
    let corrections = 0;

    const replace = (pattern, replacement) => {
      text = text.replace(pattern, (...args) => {
        const value = typeof replacement === "function" ? replacement(...args) : replacement;
        if (value !== args[0]) corrections += 1;
        return value;
      });
    };

    // 1. Graphies soudées et abréviations, avant tout le reste.
    for (const [wrong, right] of FIXED) {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${wrong.replace(/ /gu, "\\s+")}(?![\\p{L}\\p{N}])`, "giu");
      replace(re, (m) => preserveCase(m.replace(/\s+/gu, " "), right));
    }

    // 2. Restauration des accents, mot à mot, sur les mots inconnus en
    //    minuscules. Les mots capitalisés (noms propres) sont épargnés.
    text = text.replace(/\p{L}[\p{L}]*/gu, (word) => {
      if (/[A-ZÁÉÍÓÚÑÜ]/u.test(word[0]) || /\d/u.test(word)) return word;
      const fixed = restoreAccents(word);
      if (fixed !== word) corrections += 1;
      return fixed;
    });

    // 3. Ponctuation espagnole : une phrase interrogative ou exclamative
    //    s'ouvre par ¿ ou ¡. On traite chaque segment de phrase — délimité par
    //    une ponctuation forte — qui se termine par ? ou ! sans déjà porter le
    //    signe ouvrant.
    //    Le signe ouvrant déjà présent est capturé pour ne pas le doubler.
    text = text.replace(/([¿¡]?)([^.!?¿¡\n]+[?!])/gu, (match, opener, segment) => {
      if (opener) return match;
      const trimmed = segment.trimStart();
      if (!trimmed) return match;
      const lead = segment.slice(0, segment.length - trimmed.length);
      const open = trimmed.endsWith("?") ? "¿" : "¡";
      corrections += 1;
      return `${lead}${open}${trimmed}`;
    });

    // 3b. Interrogatifs et exclamatifs accentués. Placés juste après un signe
    //     ouvrant ¿ ou ¡, ce sont toujours les formes accentuées : la position
    //     lève l'ambiguïté avec le pronom relatif (« que ») ou la conjonction.
    const INTERROGATIVES = new Map(Object.entries({
      que: "qué", como: "cómo", cuando: "cuándo", donde: "dónde",
      adonde: "adónde", quien: "quién", quienes: "quiénes", cual: "cuál",
      cuales: "cuáles", cuanto: "cuánto", cuantos: "cuántos",
      cuanta: "cuánta", cuantas: "cuántas"
    }));
    replace(
      /([¿¡]\s*)(que|como|cuando|donde|adonde|quien|quienes|cual|cuales|cuanto|cuantos|cuanta|cuantas)\b/giu,
      (match, opener, word) => `${opener}${preserveCase(word, INTERROGATIVES.get(word.toLocaleLowerCase("es-ES")))}`
    );
    replace(/(¿\s*)porque\b/giu, (match, opener) => `${opener}por qué`);

    // 4. Doublons de ponctuation et espace avant ponctuation.
    replace(/\s+([,;:.!?])/gu, "$1");

    return {
      text,
      corrections,
      durationMs: Math.round(now() - started)
    };
  }

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  globalThis.korrSpanishRules = Object.freeze({
    setSpellChecker,
    correctSpanishText
  });
})();
