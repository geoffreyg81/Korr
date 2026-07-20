import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { correctFrenchText, initializeGrammarEngine } from "./grammar-engine.js";
import { correctEnglishText, initializeEnglishEngine } from "./english-engine.js";
import "./language-detection.js";

const IS_MAIN_MODULE = Boolean(
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
);

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT) || 8787;
const OLLAMA_URL = process.env.OLLAMA_URL || "http://127.0.0.1:11434";
const DEFAULT_MODEL = process.env.OLLAMA_MODEL || "gemma3:4b";
// Le modèle occupe ~3 Go tant qu’il reste chargé. Le garder évite 9 s de
// rechargement ; le libérer rend la mémoire à la machine.
const KEEP_ALIVE = process.env.OLLAMA_KEEP_ALIVE || "10m";
// Mode silencieux : brider le nombre de cœurs laisse la machine respirable au
// prix de la vitesse. 0 laisse Ollama utiliser tous les cœurs (le plus rapide).
const OLLAMA_THREADS = Number(process.env.OLLAMA_THREADS) || 0;
const MAX_INPUT_CHARACTERS = 20_000;
const REQUEST_TIMEOUT_MS = 120_000;

// Chaque style a son prompt et ses tolérances de vérification : une
// reformulation change plus de mots qu'une correction, un résumé raccourcit.
const STYLES = {
  corriger: {
    label: "correction",
    prompt: `Tu es un correcteur automatique. Corrige uniquement orthographe, grammaire, conjugaison, ponctuation et syntaxe.
Préserve sens, ton, langue et mise en forme. Ne donne jamais de variantes. Si le genre est inconnu, utilise le masculin non marqué.
Conserve exactement les retours à la ligne et le découpage en paragraphes du texte reçu.
Relis chaque accord sujet-verbe et participe-COD, les verbes impersonnels, les adjectifs verbaux et toute virgule entre un sujet et son verbe.
Pour voir, entendre, regarder ou sentir suivis d’un infinitif : accorde le participe seulement si le COD placé avant fait lui-même l’action de l’infinitif.
Avec une fraction ou un collectif (la moitié de, la majorité de, l’ensemble de), accorde le verbe avec le noyau (la moitié a), pas avec le complément.
Remets les mots dans l’ordre naturel du français, sujet puis verbe puis complément : un complément ou une locution placés avant le verbe qu’ils complètent doivent repasser derrière lui.
Ne remplace jamais un mot déjà correct par une graphie voisine et ne reformule pas le vocabulaire au-delà des anglicismes manifestes.
Réponds uniquement avec le texte corrigé, sans explication ni guillemets.`,
    promptEn: `You are an automatic proofreader for business English. Fix spelling, grammar, verb forms, punctuation and word order.
The writer is a French speaker. Never keep a literal translation: rewrite every phrase so it sounds the way a native colleague would write it: assist to -> attend, take a decision -> make a decision, society -> company, are agree -> agree, demand a delay -> ask for more time, actual -> current (when it means "current"), join someone -> reach someone, depends of -> depends on, since two years -> for two years, the planning -> the schedule, I like it too much -> I really like it, pass by the office -> stop by the office.
Soften aggressive business verbs: demand -> ask for or request. After everyone/everybody, use their, not his. Fix subject-verb agreement even when a clause separates the subject from its verb.
Do not stop at spelling: if a sentence is grammatically correct but no native speaker would phrase it that way, rewrite that sentence.
Uncountable nouns (information, software, feedback, equipment, advice) never take a plural or a stray apostrophe. After crucial/essential/important/necessary that, use the base verb form.
Leave abbreviations, product names, brands and technical jargon exactly as written; never swap an unfamiliar token for a similar-looking word.
Keep the meaning, tone and paragraph breaks exactly as received. Never add content and never replace a correct word with a near-synonym.
Answer with the corrected text only, no explanations, no quotation marks.`,
    minRatio: 0.7,
    maxRatio: 1.3,
    minRetention: 0.72,
    minContentRetention: 0.76,
    minCandidateGrounding: 0.7,
    sameParagraphs: true
  },
  professionnel: {
    label: "style professionnel",
    prompt: `Tu es un assistant de rédaction. Réécris le texte dans sa langue d'origine avec un ton professionnel, courtois et clair, comme dans un courriel de travail soigné.
Corrige toutes les fautes. Conserve toutes les informations, le sens et la langue. N'invente rien, n'ajoute aucune formule de politesse absente du texte.
Réponds uniquement avec le texte réécrit, sans explication ni guillemets.`,
    minRatio: 0.6,
    maxRatio: 1.7,
    minRetention: 0,
    minContentRetention: 0.1,
    minCandidateGrounding: 0.08,
    sameParagraphs: true
  },
  amical: {
    label: "style amical",
    prompt: `Tu es un assistant de rédaction. Réécris le texte dans sa langue d'origine avec un ton naturel, chaleureux et détendu, comme un message à un ami.
Garde le tutoiement ou le vouvoiement d'origine. Corrige toutes les fautes. Conserve toutes les informations et le sens. N'invente rien.
Réponds uniquement avec le texte réécrit, sans explication ni guillemets.`,
    minRatio: 0.6,
    maxRatio: 1.7,
    minRetention: 0,
    minContentRetention: 0.1,
    minCandidateGrounding: 0.08,
    sameParagraphs: true
  },
  concis: {
    label: "version concise",
    prompt: `Tu es un assistant de rédaction. Raccourcis le texte au maximum : va droit au but, supprime les répétitions et les remplissages.
Conserve toutes les informations essentielles, le ton et la langue. Corrige les fautes au passage. N'invente rien.
Réponds uniquement avec le texte raccourci, sans explication ni guillemets.`,
    minRatio: 0.2,
    maxRatio: 1.05,
    minRetention: 0,
    minContentRetention: 0.3,
    minCandidateGrounding: 0.38,
    sameParagraphs: false
  }
};

