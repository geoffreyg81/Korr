// Règles de correction espagnoles de Korr — beta.
//
// Contrairement au français (Grammalecte) et à l'anglais (Harper), l'espagnol
// ne dispose pas d'un moteur grammatical hors ligne complet. Cette beta repose
// donc sur deux piliers volontairement prudents :
//   1. un correcteur orthographique Hunspell (nspell + dictionary-es) ;
//   2. un jeu de règles écrites à la main, chacune bornée pour éviter les faux
//      positifs : une règle qui ne peut pas trancher ne corrige rien.
//
// Les quatre chantiers traités ici sont ceux qui « craquent » dans un courriel
// professionnel espagnol : les homophones à accent diacritique (sé/se, qué/que),
// l'accord à distance avec un sujet-tête singulier (« la pila de informes …
// se ha perdido »), les calques de bureau (planning, call, short de tiempo) et
// l'impératif de vosotros en -r (« decirme » → « decidme »).
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

  const lower = (s) => s.toLocaleLowerCase("es-ES");

  // ---------------------------------------------------------------------
  // Tables
  // ---------------------------------------------------------------------

  // Fautes soudées, graphies impossibles et abréviations SMS : chaque clé
  // n'existe pas en espagnol (ou n'existe que comme faute), la substitution
  // est donc sans ambiguïté.
  const FIXED = new Map(Object.entries({
    aver: "a ver", "haber si": "a ver si", osea: "o sea", dehecho: "de hecho",
    "de echo": "de hecho", enserio: "en serio", aveces: "a veces",
    porfavor: "por favor", almenos: "al menos", apartir: "a partir",
    entonses: "entonces", asike: "así que", asique: "así que",
    sobretodo: "sobre todo", amenudo: "a menudo", talvez: "tal vez",
    sinembargo: "sin embargo", porsupuesto: "por supuesto",
    tambien: "también", asi: "así", haci: "así", despues: "después",
    ademas: "además", quizas: "quizás", mas: "más", "por que": "porque",
    porke: "porque", porq: "porque", xq: "porque", pq: "porque",
    tb: "también", tmb: "también", dnd: "dónde", tqm: "te quiero mucho",
    finde: "fin de semana", nose: "no sé", aora: "ahora", oy: "hoy",
    weno: "bueno", wenas: "buenas", bno: "bueno", toy: "estoy",
    aki: "aquí", ke: "que", k: "que", q: "que", xa: "para", xfa: "por favor",
    porfa: "por favor", grax: "gracias", salu2: "saludos", dsp: "después",
    muxo: "mucho", kiero: "quiero", "asta luego": "hasta luego",
    hiba: "iba", haiga: "haya",
    // Numéraux composés : ils s'écrivent soudés depuis le seizième.
    "diez y seis": "dieciséis", "diez y siete": "diecisiete",
    "diez y ocho": "dieciocho", "diez y nueve": "diecinueve",
    "veinte y uno": "veintiuno", "veinte y dos": "veintidós",
    "veinte y tres": "veintitrés", "veinte y cuatro": "veinticuatro",
    "veinte y cinco": "veinticinco", "veinte y seis": "veintiséis",
    "veinte y siete": "veintisiete", "veinte y ocho": "veintiocho",
    "veinte y nueve": "veintinueve"
  }));
  const FIXED_PATTERN = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${[...FIXED.keys()]
      .sort((a, b) => b.length - a.length)
      .map((key) => key.replace(/ /gu, "\\s+"))
      .join("|")})(?![\\p{L}\\p{N}])`,
    "giu"
  );

  // Centaines écrites en deux morceaux : « dos-cientos » n'existe pas.
  const HUNDREDS = Object.freeze({
    dos: "doscientos", tres: "trescientos", cuatro: "cuatrocientos",
    cinco: "quinientos", seis: "seiscientos", siete: "setecientos",
    ocho: "ochocientos", nueve: "novecientos"
  });

  // Calques de bureau. Remplacer un mot anglais par sa forme espagnole oblige
  // à réaccorder ce qui l'entoure : « un call » → « una llamada ». Chaque
  // entrée porte donc son genre, son pluriel, et « plural » si la clé est
  // elle-même au pluriel.
  const ANGLICISMS = new Map(Object.entries({
    planning: { one: "calendario", many: "calendarios", gender: "m" },
    plannings: { one: "calendario", many: "calendarios", gender: "m", plural: true },
    call: { one: "llamada", many: "llamadas", gender: "f" },
    calls: { one: "llamada", many: "llamadas", gender: "f", plural: true },
    meeting: { one: "reunión", many: "reuniones", gender: "f" },
    meetings: { one: "reunión", many: "reuniones", gender: "f", plural: true },
    mail: { one: "correo", many: "correos", gender: "m" },
    mails: { one: "correo", many: "correos", gender: "m", plural: true },
    email: { one: "correo", many: "correos", gender: "m" },
    emails: { one: "correo", many: "correos", gender: "m", plural: true },
    "e-mail": { one: "correo", many: "correos", gender: "m" },
    deadline: { one: "fecha límite", many: "fechas límite", gender: "f" },
    deadlines: { one: "fecha límite", many: "fechas límite", gender: "f", plural: true },
    link: { one: "enlace", many: "enlaces", gender: "m" },
    links: { one: "enlace", many: "enlaces", gender: "m", plural: true },
    target: { one: "objetivo", many: "objetivos", gender: "m" },
    targets: { one: "objetivo", many: "objetivos", gender: "m", plural: true },
    budget: { one: "presupuesto", many: "presupuestos", gender: "m" },
    budgets: { one: "presupuesto", many: "presupuestos", gender: "m", plural: true },
    workshop: { one: "taller", many: "talleres", gender: "m" },
    workshops: { one: "taller", many: "talleres", gender: "m", plural: true },
    management: { one: "gestión", many: "gestiones", gender: "f" },
    performance: { one: "rendimiento", many: "rendimientos", gender: "m" },
    update: { one: "actualización", many: "actualizaciones", gender: "f" },
    updates: { one: "actualización", many: "actualizaciones", gender: "f", plural: true },
    brainstorming: { one: "lluvia de ideas", many: "lluvias de ideas", gender: "f" },
    forecast: { one: "previsión", many: "previsiones", gender: "f" },
    training: { one: "formación", many: "formaciones", gender: "f" },
    "follow-up": { one: "seguimiento", many: "seguimientos", gender: "m" },
    "follow up": { one: "seguimiento", many: "seguimientos", gender: "m" }
  }));

  // Déterminants et adjectifs antéposés que la règle des calques doit
  // réaccorder avec le nom espagnol qui remplace l'anglicisme.
  const TO_FEMININE = Object.freeze({
    el: "la", los: "las", un: "una", unos: "unas", del: "de la", al: "a la",
    este: "esta", estos: "estas", ese: "esa", esos: "esas",
    aquel: "aquella", aquellos: "aquellas", nuestro: "nuestra",
    nuestros: "nuestras", vuestro: "vuestra", vuestros: "vuestras",
    otro: "otra", otros: "otras", nuevo: "nueva", nuevos: "nuevas",
    "próximo": "próxima", "próximos": "próximas", mismo: "misma",
    mismos: "mismas", "último": "última", "últimos": "últimas",
    primer: "primera", primero: "primera", segundo: "segunda",
    tercer: "tercera", tercero: "tercera", buen: "buena", bueno: "buena",
    mal: "mala", malo: "mala", todo: "toda", todos: "todas",
    "algún": "alguna", algunos: "algunas", "ningún": "ninguna",
    mucho: "mucha", muchos: "muchas", poco: "poca", pocos: "pocas",
    varios: "varias", largo: "larga", corto: "corta", rapido: "rápida",
    "rápido": "rápida", diario: "diaria", semanal: "semanal",
    previsto: "prevista", previstos: "previstas", necesario: "necesaria",
    programado: "programada", programados: "programadas",
    planificado: "planificada", interno: "interna", externo: "externa"
  });
  const TO_MASCULINE = Object.freeze(
    Object.fromEntries(
      Object.entries(TO_FEMININE)
        .filter(([, feminine]) => !feminine.includes(" "))
        .map(([masculine, feminine]) => [feminine, masculine])
    )
  );
  const MODIFIERS = Object.keys(TO_FEMININE)
    .concat(Object.keys(TO_MASCULINE))
    .concat(["mi", "mis", "tu", "tus", "su", "sus", "cada", "gran", "cualquier"]);
  // Adjectifs postposés fréquents : eux aussi suivent le genre du nom.
  const POSTPOSED = [
    "nuevo", "nueva", "nuevos", "nuevas", "rápido", "rápida", "rápidos", "rápidas",
    "largo", "larga", "largos", "largas", "corto", "corta", "cortos", "cortas",
    "previsto", "prevista", "previstos", "previstas", "necesario", "necesaria",
    "diario", "diaria", "semanal", "mensual", "programado", "programada",
    "planificado", "planificada", "interno", "interna", "externo", "externa",
    "último", "última", "últimos", "últimas", "mismo", "misma"
  ];

  const ANGLICISM_PATTERN = new RegExp(
    `(?<![\\p{L}\\p{N}])((?:(?:${[...new Set(MODIFIERS)].join("|")})\\s+)*)` +
    `(${[...ANGLICISMS.keys()].sort((a, b) => b.length - a.length).map((k) => k.replace(/ /gu, "\\s+")).join("|")})` +
    `(?![\\p{L}\\p{N}])((?:\\s+(?:${POSTPOSED.join("|")}))?)(?![\\p{L}\\p{N}])`,
    "giu"
  );

  const PLURAL_DETERMINERS = new Set([
    "los", "las", "unos", "unas", "estos", "estas", "esos", "esas",
    "aquellos", "aquellas", "mis", "tus", "sus", "nuestros", "nuestras",
    "vuestros", "vuestras", "otros", "otras", "varios", "varias",
    "muchos", "muchas", "pocos", "pocas", "todos", "todas", "algunos",
    "algunas", "nuevos", "nuevas", "primeros", "primeras", "últimos", "últimas"
  ]);

  // Collectifs de quantité : en espagnol, l'accord ad sensum au pluriel est
  // correct après eux (« la mayoría de los clientes han esperado »). Ils sont
  // donc exclus de la règle d'accord à distance.
  const QUANTIFIER_HEADS = new Set([
    "mayoría", "minoría", "mitad", "tercio", "resto", "parte", "montón",
    "multitud", "infinidad", "sinfín", "serie", "grupo", "conjunto", "total",
    "cantidad", "número", "docena", "decena", "centenar", "millar", "par",
    "puñado", "porcentaje", "tanda", "oleada", "cúmulo", "equipo", "gente",
    "media", "veintena", "treintena", "millón", "mayor"
  ]);

  // Noms-contenants : eux seuls autorisent la correction du verbe de la
  // relative (« la pila de informes que contiene »), car ailleurs le pluriel
  // peut légitimement renvoyer au complément.
  const CONTAINER_HEADS = new Set([
    "pila", "lista", "carpeta", "caja", "tabla", "hoja", "cadena", "bandeja",
    "colección", "cartera", "base", "copia", "versión", "paquete", "archivo",
    "expediente", "informe", "resumen", "historial", "registro", "cesta"
  ]);
  const CONTAINMENT_VERBS = /^(?:conten|contien|inclu|recog|alberg|agrup|reún|reun|abarc|comprend|guard|almacen|list|detall)/u;

  // Formes verbales de 3e personne du pluriel dont le singulier n'est pas
  // régulier.
  const IRREGULAR_SINGULAR = Object.freeze({
    son: "es", están: "está", han: "ha", van: "va", dan: "da", ven: "ve",
    eran: "era", iban: "iba", fueron: "fue", fueran: "fuera", fuesen: "fuese",
    sean: "sea", hayan: "haya", habían: "había", hubieron: "hubo",
    hicieron: "hizo", dijeron: "dijo", pudieron: "pudo", tuvieron: "tuvo",
    estuvieron: "estuvo", quisieron: "quiso", vinieron: "vino",
    supieron: "supo", pusieron: "puso", trajeron: "trajo",
    condujeron: "condujo", produjeron: "produjo", dieron: "dio",
    vieron: "vio", anduvieron: "anduvo", cupieron: "cupo"
  });

  // Mots en -an/-en/-án qui ne sont pas des verbes : sans cette liste, la
  // règle d'accord prendrait « el orden » ou « el resumen » pour un pluriel.
  const NOT_VERBS = new Set([
    "también", "bien", "quien", "alguien", "joven", "orden", "imagen",
    "origen", "margen", "examen", "volumen", "certamen", "crimen", "germen",
    "dictamen", "resumen", "almacén", "andén", "sartén", "rehén", "desdén",
    "refrán", "imán", "afán", "plan", "pan", "gran", "san", "clan", "tan",
    "según", "común", "detrás", "jamás", "además", "edén"
  ]);

  // Devant un mot, ces outils annoncent un nom : le mot suivant n'est donc
  // pas le verbe que la règle d'accord cherche.
  const BEFORE_NOUN = new Set([
    "el", "la", "los", "las", "un", "una", "unos", "unas", "del", "al", "de",
    "en", "con", "por", "para", "sin", "sobre", "hasta", "desde", "entre",
    "este", "esta", "estos", "estas", "ese", "esa", "esos", "esas", "mi",
    "tu", "su", "mis", "tus", "sus", "nuestro", "nuestra", "nuestros",
    "nuestras", "vuestro", "vuestra", "vuestros", "vuestras", "cada",
    "algún", "ningún", "otro", "otra", "otros", "otras", "buen", "gran",
    "primer", "cualquier", "todo", "toda", "todos", "todas", "muchos",
    "muchas", "varios", "varias"
  ]);
  // Clitiques et adverbes qui peuvent précéder le verbe principal.
  const PREVERBAL = new Set([
    "se", "no", "ya", "nunca", "jamás", "también", "tampoco", "aún",
    "todavía", "siempre", "casi", "solo", "sólo", "me", "te", "le", "les",
    "nos", "os", "lo", "la", "los", "las", "sí"
  ]);
  // Copules : leur attribut s'accorde, contrairement au participe de haber.
  const COPULAS = new Set([
    "son", "eran", "fueron", "serán", "sean", "están", "estaban",
    "estarán", "estén", "parecen", "resultan", "quedan", "siguen"
  ]);

  // Participes fréquents : « a sido » n'existe pas, c'est « ha sido ».
  const PARTICIPLES = [
    "sido", "hecho", "dicho", "ido", "estado", "venido", "puesto", "visto",
    "tenido", "llegado", "pasado", "dado", "habido", "podido", "querido",
    "sabido", "salido", "entrado", "recibido", "enviado", "terminado",
    "empezado", "decidido", "cambiado", "funcionado", "vuelto", "escrito",
    "abierto", "roto", "resuelto", "muerto", "cubierto"
  ];

  // Après un signe ouvrant, ces mots sont toujours les formes accentuées.
  const INTERROGATIVES = new Map(Object.entries({
    que: "qué", como: "cómo", cuando: "cuándo", donde: "dónde",
    adonde: "adónde", quien: "quién", quienes: "quiénes", cual: "cuál",
    cuales: "cuáles", cuanto: "cuánto", cuantos: "cuántos",
    cuanta: "cuánta", cuantas: "cuántas"
  }));

  // Participes et adverbes qu'un démonstratif ne peut pas introduire : après
  // « esta », ce sont toujours des attributs, donc « está ».
  const AFTER_ESTAR = [
    "bien", "mal", "aquí", "ahí", "allí", "allá", "cerca", "lejos", "dentro",
    "fuera", "arriba", "abajo", "listo", "lleno", "claro", "seguro", "roto",
    "hecho", "dicho", "muerto", "abierto", "cerrado", "escrito", "puesto",
    "vuelto", "resuelto", "previsto", "incluido", "pendiente", "disponible"
  ];

  // ---------------------------------------------------------------------
  // Outils
  // ---------------------------------------------------------------------

  const stripDiacritics = (s) =>
    s.normalize("NFD").replace(/[̀-ͯ]/gu, "").toLocaleLowerCase("es-ES");

  // Clé phonétique espagnole : b/v, h muet, ll/y, c/z/s et qu/k se confondent
  // à l'oreille, ce sont exactement les fautes d'orthographe natives.
  const phoneticKey = (s) =>
    stripDiacritics(s)
      .replace(/qu(?=[ei])/gu, "k")
      .replace(/gu(?=[ei])/gu, "g")
      .replace(/[cz](?=[ei])/gu, "s")
      .replace(/z/gu, "s")
      .replace(/c/gu, "k")
      .replace(/v/gu, "b")
      .replace(/h/gu, "")
      .replace(/ll/gu, "y")
      .replace(/g(?=[ei])/gu, "j")
      .replace(/(.)\1/gu, "$1");

  function preserveCase(source, replacement) {
    if (source.length > 1 && source === source.toLocaleUpperCase("es-ES")) {
      return replacement.toLocaleUpperCase("es-ES");
    }
    if (source[0] === source[0].toLocaleUpperCase("es-ES")) {
      return replacement[0].toLocaleUpperCase("es-ES") + replacement.slice(1);
    }
    return replacement;
  }

  // Corrige un mot absent du dictionnaire : d'abord l'accent manquant (mêmes
  // lettres de base), puis la confusion phonétique (aprueve → apruebe). Dans
  // les deux cas, une seule suggestion doit convenir, sinon on ne touche rien.
  // En tête de phrase, la majuscule ne dit plus si le mot est un nom propre :
  // on s'y limite donc à l'accent, qui ne change aucune lettre.
  function fixUnknownWord(word, accentsOnly) {
    if (word.length < 3 || known(word)) return word;
    const options = suggest(word).filter((s) => lower(s) !== lower(word) && !s.includes(" "));
    if (!options.length) return word;

    const base = stripDiacritics(word);
    const sameLetters = new Set(options.filter((s) => stripDiacritics(s) === base));
    if (sameLetters.size === 1) return preserveCase(word, [...sameLetters][0]);
    if (sameLetters.size > 1 || accentsOnly || word.length < 4) return word;

    const key = phoneticKey(word);
    const sameSound = new Set(
      options.filter((s) =>
        phoneticKey(s) === key &&
        Math.abs(s.length - word.length) <= 1 &&
        stripDiacritics(s)[0] === base[0])
    );
    return sameSound.size === 1 ? preserveCase(word, [...sameSound][0]) : word;
  }

  // Passe une forme de 3e personne du pluriel au singulier. Renvoie null si le
  // résultat n'est pas un mot connu : la règle appelante s'abstient alors.
  function singularizeVerb(verb) {
    const key = lower(verb);
    if (NOT_VERBS.has(key)) return null;
    if (Object.hasOwn(IRREGULAR_SINGULAR, key)) return IRREGULAR_SINGULAR[key];
    const rules = [
      [/aron$/u, "ó"], [/ieron$/u, "ió"], [/ían$/u, "ía"], [/aban$/u, "aba"],
      [/án$/u, "á"], [/én$/u, "é"], [/an$/u, "a"], [/en$/u, "e"]
    ];
    for (const [pattern, ending] of rules) {
      if (!pattern.test(key)) continue;
      const singular = key.replace(pattern, ending);
      return singular.length >= 2 && known(singular) ? singular : null;
    }
    return null;
  }

  // Un attribut pluriel suit sa copule au singulier : « fueron aprobadas » →
  // « fue aprobada ».
  function singularizeAttribute(word) {
    const key = lower(word);
    if (!/(?:os|as)$/u.test(key) || key.length < 5) return null;
    const singular = key.slice(0, -1);
    return known(singular) ? singular : null;
  }

  function genderize(word, gender) {
    const table = gender === "f" ? TO_FEMININE : TO_MASCULINE;
    const target = table[lower(word)];
    return target ? preserveCase(word, target) : word;
  }

  function now() {
    return typeof performance !== "undefined" ? performance.now() : Date.now();
  }

  // ---------------------------------------------------------------------
  // Accord à distance avec un sujet-tête singulier
  // ---------------------------------------------------------------------

  const HEAD_PATTERN = new RegExp(
    String.raw`(?<![\p{L}\p{N}])(?:el|la|un|una|este|esta|ese|esa|dicho|dicha|nuestro|nuestra|vuestro|vuestra)` +
    String.raw`\s+(\p{L}+)\s+de\s+(?:(?:los|las|sus|mis|tus|nuestros|nuestras|vuestros|vuestras|estos|estas|esos|esas|otros|otras|varios|varias|muchos|muchas)\s+)?` +
    String.raw`\p{L}+s(?![\p{L}\p{N}])`,
    "giu"
  );

  // « La pila de informes financieros … se han perdido » : c'est la tête (la
  // pila) qui commande le verbe, pas le complément au pluriel. Même faute
  // qu'en français et en anglais, même remède : on cherche le verbe principal
  // en sautant la relative, puis on le repasse au singulier.
  function fixDistanceAgreement(text, count) {
    let output = "";
    let cursor = 0;
    let match;
    HEAD_PATTERN.lastIndex = 0;

    while ((match = HEAD_PATTERN.exec(text))) {
      const head = lower(match[1]);
      if (head.endsWith("s") || QUANTIFIER_HEADS.has(head) || !known(head)) continue;

      const start = match.index + match[0].length;
      const stop = text.slice(start).search(/[.;!?\n]/u);
      const end = stop === -1 ? text.length : start + stop;
      const clause = text.slice(start, end);
      const fixed = singularizeClause(clause, head, count);
      if (fixed === clause) continue;

      output += text.slice(cursor, start) + fixed;
      cursor = end;
      HEAD_PATTERN.lastIndex = end;
    }
    return output + text.slice(cursor);
  }

  function singularizeClause(clause, head, count) {
    const tokens = [...clause.matchAll(/[\p{L}\p{M}]+/gu)];
    let seenRelative = false;
    let relativeDone = false;
    let result = clause;
    let shift = 0;

    const splice = (token, replacement) => {
      const at = token.index + shift;
      result = result.slice(0, at) + preserveCase(token[0], replacement) + result.slice(at + token[0].length);
      shift += replacement.length - token[0].length;
      count.value += 1;
    };

    for (let i = 0; i < tokens.length && i < 30; i += 1) {
      const word = lower(tokens[i][0]);
      const previous = i > 0 ? lower(tokens[i - 1][0]) : "";

      if (word === "que" && !seenRelative) { seenRelative = true; continue; }
      if (BEFORE_NOUN.has(previous) && !PREVERBAL.has(previous)) continue;

      const singular = singularizeVerb(word);
      if (!singular) continue;

      if (seenRelative && !relativeDone) {
        // Verbe de la relative : ambigu en général, tranché seulement quand la
        // tête est un contenant et le verbe un verbe de contenu.
        relativeDone = true;
        if (CONTAINER_HEADS.has(head) && CONTAINMENT_VERBS.test(word)) splice(tokens[i], singular);
        continue;
      }

      splice(tokens[i], singular);
      // Attribut d'une copule : il suit le verbe au singulier.
      const next = tokens[i + 1];
      if (next && COPULAS.has(word)) {
        const attribute = singularizeAttribute(next[0]);
        if (attribute) splice(next, attribute);
      }
      break;
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Impératif de vosotros
  // ---------------------------------------------------------------------

  // « Decirme » pour « decidme » : l'infinitif employé comme impératif est la
  // faute la plus répandue d'Espagne, mais elle n'a pas sa place dans un écrit
  // professionnel. On ne corrige qu'en tête de phrase, et jamais quand
  // l'infinitif est en réalité sujet (« Decirme la verdad no es fácil »).
  const IMPERATIVE_PATTERN =
    /(^|[.!?¡¿\n]\s*|,\s*)(\p{L}{2,})(ar|er|ir)(me|nos|le|les|lo|la|los|las|os)(?![\p{L}\p{N}])([^.!?\n]{0,40})/giu;

  function fixVosotrosImperative(text, count) {
    return text.replace(IMPERATIVE_PATTERN, (match, lead, stem, ending, pronoun, tail) => {
      const infinitive = `${stem}${ending}`;
      if (!known(lower(infinitive))) return match;
      // Un infinitif sujet est presque toujours suivi de sa copule.
      if (/(?<![\p{L}])(es|era|fue|será|sería|resulta|parece|significa|suena)(?![\p{L}])/iu.test(tail)) return match;

      const stemLower = lower(ending);
      let corrected;
      if (lower(pronoun) === "os") {
        // Le -d tombe devant « os » : callad + os → callaos, venid + os → veníos.
        if (!stem) return match;
        corrected = stemLower === "ar" ? `${stem}aos` : stemLower === "er" ? `${stem}eos` : `${stem}íos`;
      } else {
        const imperative = stemLower === "ar" ? "ad" : stemLower === "er" ? "ed" : "id";
        corrected = `${stem}${imperative}${pronoun}`;
      }
      count.value += 1;
      return `${lead}${preserveCase(`${stem}${ending}`, corrected)}${tail}`;
    });
  }

  // ---------------------------------------------------------------------
  // Correction
  // ---------------------------------------------------------------------

  function correctSpanishText(source) {
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

    // 1. Graphies soudées, abréviations SMS et numéraux composés. Une clé d'une
    //    seule lettre (« q », « k ») n'est développée qu'entre des mots : après
    //    un nombre, c'est une unité ou une initiale (« 50 k », « Juan Q. »).
    replace(FIXED_PATTERN, (match, offset, whole) => {
      const right = FIXED.get(lower(match).replace(/\s+/gu, " "));
      if (!right) return match;
      if (match.length === 1 && /\p{N}\s*$/u.test(whole.slice(0, offset))) return match;
      return preserveCase(match.replace(/\s+/gu, " "), right);
    });

    // 2. Abréviations orales qu'un courriel professionnel développe. Le nombre
    //    est donné par le déterminant : « vuestras dispo » est un pluriel.
    replace(
      /(?<![\p{L}\p{N}])((?:las|los|vuestras|nuestras|sus|mis|tus|unas|estas|esas|varias|algunas|muchas)\s+)?dispos?(?![\p{L}\p{N}])/giu,
      (match, determiner) => {
        const plural = /s$/iu.test(match.trim()) || (determiner && /s\s+$/u.test(determiner));
        return `${determiner || ""}${plural ? "disponibilidades" : "disponibilidad"}`;
      }
    );
    replace(
      /(?<![\p{L}\p{N}])((?:la|las|una|unas|esta|estas|mi|mis|tu|tus|su|sus|vuestra|vuestras|nuestra|nuestras)\s+)infos?(?![\p{L}\p{N}])/giu,
      (match, determiner) => {
        const plural = /s$/iu.test(match.trim()) || /s\s+$/u.test(determiner);
        return `${determiner}${plural ? "informaciones" : "información"}`;
      }
    );
    // « fyi » suit la personne déjà employée dans le message.
    const address = /(?<![\p{L}])(?:os|vuestr[oa]s?)(?![\p{L}])|\p{L}+(?:áis|éis)(?![\p{L}])/iu.test(text)
      ? "vuestra"
      : /(?<![\p{L}])usted(?:es)?(?![\p{L}])/iu.test(text) ? "su" : "tu";
    replace(/(?<![\p{L}\p{N}])fyi(?![\p{L}\p{N}])/giu, (m) => preserveCase(m, `para ${address} información`));
    replace(/(?<![\p{L}\p{N}])asap(?![\p{L}\p{N}])/giu, (m) => preserveCase(m, "cuanto antes"));

    // 3. Calques de bureau. Le déterminant et l'adjectif suivent le genre du
    //    mot espagnol : « un call urgente » → « una llamada urgente ».
    replace(ANGLICISM_PATTERN, (match, chain, word, postposed) => {
      const entry = ANGLICISMS.get(lower(word).replace(/\s+/gu, " "));
      if (!entry) return match;
      const parts = (chain || "").split(/(\s+)/u);
      const plural = Boolean(entry.plural) ||
        parts.some((part) => PLURAL_DETERMINERS.has(lower(part)));
      const noun = plural ? entry.many : entry.one;
      const determiners = parts.map((part) => (/\s/u.test(part) || !part ? part : genderize(part, entry.gender)));
      const adjective = postposed
        ? postposed.replace(/(\p{L}+)$/u, (adj) => {
            const stem = lower(adj).replace(/s$/u, "");
            if (!/[oa]$/u.test(stem)) return adj;
            const agreed = stem.slice(0, -1) + (entry.gender === "f" ? "a" : "o") + (plural ? "s" : "");
            return preserveCase(adj, agreed);
          })
        : "";
      return `${determiners.join("")}${preserveCase(word, noun)}${adjective}`;
    });
    // « short de tiempo » : le calque prend l'accord de son sujet.
    replace(
      /(?<![\p{L}])(estamos|estemos|estáis|estéis|están|estén|andamos|vamos|estábamos|estaban)(\s+)short(\s+de\s+tiempo)(?![\p{L}])/giu,
      (match, verb, space, rest) => `${verb}${space}cortos${rest}`
    );
    replace(
      /(?<![\p{L}])(estoy|estás|está|estaba|esté|ando|voy)(\s+)short(\s+de\s+tiempo)(?![\p{L}])/giu,
      (match, verb, space, rest) => `${verb}${space}corto${rest}`
    );
    replace(/(?<![\p{L}])short(\s+de\s+tiempo)(?![\p{L}])/giu, "con el tiempo justo");
    replace(/(?<![\p{L}])forwarde?ar(?![\p{L}])/giu, (m) => preserveCase(m, "reenviar"));
    replace(/(?<![\p{L}])printear(?![\p{L}])/giu, (m) => preserveCase(m, "imprimir"));

    // 4. Centaines écrites en deux morceaux : « dos-cientos » → « doscientos ».
    replace(
      /(?<![\p{L}\p{N}])(dos|tres|cuatro|cinco|seis|siete|ocho|nueve)[-\s]+cient(os|as)(?![\p{L}\p{N}])/giu,
      (match, unit, gender) => {
        const base = HUNDREDS[lower(unit)];
        return preserveCase(match, lower(gender) === "as" ? `${base.slice(0, -2)}as` : base);
      }
    );

    // 5. Orthographe mot à mot : accents manquants, puis confusions b/v, h, ll,
    //    c/z/s. Les mots capitalisés (noms propres) et les fragments d'adresse
    //    ou d'URL sont épargnés.
    text = text.replace(/(?<![@/\p{N}])\p{L}+(?![@/\p{N}])/gu, (word, offset, whole) => {
      if (word.length > 1 && word === word.toLocaleUpperCase("es-ES")) return word; // sigle
      const capitalized = /^[^\p{Ll}]/u.test(word);
      const opensSentence = /(?:^|[.!?¡¿\n])[\s"«(¡¿]*$/u.test(whole.slice(0, offset));
      if (capitalized && !opensSentence) return word; // nom propre
      const fixed = fixUnknownWord(word, capitalized);
      if (fixed !== word) count.value += 1;
      return fixed;
    });

    // 6. Homophones à accent diacritique : c'est le contexte, et lui seul, qui
    //    tranche. Chaque motif décrit une position où l'autre graphie est
    //    grammaticalement impossible.
    //    « no se qué hacer » → « no sé qué hacer » : après « no / yo / ya », un
    //    interrogatif ou « si » ne peut suivre qu'un verbe.
    replace(
      /(?<![\p{L}])(no|yo|ya|tampoco)(\s+)se(?=\s+(?:qu[eé]|c[oó]mo|cu[aá]ndo|d[oó]nde|qui[eé]n|cu[aá]l|cu[aá]nto|si|lo\s+que|nada|algo|mucho|bien)(?![\p{L}]))/giu,
      (match, adverb, space) => `${adverb}${space}sé`
    );
    replace(/(?<![\p{L}])(no\s+lo)(\s+)se(?![\p{L}])/giu, (match, start, space) => `${start}${space}sé`);
    //    Interrogatif indirect : « sé qué hacer », « no sé cómo ».
    replace(
      /(?<![\p{L}])(s[eé]|sabes|sabe|sabemos|sab[eé]is|saben)(\s+)que(?=\s+(?:hacer|decir|pensar|responder|contestar|poner|elegir|pedir|esperar)\s*[.,;:!?)]|\s+(?:hacer|decir|pensar|responder|contestar|poner|elegir|pedir|esperar)$)/giu,
      (match, verb, space) => `${verb}${space}qué`
    );
    replace(
      /(?<![\p{L}])(s[eé]|sabes|sabe|sabemos|sab[eé]is|saben)(\s+)(como|cuando|donde|quien|cual|cuanto)(?![\p{L}])/giu,
      (match, verb, space, word) => `${verb}${space}${preserveCase(word, INTERROGATIVES.get(lower(word)))}`
    );
    replace(/(?<![\p{L}])(el)(\s+)porque(?![\p{L}])/giu,
      (match, article, space) => `${article}${space}porqué`);
    //    « tu » et « el » ne peuvent pas précéder un verbe conjugué.
    replace(
      /(?<![\p{L}])(tu)(\s+)(?=(?:eres|estás|tienes|puedes|sabes|dices|vas|haces|quieres|debes|vienes|dijiste|has|habías|serás|tendrás)(?![\p{L}]))/giu,
      (match, word, space) => `${preserveCase(word, "tú")}${space}`
    );
    replace(
      /(?<![\p{L}])(el)(\s+)(?=(?:es|era|fue|será|está|estaba|tiene|tenía|puede|sabe|dice|dijo|hizo|quiere|debe|ha|había|me|te|nos|os|le|les|se|lo|la)\s+\p{L})/giu,
      (match, word, space) => `${preserveCase(word, "él")}${space}`
    );
    //    Pronom tonique après préposition : « para mi, » → « para mí, ».
    replace(
      /(?<![\p{L}])(a|para|por|de|en|sobre|hacia|hasta|sin|según|entre|contra|ante)(\s+)mi(?=\s*[,.;:!?)]|\s+(?:me|no)\s)/giu,
      (match, preposition, space) => `${preposition}${space}mí`
    );
    //    Affirmation : « claro que si » → « claro que sí ».
    replace(
      /(?<![\p{L}])(claro|creo|digo|espero|dice|parece|supongo|pienso)(\s+que\s+)si(?=\s*[,.;:!?]|$)/giu,
      (match, verb, middle) => `${verb}${middle}sí`
    );
    replace(/(?<![\p{L}])si(\s+o\s+no)(?![\p{L}])/giu, (match, rest) => `sí${rest}`);
    //    « aún » (todavía) devant une négation ou un verbe d'état.
    replace(
      /(?<![\p{L}])(aun)(\s+)(?=(?:no|estamos|estoy|está|están|es|son|hay|tengo|tenemos|queda|quedan|falta|faltan)(?![\p{L}]))/giu,
      (match, word, space) => `${preserveCase(word, "aún")}${space}`
    );
    //    Subjonctif de dar : « que me de » → « que me dé ».
    replace(
      /(?<![\p{L}])(que\s+(?:me|te|le|nos|os|les))(\s+)de(?![\p{L}])/giu,
      (match, start, space) => `${start}${space}dé`
    );
    //    « esta » ne peut pas introduire un participe masculin ni un adverbe :
    //    c'est le verbe estar. « Mi corazón esta roto » → « está roto ».
    replace(
      new RegExp(
        String.raw`(?<![\p{L}])(esta)(s?)(\s+)(?=(?:\p{L}+(?:ado|ido)|${AFTER_ESTAR.join("|")})(?![\p{L}]))`,
        "giu"
      ),
      (match, word, plural, space) => `${preserveCase(word, plural ? "estás" : "está")}${space}`
    );
    //    « a » devant un participe est toujours l'auxiliaire haber.
    replace(
      new RegExp(String.raw`(?<![\p{L}])(a)(\s+)(?=(?:${PARTICIPLES.join("|")})(?![\p{L}]))`, "giu"),
      (match, word, space) => `${preserveCase(word, "ha")}${space}`
    );
    replace(
      new RegExp(String.raw`(?<![\p{L}])(e)(\s+)(?=(?:${PARTICIPLES.join("|")})(?![\p{L}]))`, "giu"),
      (match, word, space) => `${preserveCase(word, "he")}${space}`
    );
    replace(/(?<![\p{L}])(he|has|ha|hemos|habéis|han)(\s+)echo(?![\p{L}])/giu,
      (match, auxiliary, space) => `${auxiliary}${space}hecho`);
    replace(/(?<![\p{L}])(ay)(\s+que\s+\p{L})/giu, (match, word, rest) => `${preserveCase(word, "hay")}${rest}`);
    replace(/(?<![\p{L}])(que)(\s+)valla(?![\p{L}])/giu, (match, word, space) => `${word}${space}vaya`);
    replace(/(?<![\p{L}])(si)\s+no\s+que(?![\p{L}])/giu, (match, word) => `${preserveCase(word, "sino")} que`);
    replace(
      /(?<![\p{L}])(una|otra|esta|cada|tal|alguna|primera|última|dos|tres|muchas|varias)(\s+)ves(?![\p{L}])/giu,
      (match, determiner, space) => `${determiner}${space}vez`
    );
    //    Prétérit de 2e personne : « dijistes » n'existe pas.
    replace(/(?<![\p{L}])(\p{L}+(?:aste|iste))s(?![\p{L}])/giu, (match, form) => (known(lower(form)) ? form : match));

    // 7. Accord à distance : le sujet-tête singulier commande le verbe.
    text = fixDistanceAgreement(text, count);

    // 8. Mise en relief au pluriel : « Es los problemas … » est un calque du
    //    français. L'espagnol accorde la copule (« Son ») et reprend l'antécédent
    //    devant le relatif (« … los que han causado esto »).
    replace(
      /(?<![\p{L}])(es|era|fue|será|sería)(\s+)(los|las|estos|estas|esos|esas|aquellos|aquellas|unos|unas)(?![\p{L}])([^.;!?\n]*)/giu,
      (match, copula, space, determiner, rest) => {
        const plural = { es: "son", era: "eran", fue: "fueron", "será": "serán", "sería": "serían" }[lower(copula)];
        const feminine = /^(las|estas|esas|aquellas|unas)$/iu.test(determiner);
        const antecedent = feminine ? "las" : "los";
        // Le « que » de la mise en relief est celui qui commande un verbe pluriel.
        const completed = rest.replace(
          /(?<![\p{L}])(que)(\s+)(\p{L}+)/giu,
          (clause, relative, gap, verb, offset, whole) => {
            if (/(?:de|en|con|por|para|sin|sobre|lo|el|la)\s+$/iu.test(whole.slice(0, offset))) return clause;
            if (whole.slice(0, offset).includes(` ${antecedent} que`)) return clause;
            return singularizeVerb(lower(verb)) && !BEFORE_NOUN.has(lower(verb))
              ? `${antecedent} ${relative}${gap}${verb}`
              : clause;
          }
        );
        return `${preserveCase(copula, plural)}${space}${determiner}${completed}`;
      }
    );

    // 9. Impératif de vosotros.
    text = fixVosotrosImperative(text, count);

    // 10. Ponctuation espagnole : une phrase interrogative ou exclamative
    //     s'ouvre par ¿ ou ¡. On traite chaque segment de phrase — délimité par
    //     une ponctuation forte — qui se termine par ? ou ! sans déjà porter le
    //     signe ouvrant. Le signe déjà présent est capturé pour ne pas le doubler.
    text = text.replace(/([¿¡]?)([^.!?¿¡\n]+[?!])/gu, (match, opener, segment) => {
      if (opener) return match;
      const trimmed = segment.trimStart();
      if (!trimmed) return match;
      const lead = segment.slice(0, segment.length - trimmed.length);
      const open = trimmed.endsWith("?") ? "¿" : "¡";
      count.value += 1;
      return `${lead}${open}${trimmed}`;
    });

    // 11. Interrogatifs et exclamatifs accentués : placés juste après un signe
    //     ouvrant, ce sont toujours les formes accentuées, la position lève
    //     l'ambiguïté avec le relatif « que » ou la conjonction.
    replace(
      /([¿¡]\s*)(que|como|cuando|donde|adonde|quien|quienes|cual|cuales|cuanto|cuantos|cuanta|cuantas)(?![\p{L}])/giu,
      (match, opener, word) => `${opener}${preserveCase(word, INTERROGATIVES.get(lower(word)))}`
    );
    replace(/(¿\s*)(porque)(?![\p{L}])/giu, (match, opener, word) => `${opener}${preserveCase(word, "por qué")}`);
    //     Après un interrogatif, « esta » n'a pas de nom à introduire : c'est
    //     encore le verbe estar (« ¿Cómo estas? » → « ¿Cómo estás? »).
    replace(
      /(?<![\p{L}])(cómo|dónde|cuándo|por qué|qué tal)(\s+)esta(s?)(?![\p{L}])/giu,
      (match, word, space, plural) => `${word}${space}est${plural ? "ás" : "á"}`
    );

    // 12. Ponctuation : pas d'espace avant, un espace après.
    replace(/\s+([,;:.!?])/gu, "$1");
    replace(/([,;:])(?=\p{L})/gu, "$1 ");
    replace(/ {2,}/gu, " ");

    return {
      text,
      corrections: count.value,
      durationMs: Math.round(now() - started)
    };
  }

  globalThis.korrSpanishRules = Object.freeze({
    setSpellChecker,
    correctSpanishText
  });
})();
