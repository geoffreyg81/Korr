// Détection légère pour choisir le moteur sans envoyer le texte ailleurs.
// En cas de doute, Korr conserve le français comme langue par défaut.

"use strict";

(() => {
  const FRENCH_WORDS = new Set([
    "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "elle",
    "en", "est", "et", "il", "je", "la", "le", "les", "mais", "ne", "nous",
    "on", "ou", "pas", "pour", "que", "qui", "sa", "se", "son", "sur", "tu",
    "un", "une", "vous"
  ]);
  const ENGLISH_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "has", "have", "he", "her", "his", "i", "in", "is", "it", "its", "not",
    "of", "on", "or", "she", "that", "the", "their", "they", "this", "to",
    "was", "we", "were", "with", "you", "your", "hello", "world", "thanks",
    "please", "today", "tomorrow", "yesterday", "good", "morning", "evening"
  ]);
  const STRONG_ENGLISH = new Set(["hello", "thanks", "please", "today", "tomorrow", "yesterday"]);
  const STRONG_FRENCH = new Set(["bonjour", "merci", "aujourd'hui", "demain", "hier"]);

  function detectLanguage(text) {
    const normalized = String(text || "").toLocaleLowerCase();
    const words = normalized.match(/[a-zà-öø-ÿ]+/gu) || [];
    let french = /[àâçéèêëîïôùûüÿœæ]/u.test(normalized) ? 2 : 0;
    let english = 0;
    let strongFrench = 0;
    let strongEnglish = 0;

    for (const word of words) {
      if (FRENCH_WORDS.has(word)) french += 1;
      if (ENGLISH_WORDS.has(word)) english += 1;
      if (STRONG_FRENCH.has(word)) strongFrench += 1;
      if (STRONG_ENGLISH.has(word)) strongEnglish += 1;
    }

    // Il faut un signal anglais net : les textes courts et ambigus restent FR.
    if (strongEnglish > strongFrench) return "en";
    return english >= 2 && english > french * 1.25 ? "en" : "fr";
  }

  globalThis.korrLanguage = Object.freeze({ detectLanguage });
})();