const server = http.createServer(async (request, response) => {
  setSecurityHeaders(response);

  if (request.method === "OPTIONS") {
    if (!isAllowedOrigin(request.headers.origin)) return sendJson(response, 403, { error: "Origine refusée." });
    response.writeHead(204);
    return response.end();
  }

  if (!isAllowedOrigin(request.headers.origin)) {
    return sendJson(response, 403, { error: "Origine refusée." });
  }

  try {
    if (request.method === "GET" && request.url === "/") {
      return sendJson(response, 200, {
        name: "Korr",
        status: "backend actif",
        defaultEngine: "Grammalecte + Harper instantanés",
        health: "/api/health"
      });
    }

    if (request.method === "GET" && request.url === "/favicon.ico") {
      response.writeHead(204);
      return response.end();
    }

    if (request.method === "GET" && request.url === "/api/health") {
      return await handleHealth(response);
    }

    if (request.method === "POST" && request.url === "/api/correct") {
      return await handleCorrection(request, response);
    }

    return sendJson(response, 404, { error: "Route introuvable." });
  } catch (error) {
    console.error(error);
    return sendJson(response, 500, { error: "Erreur interne du backend." });
  }
});

server.on("error", (error) => {
  if (error?.code === "EADDRINUSE") {
    console.log(`Le backend est déjà démarré sur http://${HOST}:${PORT}. Rien à faire.`);
    process.exit(0);
  }
  throw error;
});

