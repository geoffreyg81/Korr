// Détection légère pour choisir le moteur sans envoyer le texte ailleurs.
// En cas de doute, Korr conserve le français comme langue par défaut.

"use strict";

(() => {
  const FRENCH_WORDS = new Set([
    "au", "aux", "avec", "ce", "ces", "dans", "de", "des", "du", "elle",
    "en", "est", "et", "il", "je", "la", "le", "les", "mais", "ne", "nous",
    "on", "ou", "pas", "pour", "que", "qui", "sa", "se", "son", "sur", "tu",
    "un", "une", "vous", "aujourd", "bonjour", "ceci", "cela", "comme", "donc",
    "ici", "leur", "leurs", "merci", "notre", "nos", "suis", "très", "votre", "vos"
  ]);
  const ENGLISH_WORDS = new Set([
    "a", "an", "and", "are", "as", "at", "be", "but", "by", "for", "from",
    "has", "have", "he", "her", "his", "i", "in", "is", "it", "its", "not",
    "of", "on", "or", "she", "that", "the", "their", "they", "this", "to",
    "was", "we", "were", "with", "you", "your", "hello", "world", "thanks",
    "please", "today", "tomorrow", "yesterday", "good", "morning", "evening",
    "am", "been", "being", "can", "cannot", "could", "did", "do", "does",
    "done", "each", "every", "few", "had", "help", "here", "how", "if",
    "into", "like", "many", "may", "me", "might", "more", "most", "much",
    "must", "my", "need", "new", "no", "now", "one", "only", "our", "out",
    "over", "people", "report", "result", "same", "sentence", "several", "should",
    "some", "still", "than", "them", "then", "there", "these", "thing", "those",
    "through", "time", "too", "under", "up", "very", "want", "what", "when",
    "where", "which", "who", "why", "will", "work", "would", "again", "asap",
    "broke", "call", "car", "down", "email", "fine", "know", "later", "look",
    "looks", "meet", "monday", "tuesday", "wednesday", "thursday", "friday",
    "saturday", "sunday", "january", "february", "march", "april", "june", "july",
    "august", "september", "october", "november", "december", "try"
  ]);
  const STRONG_ENGLISH = new Set([
    "hello", "thanks", "please", "today", "tomorrow", "yesterday", "the",
    "this", "that", "these", "those", "you", "your", "we", "they", "he",
    "she", "my", "it", "is", "are", "was", "were", "have", "has", "do",
    "does", "did", "can", "could", "will", "would", "should", "monday", "tuesday",
    "wednesday", "thursday", "friday", "saturday", "sunday"
  ]);
  const STRONG_FRENCH = new Set([
    "bonjour", "merci", "aujourd'hui", "demain", "hier", "le", "la", "les",
    "je", "tu", "il", "elle", "nous", "vous", "est", "sont", "une", "des",
    "dans", "avec", "pour", "que", "qui", "suis", "notre", "votre"
  ]);

  const ENGLISH_CONTRACTION = /\b(?:aren['’]t|can['’]t|couldn['’]t|didn['’]t|doesn['’]t|don['’]t|hasn['’]t|haven['’]t|isn['’]t|let['’]s|shouldn['’]t|wasn['’]t|weren['’]t|won['’]t|wouldn['’]t|i['’]m|i['’]ve|we['’]re|we['’]ve|they['’]re|you['’]re)\b/giu;
  const ENGLISH_SHORT_MESSAGES = Object.freeze([
    /^(?:yes|yep|yeah)$/u,
    /^(?:best|kind)[ \t]+regards$/u,
    /^happy[ \t]+birthday$/u,
    /^well[ \t]+done$/u,
    /^good[ \t]+luck$/u,
    /^(?:sorry|welcome|cheers|bye|congratulations)$/u,
    /^(?:good[ \t]+night|happy[ \t]+new[ \t]+year|see[ \t]+ya|no[ \t]+problem|sounds[ \t]+good|talk[ \t]+soon|take[ \t]+care)$/u,
    /^h(?:ello|elo)[ \t]+how[ \t]+(?:are|ar|r)[ \t]+(?:you|yu|u)$/u,
    /^i[ \t]+(?:can['’]?t|cannot)[ \t]+(?:connect|conect)$/u,
    /^(?:thanks|thx)[ \t]+see[ \t]+(?:you|u)[ \t]+(?:tomorrow|tmrw|tmrrw)$/u,
    /^need[ \t]+(?:help|hlp)$/u,
    /^(?:where|wher)[ \t]+(?:are|r)[ \t]+(?:you|u)$/u
  ]);

  function detectLanguage(text) {
    const normalized = String(text || "").toLocaleLowerCase();
    const compact = normalized
      .trim()
      .replace(/[.!?,;:]+$/u, "")
      .trim()
      .replace(/[ \t]+/gu, " ");
    if (ENGLISH_SHORT_MESSAGES.some((pattern) => pattern.test(compact))) return "en";

    const words = normalized.match(/[a-zà-öø-ÿ]+/gu) || [];
    const hasFrenchDiacritics = /[àâçéèêëîïôùûüÿœæ]/u.test(normalized);
    let french = hasFrenchDiacritics ? 2 : 0;
    let english = 0;
    let strongFrench = 0;
    let strongEnglish = (normalized.match(ENGLISH_CONTRACTION) || []).length;
    english += strongEnglish * 2;

    for (const word of words) {
      if (FRENCH_WORDS.has(word)) french += 1;
      if (ENGLISH_WORDS.has(word)) english += 1;
      if (STRONG_FRENCH.has(word)) strongFrench += 1;
      if (STRONG_ENGLISH.has(word)) strongEnglish += 1;
    }

    // Un mélange net ne doit jamais être envoyé en bloc à un seul dictionnaire :
    // Harper et Grammalecte pourraient alors "corriger" les mots de l'autre
    // langue. L'interface demandera à l'utilisateur de choisir manuellement.
    //
    // Mais « mélange » suppose un équilibre : un courriel anglais qui se
    // termine par « Merci » reste un texte anglais, et refuser de le corriger
    // serait absurde. La langue minoritaire doit peser au moins un quart des
    // indices pour qu'on renonce à trancher.
    const strongTotal = strongFrench + strongEnglish;
    const minorityCount = Math.min(strongFrench, strongEnglish);
    if (minorityCount > 0 && minorityCount * 4 >= strongTotal) return "mixed";

    // Il faut un signal anglais net : les textes courts et ambigus restent FR.
    if (strongEnglish > strongFrench) return "en";
    if (strongFrench > strongEnglish) return "fr";
    return english >= 2 && english > french * 1.25 ? "en" : "fr";
  }

  globalThis.korrLanguage = Object.freeze({ detectLanguage });
})();
