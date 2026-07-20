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

  // Espagnol (beta). Les mots retenus sont ceux qui n'appartiennent ni au
  // français ni à l'anglais : « que », « en » ou « la » sont communs et ne
  // départageraient rien.
  const SPANISH_WORDS = new Set([
    "el", "los", "las", "una", "unos", "unas", "del", "al", "por", "para",
    "con", "sin", "sobre", "desde", "hasta", "pero", "porque", "cuando",
    "donde", "como", "muy", "más", "menos", "todo", "todos", "toda", "todas",
    "esto", "eso", "esta", "este", "estos", "estas", "ese", "esa", "aquí",
    "ahí", "allí", "ahora", "siempre", "nunca", "también", "tampoco",
    "hola", "gracias", "señor", "señora", "buenos", "días", "noches",
    "hacer", "hace", "tiene", "tienen", "puede", "pueden", "quiere",
    "está", "están", "estoy", "estamos", "soy", "eres", "somos", "hay",
    "ser", "estar", "tener", "año", "años", "día", "vida", "gente",
    "trabajo", "casa", "cosa", "cosas", "vez", "veces", "algo", "nada",
    "nadie", "alguien", "mucho", "mucha", "muchos", "muchas", "poco",
    "otro", "otra", "otros", "otras", "mismo", "cada", "entre", "según",
    "mañana", "ayer", "hoy", "tarde", "noche", "bueno", "buena", "mejor",
    "quién", "cuál", "cuánto", "qué", "cómo", "sí", "usted", "ustedes",
    "ellos", "ellas", "nosotros", "vosotros", "conmigo", "así"
  ]);
  const STRONG_SPANISH = new Set([
    "el", "los", "las", "una", "del", "al", "por", "para", "con", "pero",
    "porque", "muy", "está", "están", "hay", "hola", "gracias", "qué",
    "cómo", "también", "usted", "ustedes", "ellos", "nosotros", "mañana",
    "hoy", "ayer", "siempre", "nunca", "señor", "señora", "días",
    // Un correcteur reçoit surtout de l'espagnol tapé sans accents : sans ces
    // formes, le texte à corriger est justement celui qu'on ne détecte pas.
    // Chacune est absente du français comme de l'anglais.
    "esta", "estan", "estoy", "estamos", "como", "tambien", "aqui", "asi",
    "dias", "adios", "senor", "anos", "quiero", "tiene", "hacer", "muchas",
    "nada", "algo", "bueno", "todos", "cuando", "donde", "quien"
  ]);
  // Signes propres à chaque langue : la ponctuation ouvrante et le ñ sont
  // exclusivement espagnols, tandis que ç, œ, è et ê sont français.
  const SPANISH_MARKS = /[ñ¿¡]|[áíóú]/u;
  const FRENCH_MARKS = /[çœàèêë]/u;

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

    // Le « ñ » et la ponctuation ouvrante n'existent qu'en espagnol ; les
    // accents propres au français jouent le rôle inverse.
    let spanish = SPANISH_MARKS.test(normalized) ? 3 : 0;
    if (FRENCH_MARKS.test(normalized)) spanish -= 2;
    let strongSpanish = 0;

    for (const word of words) {
      if (FRENCH_WORDS.has(word)) french += 1;
      if (ENGLISH_WORDS.has(word)) english += 1;
      if (SPANISH_WORDS.has(word)) spanish += 1;
      if (STRONG_FRENCH.has(word)) strongFrench += 1;
      if (STRONG_ENGLISH.has(word)) strongEnglish += 1;
      if (STRONG_SPANISH.has(word)) strongSpanish += 1;
    }

    // L'espagnol ne se déclare que sur un signal net et dominant : le
    // français reste la langue de repli, et un doute ne doit jamais faire
    // basculer un texte français vers un moteur qui ne le connaît pas.
    if (strongSpanish >= 2 && spanish > french && spanish > english) return "es";

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

  // Listes de protection, distinctes de celles de détection : elles servent
  // aux moteurs de correction, à qui il faut interdire de « rapprocher » un
  // mot de l'autre langue d'une graphie voisine — « the » deviendrait « thé »
  // et « late » deviendrait « latte ». Elles sont volontairement plus larges
  // que les jeux de détection, qu'elles n'influencent pas.
  const PROTECTED_ENGLISH = new Set([
    ...ENGLISH_WORDS, ...STRONG_ENGLISH,
    "about", "after", "again", "all", "also", "always", "any", "back", "because",
    "been", "before", "being", "best", "better", "both", "call", "can", "come",
    "could", "day", "days", "did", "does", "done", "down", "each", "early",
    "end", "even", "ever", "every", "first", "get", "give", "going", "good",
    "great", "help", "here", "hi", "how", "into", "just", "keep", "know",
    "last", "late", "later", "left", "let", "like", "look", "made", "make",
    "many", "may", "meet", "might", "more", "most", "much", "must", "need",
    "never", "new", "next", "nice", "now", "off", "old", "one", "only", "other",
    "our", "out", "over", "own", "part", "put", "read", "ready", "right",
    "said", "same", "say", "see", "send", "sent", "set", "should", "since",
    "some", "soon", "sorry", "still", "such", "sure", "take", "team", "tell",
    "than", "thank", "thanks", "then", "there", "these", "thing", "things",
    "think", "those", "time", "too", "took", "try", "under", "until", "up",
    "us", "use", "used", "very", "want", "way", "week", "well", "went", "what",
    "when", "where", "which", "while", "who", "why", "will", "with", "work",
    "working", "would", "year", "years", "yes", "yet", "you", "your"
  ]);

  const PROTECTED_FRENCH = new Set([
    ...FRENCH_WORDS, ...STRONG_FRENCH,
    "alors", "après", "assez", "aussi", "autre", "avant", "beaucoup", "bien",
    "bientôt", "bon", "bonne", "ça", "car", "cette", "chez", "comme", "déjà",
    "demain", "depuis", "dernier", "donc", "encore", "enfin", "ensuite",
    "être", "faire", "fait", "hier", "ici", "jamais", "jour", "journée",
    "leur", "maintenant", "mal", "même", "mieux", "moins", "monsieur",
    "madame", "non", "oui", "par", "parce", "peu", "peut", "plus", "quand",
    "rien", "salut", "sans", "semaine", "seulement", "si", "soir", "sous",
    "souvent", "toujours", "tout", "toute", "très", "trop", "vers", "voici",
    "voilà", "vraiment", "cordialement", "amicalement", "merci", "bonjour",
    // Mots français qui n'existent pas en anglais : sans eux, le correcteur
    // anglais les rapproche d'une graphie voisine (« niveau » → « Nivea »).
    // Les homographes anglais (client, service, chose, note…) sont exclus :
    // les protéger empêcherait une correction anglaise légitime.
    "niveau", "boulot", "taf", "truc", "gens", "monde", "équipe", "réunion",
    "dossier", "entreprise", "société", "travail", "semaine", "matin",
    "soir", "midi", "heure", "journée", "année", "aujourd", "quelqu",
    "beaucoup", "pourquoi", "comment", "combien", "toujours", "jamais",
    "chaque", "plusieurs", "certains", "aucun", "quelques", "besoin",
    "envie", "peut-être", "d'accord", "s'il", "n'est", "c'est", "qu'il",
    "bises", "bisous", "salutations", "sincères", "veuillez", "agréer"
  ]);

  const isWordOf = (set) => (word) =>
    set.has(String(word || "").toLocaleLowerCase().replace(/[’'].*$/u, ""));

  globalThis.korrLanguage = Object.freeze({
    detectLanguage,
    isEnglishWord: isWordOf(PROTECTED_ENGLISH),
    isFrenchWord: isWordOf(PROTECTED_FRENCH)
  });
})();