if (IS_MAIN_MODULE) {
  server.listen(PORT, HOST, () => {
    console.log(`Korr prêt sur http://${HOST}:${PORT}`);
    // Le port est ouvert immédiatement ; le moteur se charge juste après.
    // Une requête arrivée pendant le chargement attend simplement la fin.
    setImmediate(async () => {
      initializeGrammarEngine();
      // Phrase de chauffe : le tout premier passage paie la compilation JIT des
      // chemins d'analyse, autant l'absorber ici plutôt qu'à la première requête.
      correctFrenchText("Une petite frase de chauffe pour préparer le moteur avant la première correction.");
      console.log("Correcteur instantané Grammalecte chargé.");
      try {
        await initializeEnglishEngine();
        console.log("Correcteur anglais Harper chargé.");
      } catch (error) {
        console.warn(`Harper indisponible : ${error?.message || error}`);
      }
      console.log(`Mode approfondi optionnel : ${DEFAULT_MODEL}`);
    });
  });
}

async function handleHealth(response) {
  let models = [];
  let ollama = false;
  try {
    const ollamaResponse = await fetch(`${OLLAMA_URL}/api/tags`, {
      signal: AbortSignal.timeout(5_000)
    });
    if (ollamaResponse.ok) {
      const data = await ollamaResponse.json();
      models = (data.models || []).map((model) => model.name);
      ollama = true;
    }
  } catch {
    // Le mode instantané fonctionne sans Ollama.
  }

  return sendJson(response, 200, {
    status: "ok",
    instantEngine: "Grammalecte 2.3.0 + Harper 2.4.0",
    ollama,
    defaultModel: DEFAULT_MODEL,
    models
  });
}

