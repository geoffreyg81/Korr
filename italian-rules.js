// Règles de correction italiennes de Korr.
//
// Le dictionnaire Hunspell italien (dictionary-it) est inutilisable ici : son
// jeu d'affixes fait exploser le temps de construction de nspell (plus d'une
// minute, croissance quadratique). Le correcteur italien est donc entièrement
// fondé sur des règles écrites à la main, sans correcteur orthographique — ce
// qui le rend aussi plus léger (aucun dictionnaire de 1,3 Mo à télécharger) et
// tout aussi hors ligne que les autres langues.
//
// L'italien a l'avantage de concentrer ses fautes fréquentes sur un ensemble
// fermé, corrigeable sans dictionnaire :
//   - accents sur les mots oxytons (piu → più, citta → città, perche → perché) ;
//   - accent grave écrit à la place de l'aigu sur les mots en -ché
//     (perchè → perché), faute quasi universelle ;
//   - homophones de l'auxiliaire avere sans « h » (o/ho, a/ha, ai/hai,
//     anno/hanno) et « non e » pour « non è » ;
//   - élision de l'article (una amica → un'amica, un'altro → un altro) ;
//   - troncations (un po → un po', qual'è → qual è) ;
//   - abréviations SMS (xké → perché, cmq → comunque, nn → non) ;
//   - anglicismes de bureau avec accord de l'article (il meeting → la riunione).
//
// Chaque règle est bornée : si elle ne peut pas trancher, elle ne touche rien.
//
// Ce fichier est un script classique, sans import ni export : il s'installe sur
// globalThis, exactement comme grammar-rules.js, english-rules.js et
// spanish-rules.js. setSpellChecker() est conservé pour la symétrie de
// l'architecture, mais l'italien ne s'en sert pas.

"use strict";