async function handleCorrection(request, response) {
  const startedAt = performance.now();
  const body = await readJsonBody(request);
  const text = typeof body.text === "string" ? body.text : "";
  const mode = body.mode === "deep" ? "deep" : "instant";
  const styleName = Object.hasOwn(STYLES, body.style) ? body.style : "corriger";
  const style = STYLES[styleName];
  const model = validateModel(body.model) || DEFAULT_MODEL;
  const requestedLanguage = ["fr", "en"].includes(body.language) ? body.language : "auto";
  const language = requestedLanguage === "auto"
    ? globalThis.korrLanguage.detectLanguage(text)
    : requestedLanguage;

  if (!text.trim()) return sendJson(response, 400, { error: "Aucun texte à corriger." });
  if (text.length > MAX_INPUT_CHARACTERS) {
    return sendJson(response, 413, {
      error: `Texte trop long : maximum ${MAX_INPUT_CHARACTERS.toLocaleString("fr-FR")} caractères.`
    });
  }

  if (mode === "instant") {
    const result = await correctInstantText(text, language);
    return sendJson(response, 200, {
      ...result,
      engine: instantEngineName(language),
      language,
      ...(language === "mixed" ? {
        fallback: "Texte français et anglais mélangé : choisissez explicitement la langue."
      } : {}),
      ...(language === "es" ? {
        fallback: "Texte espagnol détecté : la correction espagnole (beta) n'existe que sur le site."
      } : {})
    });
  }

  // Le moteur déterministe nettoie d’abord les fautes simples. Le modèle se
  // concentre ainsi sur la syntaxe, puis sa réponse repasse dans le même filet.
  const instantResult = await correctInstantText(text, language);
  const preparedText = instantResult.text;

  if (language === "mixed") {
    return sendJson(response, 200, {
      ...instantResult,
      engine: "mixed",
      language,
      style: styleName,
      fallback: "Texte français et anglais mélangé : choisissez explicitement la langue."
    });
  }

  // Le modèle reçoit un prompt rédigé pour le français ou l'anglais : lui
  // soumettre de l'espagnol produirait une réécriture dans la mauvaise langue.
  if (language === "es") {
    return sendJson(response, 200, {
      ...instantResult,
      engine: "unsupported",
      language,
      style: styleName,
      fallback: "Texte espagnol détecté : la correction espagnole (beta) n'existe que sur le site."
    });
  }

  // Un SMS déjà remis au propre n'a pas besoin de l'IA pour une simple
  // correction ; les styles de réécriture, eux, gardent leur raison d'être.
  if (instantResult.smsDetected && styleName === "corriger") {
    return sendJson(response, 200, {
      ...instantResult,
      engine: instantEngineName(language),
      language,
      style: styleName,
      fallback: "Langage SMS corrigé en mode rapide · IA 4B inutile."
    });
  }

  // Un petit modèle sature sur un texte long : l'attention se dilue et la fin
  // du texte part en hallucination (« quoi quel arrivant »). Chaque paragraphe
  // est donc soumis séparément — la correction est une tâche locale, aucun
  // paragraphe n'a besoin des autres. Seule la réécriture libre (style
  // « concis ») garde le texte entier, car elle fusionne des paragraphes.
  // Un texte anglais reçoit ses propres instructions : la chasse aux calques
  // du francophone n'a pas de sens dans un prompt rédigé pour le français.
  const activeStyle = language === "en" && style.promptEn
    ? { ...style, prompt: style.promptEn }
    : style;

  let correctedText;
  if (style.sameParagraphs) {
    const chunks = splitIntoLlmChunks(preparedText);
    const correctedChunks = [];
    for (const chunk of chunks) {
      if (!chunk.trim()) {
        correctedChunks.push(chunk);
        continue;
      }
      const generated = await generateWithOllama(model, activeStyle, chunk);
      if (generated.fatal) return sendJson(response, generated.status, { error: generated.error });
      // Un paragraphe rejeté (réponse invraisemblable ou vide) retombe sur sa
      // version déterministe : le reste du texte garde le bénéfice du modèle.
      correctedChunks.push(
        generated.text && isPlausibleCorrection(chunk, generated.text, style)
          ? generated.text
          : chunk
      );
    }
    correctedText = correctedChunks.join("");
  } else {
    const generated = await generateWithOllama(model, activeStyle, preparedText);
    if (generated.fatal) return sendJson(response, generated.status, { error: generated.error });
    correctedText = generated.text;
    if (!correctedText) {
      return sendJson(response, 502, { error: "Le modèle n'a renvoyé aucun texte." });
    }
    if (!isPlausibleCorrection(preparedText, correctedText, style)) {
      return sendJson(response, 200, {
        ...instantResult,
        engine: instantEngineName(language),
        language,
        style: styleName,
        fallback: "Réponse IA écartée car elle s’éloignait trop du texte."
      });
    }
  }

  const verifiedResult = await correctInstantText(correctedText, language);
  // Grammalecte est normalement conservateur, mais le résultat effectivement
  // renvoyé doit respecter les mêmes protections que la sortie brute du LLM.
  if (!isPlausibleCorrection(preparedText, verifiedResult.text, style)) {
    return sendJson(response, 200, {
      ...instantResult,
      engine: instantEngineName(language),
      language,
      style: styleName,
      fallback: "Réponse IA écartée après vérification de son contenu."
    });
  }

  return sendJson(response, 200, {
    ...verifiedResult,
    durationMs: Math.round(performance.now() - startedAt),
    engine: language === "en" ? "ollama+harper" : "ollama+grammalecte",
    language,
    style: styleName,
    model
  });
}

// Découpe un texte en tranches pour le modèle : les paragraphes sont les
// unités naturelles, regroupés tant que la tranche reste sous la limite où le
// 4B commence à halluciner. Les séparateurs (sauts de ligne) sont des tranches
// à part entière, ce qui garantit une reconstruction à l'identique.
const LLM_CHUNK_TARGET = 700;

function splitIntoLlmChunks(text) {
  const parts = text.split(/(\n+)/u);
  const chunks = [];
  let current = "";

  for (const part of parts) {
    if (/^\n+$/u.test(part)) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      chunks.push(part);
      continue;
    }
    // Un paragraphe monolithe dépassant nettement la cible est redécoupé sur
    // ses fins de phrase : c'est précisément le format qui fait dériver le
    // modèle en fin de génération.
    const pieces = part.length > LLM_CHUNK_TARGET * 1.5
      ? (part.match(/[^.!?…]*[.!?…]+[\s  ]*|[^.!?…]+$/gu) || [part])
      : [part];

    for (const piece of pieces) {
      if (current && current.length + piece.length > LLM_CHUNK_TARGET) {
        chunks.push(current);
        current = piece;
      } else {
        current += piece;
      }
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

// Une génération Ollama : ne retourne « fatal » que pour les erreurs qui
// condamnent toute la requête (service éteint, modèle absent). Une réponse
// vide n'est pas fatale : l'appelant décide du repli.
async function generateWithOllama(model, style, prompt) {
  let ollamaResponse;
  try {
    ollamaResponse = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      body: JSON.stringify({
        model,
        system: style.prompt,
        prompt,
        stream: false,
        think: false,
        keep_alive: KEEP_ALIVE,
        options: {
          temperature: 0,
          num_ctx: 4096,
          num_predict: Math.min(4096, Math.max(96, Math.ceil(prompt.length / 2) + 64)),
          ...(OLLAMA_THREADS > 0 ? { num_thread: OLLAMA_THREADS } : {})
        }
      })
    });
  } catch (error) {
    const timedOut = error?.name === "TimeoutError";
    return {
      fatal: true,
      status: 503,
      error: timedOut
        ? "Le modèle local a mis trop de temps à répondre."
        : "Ollama est inaccessible. Vérifie qu'il est démarré."
    };
  }

  const data = await ollamaResponse.json().catch(() => ({}));
  if (!ollamaResponse.ok) {
    const modelMissing = /not found/i.test(data?.error || "");
    return {
      fatal: true,
      status: ollamaResponse.status,
      error: modelMissing
        ? `Le modèle « ${model} » n'est pas installé. Lance : ollama pull ${model}`
        : data?.error || "La génération locale a échoué."
    };
  }

  return { text: typeof data.response === "string" ? data.response.trim() : "" };
}

async function correctInstantText(text, language) {
  // L'espagnol n'existe que sur le site : l'application n'embarque pas son
  // moteur. Le renvoyer au correcteur français lui appliquerait des règles
  // d'une autre langue, ce qui abîmerait le texte au lieu de le corriger.
  if (language === "mixed" || language === "es") {
    return { text, corrections: 0, durationMs: 0 };
  }
  return language === "en" ? correctEnglishText(text) : correctFrenchText(text);
}

function instantEngineName(language) {
  if (language === "mixed") return "mixed";
  if (language === "es") return "unsupported";
  return language === "en" ? "harper" : "grammalecte";
}

function isPlausibleCorrection(source, candidate, style) {
  const normalizedCandidate = candidate.trim();
  if (!normalizedCandidate) return false;

  if (looksLikeAssistantWrapper(normalizedCandidate) && !looksLikeAssistantWrapper(source)) {
    return false;
  }

  const lengthRatio = normalizedCandidate.length / Math.max(1, source.length);
  if (lengthRatio < style.minRatio || lengthRatio > style.maxRatio) return false;

  if (style.sameParagraphs) {
    const sourceParagraphs = source.split(/\n\s*\n/u).length;
    const candidateParagraphs = normalizedCandidate.split(/\n\s*\n/u).length;
    if (sourceParagraphs !== candidateParagraphs) return false;
  }

  if (!hasSameProtectedEntities(source, normalizedCandidate)) return false;
  if (!preservesLikelyProperNames(source, normalizedCandidate)) return false;

  const sourceWords = new Set(extractWords(source).filter((word) => word.length >= 4));
  const candidateWords = new Set(extractWords(normalizedCandidate).filter((word) => word.length >= 4));

  if (style.minRetention && sourceWords.size) {
    let retainedWords = 0;
    for (const word of sourceWords) {
      if (candidateWords.has(word)) retainedWords += 1;
    }
    if (retainedWords / sourceWords.size < style.minRetention) return false;
  }

  return hasSufficientContentOverlap(source, normalizedCandidate, style);
}