(() => {
  const setSpellChecker = () => {}; // l'italien ne dépend d'aucun dictionnaire

  const lower = (s) => s.toLocaleLowerCase("it-IT");

  function preserveCase(source, replacement) {
    if (source.length > 1 && source === source.toLocaleUpperCase("it-IT")) {
      return replacement.toLocaleUpperCase("it-IT");
    }
    if (source[0] === source[0].toLocaleUpperCase("it-IT")) {
      return replacement[0].toLocaleUpperCase("it-IT") + replacement.slice(1);
    }
    return replacement;
  }

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  // ---------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------

  // Graphies toujours fausses (SMS, mots soudés, accent grave sur les mots en
  // -ché). Chaque clé n'existe pas en italien correct, la substitution est donc
  // sans ambiguïté.
  const FIXED = new Map(Object.entries({
    // Accent grave écrit pour l'aigu : la faute la plus répandue d'Italie.
    "perchè": "perché", "poichè": "poiché", "affinchè": "affinché",
    "benchè": "benché", "finchè": "finché", "purchè": "purché",
    "giacchè": "giacché", "sicchè": "sicché", "cosicchè": "cosicché",
    "nonchè": "nonché", "anzichè": "anziché", "dacchè": "dacché",
    "fintantochè": "fintantoché", "nè": "né", "sè": "sé",
    "trentatrè": "trentatré", "ventitrè": "ventitré", "trè": "tré",
    // Troncations et élisions.
    "pò": "po'", "qual'è": "qual è", "qual'era": "qual era",
    "cè": "c'è", "daccordo": "d'accordo", "dallaltra": "dall'altra",
    // Orthographe : mots soudés ou double consonne fautive fréquente.
    "sopratutto": "soprattutto", "innanzitutto": "innanzitutto",
    // Abréviations SMS et de messagerie.
    "xké": "perché", "xche": "perché", "xchè": "perché", "perkè": "perché",
    "perke": "perché", "xk": "perché", "cmq": "comunque", "cmnq": "comunque",
    "nn": "non", "xò": "però", "xo": "però", "tvb": "ti voglio bene",
    "tvtb": "ti voglio tanto bene", "qlcs": "qualcosa", "qcosa": "qualcosa",
    "qlcn": "qualcuno", "qlc": "qualche", "qualke": "qualche",
    "qnd": "quando", "qndo": "quando", "qst": "questo", "cn": "con",
    "ke": "che", "ki": "chi", "sn": "sono", "nnt": "niente", "dp": "dopo",
    "grz": "grazie", "prg": "prego", "anke": "anche", "ank": "anche",
    "dv": "dove", "msg": "messaggio", "raga": "ragazzi",
    "xfavore": "per favore", "xpiacere": "per piacere", "bn": "bene",
    "adess": "adesso", "nnc": "neanche"
  }));
  const FIXED_PATTERN = new RegExp(
    `(?<![\\p{L}\\p{N}'’])(?:${[...FIXED.keys()]
      .sort((a, b) => b.length - a.length)
      .map((key) => key.replace(/\./gu, "\\.").replace(/ /gu, "\\s+"))
      .join("|")})(?![\\p{L}\\p{N}'’])`,
    "giu"
  );

  // Restauration d'accent sur des mots oxytons. Chaque clé, sans accent, n'est
  // pas un mot italien courant (les homographes ambigus comme « pero » (poirier)
  // / « però », « papa » / « papà », « te » / « tè », « meta » / « metà » sont
  // volontairement exclus : eux ne peuvent se trancher qu'au contexte).
  const ACCENTS = new Map(Object.entries({
    piu: "più", gia: "già", cosi: "così", puo: "può", cioe: "cioè",
    citta: "città", universita: "università", societa: "società",
    qualita: "qualità", quantita: "quantità", verita: "verità",
    liberta: "libertà", novita: "novità", attivita: "attività",
    possibilita: "possibilità", necessita: "necessità", velocita: "velocità",
    capacita: "capacità", identita: "identità", comunita: "comunità",
    autorita: "autorità", realta: "realtà", difficolta: "difficoltà",
    curiosita: "curiosità", serieta: "serietà", eta: "età",
    virtu: "virtù", gioventu: "gioventù", tribu: "tribù", schiavitu: "schiavitù",
    servitu: "servitù", caffe: "caffè", laggiu: "laggiù", quaggiu: "quaggiù",
    lassu: "lassù", quassu: "quassù", perlopiu: "perlopiù",
    lunedi: "lunedì", martedi: "martedì", mercoledi: "mercoledì",
    giovedi: "giovedì", venerdi: "venerdì",
    poverta: "povertà", bonta: "bontà"
  }));
  const ACCENTS_PATTERN = new RegExp(
    `(?<![\\p{L}\\p{N}'’])(?:${[...ACCENTS.keys()].join("|")})(?![\\p{L}\\p{N}'’])`,
    "giu"
  );

  // Participes passés fréquents : après « a / o / ai / anno », un participe
  // révèle toujours l'auxiliaire avere manquant (jamais la préposition ni le
  // nom « anno »). La liste couvre les réguliers (-ato/-ito/-uto) par motif, et
  // les irréguliers un à un.
  const IRREGULAR_PARTICIPLES = [
    "fatto", "detto", "visto", "preso", "messo", "scritto", "letto", "rotto",
    "aperto", "chiuso", "offerto", "morto", "nato", "vissuto", "venuto",
    "rimasto", "deciso", "chiesto", "risposto", "perso", "vinto", "speso",
    "corso", "scelto", "mosso", "cotto", "spento", "giunto", "tolto", "volto",
    "svolto", "accolto", "raccolto", "sciolto", "dato", "stato", "successo",
    "concesso", "promesso", "permesso", "discusso", "acceso", "ucciso",
    "diviso", "escluso", "incluso", "compreso", "sorpreso", "espresso",
    "coperto", "scoperto", "sofferto", "corretto", "protetto", "eletto",
    "distrutto", "costruito", "condotto", "prodotto", "ridotto", "tradotto"
  ];
  const PARTICIPLE = String.raw`(?:\p{L}{2,}(?:ato|ito|uto)|${IRREGULAR_PARTICIPLES.join("|")})`;
  // Quelques adjectifs en -ato/-ito qui ne sont pas des participes d'action :
  // « a salato » ou « o dolce » ne doivent jamais devenir « ha/ho ».
  const ATO_ADJECTIVES = new Set([
    "salato", "dolce", "colorato", "malato", "ammalato", "isolato", "privato",
    "dedicato", "delicato", "adatto", "esatto", "beato", "moderato", "sfacciato"
  ]);
  // Mots qui suivent « anno » quand c'est le nom (année), pas l'auxiliaire.
  const YEAR_WORDS = new Set([
    "scorso", "prossimo", "passato", "nuovo", "bisestile", "sabbatico",
    "solare", "accademico", "scolastico", "fa", "dopo", "prima", "fiscale"
  ]);

  // Anglicismes de bureau, avec genre et pluriel pour réaccorder l'article.
  const ANGLICISMS = new Map(Object.entries({
    meeting: { one: "riunione", many: "riunioni", g: "f" },
    call: { one: "chiamata", many: "chiamate", g: "f" },
    deadline: { one: "scadenza", many: "scadenze", g: "f" },
    planning: { one: "programma", many: "programmi", g: "m" },
    target: { one: "obiettivo", many: "obiettivi", g: "m" },
    forwarding: { one: "inoltro", many: "inoltri", g: "m" }
  }));

  // ---------------------------------------------------------------------
  // Articles italiens : la forme dépend du genre, du nombre et de l'initiale
  // du mot qui suit (il/lo/l', un/uno, i/gli). On les recalcule pour l'article
  // qui précède un anglicisme remplacé.
  // ---------------------------------------------------------------------

  const startsVowel = (word) => /^[aeiouàèéìíòóù]/iu.test(word);
  // « lo/uno/gli » devant s+consonne, z, gn, ps, pn, x, y, i+voyelle.
  const needsLo = (word) =>
    /^(?:s[^aeiou]|z|gn|ps|pn|x|y|i[aeiou])/iu.test(word);

  function defArticle(gender, plural, word) {
    if (plural) {
      if (gender === "f") return "le";
      return startsVowel(word) || needsLo(word) ? "gli" : "i";
    }
    if (gender === "f") return startsVowel(word) ? "l'" : "la";
    if (startsVowel(word)) return "l'";
    return needsLo(word) ? "lo" : "il";
  }
  function indefArticle(gender, word) {
    if (gender === "f") return startsVowel(word) ? "un'" : "una";
    return needsLo(word) ? "uno" : "un";
  }

  const DEF_ARTICLES = new Set(["il", "lo", "la", "l'", "i", "gli", "le"]);
  const INDEF_ARTICLES = new Set(["un", "uno", "una", "un'"]);
  const PLURAL_ARTICLES = new Set(["i", "gli", "le"]);

  // Masculin fréquent commençant par une voyelle : « un'altro » est fautif
  // (un' ne précède qu'un féminin), c'est « un altro ». On corrige la petite
  // série des masculins vocaliques les plus courants.
  const MASC_VOWEL = new Set([
    "altro", "amico", "uomo", "anno", "esempio", "aiuto", "angolo", "errore",
    "evento", "incontro", "italiano", "ufficio", "orario", "obiettivo",
    "argomento", "ordine", "istante", "attimo", "episodio", "elenco",
    "aereo", "albero", "articolo", "abito", "orologio", "occhio", "invito"
  ]);

  // ---------------------------------------------------------------------
  // Correction
  // ---------------------------------------------------------------------

  function correctItalianText(source) {
    const started = now();
    let text = String(source || "").normalize("NFC");
    const count = { value: 0 };

    const replace = (pattern, replacement) => {
      text = text.replace(pattern, (...args) => {
        const value = typeof replacement === "function" ? replacement(...args) : replacement;
        if (value !== args[0]) count.value += 1;
        return value;
      });
    };

    // 1. Graphies toujours fausses (SMS, mots soudés, accent grave sur -ché).
    replace(FIXED_PATTERN, (match) => {
      const right = FIXED.get(lower(match).replace(/\s+/gu, " "));
      return right ? preserveCase(match.replace(/\s+/gu, " "), right) : match;
    });

    // « x » isolé = « per », mais jamais entre deux nombres (« 3 x 4 »).
    replace(/(?<![\p{L}\p{N}])x(?![\p{L}\p{N}])/giu, (match, offset, whole) => {
      const before = whole.slice(0, offset);
      const after = whole.slice(offset + 1);
      if (/\p{N}\s*$/u.test(before) || /^\s*\p{N}/u.test(after)) return match;
      return preserveCase(match, "per");
    });

    // 2. Accents sur les mots oxytons (piu → più, citta → città).
    replace(ACCENTS_PATTERN, (match) => preserveCase(match, ACCENTS.get(lower(match))));

    // 3. Homophones de l'auxiliaire avere. Un participe passé révèle l'auxiliaire
    //    manquant ; la préposition (« a », « ai »), la conjonction (« o ») et le
    //    nom « anno » (année) ne précèdent jamais un participe.
    const participleAfter = (word) => !ATO_ADJECTIVES.has(lower(word));
    //    « a fatto » → « ha fatto ».
    replace(
      new RegExp(String.raw`(?<![\p{L}'’])a(\s+)(${PARTICIPLE})(?![\p{L}])`, "giu"),
      (match, space, part) => (participleAfter(part) ? `${preserveCase("a", "ha")}${space}${part}` : match)
    );
    //    « ai fatto » → « hai fatto ».
    replace(
      new RegExp(String.raw`(?<![\p{L}'’])ai(\s+)(${PARTICIPLE})(?![\p{L}])`, "giu"),
      (match, space, part) => (participleAfter(part) ? `${preserveCase("ai", "hai")}${space}${part}` : match)
    );
    //    « anno fatto » → « hanno fatto », sauf « l'anno scorso » (le nom année).
    replace(
      new RegExp(String.raw`(?<![\p{L}'’])(l['’]\s*)?anno(\s+)(${PARTICIPLE})(?![\p{L}])`, "giu"),
      (match, article, space, part) => {
        if (YEAR_WORDS.has(lower(part)) || !participleAfter(part)) return match;
        return `${article || ""}${preserveCase("anno", "hanno")}${space}${part}`;
      }
    );
    //    « o fatto » → « ho fatto », mais seulement en tête de phrase : ailleurs,
    //    « o » est le plus souvent la conjonction (« bianco o salato »).
    replace(
      new RegExp(String.raw`(^|[.!?…]\s+|\n\s*)(o)(\s+)(${PARTICIPLE})(?![\p{L}])`, "gimu"),
      (match, lead, o, space, part) => (participleAfter(part) ? `${lead}${preserveCase(o, "ho")}${space}${part}` : match)
    );
    //    « non e » → « non è » ; « e' » (apostrophe pour l'accent) → « è ».
    replace(/(?<![\p{L}'’])(non)(\s+)e(?![\p{L}'’])/giu, (match, non, space) => `${non}${space}è`);
    replace(/(?<![\p{L}'’])e['’](?=\s|$)/giu, (match) => preserveCase(match, "è"));
    //    « e » en tête de phrase devant un attribut clair, c'est le verbe « è » :
    //    « E già tardi » → « È già tardi ». Réservé au début de phrase, où « e »
    //    conjonction (« et ») est bien plus rare que « è » (« il/elle est »).
    replace(
      /(^|[.!?…]\s+|\n\s*)(e)(\s+)(?=(?:già|ora|tardi|presto|troppo|meglio|peggio|vero|falso|ovvio|chiaro|inutile|finito|finita|pronto|pronta|possibile|impossibile|necessario|normale|evidente|meraviglioso|importante)(?![\p{L}\p{N}]))/gimu,
      (match, lead, e, space) => `${lead}${preserveCase(e, "è")}${space}`
    );
    //    « c'e » / « cè » → « c'è » (déjà partiellement traité en 1).
    replace(/(?<![\p{L}])c['’]e(?![\p{L}'’])/giu, (match) => preserveCase(match, "c'è"));

    // 4. Élision de l'article indéfini.
    //    « una » devant une voyelle s'élide toujours : « una amica » → « un'amica ».
    replace(
      /(?<![\p{L}'’])(una)\s+(?=[aeiouàèéìíòóù])/giu,
      (match, word) => preserveCase(word, "un'")
    );
    //    « un' » ne précède qu'un féminin : devant un masculin vocalique courant,
    //    l'apostrophe saute (« un'altro » → « un altro »).
    replace(
      /(?<![\p{L}'’])(un)['’](\p{L}+)/giu,
      (match, article, word) => (MASC_VOWEL.has(lower(word)) ? `${preserveCase(article, "un")} ${word}` : match)
    );

    // 5. Troncations : « un po » → « un po' », « po » adverbe → « po' ».
    replace(/(?<![\p{L}'’])(un|il|di|che|bel)\s+po(?![\p{L}'’])/giu,
      (match, before) => `${before} po'`);
    //    « qual è » sans apostrophe (traité aussi en 1 pour « qual'è »).
    replace(/(?<![\p{L}'’])qual\s+e(?![\p{L}'’])/giu, "qual è");

    // 6. Anglicismes de bureau : le mot italien remplace l'anglicisme, et
    //    l'article qui précède est réaccordé au genre du mot italien.
    const anglPattern = new RegExp(
      String.raw`(?<![\p{L}\p{N}'’])(?:(il|lo|la|l['’]|i|gli|le|un|uno|una|un['’])\s+)?` +
      String.raw`(${[...ANGLICISMS.keys()].join("|")})(?![\p{L}\p{N}'’])`,
      "giu"
    );
    replace(anglPattern, (match, article, word) => {
      const entry = ANGLICISMS.get(lower(word));
      if (!entry) return match;
      if (!article) return preserveCase(word, entry.one);
      const art = lower(article).replace(/['’]/u, "'");
      const plural = PLURAL_ARTICLES.has(art);
      const noun = plural ? entry.many : entry.one;
      const kind = DEF_ARTICLES.has(art) ? "def" : INDEF_ARTICLES.has(art) ? "indef" : null;
      if (!kind) return `${article} ${preserveCase(word, noun)}`;
      const newArticle = kind === "def" ? defArticle(entry.g, plural, noun) : indefArticle(entry.g, noun);
      const glued = newArticle.endsWith("'") ? `${newArticle}${noun}` : `${newArticle} ${noun}`;
      return preserveCase(article, glued);
    });

    // 7. Ponctuation : pas d'espace avant, un espace après. L'italien n'a ni le
    //    « ¿ ¡ » espagnol ni l'espace insécable français.
    replace(/\s+([,;:.!?])/gu, "$1");
    replace(/([,;:])(?=\p{L})/gu, "$1 ");
    replace(/ {2,}/gu, " ");

    // 8. Majuscule initiale : le premier mot du texte se met en capitale, sans
    //    toucher au reste (les abréviations en milieu de phrase sont épargnées).
    text = text.replace(/^(\s*["«'‘(]*)(\p{Ll})/u, (match, lead, letter) => {
      count.value += 1;
      return lead + letter.toLocaleUpperCase("it-IT");
    });

    return {
      text,
      corrections: count.value,
      durationMs: Math.round(now() - started)
    };
  }

  globalThis.korrItalianRules = Object.freeze({
    setSpellChecker,
    correctItalianText
  });
})();