// Les mots outils ne prouvent pas qu'une réponse parle encore du même sujet.
// Ils sont donc retirés du contrôle sémantique léger ci-dessous.
const FRENCH_STOP_WORDS = new Set([
  "afin", "ainsi", "alors", "apres", "au", "aucun", "aux", "avec", "avant",
  "bien", "car", "ce", "cela", "ces", "cet", "cette", "chez", "comme", "dans",
  "de", "des", "donc", "dont", "du", "elle", "elles", "en", "encore", "entre",
  "est", "et", "etre", "eux", "il", "ils", "je", "la", "le", "les", "leur",
  "leurs", "lui", "mais", "me", "meme", "mes", "moi", "mon", "ne", "ni", "nos",
  "notre", "nous", "on", "ou", "par", "pas", "plus", "pour", "que", "quel", "quelle",
  "quelles", "quels", "qui", "sa", "sans", "se", "ses", "si", "soi", "son", "sont",
  "sous", "sur", "ta", "te", "tes", "toi", "ton", "tous", "tout", "toute", "toutes",
  "tres", "tu", "un", "une", "vos", "votre", "vous", "y"
]);

const COMMON_CAPITALIZED_WORDS = new Set([
  ...FRENCH_STOP_WORDS,
  "bonjour", "bonsoir", "salut", "merci", "cordialement", "cher", "chere",
  "ensuite", "cependant", "pourtant", "voici", "voila", "lundi", "mardi",
  "mercredi", "jeudi", "vendredi", "samedi", "dimanche", "janvier", "fevrier",
  "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre",
  "novembre", "decembre"
]);

// Sans analyseur d'entités nommées, une majuscule en début de phrase est
// ambiguë. Cette liste courte permet de protéger les noms les plus courants
// sans prendre "Contacte", "Réunion", etc. pour des personnes.
const PROPER_NAME_HINTS = new Set([
  "alain", "alexandre", "alice", "amelie", "antoine", "arthur", "camille",
  "charlotte", "chloe", "claire", "david", "emma", "eric", "eva", "francois",
  "gabriel", "hugo", "isabelle", "jean", "julie", "julien", "laurent", "lea",
  "leo", "luc", "lucas", "manon", "marc", "marie", "mathieu", "nathalie",
  "nicolas", "paul", "pierre", "sophie", "stephane", "thomas", "valerie",
  "paris", "lyon", "marseille", "toulouse", "bordeaux", "lille", "nantes",
  "rennes", "nice", "strasbourg", "france", "europe"
]);

function hasSameProtectedEntities(source, candidate) {
  const extractors = [
    extractEmails,
    extractUrls,
    extractMentionsAndHashtags,
    extractAcronyms,
    extractNumericSignatures
  ];

  return extractors.every((extract) => sameSet(extract(source), extract(candidate)));
}

function extractEmails(text) {
  return new Set(
    (text.match(/[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/giu) || [])
      .map((value) => value.toLocaleLowerCase("fr-FR"))
  );
}

function extractUrls(text) {
  return new Set(
    (text.match(/(?:https?:\/\/|www\.)[^\s<>{}\[\]"'\u2019]+/giu) || [])
      .map((value) => value.replace(/[),.;:!?]+$/u, ""))
  );
}

function extractMentionsAndHashtags(text) {
  return new Set(
    (text.match(/(?<![\p{L}\p{N}._%+-])[@#][\p{L}\p{N}_]{2,}/gu) || [])
      .map((value) => value.toLocaleLowerCase("fr-FR"))
  );
}

function extractAcronyms(text) {
  const dotted = text.match(/(?<![\p{L}\p{N}])(?:\p{Lu}\.){2,}(?![\p{L}\p{N}])/gu) || [];
  const solid = text.match(
    /(?<![\p{L}\p{N}])(?:\p{Lu}{2,}[\p{Lu}\p{N}]*(?:[-\/]?[\p{Lu}\p{N}]+)*|\p{Lu}[\p{Lu}\p{N}]*\d[\p{Lu}\p{N}-]*|\d+\p{Lu}+)(?![\p{L}\p{N}])/gu
  ) || [];

  return new Set([...dotted, ...solid].map((value) => value.replace(/\./gu, "")));
}

function extractNumericSignatures(text) {
  // Rend "10 000" et "10000" équivalents, sans confondre les espaces
  // ordinaires d'une date ou d'une phrase.
  const compactThousands = text.replace(
    /\b\d{1,3}(?:[\u0020\u00a0\u202f]\d{3})+\b/gu,
    (value) => value.replace(/[\u0020\u00a0\u202f]/gu, "")
  );
  const numbers = compactThousands.match(/\d+/gu) || [];
  return new Set(numbers.map((value) => value.replace(/^0+(?=\d)/u, "")));
}

function sameSet(first, second) {
  if (first.size !== second.size) return false;
  for (const value of first) {
    if (!second.has(value)) return false;
  }
  return true;
}

function preservesLikelyProperNames(source, candidate) {
  const sourceWords = new Set(extractWords(source));
  const candidateWords = new Set(extractWords(candidate));
  const sourceNames = extractLikelyProperNames(source);
  const candidateNames = extractLikelyProperNames(candidate);

  // Un nom présent dans le texte d'origine ne peut ni disparaître ni être
  // remplacé. En sens inverse, seuls les noms fortement détectés (majuscule
  // hors début de phrase ou casse interne) bloquent une invention du modèle.
  for (const { normalized } of sourceNames) {
    if (!candidateWords.has(normalized)) return false;
  }
  for (const { normalized, strong } of candidateNames) {
    if (strong && !sourceWords.has(normalized)) return false;
  }
  return true;
}

function extractLikelyProperNames(text) {
  const names = [];
  const tokenPattern = /[\p{L}][\p{L}\p{M}'\u2019-]*/gu;

  for (const match of text.matchAll(tokenPattern)) {
    const word = match[0];
    const normalized = normalizeWord(word);
    if (normalized.length < 2 || COMMON_CAPITALIZED_WORDS.has(normalized)) continue;

    const hasInitialCapital = /^\p{Lu}/u.test(word);
    const hasInternalCapital = /[\p{Ll}\p{M}][\p{Lu}]/u.test(word) || /-\p{Lu}/u.test(word);
    if (!hasInitialCapital && !hasInternalCapital) continue;
    if (/^\p{Lu}{2,}$/u.test(word)) continue; // Déjà protégé comme acronyme.

    const before = text.slice(0, match.index);
    const atSentenceStart = !before.trim() || /(?:[.!?]\s*|\n\s*)$/u.test(before);
    const afterTitle = /(?:M(?:me|lle)?|Dr|Pr|Ma[iî]tre)\.?\s+$/u.test(before);
    const after = text.slice(match.index + word.length);
    const isVocative = /^\s*,/u.test(after);
    const startsCapitalizedSequence = /^\s+\p{Lu}[\p{L}\p{M}'\u2019-]*/u.test(after);

    if (
      atSentenceStart &&
      !hasInternalCapital &&
      !afterTitle &&
      !isVocative &&
      !startsCapitalizedSequence &&
      !PROPER_NAME_HINTS.has(normalized)
    ) {
      continue;
    }
    names.push({
      normalized,
      strong: true
    });
  }

  return names;
}

function hasSufficientContentOverlap(source, candidate, style) {
  const sourceContent = contentWords(source);
  const candidateContent = contentWords(candidate);

  if (!sourceContent.size) {
    // Pour un texte très court, exiger tout de même au moins un mot commun.
    const sourceWords = new Set(extractWords(source));
    const candidateWords = new Set(extractWords(candidate));
    return sourceWords.size === 0 || [...sourceWords].some((word) => candidateWords.has(word));
  }
  if (!candidateContent.size) return false;

  const sourceRetention = relatedWordRatio(sourceContent, candidateContent);
  if (sourceRetention < (style.minContentRetention ?? 0)) return false;

  const candidateGrounding = relatedWordRatio(candidateContent, sourceContent);
  return candidateGrounding >= (style.minCandidateGrounding ?? 0);
}

function contentWords(text) {
  return new Set(
    extractWords(text).filter((word) => word.length >= 3 && !FRENCH_STOP_WORDS.has(word))
  );
}

function extractWords(text) {
  return (text.match(/[\p{L}\p{M}]+/gu) || []).map(normalizeWord).filter(Boolean);
}

function normalizeWord(word) {
  return word
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/œ/gu, "oe")
    .replace(/æ/gu, "ae");
}

function relatedWordRatio(words, referenceWords) {
  let matches = 0;
  for (const word of words) {
    if ([...referenceWords].some((reference) => areRelatedWords(word, reference))) {
      matches += 1;
    }
  }
  return matches / Math.max(1, words.size);
}

function areRelatedWords(first, second) {
  if (first === second) return true;
  const firstStem = lightFrenchStem(first);
  const secondStem = lightFrenchStem(second);
  if (firstStem.length >= 4 && firstStem === secondStem) return true;

  // Tolère une petite correction orthographique, sans assimiler deux mots
  // courts simplement parce qu'ils commencent de la même façon.
  if (Math.min(first.length, second.length) < 6) return false;
  if (Math.abs(first.length - second.length) > 2) return false;
  return commonPrefixLength(first, second) >= Math.min(first.length, second.length) - 2;
}

function lightFrenchStem(word) {
  let stem = word;
  if (stem.endsWith("aux") && stem.length > 5) stem = `${stem.slice(0, -3)}al`;

  const suffixes = [
    "issements", "issement", "atrices", "ateurs", "ations", "ement", "ments",
    "iques", "ique", "euses", "ables", "aient", "erait", "eraient", "antes",
    "ante", "ives", "ive", "ifs", "ees", "ee", "es", "s"
  ];
  for (const suffix of suffixes) {
    if (stem.endsWith(suffix) && stem.length - suffix.length >= 4) {
      return stem.slice(0, -suffix.length);
    }
  }
  return stem;
}

function commonPrefixLength(first, second) {
  let length = 0;
  while (length < first.length && length < second.length && first[length] === second[length]) {
    length += 1;
  }
  return length;
}

function looksLikeAssistantWrapper(text) {
  return /^(?:```|voici\s+(?:le|la|une|votre)\s+(?:texte|version|correction)|(?:texte|version)\s+(?:corrig(?:e|ee)|reecrit(?:e)?|concise)\s*:)/iu.test(
    text.trimStart()
  );
}

export {
  STYLES,
  extractAcronyms,
  extractEmails,
  extractLikelyProperNames,
  extractMentionsAndHashtags,
  extractNumericSignatures,
  extractUrls,
  hasSameProtectedEntities,
  isPlausibleCorrection,
  preservesLikelyProperNames
};

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let rawBody = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      rawBody += chunk;
      if (rawBody.length > MAX_INPUT_CHARACTERS * 2) {
        reject(new Error("Corps de requête trop volumineux."));
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(rawBody || "{}"));
      } catch {
        reject(new Error("JSON invalide."));
      }
    });
    request.on("error", reject);
  });
}

function validateModel(model) {
  if (typeof model !== "string") return "";
  const normalized = model.trim();
  return /^[a-zA-Z0-9._:/-]{1,100}$/.test(normalized) ? normalized : "";
}

function isAllowedOrigin(origin) {
  return !origin || origin.startsWith("chrome-extension://");
}

function setSecurityHeaders(response) {
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
  response.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("X-Content-Type-Options", "nosniff");
}

function sendJson(response, status, data) {
  response.writeHead(status);
  response.end(JSON.stringify(data));
}
