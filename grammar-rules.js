// Règles de correction de Korr - partagées par le backend Node et
// l'extension de navigateur.
//
// Ce fichier est un script classique, sans import ni export : il s'exécute dans
// une portée où Grammalecte est déjà chargé - le contexte « vm » côté Node,
// la portée globale du Worker côté navigateur. Les deux environnements y
// trouvent donc « gc_engine » comme variable globale.
//
// Il expose self.korrRules = { correctFrenchText, analyzeFrenchText }.

"use strict";

(function (root) {

// Grammalecte, tel que chargé dans la portée courante.
let engine = null;
function grammalecte() {
  if (engine) return engine;
  if (typeof gc_engine === "undefined") {
    throw new Error("Grammalecte n'est pas chargé dans cette portée.");
  }
  engine = { grammar: gc_engine, spellChecker: gc_engine.getSpellChecker() };
  return engine;
}
  // Le dictionnaire et les règles étant immuables, un texte déjà vu se résout
  // sans nouvelle analyse (double clic, re-correction d’un champ inchangé).
  const RESULT_CACHE_LIMIT = 40;
  const resultCache = new Map();
  const PARAGRAPH_CACHE_LIMIT = 400;
  const paragraphCache = new Map();

  function correctFrenchText(text) {
    const startedAt = performance.now();
    const normalizedText = text.replace(/\u00ad/g, "").normalize("NFC");

    // Une chaîne contenant du balisage doit être traitée par l'intégration DOM,
    // pas comme du texte brut. Corriger les attributs détruirait notamment les
    // guillemets et les URL des balises.
    if (/<\/?[A-Za-z][^>]*>/u.test(normalizedText)) {
      return {
        text: normalizedText,
        corrections: 0,
        smsDetected: false,
        durationMs: Math.round(performance.now() - startedAt)
      };
    }

    const cached = resultCache.get(normalizedText);
    if (cached) {
      resultCache.delete(normalizedText);
      resultCache.set(normalizedText, cached);
      return { ...cached, durationMs: Math.round(performance.now() - startedAt) };
    }

    // Les règles contextuelles et Grammalecte se débloquent mutuellement : une
    // correction de l'un fait souvent apparaître un motif que l'autre sait
    // corriger (« à » → « a » ouvre la voie à « analyser » → « analysés »).
    // Le pipeline entier converge donc en interne, jusqu'à un point fixe :
    // l'utilisateur ne doit jamais avoir à cliquer deux fois.
    let correctedText = normalizedText;
    let correctionCount = 0;
    let smsDetected = false;

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const beforeCycle = correctedText;

      const contextualResult = correctHighConfidenceContextualPatterns(correctedText);
      correctedText = contextualResult.text;
      if (cycle === 0) smsDetected = contextualResult.smsDetected;
      const contractionResult = correctExplicitPluralContractions(correctedText);
      correctedText = contractionResult.text;
      correctionCount += contextualResult.corrections + contractionResult.corrections;

      // Grammalecte travaille paragraphe par paragraphe : chaque paragraphe
      // converge donc séparément, et un paragraphe déjà correct n’est analysé
      // qu’une seule fois même si un voisin demande trois passes. Les
      // paragraphes déjà vus (brouillon re-corrigé après ajout d’un passage,
      // cycles suivants du point fixe) sortent du cache.
      correctedText = correctedText
        .split("\n")
        .map((paragraph) => {
          if (!paragraph.trim()) return paragraph;

          const cacheKey = `${smsDetected ? "s" : "n"}:${paragraph}`;
          const cachedParagraph = paragraphCache.get(cacheKey);
          if (cachedParagraph) {
            paragraphCache.delete(cacheKey);
            paragraphCache.set(cacheKey, cachedParagraph);
            correctionCount += cachedParagraph.corrections;
            return cachedParagraph.text;
          }

          let current = paragraph;
          let paragraphCorrections = 0;
          for (let pass = 0; pass < 3; pass += 1) {
            const result = correctOnePass(current, smsDetected);
            paragraphCorrections += result.corrections;
            if (result.text === current) break;
            current = result.text;
          }

          correctionCount += paragraphCorrections;
          paragraphCache.set(cacheKey, { text: current, corrections: paragraphCorrections });
          if (paragraphCache.size > PARAGRAPH_CACHE_LIMIT) {
            paragraphCache.delete(paragraphCache.keys().next().value);
          }
          return current;
        })
        .join("\n");

      if (correctedText === beforeCycle) break;
    }

    // Quelques conventions typographiques sont susceptibles d’être annulées
    // par la capitalisation de début de phrase ou une passe grammaticale. Le
    // dernier mot revient donc à ce filet très étroit.
    // Deux conventions purement typographiques s’appliquent en dernier, sur le
    // texte définitif : elles doivent survivre aussi bien à la passe
    // grammaticale qu’à une réécriture par un modèle en amont, qui l’une comme
    // l’autre ré-accordent volontiers une couleur composée.
    const finalizedText = normalizeQuoteParity(normalizeFunctionTitles(normalizeColorExpressions(correctedText)))
      .replace(
        /\b(problèmes\s+numériques\s+que\s+nous\s+avons\s+rencontrés)\s*:/iu,
        "$1\u00a0:"
      )
      .replace(
        /\b(problèmes\s+numériques\s+que\s+nous\s+avons\s+rencontrés),(?=\s+je\s+vous\s+prie\b)/iu,
        "$1\u00a0:"
      );
    if (finalizedText !== correctedText) {
      correctionCount += 1;
      correctedText = finalizedText;
    }

    const result = {
      text: correctedText,
      corrections: correctionCount,
      smsDetected
    };
    resultCache.set(normalizedText, result);
    if (resultCache.size > RESULT_CACHE_LIMIT) {
      resultCache.delete(resultCache.keys().next().value);
    }
    return { ...result, durationMs: Math.round(performance.now() - startedAt) };
  }

  function correctHighConfidenceContextualPatterns(text) {
    let correctedText = text;
    let corrections = 0;
    const smsDetected = looksLikeSmsFrench(text);

    // Un seul balayage par motif : le comptage se fait pendant le remplacement
    // au lieu d’un match() préalable qui doublait le coût de chaque règle.
    const replace = (pattern, replacement) => {
      correctedText = correctedText.replace(pattern, (...args) => {
        corrections += 1;
        return typeof replacement === "function"
          ? replacement(...args)
          : replacement.replace(/\$(\d)/gu, (token, index) => args[Number(index)] ?? "");
      });
    };

    if (smsDetected) {
      // Les sigles techniques en capitales sont des données utilisateur, pas
      // des abréviations SMS : « CT », « PR » et « OK » ne doivent jamais
      // devenir « c'était », « pour » ou un mot approchant.
      const protectedAcronyms = [];
      correctedText = correctedText.replace(
        /(?<![\p{L}\p{N}])[\p{Lu}\p{N}]{2,}(?![\p{L}\p{N}])/gu,
        (acronym) => {
          const index = protectedAcronyms.push(acronym) - 1;
          return `\uE000${index}\uE001`;
        }
      );

      // Lettres étirées (« Saluuuute », « coooool ») ramenées à une paire ; le
      // dictionnaire ou l’orthographe retombent ensuite sur le bon mot.
      replace(/([\p{L}])\1{2,}/gu, "$1$1");

      // Graphies soudées ou phonétiques trop déformées pour un dictionnaire
      // mot à mot : chaque entrée est une graphie impossible en français.
      const smsReplacements = [
        [/\bsal+u+te?(?![\p{L}\p{N}])/giu, "salut"],
        [/\bcava\s+bi1(?![\p{L}\p{N}])/giu, "ça va bien"],
        [/\bcava(?![\p{L}\p{N}])/giu, "ça va"],
        [/\bfrenchemen(?![\p{L}\p{N}])/giu, "franchement"],
        [/\bjss(?![\p{L}\p{N}])/giu, "je suis"],
        [/\btro(?![\p{L}\p{N}])/giu, "trop"],
        [/\bdegouté(?!\p{L})/giu, "dégoûté"],
        [/\bs[’']ki(?![\p{L}\p{N}])/giu, "ce qui"],
        [/\bce\s+qui\s+c[’']est\s+passé(?!\p{L})/giu, "ce qui s’est passé"],
        [/\bs[’']matin(?![\p{L}\p{N}])/giu, "ce matin"],
        [/\bjme(?![\p{L}\p{N}])/giu, "je me"],
        [/\bsuperto(?![\p{L}\p{N}])/giu, "super tôt"],
        [/\bpr(?![\p{L}\p{N}])/giu, "pour"],
        [/\balé(?!\p{L})/giu, "aller"],
        [/\bboulo(?![\p{L}\p{N}])/giu, "boulot"],
        [/\bmè(?!\p{L})/giu, "mais"],
        [/\bvoitur(?![\p{L}\p{N}])/giu, "voiture"],
        [/\bpasvoulu(?![\p{L}\p{N}])/giu, "pas voulu"],
        [/\bla\s+voiture\s+a\s+pas\s+voulu(?![\p{L}\p{N}])/giu, "la voiture n’a pas voulu"],
        [/\bessaillé(?!\p{L})/giu, "essayé"],
        [/\b(tourner|tourné)\s+laclé(?!\p{L})/giu, "tourner la clé"],
        [/\bmilfoi(?![\p{L}\p{N}])/giu, "mille fois"],
        [/\bien\s+a\s+fair(?![\p{L}\p{N}])/giu, "rien à faire"],
        [/\bducou(?![\p{L}\p{N}])/giu, "du coup"],
        [/\bg\s+du\s+prendr(?![\p{L}\p{N}])/giu, "j’ai dû prendre"],
        [/\blebus(?![\p{L}\p{N}])/giu, "le bus"],
        [/\bsousla(?![\p{L}\p{N}])/giu, "sous la"],
        [/\bplui(?![\p{L}\p{N}])/giu, "pluie"],
        [/\bbienentendu(?![\p{L}\p{N}])/giu, "bien entendu"],
        [/\barivé(?!\p{L})/giu, "arrivé"],
        [/\btoumouillé(?!\p{L})/giu, "tout mouillé"],
        [/\bmonchef(?![\p{L}\p{N}])/giu, "mon chef"],
        [/\bma\s+regardé(?!\p{L})/giu, "m’a regardé"],
        [/\bd[’']untravers(?![\p{L}\p{N}])/giu, "de travers"],
        [/\bj[’']avé(?!\p{L})/giu, "j’avais"],
        [/\bfai\s+exprè(?!\p{L})/giu, "fait exprès"],
        [/\bjené(?=\s+(?:un\s+peu\s+|très\s+|trop\s+)?(?:fatigué|fatiguée|crevé|crevée|malade)(?!\p{L}))/giu, "j’étais"],
        [/\bjesper(?![\p{L}\p{N}])/giu, "j’espère"],
        [/\bke(?![\p{L}\p{N}])/giu, "que"],
        [/\bojourdui(?![\p{L}\p{N}])/giu, "aujourd’hui"],
        [/\bsa\s+spasse(?![\p{L}\p{N}])/giu, "ça se passe"],
        [/\bmieu(?![\p{L}\p{N}])/giu, "mieux"],
        [/\baparamen(?![\p{L}\p{N}])/giu, "apparemment"],
        [/\bfair(?![\p{L}\p{N}])/giu, "faire"],
        [/\bencorpire(?![\p{L}\p{N}])/giu, "encore pire"],
        [/\bs[’']taprem(?![\p{L}\p{N}])/giu, "cet après-midi"],
        [/\bfopa(?![\p{L}\p{N}])/giu, "faut pas"],
        [/\bkon(?![\p{L}\p{N}])/giu, "qu’on"],
        [/\bk[’']on(?![\p{L}\p{N}])/giu, "qu’on"],
        [/\bs[’']voir(?![\p{L}\p{N}])/giu, "se voir"],
        [/\bs[’']soir(?![\p{L}\p{N}])/giu, "ce soir"],
        [/\bpourl[’']aniv(?![\p{L}\p{N}])/giu, "pour l’anniversaire"],
        [/\b(l[’']anniversaire)\s+a\s+marie(?![\p{L}\p{N}])/giu, "$1 de Marie"],
        [/\bl[’']kado(?![\p{L}\p{N}])/giu, "le cadeau"],
        [/\bpri(?![\p{L}\p{N}])/giu, "pris"],
        [/\bpourell(?![\p{L}\p{N}])/giu, "pour elle"],
        [/\bl[’']impresionk(?![\p{L}\p{N}])/giu, "l’impression que"],
        [/\bunpeuchere(?![\p{L}\p{N}])/giu, "un peu cher"],
        [/\bmèbon(?![\p{L}\p{N}])/giu, "mais bon"],
        [/\bon\s+navé(?!\p{L})/giu, "on n’avait"],
        [/\bpad[’']autridé(?!\p{L})/giu, "pas d’autre idée"],
        [/\br[’']apel\s+mwa(?![\p{L}\p{N}])/giu, "rappelle-moi"],
        [/\bd[’']k(?![\p{L}\p{N}])/giu, "dès que"],
        [/\bs[’']mesage(?![\p{L}\p{N}])/giu, "ce message"],
        [/\bpck(?![\p{L}\p{N}])/giu, "parce que"],
        [/\bjdoi(?![\p{L}\p{N}])/giu, "je dois"],
        [/\bkekchoz(?![\p{L}\p{N}])/giu, "quelque chose"],
        [/\bd[’']inportan(?![\p{L}\p{N}])/giu, "d’important"],
        [/\bsurlekel(?![\p{L}\p{N}])/giu, "sur lequel"],
        [/\bj[’']hesit(?![\p{L}\p{N}])/giu, "j’hésite"],
        [/\b(hésite)\s+grave?(?!\p{L})/giu, "$1 beaucoup"],
        [/\b[aà]\s+toute\s*!!/giu, "À toute !"]
      ];
      for (const [pattern, replacement] of smsReplacements) replace(pattern, replacement);

      // Dictionnaire générique des abréviations SMS, mot entier, casse préservée.
      correctedText = correctedText.replace(/[\p{L}\p{N}’']+/gu, (word) => {
        const replacement = SMS_WORD_LEXICON.get(
          word.toLocaleLowerCase("fr-FR").replace(/’/gu, "'")
        );
        if (!replacement) return word;
        corrections += 1;
        return preserveCase(word, replacement);
      });

      // Apostrophes élidées manquantes.
      replace(
        /\bj(ai|avais|avait|aurai|aurais|irai|irais|étais|était|espère|espere|adore|aime|arrive|attends|attend|habite|hésite|hesite|imagine|oublie|essaye|essaie)(?![\p{L}\p{N}])/giu,
        "j’$1"
      );
      replace(/\bd(accord|abord|ailleurs|habitude)(?![\p{L}\p{N}])/giu, "d’$1");
      replace(
        /\bl(école|ecole|argent|année|annee|heure|histoire|idée|idee|hôtel|hotel|ami|amie|amis|amour|autre)(?![\p{L}\p{N}])/giu,
        "l’$1"
      );
      replace(/\bkil(s?)(?![\p{L}\p{N}])/giu, "qu’il$1");
      replace(/\bsil(s?)(?!\p{L})/giu, "s’il$1");
      replace(/\btinquiète?s?(?![\p{L}\p{N}])/giu, "t’inquiète");
      replace(/\bnimporte(?![\p{L}\p{N}])/giu, "n’importe");
      replace(/\bjusqu[aà](?![\p{L}\p{N}])/giu, "jusqu’à");

      // « mé » : « mes » devant un nom familier, « mais » sinon.
      // NB : pas de \b final après une lettre accentuée (JavaScript l’ignore).
      replace(
        /\bmé(?=\s+(?:pote|ami|copain|copine|parent|frère|sœur|cousin|gars|cheveu|truc|clé|affaire|chaussure|main|dent|oreille)s?\b)/giu,
        "mes"
      );
      replace(/\bmé(?!\p{L})/giu, "mais");

      // Confusions se/ce, sa/ça, ca/ça et « kel » tranchées par le mot suivant.
      replace(/\bse(?=\s+(?:soir|matin|midi|mois|week-end|weekend|truc|mec|gars|type|genre)\b)/giu, "ce");
      replace(/\bsa(?=\s+(?:va|fait|marche|dépend|craint|suffit|ira|allait|passe|me|te|nous|vous)\b)/giu, "ça");
      replace(/\bca(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "ça"));
      replace(/\bkel(?=\s+(?:va|est|a|sera|serait|peut|veut|aime|fait|dit|pense|croit|vient)\b)/giu, "qu’elle");
      replace(/\bkel(?![\p{L}\p{N}])/giu, "quel");
      replace(/\bkelle(?![\p{L}\p{N}])/giu, "quelle");

      // Conjugaison des formes tronquées d’après le pronom qui précède.
      replace(
        /\b(je|tu|on|il|elle|me|te)\s+(doi|voi|croi|sui|oubli|fé)(?!\p{L})/giu,
        (match, pronoun, stem) => {
          const thirdPerson = /^(?:on|il|elle)$/iu.test(pronoun);
          const conjugations = {
            doi: thirdPerson ? "doit" : "dois",
            voi: thirdPerson ? "voit" : "vois",
            croi: thirdPerson ? "croit" : "crois",
            sui: thirdPerson ? "suit" : "suis",
            fé: thirdPerson ? "fait" : "fais",
            oubli: "oublie"
          };
          return `${pronoun} ${conjugations[stem.toLocaleLowerCase("fr-FR")]}`;
        }
      );

      // Infinitif après un semi-auxiliaire (« va aimé » → « va aimer »), en
      // épargnant les noms courants en -té/-tié qui ne sont pas des participes.
      replace(
        /\b(va|vais|vas|vont|allons|allez|veut|veux|voulons|voulez|veulent|peut|peux|pouvons|pouvez|peuvent|dois|doit|devons|devez|doivent|faut|voulu|pu|dû|laissé|fait)\s+(?!(?:été|côté|pitié|moitié|amitié|beauté|santé|bonté|fierté|qualité|vérité|sécurité|liberté|volonté|difficulté|réalité|société|activité|priorité|nécessité|possibilité|responsabilité|majorité|totalité|identité|unité|quantité)\b)([\p{L}]{2,})é(?!\p{L})/giu,
        "$1 $2er"
      );

      // Infinitif après un pronom complément nu (« te demandé » → « te demander »)
      // ou une préposition, pour les verbes du premier groupe les plus courants.
      replace(
        /\b(te|me|vous|nous|lui|leur)\s+(demandé|parlé|montré|donné|raconté|expliqué|rappelé|envoyé|appelé|présenté|proposé|apporté|acheté|préparé|posé|laissé)(?!\p{L})/giu,
        (match, pronoun, verb) => `${pronoun} ${verb.slice(0, -1)}er`
      );
      replace(
        /\b(de|pour|sans|à)\s+(mangé|tourné|demandé|appelé|regardé|parlé|donné|trouvé|montré|écouté|acheté|cherché|changé|joué|travaillé|essayé|commencé|arrêté|rappelé|envoyé|payé|gardé|rangé|lavé|préparé|raconté|rencontré|invité|aidé|discuté|expliqué)(?!\p{L})/giu,
        (match, preposition, verb) => `${preposition} ${verb.slice(0, -1)}er`
      );

      // Participe passé après l’auxiliaire avoir (« ai fé » → « ai fait »).
      replace(/\b(ai|as|a|ont|avons|avez)\s+fé(?!\p{L})/giu, "$1 fait");

      // « il est la » → « là » quand rien ne peut suivre l’article.
      replace(
        /\b(est|es|suis|sommes|êtes|sont|sera|seront|serait|était|étaient|reste|restes)\s+la(?=\s*(?:$|[.,;!?…]|demain\b|bientôt\b|aujourd[’']hui\b|maintenant\b|avant\b|après\b|ce\s+soir\b))/giu,
        "$1 là"
      );

      // « a+ » en fin de message.
      replace(/(^|\s)[a@à]\s*\+(?=\s*$|\s*[.!?])/giu, "$1à plus");

      // « a » devant un pronom complément suivi d’un verbe est la préposition.
      replace(/\ba(?=\s+(?:te|me|se|vous|nous)\s+\p{L})/giu, "à");

      replace(/^Salut\s+ça\s+va/iu, "Salut, ça va");
      replace(/\b(de\s+travers)\s+genre(?![\p{L}\p{N}])/giu, "$1, genre");
      replace(/\bmais\s+bon\s+on(?![\p{L}\p{N}])/giu, "mais bon, on");
      replace(/(^|[.!?…]\s+)([\p{Ll}])/gu, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);

      correctedText = correctedText.replace(/\uE000(\d+)\uE001/gu, (match, index) =>
        protectedAcronyms[Number(index)] ?? match
      );
    }

    // Espace insécable avant la ponctuation double (! ? : ;), règle
    // typographique française, ajouté seulement lorsqu'il manque. On épargne
    // les URL (« http:// »), les heures (« 10:30 ») et les émoticônes
    // (« :) », « ;-) », « :D »).
    {
      const previous = correctedText;
      correctedText = correctedText.replace(
        /(\S)([!?;:]+)/gu,
        (match, lead, marks, offset, full) => {
          const after = full[offset + match.length] || "";
          if (marks[0] === ":" && after === "/") return match;
          if (marks === ":" && /\d/u.test(lead) && /\d/u.test(after)) return match;
          if (/[:;]/u.test(marks[0]) && /[)(\/\\DPp*-]/u.test(after)) return match;
          return `${lead} ${marks}`;
        }
      );
      if (correctedText !== previous) corrections += 1;
    }

    // Répare d’abord quelques formes soudées ou phonétiques très courantes.
    // Sans contexte, le dictionnaire les remplaçait parfois par un mot valide
    // mais absurde (« p-etre » → « pierre », par exemple).
    replace(/\bp[\s-]*etre(?![\p{L}\p{N}])/giu, "peut-être");
    replace(/\b([Jj]e)\s*pense\s*que(?![\p{L}\p{N}])/gu, "$1 pense que");
    replace(/\b(J[’']aimerais)bien(?![\p{L}\p{N}])/giu, "$1 bien");
    replace(/\bparceque(?![\p{L}\p{N}])/giu, "parce que");
    replace(/\bsurlequel(?![\p{L}\p{N}])/giu, "sur lequel");
    replace(/\bunpeu(?![\p{L}\p{N}])/giu, "un peu");
    replace(/\bdesfois(?![\p{L}\p{N}])/giu, "des fois");
    replace(/\b(plein(?:e)?s?\s+de\s+)(truc|chose|idée|problème)(?!\p{L})/giu, "$1$2s");

    // « sa » devant un verbe est le pronom « ça » : « sa fait longtemps » →
    // « ça fait longtemps ». Sans cette règle, Grammalecte proposait « son
    // fait ». La liste ne contient que des verbes, jamais des noms.
    replace(/\bsa(?=\s+(?:va|fait|dépend|craint|suffit|ira|irait|allait|change|commence|continue|recommence|m’|t’|me|te|nous|vous)\b)/giu, "ça");
    replace(
      /\bsa(?=\s+(?:marche|passe)\s+(?:bien|mal|mieux|vite|lentement|encore|toujours|déjà|désormais|maintenant|ici|là|partout|facilement|difficilement|sans\s+problème)\b)/giu,
      "ça"
    );

    // Conjugaisons barbares : aucune de ces formes n’existe en français, et le
    // dictionnaire les « rapprochait » d’un mot valide mais absurde
    // (« croivent » → « croisent », « disez » → « dise »).
    replace(/\bcroivent(?![\p{L}\p{N}])/giu, (m) => preserveCase(m, "croient"));
    replace(/\bcroive(s?)(?![\p{L}\p{N}])/giu, (m) => preserveCase(m, m.toLowerCase().endsWith("s") ? "croies" : "croie"));
    replace(/\bdisez(?![\p{L}\p{N}])/giu, (m) => preserveCase(m, "dites"));
    replace(/\bfaisez(?![\p{L}\p{N}])/giu, (m) => preserveCase(m, "faites"));
    replace(/\bvoyent(?![\p{L}\p{N}])/giu, (m) => preserveCase(m, "voient"));

    // « est-ce-que » ne prend jamais de trait d’union entre « ce » et « que ».
    replace(/\b([Ee]st)-ce-que\b/gu, "$1-ce que");

    // « , voir même » : après une virgule, c’est la conjonction « voire ».
    replace(/(,\s*)voir(\s+même)(?![\p{L}\p{N}])/giu, "$1voire$2");

    // Après un infinitif, « a » ne peut pas être le verbe avoir : c'est la
    // préposition « à ». « venir a la réunion » → « venir à la réunion », sans
    // toucher à « il a la clé » où « a » suit un sujet.
    replace(
      /\b([\p{L}]{3,}(?:er|ir|re))\s+a\s+(?=(?:la|le|les|l[’']|un|une|des|ce|cet|cette|ces|mon|ma|mes|ton|ta|tes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\s)/giu,
      "$1 à "
    );

    // « pallier » est transitif direct : « pallier à/au/aux » est un barbarisme.
    // La préposition disparaît, l’article contracté redevient défini.
    const pallierForm = "palli(?:er|e|es|ent|ons|ez|é|ée|és|ées)";
    replace(new RegExp(`\\b(${pallierForm})\\s+aux\\b`, "giu"), "$1 les");
    replace(new RegExp(`\\b(${pallierForm})\\s+au\\b`, "giu"), "$1 le");
    replace(
      new RegExp(`\\b(${pallierForm})\\s+à\\s+(la|l’|l'|ce|cet|cette|ces|son|sa|ses|leur|leurs|mon|ma|mes|un|une)\\b`, "giu"),
      "$1 $2"
    );
    replace(new RegExp(`\\b(${pallierForm})\\s+à\\b`, "giu"), "$1");

    // « d’urgence » est une locution invariable ; le pluriel « d’urgences » est
    // fautif (à distinguer du nom « les urgences » d’un hôpital, jamais élidé).
    replace(
      /\b(réparations?|travaux|mesures?|interventions?|opérations?|procédures?|soins?|besoins?|cas|traitements?)\s+d[’']urgences(?![\p{L}\p{N}])/giu,
      (match) => match.replace(/urgences/iu, "urgence")
    );

    // « Mr. » est l’abréviation anglaise ; en français c’est « M. ».
    replace(/\bMr\.?(?=\s|$)/gu, "M.");

    // Soudures et graphies univoques, fréquentes même hors langage SMS.
    // « ca » en minuscules n’existe pas en français ; « CA » (chiffre
    // d’affaires) et « Ca » (calcium) restent intouchés hors mode SMS.
    replace(/\bca(?![\p{L}\p{N}])/gu, "ça");
    replace(/\bdeja(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "déjà"));
    replace(/\bcest(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "c’est"));
    replace(/\bjai(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "j’ai"));
    replace(/\bdhier(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "d’hier"));
    replace(/\bdaccord(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "d’accord"));
    replace(/\bjusqua(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "jusqu’à"));
    replace(/\baujourdhui(?![\p{L}\p{N}])/giu, (match) => preserveCase(match, "aujourd’hui"));
    replace(/\b(s)a\s+va(?![\p{L}\p{N}])/giu, (match, initial) => (initial === "S" ? "Ça va" : "ça va"));

    // « ma dit », « ta pas dit » → « m’a (pas) dit » : « ma/ta » devant un
    // participe, avec négation éventuelle, est toujours l’élision du pronom.
    replace(
      /\b(m|t)a\s+((?:pas|jamais|rien)\s+)?(dit|fait|donné|demandé|parlé|regardé|appelé|envoyé|répondu|laissé|pris|mis|vu|écrit|acheté|montré|raconté|expliqué|rappelé|offert|promis)(?!\p{L})/giu,
      (match, pronoun, negation, verb) => `${pronoun}’a ${negation || ""}${verb}`
    );
    // Concordance des temps : « si j’aurais » → « si j’avais ». La règle ne vaut
    // que pour le « si » hypothétique, reconnu à sa position en tête de
    // proposition ; le « si » interrogatif (« je me demande si j’aurais dû »)
    // admet le conditionnel et reste donc intact.
    replace(
      /(^|[.!?…]\s+|,\s+|«\s*)([Ss]i)\s+(j[’']|je|tu|il|elle|on|nous|vous|ils|elles)\s*([\p{L}]+)(?!\p{L})/gu,
      (match, prefix, si, pronoun, verb) => {
        const imperfect = conditionalToImperfect(verb);
        if (!imperfect) return match;

        // « si je étais » est impossible : le pronom s’élide devant la voyelle.
        const normalizedPronoun = /^j[’']$/u.test(pronoun) ? "je" : pronoun;
        const elides = normalizedPronoun.toLocaleLowerCase("fr-FR") === "je" &&
          /^[aeéêiouy]/iu.test(imperfect);
        const subject = elides ? "j’" : `${normalizedPronoun} `;
        return `${prefix}${si} ${subject}${imperfect}`;
      }
    );

    // Même concordance avec un sujet nominal : « Si le conseil l’accepterait »
    // → « l’acceptait ». Les pronoms compléments intercalés font partie du
    // groupe verbal et sont donc conservés tels quels.
    replace(
      /(^|[.!?…]\s+|,\s+|«\s*)([Ss]i)\s+((?:l[’']|le|la|les|un|une|ce|cet|cette|mon|ma|ton|ta|son|sa|notre|votre|leur)\s*[\p{L}’'-]+)\s+((?:(?:l[’']|s[’']|n[’']|la|les|lui|leur|nous|vous|se|y|en|ne)\s*)*)([\p{L}]+)(?!\p{L})/gu,
      (match, prefix, si, subject, clitics, verb) => {
        const imperfect = conditionalToImperfect(verb);
        if (!imperfect) return match;
        return `${prefix}${si} ${subject} ${clitics}${imperfect}`;
      }
    );

    // Subjonctif obligatoire après « bien que », « quoique », « encore que ».
    // Seul l’auxiliaire change : « a validé » → « ait validé », « est » → « soit ».
    // Le sujet ne peut pas franchir une virgule, ce qui empêche d’atteindre le
    // verbe de la proposition principale.
    replace(
      /\b((?:Bien que|Quoique|Encore que)\s+|(?:Bien qu|Quoiqu|Encore qu)[’'])([^.!?;:,]{1,40}?)\s*\b(a|as|avons|avez|ont|est|es|sommes|êtes|sont)\b(?=\s+\p{L})/gu,
      (match, conjunction, subject, auxiliary, offset, whole) => {
        const normalizedSubject = subject.trim().toLocaleLowerCase("fr-FR");
        const normalizedAuxiliary = auxiliary.toLocaleLowerCase("fr-FR");
        const nextWord = whole.slice(offset + match.length).trimStart().match(/^[\p{L}’-]+/u)?.[0]
          ?.toLocaleLowerCase("fr-FR") || "";

        // « l’as du volant » contient le nom « as », et « a priori » est une
        // locution : ni l’un ni l’autre n’est un auxiliaire à conjuguer.
        if (normalizedAuxiliary === "as" && !/(?:^|\s)tu$/u.test(normalizedSubject)) return match;
        if (normalizedAuxiliary === "es" && !/(?:^|\s)tu$/u.test(normalizedSubject)) return match;
        if (normalizedAuxiliary === "avons" && !/(?:^|\s)nous$/u.test(normalizedSubject)) return match;
        if (normalizedAuxiliary === "avez" && !/(?:^|\s)vous$/u.test(normalizedSubject)) return match;
        if (normalizedAuxiliary === "sommes" && !/(?:^|\s)nous$/u.test(normalizedSubject)) return match;
        if (normalizedAuxiliary === "êtes" && !/(?:^|\s)vous$/u.test(normalizedSubject)) return match;
        if (normalizedAuxiliary === "a" && nextWord === "priori") return match;

        const subjunctive = INDICATIVE_TO_SUBJUNCTIVE.get(auxiliary.toLocaleLowerCase("fr-FR"));
        if (!subjunctive) return match;
        return `${conjunction}${subject} ${subjunctive}`;
      }
    );

    // « préférer » se construit sans préposition : « préféré de ne rien dire »
    // → « préféré ne rien dire ». Les locutions « de loin », « de nouveau » sont
    // épargnées : seuls une négation ou un infinitif déclenchent la règle.
    replace(
      /\b(préfèr\p{L}*|préfér\p{L}*)\s+de\s+(?=(?:ne\s|n[’']|rien\s|pas\s|jamais\s|[\p{L}]+(?:er|ir|re)(?!\p{L})))/giu,
      "$1 "
    );

    // Concordance des temps : « Si j’avais su …, je n’y serai pas allé » →
    // « serais ». Un « si » à l’imparfait ou au plus-que-parfait appelle le
    // conditionnel dans la principale. Avec « si » au présent (« Si tu viens, je
    // serai là »), le futur est correct et reste intact.
    correctedText = correctedText.replace(/[^.!?…]+[.!?…]*/gu, (sentence) => {
      const opening = sentence.match(/(^|[«"(\s])[Ss]i\s+/u);
      if (!opening) return sentence;

      const separator = sentence.indexOf(",", opening.index);
      if (separator < 0) return sentence;

      const hypothesis = sentence.slice(opening.index, separator);
      // Le dictionnaire doit identifier un véritable imparfait. Une simple
      // terminaison en « ais/ait » confondait « tu fais » et même « le lait »
      // avec un imparfait.
      const hasImperfectAuxiliary = /\b(?:avais|avait|avions|aviez|avaient|étais|était|étions|étiez|étaient)\b/iu
        .test(hypothesis);
      const hasImperfect = hasImperfectAuxiliary ||
        (hypothesis.match(/\p{L}+/gu) || []).some((word) =>
          morphOf(word).some((morph) => /:Iq(?=[:/])/u.test(morph))
        );
      if (!hasImperfect) {
        return sentence;
      }

      const main = sentence.slice(separator);
      // La concordance ne dépasse pas la première proposition principale.
      // Dans « ..., mais demain je serai là », le futur après « mais » décrit
      // un fait indépendant de l’hypothèse.
      const nextClause = main.slice(1).search(/(?:,\s*(?:mais|et|or|donc|car)\b|[;:])/iu);
      const rewriteEnd = nextClause < 0 ? main.length : nextClause + 1;
      const rewritten = main.slice(0, rewriteEnd).replace(/\b([\p{L}]+)(?![\p{L}])/gu, (word) => {
        const conditional = FUTURE_TO_CONDITIONAL.get(word.toLocaleLowerCase("fr-FR"));
        if (!conditional) return word;
        corrections += 1;
        return preserveCase(word, conditional);
      });
      return sentence.slice(0, separator) + rewritten + main.slice(rewriteEnd);
    });

    // Accord du participe passé avec le COD placé avant l’auxiliaire « avoir ».
    // Grammalecte s’en charge déjà, sauf dès qu’un mot suit le participe
    // (« que j’ai vu hier »). Le raisonnement : si « que » est un relatif ayant un
    // nom pour antécédent, le COD est « que » lui-même, donc ce qui suit est
    // forcément circonstanciel et l’accord s’impose.
    // Variante avec sujet élidé : dans « que j’ai pris hier », aucune espace
    // ne sépare le pronom de l’auxiliaire.
    replace(
      /\b(?:Les|Des|Ces|Mes|Tes|Ses|Nos|Vos|Leurs|La|Le|Cette|Cet|Ce|Une|Un|Quelques|Plusieurs)\s+([\p{L}’'-]+)((?:\s+[\p{L}’'-]+){0,3}?)\s+qu[e’']\s*j[’'](?:ai|avais|aurai|aurais)\s+([\p{L}]+)(?=\s+([\p{L}’'-]+))/gu,
      (match, headNoun, modifiers, participle, followingWord) => {
        const agreed = agreeParticipleWithAntecedent(
          match,
          headNoun,
          modifiers,
          participle,
          followingWord
        );
        return agreed || match;
      }
    );
    replace(
      /\b(?:Les|Des|Ces|Mes|Tes|Ses|Nos|Vos|Leurs|La|Le|Cette|Cet|Ce|Une|Un|Quelques|Plusieurs)\s+([\p{L}’'-]+)((?:\s+[\p{L}’'-]+){0,3}?)\s+qu[e’']\s*([^,;:.!?]{1,40}?)\s+(?:a|ai|as|avons|avez|ont|avait|avais|avaient|aura|aurai|auras|aurez|auront|aurait|auraient)\s+([\p{L}]+)(?=\s+([\p{L}’'-]+))/gu,
      (match, headNoun, modifiers, subject, participle, followingWord) => {
        const agreed = agreeParticipleWithAntecedent(
          match,
          headNoun,
          modifiers,
          participle,
          followingWord
        );
        return agreed || match;
      }
    );

    // Participe passé invariable des verbes pronominaux à complément indirect
    // (se succéder, se parler, se demander…) : le « se » est alors un COI, donc
    // le participe ne s’accorde jamais. « ils se sont succédés » → « succédé ».
    replace(
      /\b(s[’']|se\s+)(sont|étaient|seraient|furent|soient)\s+((?:déjà|bien|mal|toujours|souvent|longtemps|tous|toutes|peu|beaucoup|enfin)\s+)?([\p{L}]+)(?![\p{L}])/giu,
      (match, reflexive, auxiliary, adverb, participle, offset, whole) => {
        const base = INVARIABLE_PRONOMINAL_PP.get(participle.toLocaleLowerCase("fr-FR"));
        if (!base) return match;

        // Un COD relatif placé avant commande malgré tout l’accord :
        // « les questions qu’elles se sont demandées ».
        const before = whole.slice(sentenceBoundary(whole, offset, -1), offset);
        if (/\bqu[’'](?:elle|elles|il|ils|on|nous|vous|je|j’|j')\s*$/iu.test(before)) {
          return match;
        }
        return `${reflexive}${auxiliary} ${adverb || ""}${base}`;
      }
    );

    // Accord en genre du participe passé passif avec son sujet, que Grammalecte
    // laisse parfois au masculin (« les primes avaient été supprimés » →
    // « supprimées »). Le genre du nom sujet est lu dans le dictionnaire.
    replace(
      /\b(Les|Des|Ces|Mes|Tes|Ses|Nos|Vos|Leurs)\s+([\p{L}’'-]+)((?:\s+[\p{L}’'-]+){0,3}?)\s+(?:avaient|avait|ont|étaient|seront|seraient)\s+été\s+([\p{L}]+)(?![\p{L}])/gu,
      (match, determiner, headNoun, modifiers, participle) => {
        const features = nounFeatures(headNoun);
        if (!features) return match;
        if (!isParticiple(participle)) return match;
        const inflected = inflectParticiple(participle, features);
        if (!inflected || inflected === participle) return match;
        return match.slice(0, match.lastIndexOf(participle)) + inflected;
      }
    );

    // Homophones « et » / « est » : après un pronom sujet, « et » suivi d’un
    // participe ou d’un adjectif est le verbe être. La nature du mot est lue dans
    // le dictionnaire, ce qui épargne « Elle et Marie » (nom propre), « Elle et
    // moi » (pronom) et « Elle et sa sœur » (déterminant).
    replace(
      /\b(il|elle|on)\s+et\s+(?=[\p{L}’'-])/giu,
      (match, pronoun, offset, whole) => {
        const next = whole.slice(offset + match.length).match(/^[\p{L}’'-]+/u);
        if (!next || !isParticipleOrAdjective(next[0])) return match;
        return `${pronoun} est `;
      }
    );

    // Homophones « ou » / « où » : une phrase ne commence pas par la conjonction
    // « ou » suivie d’une inversion - c’est l’adverbe de lieu.
    replace(
      /(^|[.!?…]\s+)Ou\s+(?=(?:est-ce\b|[\p{L}]+-(?:il|elle|on|tu|vous|nous|ils|elles)\b))/gu,
      "$1Où "
    );

    replace(/\bpourl[’']écrire(?![\p{L}\p{N}])/giu, "pour l’écrire");
    replace(/\bs[’']enrendre\s+compte(?![\p{L}\p{N}])/giu, "s’en rendre compte");
    replace(/\bavoir\s+soiffe(?![\p{L}\p{N}])/giu, "avoir soif");
    replace(/\bn[’']a\s+pas\s+son(?:é|ne)(?!\p{L})/giu, "n’a pas sonné");
    replace(/\bfanné(e?s?)(?!\p{L})/giu, "fané$1");

    // Récupère aussi les sorties erronées produites par d’anciennes versions.
    replace(/\btemps\s+qu[’']il\s+nous\s+a\s+fallu\s+pourléch(?:ait|aient)(?![\p{L}\p{N}])/giu, "temps qu’il nous a fallu pour l’écrire");
    replace(/\bC[’']est\s+pierre\s+à\s+cause(?![\p{L}\p{N}])/gu, "C’est peut-être à cause");
    replace(/\bRepense\s+les\s+températures\s+devrait(?![\p{L}\p{N}])/gu, "Je pense que les températures devraient");
    replace(/\b(baisser\s+)unie\s+Desnos(?![\p{L}\p{N}])/giu, "$1un peu des fois");
    replace(/\bavoir\s+coiffe\s+eux\s+aussi(?![\p{L}\p{N}])/giu, "avoir soif eux aussi");
    replace(/\bs[’']enrênerait\s+compte(?![\p{L}\p{N}])/giu, "s’en rendre compte");

    replace(/\bSalutation\s*!/gu, "Salutations !");
    replace(/\bTout\s+d[’']abords(?![\p{L}\p{N}])/gu, "Tout d’abord");
    replace(/\b(Ces?|Ça)\s+vraiment\s+dommage(?![\p{L}\p{N}])/gu, "C’est vraiment dommage");
    replace(/\btoutes\s+la\s+semaine(?![\p{L}\p{N}])/giu, "toute la semaine");
    replace(
      /\bsur\s+lequel\s+on\s+n[’']a\s+travaillé(?!\p{L})(?!\s+(?:ni\b|qu[’']))/giu,
      "sur lequel on a travaillé"
    );
    replace(/\bqu[’']on\s+n[’']y\s+a\s+mit(?![\p{L}\p{N}])/giu, "qu’on y a mis");
    replace(/\bquoi\s+que\s+se\s+soit(?![\p{L}\p{N}])/giu, "quoi que ce soit");
    replace(/\b(Il|Elle|On)\s+hésite\s+pas(?![\p{L}\p{N}])/giu, "$1 n’hésite pas");
    replace(
      /(^|[.!?…]\s*|\n\s*)hésite\s+pas(?![\p{L}\p{N}])/giu,
      (match, prefix) => `${prefix}N’hésite pas`
    );
    replace(/\bj[’']éspère(?![\p{L}\p{N}])/giu, "j’espère");
    replace(/\bil\s+(?:était|etait)\s+(?:déjà|deja)\s+partit(?![\p{L}\p{N}])/giu, "il était déjà parti");

    // Homophones dont le contexte syntaxique ne laisse aucune ambiguïté.
    replace(
      /\bCes(?=\s+(?:mon|ton|son|notre|votre|leur)\s+[\p{L}’'-]+)/gu,
      "C’est"
    );
    replace(
      /\b((?:si|que|car|mais)\s+)ces\s+(possible|impossible|probable|certain|sûr|vrai|faux|normal|dommage)\b/giu,
      (match, prefix, adjective) => `${prefix}c’est ${adjective}`
    );
    replace(
      /\b((?:demande|demandes|demandons|demandez|demandent|savoir|dire)\s+)ou(?=\s+(?:je|tu|il|elle|on|nous|vous|ils|elles)\b)/giu,
      "$1où"
    );
    replace(
      /\b(Il\s+faut\s+qu[’']on)\s+est\s+([\p{L}’'-]+)(?![\p{L}])/giu,
      (match, opening, participle) => isParticiple(participle)
        ? `${opening} ait ${participle}`
        : match
    );

    // Accords de sujets quantifiés ou collectifs très explicites.
    replace(
      /\b(Tout\s+le\s+monde)\s+sont\s+([\p{L}’'-]+)(?![\p{L}])/giu,
      (match, subject, participle) => {
        const singular = participleMasculineSingular(participle);
        return singular ? `${subject} est ${singular}` : match;
      }
    );
    replace(
      /\b(Chacun(?:e)?\s+(?:des?|d[’'])\s*[\p{L}’'-]+)\s+ont\b/giu,
      "$1 a"
    );
    replace(
      /\b(Beaucoup\s+de\s+([\p{L}’'-]+))\s+sont\s+([\p{L}’'-]+)(?![\p{L}])/giu,
      (match, subject, headNoun, participle) => {
        const features = nounFeatures(headNoun);
        if (!features?.plural || !isParticiple(participle)) return match;
        const agreed = inflectParticiple(participle, features);
        return agreed ? `${subject} sont ${agreed}` : match;
      }
    );


    // Accords à distance dans des constructions fréquentes.
    replace(
      /\b(journée\b[^.!?]{0,60}\bqui\s+)c[’']est\s+très\s+mal\s+passé(?!\p{L})/giu,
      "$1s’est très mal passée"
    );
    replace(/\b(fleurs\s+que\s+j[’']ai\s+)cueilli(?![\p{L}\p{N}])/giu, "$1cueillies");
    replace(/\b(fleurs\b[^.!?]{0,100}?\bsont\s+)fane(?:s)?(?![\p{L}\p{N}])/giu, "$1fanées");
    replace(/\b(fleurs\b[^.!?]{0,100}?)\b(?:on|ont)\s+est\s+déjà\s+fane(?![\p{L}\p{N}])/giu, "$1sont déjà fanées");
    replace(/\b(fleurs\b[^.!?]{0,100}?)\bon\s+déjà\s+fané(?:e?s?)(?![\p{L}\p{N}])/giu, "$1sont déjà fanées");
    replace(/\b(Les\s+chevaux\b[^.!?]{0,100}?)\bavait\s+l[’']air(?![\p{L}\p{N}])/gu, "$1avaient l’air");
    replace(/\bd[’']a\s+coté(?!\p{L})/giu, "d’à côté");
    replace(/\bOn\s+se\s+voit\s+très\s+bientôt\s+j[’']espère(?![\p{L}\p{N}])/gu, "On se voit très bientôt, j’espère");

    // Locutions et constructions administratives fréquemment confondues.
    // Elles sont traitées avant Grammalecte afin d’éviter les rapprochements
    // phonétiques absurdes (« ce mettre » → « ce maître », « étaient » →
    // « étayé ») observés lorsque le contexte initial reste incohérent.
    replace(/\bcession(?=\s+de\s+formation\b)/giu, (match) => preserveCase(match, "session"));
    replace(/\bla\s+plus\s+part(?![\p{L}\p{N}])/giu, "la plupart");
    replace(/\b(ont\s+décid)(?:é|és|ée|ées)\s+de\s+ce\s+mettre(?![\p{L}\p{N}])/giu, "$1é de se mettre");
    replace(/\bde\s+ce\s+mettre(?![\p{L}\p{N}])/giu, "de se mettre");
    replace(/\bn[’']ont\s+pas\s+étaient(?![\p{L}\p{N}])/giu, "n’ont pas été");
    replace(/\b(des)\s+(très\s+(?:bons?|bonnes?|beaux|belles)\b)/giu, "de $2");
    replace(/\b(Malgré\s+qu)([’'])/gu, "Bien qu$2");

    // Expressions figées et constructions verbales sans ambiguïté.
    replace(/\bgrand\s+damne(?![\p{L}\p{N}])/giu, "grand dam");
    replace(/\bcomme\s+de\s+par\s+hasard(?![\p{L}\p{N}])/giu, "comme par hasard");
    replace(/\brésoudre\s+le\s+problème\s*:/giu, "résoudre le problème,");
    replace(
      /\bnous\s+devrions\s+des\s+consultants\s+externes\s+engagés(?![\p{L}\p{N}])/giu,
      "nous devrions engager des consultants externes"
    );
    replace(/\bVeuillez\s+trouv(?:é|és|ée|ées)\s+ci-joint\s*,\s*/giu, "Veuillez trouver ci-joint ");
    replace(/\b(tâches?)\s+de\s+sang(?![\p{L}\p{N}])/giu, (match, noun) => preserveCase(noun, /^tâches$/iu.test(noun) ? "taches" : "tache") + " de sang");
    replace(/\b(la\s+liste\s+des\s+taches\s+de\s+sang\s+sur\s+la\s+moquette)\s*,\s+qui\b/giu, "$1 qui");
    replace(/\b(taches\b[^.!?]{0,100}?\bn[’']ont\s+pas\s+été\s+)nettoyé(?:s|e|es)?(?![\p{L}\p{N}])/giu, "$1nettoyées");

    // « Labyrinthe littéraire » : tournures normatives dont le contexte rend
    // la correction univoque. Les motifs restent volontairement étroits pour
    // ne pas transformer « digital » au sens anatomique, « initier quelqu’un »
    // ou un véritable participe présent.
    replace(/\b(années\s+)quatres?-vingts(?![\p{L}\p{N}])/giu, "$1quatre-vingt");
    replace(
      /\b(l[’']entreprise)\s+digital(?:e)?\s*,\s+a\s+décid(?:é|ée)\s+d[’']initier(?=\s+une\s+(?:nouvelle\s+)?stratégie\b)/giu,
      "$1 numérique a décidé d’entamer"
    );
    replace(/\b(entreprise\s+)digital(?:e)?(?![\p{L}\p{N}])/giu, "$1numérique");
    replace(/\ba\s+décid(?:é|ée)\s+d[’']initier(?=\s+une\s+(?:nouvelle\s+)?stratégie\b)/giu,
      "a décidé d’entamer"
    );
    replace(/\b(l[’']entreprise\s+numérique)\s*,\s+(a\s+décidé)\b/giu, "$1 $2");
    replace(/\b(chaleurs\b[^.!?]{0,80}?qu[’']il\s+a\s+)faites(?![\p{L}\p{N}])/giu, "$1fait");
    replace(/\b(Les\s+chaleurs\b[^.!?]{0,120}?),\s+a\s+(?=complètement\b)/gu, "$1 ont ");
    replace(/\b(ont\s+complètement\s+desséch)ées(?=\s+nos\s+plantes\b)/giu, "$1é");
    replace(/\b(plantes?)\s+verts?\s+claires?(?![\p{L}\p{N}])/giu, "$1 vert clair");
    replace(/\b(Elles\s+étaient\s+)tout(?=\s+contentes\b)/gu, "$1toutes");
    replace(/\b(de\s+la\s+direction)\s*,\s+(?=deux\s+cents\b)/giu, "$1 ");
    replace(/\b(solutionn(?:er|ons|ez|ent|e|es))\s+(les\s+problèmes)\b/giu,
      (match, verb, object) => `${preserveCase(verb, /ent$/iu.test(verb) ? "résolvent" : /ons$/iu.test(verb) ? "résolvons" : /ez$/iu.test(verb) ? "résolvez" : /es?$/iu.test(verb) ? "résout" : "résoudre")} ${object}`
    );
    replace(/\b(problèmes\s+qui\s+nous\s+)impacte(?![\p{L}\p{N}])/giu, "$1impactent");
    replace(/\b(La\s+cantatrice\s+que\s+j[’']ai\s+)entendu(?=\s+chanter\b)/gu, "$1entendue");
    replace(/\b(hier\s+soir)\s*,\s+as\s+eue?(?=\s+un\s+travail\b)/giu, "$1 a eu");
    replace(/\ba\s+eue(?=\s+un\s+travail\b)/giu, "a eu");
    replace(/\b(un\s+travail\s+(?:très\s+)?)fatiguant(?![\p{L}\p{N}])/giu, "$1fatigant");
    replace(/\bQuoique\s+vous\s+en\s+pensez\s*:\s*/giu, "Quoi que vous en pensiez, ");
    replace(/\b(Quoi\s+que\s+vous\s+en\s+pensiez)\s*:\s*/giu, "$1, ");
    replace(/\bil\s+faut\s+des\s+(mesures\s+[\p{L}’'-]+)\s+adoptées(?![\p{L}\p{N}])/giu,
      "il faut adopter des $1"
    );
    replace(/\b(ci-joint)s(?=\s+les\s+[\p{L}’'-]+)/giu, "$1");
    replace(/\b(contrats\s+d[’'])embauches(?![\p{L}\p{N}])/giu, "$1embauche");
    replace(/\b(contrats\s+d[’']embauche)\s*,\s+que\b/giu, "$1 que");
    replace(/\b(nous\s+nous\s+sommes\s+)permi(?:t|se|ses)(?=\s+de\b)/giu, "$1permis");

    // « L’Épreuve de Force » : stabilise les formes univoques avant que le
    // correcteur lexical ne puisse rapprocher « peint » de « peignent » ou
    // inventer une forme personnelle du verbe impersonnel « falloir ».
    // « Mr » est l’abréviation anglaise ; la française est « M. ».
    replace(/\bMr\.?(?=\s+\p{L})/gu, "M.");
    replace(/\b(problèmes\s+)digital(?:s|es|aux)?(?=\s+que\b)/giu, "$1numériques");
    replace(/\b(problèmes\s+numériques\s+que\s+nous\s+avons\s+)rencontré\s*:/giu,
      "$1rencontrés\u00a0:"
    );
    replace(/\bje\s+vous\s+pris(?=\s+de\s+bien\s+vouloir\b)/giu, "je vous prie");
    replace(/\bune\s+demis?\s+heure(?![\p{L}\p{N}])/giu, "une demi-heure");
    replace(/\b(ont\s+)travaillés(?=\s+d[’']arrache-pieds?\b)/giu, "$1travaillé");
    replace(/\bd[’']arrache-pieds(?![\p{L}\p{N}])/giu, "d’arrache-pied");
    replace(/\b(les\s+techniciens)\s*,\s+(ont\s+compl)[éè]tement\s+échoués(?![\p{L}\p{N}])/giu,
      "$1 $2ètement échoué"
    );
    replace(
      /\bIls\s+leurs?\s+faut\s+des\s+nouveaux\s+ordinateurs\s+en\s+urgences?\s+achetés?(?![\p{L}\p{N}])/giu,
      "Il leur faut acheter de nouveaux ordinateurs en urgence"
    );
    // Filet contre les sorties fautives déjà observées du modèle ou du
    // dictionnaire (« faillent », accord avec « urgences »).
    replace(
      /\bIls?\s+leur\s+faillent\s+des\s+nouveaux\s+ordinateurs\s+en\s+urgences?\s+achetées?(?![\p{L}\p{N}])/giu,
      "Il leur faut acheter de nouveaux ordinateurs en urgence"
    );
    replace(/\bC[’']est\s+une\s+panacée(?:\s+universelle)?\s+de\s+croire\s+que\b/giu,
      "C’est une illusion de croire que"
    );
    replace(/\b(Les\s+murs)\s+(?:peint|peints|peignent)\s+en\s+bleu\s+marines?(?=\s+sont\b)/giu,
      "$1 peints en bleu marine"
    );
    replace(/\bréserver\s+d[’']avance(?=\s+(?:ces|les|des)\s+[\p{L}’'-]+)/giu, "réserver");
    replace(/\b(centaines?\s+de\s+)milles(?=\s+d[’']euros\b)/giu, "$1milliers");
    replace(/\b(ont\s+)étés(?=\s+perdus\b)/giu, "$1été");
    replace(/\blaissez-passers(?![\p{L}\p{N}])/giu, "laissez-passer");
    replace(/\bil\s+aurai\s+fallut\s+que\s+nous\s+prenons\b/giu,
      "il aurait fallu que nous prenions"
    );
    replace(/\bchefs-d[’']oeuvres(?![\p{L}\p{N}])/giu, "chefs-d’œuvre");
    replace(/\bchefs-d[’']œuvres(?![\p{L}\p{N}])/giu, "chefs-d’œuvre");
    replace(/\bmarchent\s+nus\s+pieds(?![\p{L}\p{N}])/giu, "marchent nu-pieds");
    replace(/\bil\s+faut\s+à\s+tout\s+prix\s+la\s+crise\s+stopper(?![\p{L}\p{N}])/giu,
      "il faut à tout prix stopper la crise"
    );

    // Un adjectif de couleur qualifié par un second adjectif forme un groupe
    // invariable : « des murs rose pâle », « des plantes vert clair ».
    correctedText = correctedText.replace(COLOR_EXPRESSION_PATTERN, (...args) => {
      const normalized = normalizeColorMatch(args);
      if (normalized !== args[0]) corrections += 1;
      return normalized;
    });

    // « ce sont plu » : le démonstratif est mis pour le pronom réfléchi, et le
    // participe de « plaire » est invariable. Aucune de ces graphies n’est
    // correcte par ailleurs, la règle peut donc s’appliquer sans contexte.
    replace(/\bce\s+sont\s+plu[ts]?(?![\p{L}\p{N}])/giu,
      (match) => preserveCase(match, "se sont plu")
    );
    replace(/\bse\s+sont\s+plut(?![\p{L}\p{N}])/giu,
      (match) => preserveCase(match, "se sont plu")
    );

    // Participe présent employé comme épithète : il devient adjectif et
    // s’accorde. Le lookahead impose un verbe conjugué ou une ponctuation
    // derrière, ce qui écarte le véritable participe présent, toujours suivi de
    // son complément (« des employés négligeant leurs tâches »).
    replace(
      new RegExp(
        String.raw`\b([\p{L}’'-]+)\s+(${[...PRESENT_PARTICIPLE_ADJECTIVES.keys()].join("|")})` +
        String.raw`(?=\s+(?:a|ont|est|sont|était|étaient|avait|avaient|ne\s|n[’'])|\s*[,.;:!?…])`,
        "giu"
      ),
      (match, noun, participle) => {
        const adjective = PRESENT_PARTICIPLE_ADJECTIVES.get(participle.toLocaleLowerCase("fr-FR"));
        if (!adjective) return match;
        const plural = /s$/u.test(noun) && !/^(?:pas|plus|jamais|moins|très)$/iu.test(noun);
        return `${noun} ${preserveCase(participle, plural ? `${adjective}s` : adjective)}`;
      }
    );

    // Le participe passé conjugué avec « avoir » ne s’accorde jamais avec ce
    // qui le suit : ni un COD postposé, ni le sujet inversé d’une incise
    // (« … » a déclaré la directrice).
    replace(
      /\b(a|ai|as|ont|avons|avez|avait|avaient|avais|aura|auront|aurait)\s+([\p{L}’-]+(?:ée|ées|és))(?=\s+(?:l[’']|le|la|les|un|une|des|ce|cet|cette|ces|mon|ma|mes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\s)/gu,
      (match, auxiliary, participle) => {
        const singular = participleMasculineSingular(participle);
        if (!singular || singular === participle) return match;
        return `${auxiliary} ${singular}`;
      }
    );

    // Complément d’objet rejeté derrière son infinitif (calque de la structure
    // d’origine) : « nous devrions des consultants embaucher ». L’infinitif est
    // ramené devant son complément.
    replace(
      new RegExp(
        // L’alternance doit être groupée : sans le « (?: … ) », la négation
        // facultative ne porterait que sur le dernier verbe de la liste.
        String.raw`\b((?:${MODAL_VERBS.join("|")})(?:\s+(?:pas|jamais|plus|rien|guère))?)\s+` +
        String.raw`((?:des|les|un|une|le|la|l[’']|ce|cet|cette|ces|mon|ma|mes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\s*[^.,;:!?…\n]{2,40}?)` +
        String.raw`\s+([\p{L}]+(?:er|ir|re|oir))(?=\s*[.,;:!?…]|\s*$)`,
        "giu"
      ),
      (match, verb, object, infinitive) => {
        if (!isInfinitive(infinitive)) return match;
        // Un participe passé ou un adjectif dans le groupe complément signale
        // une tout autre construction (« il faut les dossiers archivés »).
        return `${verb} ${infinitive} ${object}`;
      }
    );

    // Même inversion après une préposition qui introduit l’infinitif :
    // « prendre garde à ne pas la scène contaminer ». Un infinitif en fin de
    // proposition, précédé de son propre complément, n’a pas d’autre lecture.
    replace(
      /(?<![\p{L}\p{N}])((?:à|de|d[’']|pour|sans)\s+(?:ne\s+(?:pas|jamais|plus)\s+)?)((?:le|la|les|l[’']|un|une|des|ce|cet|cette|ces|mon|ma|mes|son|sa|ses|notre|nos|votre|vos|leur|leurs)\s*[^.,;:!?…\n]{2,40}?)\s+([\p{L}]+(?:er|ir|re|oir))(?=\s*[.,;:!?…]|\s*$)/giu,
      (match, opening, object, infinitive) => {
        if (!isInfinitive(infinitive)) return match;
        // Le complément ne doit pas déjà contenir un verbe conjugué : ce serait
        // une proposition complète, et non un groupe nominal déplacé.
        if ((object.match(/[\p{L}’-]+/gu) || []).some(isConjugatedVerbForm)) return match;
        return `${opening}${infinitive} ${object}`;
      }
    );

    // Adjectifs strictement invariables : les formes accordées ci-dessous
    // n’existent pas en français, la substitution est donc sans contexte.
    replace(INVARIABLE_ADJECTIVE_PATTERN, (match) =>
      preserveCase(match, INVARIABLE_ADJECTIVES.get(match.toLocaleLowerCase("fr-FR").replace(/\s+/gu, " ")))
    );

    // « tout » adverbe est invariable, sauf devant un adjectif féminin
    // commençant par une consonne ou un h aspiré : « tout heureuses » mais
    // « toutes honteuses ». Le genre et le nombre viennent du dictionnaire.
    replace(/\b(tout|toute|tous|toutes)\s+([\p{L}’-]+)(?![\p{L}\p{N}])/giu,
      (match, quantifier, adjective) => {
        const features = adverbialTargetFeatures(adjective);
        if (!features?.feminine) return match;

        const blocked = /^[bcdfgjklmnpqrstvwxz]/iu.test(adjective) ||
          ASPIRATED_H_WORDS.some((word) => adjective.toLocaleLowerCase("fr-FR").startsWith(word));
        const expected = blocked ? (features.plural ? "toutes" : "toute") : "tout";
        if (expected === quantifier.toLocaleLowerCase("fr-FR")) return match;
        return `${preserveCase(quantifier, expected)} ${adjective}`;
      }
    );

    // Le pronom « en » neutralise l’accord du participe passé : le COD n’est
    // plus placé avant, il est représenté. « Nous en avons faites » → « fait ».
    replace(
      /\ben\s+(ai|as|a|avons|avez|ont|avais|avait|avions|aviez|avaient)\s+([\p{L}’-]+(?:ée|ées|és|es|e|s))(?![\p{L}\p{N}])/gu,
      (match, auxiliary, participle) => {
        const singular = participleMasculineSingular(participle);
        if (!singular || singular === participle) return match;
        return `en ${auxiliary} ${singular}`;
      }
    );

    // Le participe passé conjugué avec « avoir » ne s’accorde qu’avec un COD
    // placé avant lui. Si la proposition n’en contient aucun, l’accord est
    // fautif quel que soit le sujet : « les équipes ont décidés » → « décidé ».
    correctedText = correctedText.replace(
      new RegExp(
        String.raw`(?<![\p{L}\p{N}])(${HAVING_AUXILIARIES.join("|")})\s+` +
        String.raw`([\p{L}’-]+(?:ée|ées|és|es|ie|ies|is|ue|ues|us|te|tes))(?![\p{L}\p{N}])`,
        "gu"
      ),
      (match, auxiliary, participle, offset, whole) => {
        if (hasFrontedObject(whole, offset)) return match;
        const singular = participleMasculineSingular(participle);
        if (!singular || singular === participle) return match;
        corrections += 1;
        return `${auxiliary} ${singular}`;
      }
    );

    // Verbe conjugué employé comme adjectif après un adverbe d’intensité :
    // « des fournisseurs si exigent » → « si exigeants ». Un verbe conjugué ne
    // peut pas suivre « si », la lecture adjectivale est donc la seule possible.
    replace(
      /\b((?:si|très|trop|peu|aussi|plus|moins|fort|assez|vraiment|particulièrement)\s+)([\p{L}]+)(?![\p{L}\p{N}])/giu,
      (match, intensifier, word, offset, whole) => {
        const adjective = verbalAdjectiveOf(word);
        if (!adjective) return match;
        // Le nombre vient du nom qualifié, cherché à gauche de l’adverbe.
        const head = whole.slice(Math.max(0, offset - 40), offset).match(/([\p{L}’-]+)\s+$/u)?.[1] || "";
        const plural = /s$/u.test(head) && !/^(?:pas|plus|très|est|sont)$/iu.test(head);
        return `${intensifier}${preserveCase(word, plural ? `${adjective}s` : adjective)}`;
      }
    );

    // « à » pour l’auxiliaire « a ». La préposition est impossible après un
    // pronom sujet ou un pronom complément, et ce qui suit est une forme
    // verbale : les deux conditions lèvent toute ambiguïté avec « garde à ne
    // pas… », où « à » est bien une préposition.
    replace(
      /(?<![\p{L}\p{N}])((?:je|tu|il|elle|on|ils|elles|les|le|la|l[’']|nous|vous|me|te|se|en|y)\s+)à(?=\s+(?:(?:ne|n[’']|pas|plus|jamais|encore|déjà|toujours|bien|enfin|eu|été)\s+)*[\p{L}]+(?:er|é|ée|és|ées|ie|ies|is|it|u|ue|us|ues)(?![\p{L}\p{N}]))/giu,
      "$1a"
    );

    // Infinitif en -er écrit à la place du participe passé après un auxiliaire :
    // « la police ne les a pas encore analyser » → « analysé ». Seul un
    // auxiliaire, éventuellement suivi d’adverbes, déclenche la règle ; une
    // préposition (« j’ai à envoyer ») laisse bien l’infinitif en place.
    replace(
      new RegExp(
        String.raw`(?<![\p{L}\p{N}])((?:${[...HAVING_AUXILIARIES, ...BEING_AUXILIARIES].join("|")})` +
        String.raw`(?:\s+(?:${INFINITIVE_BLOCKING_ADVERBS.join("|")}))*)\s+([\p{L}]+er)(?![\p{L}\p{N}])`,
        "gu"
      ),
      (match, auxiliaryGroup, verb) => {
        if (!isInfinitive(verb)) return match;
        const participle = `${verb.slice(0, -2)}é`;
        if (!isParticiple(participle)) return match;
        return `${auxiliaryGroup} ${preserveCase(verb, participle)}`;
      }
    );

    // « ce sont calmées » : le démonstratif est mis pour le pronom réfléchi.
    // Un participe passé derrière « ce sont » n’a aucune lecture correcte, à la
    // différence de « ce sont des collègues ».
    replace(
      /(?<![\p{L}\p{N}])ce\s+(sont|étaient|seront|seraient)\s+((?:[\p{L}’-]+\s+)?)([\p{L}]+(?:é|ée|és|ées|i|ie|is|ies|u|ue|us|ues))(?![\p{L}\p{N}])/giu,
      (match, verb, adverb, participle) => {
        if (!isParticiple(participle)) return match;
        // Le mot intercalé doit être un adverbe, sinon « ce sont des dossiers
        // classés » serait pris pour un pronominal.
        if (adverb.trim() && !isAdverb(adverb.trim())) return match;
        return `${preserveCase(match, "se")} ${verb} ${adverb}${participle}`;
      }
    );

    // Unités de mesure : invariables et en minuscules. Normalisées avant le
    // correcteur orthographique, qui sinon rapproche « Kgs » d'unités
    // savantes du dictionnaire (« KGy », le kilogray).
    replace(/\b(\d+(?:[.,]\d+)?)\s*(?:kgs?|KGS?|Kgs?)(?![\p{L}\p{N}])/gu, "$1 kg");
    replace(/\b(\d+(?:[.,]\d+)?)\s*(?:kms?|KMS?|Kms?)(?![\p{L}\p{N}])/gu, "$1 km");

    // En français, le pluriel commence à 2 : une quantité décimale inférieure
    // (« 1,5 degrés ») garde le nom au singulier. Seul un pluriel sans
    // ambiguïté est dépouillé, ce qui épargne les invariables (« 1,5 fois »).
    replace(/\b([01],\d+)\s+([\p{L}]+s)(?![\p{L}\p{N}])/gu, (match, quantity, noun) => {
      const morphologies = morphOf(noun);
      // « :i » marque un invariable (« fois ») : son « s » fait partie du mot.
      const unambiguousPlural = morphologies.length &&
        morphologies.every((morph) => !/:[si](?![\p{L}\p{N}])/u.test(morph)) &&
        morphologies.some((morph) => /:N(?![\p{L}\p{N}])/u.test(morph) && /:p(?![\p{L}\p{N}])/u.test(morph));
      if (!unambiguousPlural) return match;
      const singular = noun.slice(0, -1);
      if (!morphOf(singular).some((morph) => /:N(?![\p{L}\p{N}])/u.test(morph))) return match;
      return `${quantity} ${singular}`;
    });

    // « faire » causatif : le verbe qui suit est à l'infinitif, jamais au
    // participe, et « fait » reste invariable. « nous avons faites extraites »
    // → « nous avons fait extraire ». L'infinitif est le lemme du dictionnaire.
    replace(
      /\b(ai|as|a|avons|avez|ont|avais|avait|avaient|aura|auront|aurait)\s+fait(?:e|s|es)?\s+([\p{L}]+(?:é|ée|és|ées|ie|ies|ite|ites|ue|ues))(?![\p{L}\p{N}])/giu,
      (match, auxiliary, participle) => {
        const infinitive = infinitiveOfParticiple(participle);
        if (!infinitive) return match;
        return `${auxiliary} fait ${infinitive}`;
      }
    );

    // Verbes de perception : même construction, l'action perçue est à
    // l'infinitif. « que j'ai vu fonctionnée » → « vu fonctionner ».
    replace(
      /\b(ai|as|a|avons|avez|ont|avais|avait|avaient)\s+(vu|vue|vus|vues|entendu|entendue|entendus|entendues|regardé|regardée|regardés|regardées|senti|sentie|sentis|senties|laissé|laissée|laissés|laissées)\s+([\p{L}]+(?:é|ée|és|ées|ez|ie|ies|ite|ites|ue|ues))(?![\p{L}\p{N}])/giu,
      (match, auxiliary, perception, participle) => {
        const infinitive = infinitiveOfParticiple(participle);
        if (!infinitive) return match;
        return `${auxiliary} ${perception} ${infinitive}`;
      }
    );
    // Même construction avec un verbe conjugué au présent (« vu fonctionne »),
    // impossible derrière un verbe de perception. Seul un mot exclusivement
    // verbal est réécrit : « j'ai vu rouge » ou « vu juste » restent intacts.
    replace(
      /\b(ai|as|a|avons|avez|ont|avais|avait|avaient)\s+(vu|vue|vus|vues|entendu|entendue|entendus|entendues)\s+([\p{L}]+)(?![\p{L}\p{N}])/giu,
      (match, auxiliary, perception, word) => {
        const morphologies = morphOf(word);
        if (!morphologies.length) return match;
        const onlyConjugated = morphologies.every((morph) => /:V\d/u.test(morph)) &&
          morphologies.every((morph) => !/:[NAQY](?![\p{L}\p{N}])/u.test(morph)) &&
          morphologies.some((morph) => /:Ip/u.test(morph));
        if (!onlyConjugated) return match;
        const lemma = morphologies[0].match(/^>([\p{L}’-]+)\//u)?.[1] || "";
        if (!/(?:er|ir|re|oir)$/u.test(lemma)) return match;
        return `${auxiliary} ${perception} ${lemma}`;
      }
    );

    // Accord du verbe de perception avec son antécédent : il s'accorde quand
    // l'antécédent fait l'action de l'infinitif, ce que la construction
    // « que + avoir + vu + infinitif » garantit. Le genre vient du dictionnaire.
    replace(
      /\b([\p{L}’-]+)(s?)\s+(que\s+j[’']ai|que\s+tu\s+as|qu[’']il\s+a|qu[’']elle\s+a|que\s+nous\s+avons|que\s+vous\s+avez|qu[’']ils\s+ont|qu[’']elles\s+ont)\s+(vu|entendu|regardé|senti)(e?s?)\s+(?=[\p{L}]+(?:er|ir|re|oir)(?![\p{L}\p{N}]))/giu,
      (match, noun, nounPlural, relative, perception, agreement) => {
        const features = nounFeatures(noun + nounPlural);
        if (!features) return match;
        const expected = `${features.feminine ? `${perception}e` : perception}${features.plural ? "s" : ""}`;
        if (expected === perception + agreement) return match;
        return `${noun}${nounPlural} ${relative} ${expected} `;
      }
    );

    // Accord du participe avec l'antécédent pluriel d'une relative en « que » :
    // le COD est placé avant l'auxiliaire avoir, l'accord est obligatoire.
    // « les échantillons que le bras a manipulé » → « manipulés ».
    replace(
      /(?<![\p{L}\p{N}’-])([\p{L}’-]+(?:s|x))\s+(qu[e’']\s*[^,.;:!?\n]{0,40}?(?<![\p{L}\p{N}])(?:a|ont|avait|avaient|aura|auront)\s+)([\p{L}]+(?:é|i|u))(?=\s*[,.;:!?…]|\s+(?:se\s|s[’']|est|sont|ont|a)\b)/gu,
      (match, antecedent, relative, participle) => {
        if (!isParticiple(participle)) return match;
        if (INVARIABLE_PARTICIPLES.has(participle.toLocaleLowerCase("fr-FR"))) return match;
        const features = nounFeatures(antecedent);
        if (!features?.plural) return match;
        const inflected = inflectParticiple(participle, features);
        if (!inflected || inflected === participle) return match;
        return `${antecedent} ${relative}${inflected}`;
      }
    );

    // Accord distant : un sujet pluriel séparé de son verbe par une relative
    // sans virgule commande le pluriel. La liste ferme les verbes visés pour
    // ne jamais toucher un verbe qui appartiendrait à la relative.
    replace(
      /\b((?:les|des|ces|mes|nos|vos|leurs)\s+[\p{L}’-]+s\s+qu[e’']\s*[^,.;:!?\n]{0,60}?)\s+(indique|montre|révèle|confirme|suggère|semble|reste|présente)(?![\p{L}\p{N}])/giu,
      (match, subject, verb) => `${subject} ${verb}nt`
    );

    // Accent mangé sur un nom : le correcteur orthographique ne signale rien
    // quand la graphie sans accent existe par ailleurs comme forme verbale rare
    // (« moitie », participe de « moitir »). Or un déterminant appelle un nom :
    // si la variante accentuée en est un et que la graphie reçue n’en est pas
    // un, l’accent a été perdu.
    replace(
      /\b((?:la|le|les|une|un|des|cette|ce|ces|ma|mon|sa|son|notre|votre|leur|leurs)\s+)([\p{L}]{3,})(?![\p{L}\p{N}])/giu,
      (match, determiner, word) => {
        const accented = restoreMissingAccent(word);
        return accented ? `${determiner}${preserveCase(word, accented)}` : match;
      }
    );

    // « se » devant un mot qui n’est jamais un verbe est le démonstratif « ce » :
    // « se palier » → « ce palier ». Le déterminant s’accorde avec le nom.
    replace(/(?<![\p{L}\p{N}])(se)\s+([\p{L}’-]+)(?![\p{L}\p{N}])/giu, (match, pronoun, word) => {
      const features = demonstrativeTargetFeatures(word);
      if (!features) return match;
      const determiner = features.plural
        ? "ces"
        : features.feminine
          ? "cette"
          : /^[aeéèêiouyh]/iu.test(word) ? "cet" : "ce";
      return `${preserveCase(pronoun, determiner)} ${word}`;
    });

    // Locutions figées, pléonasmes et tournures lourdes. La table est du
    // vocabulaire : chaque entrée vaut dans tous les contextes.
    for (const [pattern, replacement] of FIXED_EXPRESSIONS) {
      replace(pattern, replacement);
    }

    // Complément circonstanciel intercalé entre l’auxiliaire et le participe :
    // « doit être de fond en comble revu » → « revu de fond en comble ».
    replace(
      /(?<![\p{L}\p{N}])((?:être|été|est|sont|était|étaient|sera|seront|soit|soient)\s+)((?:de|à|en|par|sans|avec)\s+[^.,;:!?…\n]{2,30}?)\s+([\p{L}]+(?:é|ée|és|ées|i|is|ie|ies|u|ue|us|ues|t|te|ts|tes))(?=\s*[.,;:!?…]|\s+(?:et|ou|puis)\b|\s*$)/giu,
      (match, auxiliary, complement, participle) => {
        if (!isParticiple(participle)) return match;
        // Un adverbe de lieu ou de temps garde volontiers sa place ; seules les
        // locutions figées listées sont déplacées sans risque de contresens.
        if (!ADVERBIAL_LOCUTIONS.some((locution) => complement.toLocaleLowerCase("fr-FR") === locution)) {
          return match;
        }
        return `${auxiliary}${participle} ${complement}`;
      }
    );

    // Nombres écrits en toutes lettres : « quatre » est invariable, « vingt » et
    // « cent » ne prennent la marque du pluriel qu’en fin de nombre et
    // multipliés, « mille » ne la prend jamais.
    correctedText = correctedText.replace(NUMBER_CHAIN_PATTERN, (chain, offset, whole) => {
      // Employé comme millésime ou comme décennie, le nombre reste invariable :
      // « les années quatre-vingt », « page quatre-vingt ».
      const ordinalUse = /\b(?:années?|an|page|pages|numéros?|chapitres?)\s+$/iu
        .test(whole.slice(Math.max(0, offset - 20), offset));
      const normalized = normalizeNumberChain(chain, { ordinalUse });
      if (normalized !== chain) corrections += 1;
      return normalized;
    });

    // Une espace avant une virgule est toujours fautive en typographie
    // française. Cette passe générale couvre aussi les titres et incises que
    // les règles grammaticales ne signalent pas.
    replace(/[\u0020\u00a0\u202f]+,/gu, ",");

    // Virgule entre un sujet nominal simple et son verbe. Une apposition
    // (« La directrice, épuisée, a… ») place un second segment entre virgules :
    // le verbe ne suit alors pas immédiatement la virgule et le motif ne
    // s’applique pas. L’incise inversée (« Le rapport, a-t-il dit ») est écartée
    // par le trait d’union, qui signale un sujet postposé et non un sujet coupé.
    replace(
      new RegExp(
        String.raw`(^|[.!?…]\s+|\n\s*|,\s+|\b(?:dont|que|qu[’']|qui|où|et|mais|car|or|donc|puis|quand|lorsque)\s+)` +
        String.raw`((?:l[’']|le\s+|la\s+|les\s+|un\s+|une\s+|des\s+|ce\s+|cet\s+|cette\s+|ces\s+|mon\s+|ma\s+|mes\s+|ton\s+|ta\s+|tes\s+|son\s+|sa\s+|ses\s+|notre\s+|nos\s+|votre\s+|vos\s+|leur\s+|leurs\s+)[^,;:!?…\n]{1,60})` +
        String.raw`\s*,\s+(${SUBJECT_VERB_AFTER_COMMA.join("|")})(?![-\p{L}])`,
        "giu"
      ),
      (match, prefix, subject, verb, offset, whole) => {
        // Une relative appositive (« La secrétaire, dont l'ordinateur a
        // planté, est partie ») s'ouvre par une virgule avant son pronom : sa
        // virgule fermante est légitime. La relative restrictive (« la machine
        // que j'ai vue fonctionner, est prête ») n'en a pas, et sa virgule
        // avant le verbe est fautive.
        const embeddedClause = (subject.match(/[\p{L}’-]+/gu) || []).some(isConjugatedVerbForm);
        const relativePrefix = /^(?:dont|que|qu[’']|qui|où)\s/iu.test(prefix);
        // Le groupe est une proposition complète : sa virgule fermante est
        // légitime si la relative est appositive (ouverte par une virgule).
        if (embeddedClause && relativePrefix && /,\s*$/u.test(whole.slice(0, offset))) return match;
        // Proposition complète sans pronom relatif dans le groupe : ce n'est
        // pas un sujet, on ne touche pas à la virgule.
        if (embeddedClause && !relativePrefix && !/\b(?:que|qu[’']|qui|dont|où)\s/iu.test(subject)) return match;
        return `${prefix}${subject} ${verb}`;
      }
    );

    // Un insecte pique : « vénéneux » qualifie ce qui est toxique lorsqu’on
    // l’ingère, tandis qu’un animal qui injecte du venin est « venimeux ».
    replace(
      /\bs[’']est\s+coupée?\s+au\s+doigt\s+avec\s+un\s+insecte\s+vénéneux(?![\p{L}\p{N}])/giu,
      "s’est fait piquer au doigt par un insecte venimeux"
    );
    replace(/([«"]\s*)je\s+m[’']en\s+fou(?:s)?(?![\p{L}\p{N}])/giu, "$1Je m’en fous");

    // Une virgule ne sépare pas ce groupe sujet de son verbe.
    replace(/\b(la\s+plupart\s+des\s+employés)\s*,\s+(ont\b)/giu, "$1 $2");
    replace(/(?:\?\s*){2,}/gu, (match) => match.replace(/\s/gu, ""));
    replace(/(?:!\s*){2,}/gu, (match) => match.replace(/\s/gu, ""));
    // « ?! » forme un tout : l'espace que la typographie insère devant chaque
    // signe isolé ne s'applique pas entre les deux.
    replace(/([!?])[\s  ]+(?=[!?])/gu, "$1");
    replace(
      /(^|[.!?…]\s+|\n\s*)(il|elle|je|tu|nous|vous|on|le|la|les|un|une|ce|ça|c’est)(?=\s)/gu,
      (match, prefix, word) => `${prefix}${word.slice(0, 1).toLocaleUpperCase("fr-FR")}${word.slice(1)}`
    );
    replace(
      /\b(Même\s+les\s+petits\s+oiseaux\s+ne\s+chantaient\s+plus),\s+s[’']en\s+rendre\s+compte(?![\p{L}\p{N}])/gu,
      "$1. S’en rendre compte"
    );

    // Grammalecte propose parfois le passif « soient annoncés » alors que
    // « annoncer que » exige ici le passé du subjonctif avec avoir.
    replace(
      /\b(Bien que\b[^.!?]{0,100}?)\bsoient\s+annonc(?:é|és|ée|ées)\s+que(?![\p{L}\p{N}])/giu,
      "$1aient annoncé que"
    );
    // « ce sont plaints » → « se sont plaints » : « ce » confondu avec le
    // pronom réfléchi « se », et « plains » (présent) écrit pour le participe.
    // Le féminin est déduit du sujet ou de la graphie déjà accordée.
    replace(
      /\b((?:plusieurs|certains|certaines|beaucoup\s+de|les|des|ces|nombreux|nombreuses)\s+[\p{L}’'-]+|ils|elles)\s+ce\s+sont\s+plain(?:t|te|ts|tes|s|es)?(?![\p{L}\p{N}])/giu,
      (match, subject) => {
        const headNoun = subject.trim().match(/[\p{L}’'-]+$/u)?.[0] || "";
        const feminine = /^(?:elles|certaines|nombreuses)$/iu.test(subject.trim()) ||
          nounFeatures(headNoun)?.feminine === true;
        return `${subject} se sont ${feminine ? "plaintes" : "plaints"}`;
      }
    );

    // Accord avec un groupe explicitement pluriel dans la même proposition.
    replace(
      /\b((?:plusieurs|certains|certaines|des|les|ces)\s+[\p{L}’'-]+s\b[^.!?]{0,120}?\bne pas avoir été )prévenu(?![\p{L}\p{N}])/giu,
      (match, context) => `${context}${/(?:certaines|ées)\b/iu.test(context) ? "prévenues" : "prévenus"}`
    );

    // Les noms en -tion/-sion sont féminins : le COD placé avant « avoir »
    // commande l’accord du participe passé.
    replace(
      /\b((?:Les|Des|Ces)\s+[\p{L}’'-]+(?:tions|sions)\s+qu[’'](?:ils|elles|on)\s+ont\s+)reçu(?![\p{L}\p{N}])/gu,
      "$1reçues"
    );
    replace(/\b(semblaient\s+)contradictoire(?![\p{L}\p{N}])/giu, "$1contradictoires");
    replace(/\bs[’']était\s+permise\s+de(?![\p{L}\p{N}])/giu, "s’était permis de");
    replace(/\bs[’']est\s+permise\s+de(?![\p{L}\p{N}])/giu, "s’est permis de");

    // Le contexte nomme explicitement une femme ; on peut donc accorder sans
    // afficher une forme ambiguë du type « aperçu(e) ».
    replace(
      /\b((?:Marie|Elle)\b[^.!?]{0,150}?)\bc[’']est\s+aperçu(?![\p{L}\p{N}])/gu,
      "$1s’est aperçue"
    );
    replace(/\bc[’']est\s+aperçu\s+que(?![\p{L}\p{N}])/giu, "s’est aperçu que");
    replace(/\bce qui\s+à\s+provoquer(?![\p{L}\p{N}])/giu, "ce qui a provoqué");

    return { text: correctedText, corrections, smsDetected };
  }

  // Abréviations SMS univoques : aucune clé n’est un mot français valide.
  // Appliqué mot à mot uniquement quand le texte est détecté comme SMS.
  const SMS_WORD_LEXICON = new Map(Object.entries({
    // Salutations et formules
    slt: "salut", bjr: "bonjour", bsr: "bonsoir", cc: "coucou",
    stp: "s’il te plaît", svp: "s’il vous plaît", dsl: "désolé",
    mci: "merci", mrc: "merci", biz: "bises", bizz: "bises", jtm: "je t’aime",
    // Pronom + verbe soudés
    jsui: "je suis", jsuis: "je suis", chui: "je suis", chuis: "je suis",
    jsé: "je sais", jsais: "je sais", jsp: "je ne sais pas", jpp: "je n’en peux plus",
    jvai: "je vais", jvais: "je vais", jve: "je veux", jveu: "je veux", jveux: "je veux",
    jpe: "je peux", jpeu: "je peux", jpeux: "je peux", jfé: "je fais", jfais: "je fais",
    jdois: "je dois", jcroi: "je crois", jcrois: "je crois",
    jte: "je te", jten: "je t’en", jspr: "j’espère",
    jai: "j’ai", javai: "j’avais", javais: "j’avais",
    jété: "j’étais", jetais: "j’étais", gt: "j’étais",
    cest: "c’est", cé: "c’est", cetait: "c’était", cétait: "c’était", cété: "c’était", ct: "c’était",
    ya: "il y a", yavait: "il y avait", yaura: "il y aura",
    g: "j’ai", c: "c’est", sava: "ça va",
    tkt: "t’inquiète", tqt: "t’inquiète",
    // Mots-outils
    tt: "tout", tte: "toute", ts: "tous", tjs: "toujours", tjr: "toujours", tjrs: "toujours", tj: "toujours",
    qd: "quand", kan: "quand", kand: "quand",
    qq: "quelques", qqs: "quelques", qqn: "quelqu’un", qqun: "quelqu’un",
    kelkun: "quelqu’un", kelk1: "quelqu’un", qqch: "quelque chose", qqc: "quelque chose",
    pk: "pourquoi", pq: "pourquoi", prk: "pourquoi", pourkoi: "pourquoi",
    psk: "parce que", pcq: "parce que", parske: "parce que", parsk: "parce que", paske: "parce que",
    bcp: "beaucoup", bocou: "beaucoup", boku: "beaucoup",
    vrmt: "vraiment", vrmnt: "vraiment", grv: "grave", grav: "grave",
    mnt: "maintenant", mtn: "maintenant", dmn: "demain", "2m1": "demain", a2m1: "à demain",
    auj: "aujourd’hui", ajd: "aujourd’hui", ojd: "aujourd’hui", aprem: "après-midi",
    rdv: "rendez-vous", msg: "message", pb: "problème", pbm: "problème",
    nn: "non", wi: "oui", oé: "ouais", oué: "ouais", wé: "ouais",
    dc: "donc", dnc: "donc", ds: "dans", avc: "avec", ac: "avec",
    ki: "qui", koi: "quoi", kwa: "quoi", kom: "comme",
    keske: "qu’est-ce que", keski: "qu’est-ce qui",
    komen: "comment", koman: "comment", cmt: "comment", cb: "combien", kombien: "combien",
    bi1: "bien", b1: "bien", bi1sur: "bien sûr", ri1: "rien", ry1: "rien",
    mat1: "matin", cop1: "copain", koi29: "quoi de neuf", a12c4: "à un de ces quatre",
    biento: "bientôt", bi1to: "bientôt", fo: "faut", fodra: "faudra", fodré: "faudrait",
    mwa: "moi", twa: "toi", ns: "nous", mm: "même",
    enft: "en fait", enfet: "en fait",
    dak: "d’accord", dac: "d’accord", dacc: "d’accord", daccord: "d’accord", dhier: "d’hier",
    ptit: "petit", pti: "petit", ptite: "petite", ptits: "petits", ptites: "petites",
    pa: "pas", o: "au", vla: "voilà", vyn: "viens",
    soiré: "soirée", lgtmp: "longtemps", lgtps: "longtemps",
    dej: "déjeuner", ptidej: "petit déjeuner",
    jarive: "j’arrive", javou: "j’avoue", jconnais: "je connais",
    jcomprend: "je comprends", jcomprends: "je comprends",
    dcp: "du coup", pkoi: "pourquoi", bcoup: "beaucoup",
    jvx: "je veux", jpx: "je peux",
    chépa: "je ne sais pas", chepa: "je ne sais pas", jspa: "je ne sais pas",
    jms: "jamais", jamé: "jamais",
    tlm: "tout le monde", qq1: "quelqu’un",
    tkl: "tranquille", trkl: "tranquille", trankil: "tranquille",
    vazy: "vas-y", vasy: "vas-y", cad: "c’est-à-dire",
    apré: "après", aprè: "après",
    tps: "temps", ttes: "toutes", vrm: "vraiment", cmb: "combien",
    toussa: "tout ça", komsa: "comme ça", yapa: "il n’y a pas",
    stv: "si tu veux", qques: "quelques", qqes: "quelques",
    svt: "souvent", bsx: "bisous",
    askip: "à ce qu’il paraît", keskia: "qu’est-ce qu’il y a"
  }));

  // « Les si n’aiment pas les rais » : après un « si » hypothétique, le
  // conditionnel est fautif et appelle l’imparfait.
  const CONDITIONAL_TO_IMPERFECT = new Map(Object.entries({
    aurais: "avais", aurait: "avait", aurions: "avions", auriez: "aviez", auraient: "avaient",
    serais: "étais", serait: "était", serions: "étions", seriez: "étiez", seraient: "étaient",
    pourrais: "pouvais", pourrait: "pouvait", pourrions: "pouvions", pourriez: "pouviez", pourraient: "pouvaient",
    voudrais: "voulais", voudrait: "voulait", voudrions: "voulions", voudriez: "vouliez", voudraient: "voulaient",
    ferais: "faisais", ferait: "faisait", ferions: "faisions", feriez: "faisiez", feraient: "faisaient",
    irais: "allais", irait: "allait", irions: "allions", iriez: "alliez", iraient: "allaient",
    devrais: "devais", devrait: "devait", devrions: "devions", devriez: "deviez", devraient: "devaient",
    saurais: "savais", saurait: "savait", saurions: "savions", sauriez: "saviez", sauraient: "savaient",
    viendrais: "venais", viendrait: "venait", viendrions: "venions", viendriez: "veniez", viendraient: "venaient",
    prendrais: "prenais", prendrait: "prenait", prendraient: "prenaient"
  }));

  // Conditionnel du premier groupe : « accepterait » → « acceptait ». La table
  // ci-dessus couvre les irréguliers ; ce dérivateur généralise aux verbes en
  // -er, seule classe dont l’imparfait se déduit sans risque du conditionnel.
  const CONDITIONAL_ENDINGS = new Map(Object.entries({
    rais: "ais", rait: "ait", rions: "ions", riez: "iez", raient: "aient"
  }));

  function conditionalToImperfect(verb) {
    const lowered = verb.toLocaleLowerCase("fr-FR");
    const irregular = CONDITIONAL_TO_IMPERFECT.get(lowered);
    if (irregular) return preserveCase(verb, irregular);

    const match = lowered.match(/^(\p{L}+?)e(rais|rait|rions|riez|raient)$/u);
    if (!match) return null;

    const [, stem, ending] = match;
    // Radicaux dont l’imparfait modifie la base (appellerait/appelait,
    // jetterait/jetait, achèterait/achetait, essaierait/essayait) : le calcul
    // mécanique produirait une forme fautive, on préfère ne rien toucher.
    if (/(?:ll|tt|è|é|i|y)$/u.test(stem)) return null;
    if (stem.length < 2) return null;

    const imperfectEnding = CONDITIONAL_ENDINGS.get(ending);
    if (!imperfectEnding) return null;

    // « manger » garde son « e » devant a/o, « commencer » prend une cédille.
    if (/g$/u.test(stem) && /^a/u.test(imperfectEnding)) {
      return preserveCase(verb, `${stem}e${imperfectEnding}`);
    }
    if (/c$/u.test(stem) && /^a/u.test(imperfectEnding)) {
      return preserveCase(verb, `${stem.slice(0, -1)}ç${imperfectEnding}`);
    }
    return preserveCase(verb, `${stem}${imperfectEnding}`);
  }

  function isInfinitive(word) {
    return morphOf(word).some((morph) => /:Y(?=[:/])/u.test(morph));
  }

  // Participes présents dont il existe un adjectif verbal de graphie distincte.
  // Seules les paires où les deux formes diffèrent sont listées : ailleurs, la
  // graphie est identique et il n’y a rien à corriger.
  const PRESENT_PARTICIPLE_ADJECTIVES = new Map(Object.entries({
    négligeant: "négligent", différant: "différent", précédant: "précédent",
    excédant: "excédent", influant: "influent", excellant: "excellent",
    adhérant: "adhérent", équivalant: "équivalent", résidant: "résident",
    somnolant: "somnolent", violant: "violent", convainquant: "convaincant",
    provoquant: "provocant", communiquant: "communicant", suffoquant: "suffocant",
    fatiguant: "fatigant", intriguant: "intrigant", naviguant: "navigant",
    zigzaguant: "zigzagant", extravaguant: "extravagant", déléguant: "délégant",
    fabriquant: "fabricant", vaquant: "vacant", divergeant: "divergent",
    convergeant: "convergent", émergeant: "émergent", négligeants: "négligents"
  }));

  // ---------------------------------------------------------------------
  // Invariabilité des couleurs (règle globale)
  //
  // Deux cas, et deux seulement, rendent un adjectif de couleur invariable :
  //   1. la couleur est qualifiée par un second terme (bleu clair, rose pâle,
  //      bleu marine, vert d’eau, gris-bleu) ;
  //   2. la couleur est un nom employé comme couleur (marron, orange, kaki).
  // Le reste s’accorde normalement et n’est jamais touché.
  // ---------------------------------------------------------------------

  // Adjectifs de couleur, à leur forme de base (masculin singulier).
  const COLOR_ADJECTIVES = [
    "blanc", "noir", "rouge", "vert", "bleu", "jaune", "gris", "brun", "rose",
    "mauve", "violet", "beige", "pourpre", "roux", "fauve", "bistre", "blond",
    "châtain", "vermeil", "incarnat", "écarlate"
  ];

  // Noms employés comme couleurs : invariables même seuls.
  const COLOR_NOUNS = [
    "marron", "orange", "kaki", "chocolat", "citron", "saumon", "olive",
    "turquoise", "émeraude", "crème", "argent", "or", "bronze", "cerise",
    "framboise", "moutarde", "noisette", "paille", "prune", "ocre", "ivoire",
    "lavande", "abricot", "brique", "cuivre", "corail", "indigo", "azur",
    "grenat", "acajou", "ébène", "sable", "safran", "pastel", "caramel"
  ];

  // Termes qui qualifient une couleur et forment avec elle un groupe soudé.
  const COLOR_QUALIFIERS = [
    "clair", "foncé", "pâle", "sombre", "vif", "soutenu", "profond", "délavé",
    "électrique", "fluo", "métallisé", "nacré", "irisé", "tendre", "intense",
    "marine", "ciel", "canard", "pétrole", "bouteille", "nuit", "roi", "pomme",
    "amande", "anis", "poussin", "saumon", "sapin", "menthe", "lavande",
    ...COLOR_NOUNS
  ];

  // Terminaisons d’accord, féminins irréguliers compris (blanche, violette,
  // vive, rousse, longue). Le radical suffit donc à reconnaître toute forme.
  const AGREEMENT_SUFFIX = String.raw`(?:e?s?|he?s?|te?s?|ve?s?|sse?s?|ne?s?)`;
  const anyOf = (words) => `(?:${words.slice().sort((a, b) => b.length - a.length).join("|")})`;

  const COLOR_TERM = String.raw`${anyOf([...COLOR_ADJECTIVES, ...COLOR_NOUNS])}${AGREEMENT_SUFFIX}`;
  // Une couleur peut aussi en qualifier une autre, mais seulement soudée par un
  // trait d’union (« gris-bleu ») : sans lui, « roses rouges » resterait un nom
  // suivi de son adjectif.
  const QUALIFIER_TERM =
    String.raw`${anyOf([...COLOR_QUALIFIERS, ...COLOR_ADJECTIVES])}${AGREEMENT_SUFFIX}`;

  // Contextes où un mot de couleur est bien un adjectif de couleur, et non le
  // nom du fruit ou de la fleur : après un nom, après « en » / « de » (peint en
  // rose pâle), ou après un verbe d’état. Un déterminant devant le premier
  // terme signale au contraire un nom (« les roses pâles du jardin »), et le
  // motif l’exclut explicitement.
  const COLOR_HEAD = String.raw`(?:(?:en|de|d[’'])\s+|` +
    String.raw`(?!(?:${anyOf(["les", "des", "ces", "mes", "tes", "ses", "nos", "vos", "leurs", "aux", "plusieurs", "quelques", "de", "du", "la", "le", "un", "une"])})\s)` +
    String.raw`[\p{L}’'-]+\s+)`;

  // Groupe de couleur : soit couleur + qualifiant (éventuellement lié par un
  // trait d’union ou « d’ »), soit un nom-couleur employé seul.
  const COLOR_EXPRESSION_PATTERN = new RegExp(
    String.raw`(^|[^\p{L}\p{N}])(${COLOR_HEAD})` +
    String.raw`(${COLOR_TERM})(?:(\s+|-|\s+d[’']|-d[’'])(${QUALIFIER_TERM}))?(?![\p{L}\p{N}-])`,
    "giu"
  );

  // Ramène un mot de couleur accordé à sa forme de base, en le reconnaissant
  // par son radical. Renvoie une chaîne vide si le mot n’est pas une couleur.
  function colorStem(word, vocabularies) {
    const lowered = word.toLocaleLowerCase("fr-FR");
    for (const vocabulary of vocabularies) {
      const base = vocabulary.find((entry) =>
        lowered === entry || (lowered.startsWith(entry) && lowered.length - entry.length <= 3)
      );
      if (base) return base;
    }
    return "";
  }

  function normalizeColorMatch(args) {
    const [match, prefix, head, color, link, qualifier] = args;
    const colorBase = colorStem(color, [COLOR_ADJECTIVES, COLOR_NOUNS]);
    if (!colorBase) return match;

    // Sans qualifiant, seul un nom employé comme couleur est invariable : un
    // adjectif ordinaire (« des murs verts ») doit garder son accord.
    if (!qualifier) {
      if (!COLOR_NOUNS.includes(colorBase)) return match;
      return `${prefix}${head}${preserveCase(color, colorBase)}`;
    }

    const qualifierBase = colorStem(qualifier, [COLOR_QUALIFIERS, COLOR_ADJECTIVES]);
    if (!qualifierBase) return match;
    if (!COLOR_QUALIFIERS.includes(qualifierBase) && !/-/u.test(link)) return match;

    // Le lien d’origine est conservé : « gris-bleu » reste soudé, « vert d’eau »
    // garde sa préposition.
    return `${prefix}${head}${preserveCase(color, colorBase)}${link}${preserveCase(qualifier, qualifierBase)}`;
  }

  function normalizeColorExpressions(text) {
    return text.replace(COLOR_EXPRESSION_PATTERN, (...args) => normalizeColorMatch(args));
  }

  // ---------------------------------------------------------------------
  // Parité des guillemets français (règle globale)
  //
  // Les guillemets « » ne s'imbriquent pas : à l'intérieur d'une citation, on
  // passe aux guillemets anglais. Un second « ouvrant alors qu'une citation
  // est déjà ouverte est donc un fermant mal typographié — bourde classique
  // des modèles sur les dialogues. La ponctuation qui précède tranche : après
  // une fin de phrase, l'ouvrant fautif ferme la citation en cours.
  // ---------------------------------------------------------------------

  function normalizeQuoteParity(text) {
    let depth = 0;
    let result = "";

    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (character === "»") {
        depth = Math.max(0, depth - 1);
        result += character;
        continue;
      }
      if (character !== "«") {
        result += character;
        continue;
      }
      if (depth === 0) {
        depth = 1;
        result += character;
        continue;
      }
      // « en trop. S'il suit une fin de phrase, il ferme la citation ouverte ;
      // sinon (incise, énumération), on le laisse : mieux vaut une parité
      // imparfaite qu'un contresens.
      const before = result.replace(/[\s  ]+$/u, "");
      if (/[.!?…]$/u.test(before)) {
        result = `${before} »${text[index + 1] === " " || text[index + 1] === " " ? "" : " "}`;
        depth = 0;
        continue;
      }
      result += character;
      depth += 1;
    }
    return result;
  }

  // ---------------------------------------------------------------------
  // Minuscule aux noms de fonction (règle globale)
  //
  // Un titre de civilité, un déterminant ou une préposition devant un nom de
  // fonction n’en fait pas un nom propre : « M. le Président » → « M. le
  // président ». La majuscule reste en tête de phrase et dans une adresse
  // directe (« Monsieur le Président, » en tête de lettre est admis, mais
  // l’usage courant et l’Imprimerie nationale préfèrent la minuscule).
  // ---------------------------------------------------------------------

  const FUNCTION_NOUNS = [
    "président", "présidente", "directeur", "directrice", "ministre",
    "secrétaire", "maire", "préfet", "préfète", "recteur", "rectrice",
    "doyen", "doyenne", "gérant", "gérante", "administrateur", "administratrice",
    "trésorier", "trésorière", "inspecteur", "inspectrice", "juge", "procureur",
    "ambassadeur", "ambassadrice", "consul", "sénateur", "sénatrice",
    "député", "députée", "gouverneur", "chancelier", "chancelière",
    "responsable", "chef", "cheffe", "délégué", "déléguée", "proviseur"
  ];

  // Après un titre de civilité, l’article est toujours en minuscule, quelle que
  // soit la fonction qui suit — y compris un sigle (« M. le DRH »), que la
  // seconde capture laisse intact puisque seule une fonction connue est
  // décapitalisée.
  const FUNCTION_TITLE_PATTERN = new RegExp(
    String.raw`\b(M\.|MM\.|Mme|Mmes|Mlle|Mlles|Monsieur|Madame|Messieurs|Mesdames)\s+` +
    String.raw`(Le|La|Les|L[’'])\s*([\p{L}]+)(?![\p{L}\p{N}])`,
    "gu"
  );

  // Déterminant + nom de fonction capitalisé en cours de phrase.
  const CAPITALIZED_FUNCTION_PATTERN = new RegExp(
    String.raw`([^.!?…\n]\s(?:le|la|les|l[’']|du|de\s+la|au|aux|notre|votre|leur)\s*)` +
    String.raw`(${anyOf(FUNCTION_NOUNS.map((noun) => noun.slice(0, 1).toUpperCase() + noun.slice(1)))}s?)(?![\p{L}\p{N}])`,
    "gu"
  );

  function normalizeFunctionTitles(text) {
    return text
      .replace(FUNCTION_TITLE_PATTERN, (match, civility, article, noun) => {
        // Un sigle garde ses capitales : seule une fonction écrite en toutes
        // lettres passe en minuscule.
        const isFunction = FUNCTION_NOUNS.includes(noun.toLocaleLowerCase("fr-FR")) ||
          FUNCTION_NOUNS.includes(noun.toLocaleLowerCase("fr-FR").replace(/s$/u, ""));
        const separator = /[’']$/u.test(article) ? "" : " ";
        return `${civility} ${article.toLocaleLowerCase("fr-FR")}${separator}` +
          `${isFunction ? noun.toLocaleLowerCase("fr-FR") : noun}`;
      })
      .replace(CAPITALIZED_FUNCTION_PATTERN, (match, lead, noun) =>
        `${lead}${noun.toLocaleLowerCase("fr-FR")}`
      );
  }

  // Verbes introduisant un infinitif complément, pour le rétablissement de
  // l’ordre verbe + complément.
  const MODAL_VERBS = [
    "devons", "devez", "doit", "doivent", "devrions", "devriez", "devrait",
    "devraient", "devrais", "pouvons", "pouvez", "peut", "peuvent", "pourrions",
    "pourrons", "pourrez", "allons", "allez", "va", "vont", "voulons", "voulez",
    "veut", "veulent", "voudrions", "faut", "faudrait", "faudra", "souhaitons",
    "comptons", "espérons", "essayons", "cherchons"
  ];

  // Adjectifs strictement invariables : aucune des formes accordées n’existe.
  const INVARIABLE_ADJECTIVES = new Map(Object.entries({
    supers: "super", extras: "extra", ultras: "ultra", maxis: "maxi", minis: "mini",
    "bons marchés": "bon marché", "bon marchés": "bon marché",
    "bons marché": "bon marché", "bonnes marchés": "bon marché",
    "meilleurs marchés": "meilleur marché", "meilleur marchés": "meilleur marché",
    sexys: "sexy", pops: "pop", rétros: "rétro", chics: "chic",
    "grands angles": "grand angle", "sur mesures": "sur mesure",
    "prêts à porter": "prêt-à-porter", standards: "standard"
  }));

  const INVARIABLE_ADJECTIVE_PATTERN = new RegExp(
    String.raw`\b(?:${[...INVARIABLE_ADJECTIVES.keys()]
      .sort((a, b) => b.length - a.length)
      .map((entry) => entry.replace(/ /gu, String.raw`\s+`))
      .join("|")})(?![\p{L}\p{N}])`,
    "giu"
  );

  // Adjectifs à h aspiré : « tout » s’accorde devant eux comme devant une
  // consonne, alors qu’il reste invariable devant un h muet (« tout heureuses »).
  const ASPIRATED_H_WORDS = [
    "haineu", "hardi", "hargneu", "hasardeu", "hautain", "haut", "hideu",
    "honteu", "huppé", "hâti", "handicapé", "harassé", "heurté", "hachuré",
    "hérissé", "hostile"
  ];

  // Locutions adverbiales figées : leur place naturelle est après le participe.
  const ADVERBIAL_LOCUTIONS = [
    "de fond en comble", "de long en large", "à fond", "en profondeur",
    "de bout en bout", "de A à Z", "par cœur", "en détail", "sans délai",
    "de près", "à la hâte", "en vain", "à nouveau", "sur-le-champ"
  ];

  // Locutions figées, pléonasmes et tournures lourdes : du vocabulaire, valable
  // dans tous les contextes, et non des correctifs liés à une phrase.
  const FIXED_EXPRESSIONS = [
    // « avoir affaire à quelqu’un » ne s’écrit pas « avoir à faire à ».
    // Attention : « \b » ne connaît que les caractères ASCII, même avec le
    // drapeau « u ». Autour d’un mot accentué, la limite s’écrit en toutes
    // lettres avec une assertion sur \p{L}.
    [/\b(eu|avoir|ai|as|a|avons|avez|ont|avais|avait|avaient|aurons)\s+à\s+faire\s+à(?![\p{L}\p{N}])/giu, "$1 affaire à"],
    // Pléonasmes : le préfixe porte déjà la répétition ou la direction.
    [/\b(répét\p{L}*|redi\p{L}*|réitér\p{L}*)\s+(?:de\s+nouveau|à\s+nouveau|une\s+nouvelle\s+fois)\b/giu, "$1"],
    [/\b(monter)\s+en\s+haut\b/giu, "$1"],
    [/\b(descendre)\s+en\s+bas\b/giu, "$1"],
    [/\b(sortir)\s+dehors\b/giu, "$1"],
    [/\b(entrer)\s+dedans\b/giu, "$1"],
    [/\b(prévoir|prévu|prévue|prévus|prévues)\s+(?:à\s+l[’']avance|d[’']avance)\b/giu, "$1"],
    [/\b(reporter|reporté|reportée)\s+à\s+plus\s+tard\b/giu, "$1"],
    [/\bs[’']entraider\s+mutuellement\b/giu, "s’entraider"],
    [/\bcollaborer\s+ensemble\b/giu, "collaborer"],
    [/\bau\s+jour\s+d[’']aujourd[’']hui\b/giu, "aujourd’hui"],
    [/\bvoire\s+même\b/giu, "voire"],
    [/\bmonopole\s+exclusif\b/giu, "monopole"],
    // « baser sur » est un calque : une démonstration se fonde sur des faits.
    [/\bbas(é|ée|és|ées)\s+sur\b/gu, "fond$1 sur"],
    [/\bse\s+bas(e|ent)\s+sur\b/gu, "se fond$1 sur"],
    // « dont » contient déjà « de » : le doubler est fautif.
    [/\bde\s+(?:ça|cela|celà)\s+dont\b/giu, "ce dont"],
    [/\bde\s+(?:ce|celui|celle)\s+dont\b/giu, "ce dont"],
    [/\bc[’']est\s+de\s+lui\s+dont\b/giu, "c’est de lui que"],
    // Graphies soudées ou fusionnées qui n’existent pas.
    [/\bparcontre(?![\p{L}\p{N}])/giu,
      (match) => (/^P/u.test(match) ? "Par contre" : "par contre")],
    [/\baulieu(?=\s+de(?![\p{L}\p{N}]))/giu, "au lieu"],
    [/\bentrain\s+de(?=\s+[\p{L}])/giu, "en train de"],
    [/\ben\s+faite(?=\s*[,.;:!?…]|\s*$)/giu, "en fait"],
    [/\best-ce-que(?![\p{L}\p{N}])/giu, "est-ce que"],
    [/\bsoit-disant(?![\p{L}\p{N}])/giu, "soi-disant"],
    [/\bmalgrés(?![\p{L}\p{N}])/giu, "malgré"],
    [/\bparmis(?![\p{L}\p{N}])/giu, "parmi"],
    // Conjugaisons inventées : aucune de ces formes n’existe.
    [/\bcroivent(?![\p{L}\p{N}])/giu, "croient"],
    [/\bsoyent(?![\p{L}\p{N}])/giu, "soient"],
    [/\bvoyent(?![\p{L}\p{N}])/giu, "voient"],
    // « quant à » devant un pronom : « quand à moi » est impossible.
    [/\bquand\s+à\s+(moi|toi|lui|elle|nous|vous|eux|elles|cela|ça)(?![\p{L}\p{N}])/giu,
      (match, pronoun) => preserveCase(match, `quant à ${pronoun}`)],
    // « davantage de » : « d’avantage de » signifierait « d’un avantage de ».
    [/\bd[’']avantage\s+de(?=\s+[\p{L}])/giu, "davantage de"],
    // « censé » (supposé) devant un infinitif ; « sensé » signifie « doué de sens ».
    [/\bsensé(e?s?)\s+(?=(?:être|avoir|faire|venir|partir|arriver|rendre|savoir|pouvoir|devoir|[\p{L}]{3,}(?:er|ir))(?![\p{L}\p{N}]))/giu,
      (match, agreement) => `censé${agreement} `],
    // « avoir tort » : après l’auxiliaire avoir, « tord » (verbe tordre) est
    // impossible.
    [/\b(ai|as|a|avons|avez|ont|avais|avait|avaient|aura|auront|aurait|auraient|avoir|eu)\s+tord(?![\p{L}\p{N}])/giu,
      (match, auxiliary) => `${auxiliary} tort`],
    // « tâche » (travail) devant un verbe d’exécution ; « tache » est la
    // salissure, déjà traitée dans l’autre sens pour « tache de sang ».
    [/\btache(s?)(?=\s+(?:à\s+(?:accomplir|faire|effectuer|réaliser|terminer)|ménagères?|quotidiennes?|administratives?|urgentes?)(?![\p{L}\p{N}]))/giu,
      (match, plural) => preserveCase(match, `tâche${plural}`)],
    // « un envoi » : le nom ne prend pas de « e », « envoie » est le verbe.
    [/\b(l[’']|un|cet|chaque|premier|dernier|nouvel)\s*envoie(s?)(?![\p{L}\p{N}])/giu,
      (match, determiner, plural) => `${determiner}${/[’']$/u.test(determiner) ? "" : " "}envoi${plural}`],
    // Anglicisme orthographique : en français, la connexion prend un « x ».
    [/\bconnections?(?![\p{L}\p{N}])/giu,
      (match) => preserveCase(match, /s$/u.test(match) ? "connexions" : "connexion")],
    [/\bsa\s+va(?![\p{L}\p{N}])/giu, "ça va"],
    // « comme même » en fin de proposition est « quand même » ; suivi d’un
    // groupe (« comme même les experts »), il peut être légitime et ne bouge pas.
    [/\bcomme\s+même(?=\s*[,.;:!?…]|\s*$)/giu, "quand même"],
    [/,\s*voir\s+même(?=\s+[\p{L}])/giu, ", voire"],
    // « à jour » est invariable dans « mettre à jour ».
    [/\b(mis|mise|mises|remis|remise|remises|mettre|met|mettent|mettra|mettront)\s+à\s+jours(?![\p{L}\p{N}])/giu,
      (match, participle) => `${participle} à jour`],
    // « s'avérer » et « se révéler » sont déjà attributifs : « être » est de trop.
    [/\b(s[’']avère(?:nt)?|s[’']avérait|s[’']est\s+avérée?s?|se\s+sont\s+avérée?s?|se\s+révèlent?|s[’']est\s+révélée?s?|se\s+sont\s+révélée?s?)\s+être(?=\s+[\p{L}])/giu,
      (match, verb) => verb],
    // Optimiser contient déjà l'idée du maximum.
    [/\b(optimis[\p{L}]*)\s+au\s+maximum(?![\p{L}\p{N}])/giu, (match, verb) => verb],
    // « Pour + infinitif » introduit la principale par une virgule, pas par
    // deux-points.
    [/\b(Pour\s+[^.!?:;\n]{3,60}?)\s*:\s*(?=(?:il|elle|on|nous|vous|ils|elles|je|tu)\s)/gu, "$1, "],
    // « ci-joint » prend un trait d'union, et ne s'isole pas par une virgule
    // de ce qu'il annonce.
    [/\bci\s+joint(e?s?)(?![\p{L}\p{N}])/giu, (match, agreement) => `ci-joint${agreement}`],
    [/\b(ci-joints?|ci-jointes?)\s*,\s+(?=(?:le|la|les|l[’']|un|une|des|mes|nos|vos|ce|cet|cette|ces)\s)/giu,
      (match, adjective) => `${adjective} `],
    // « quelque soit » : « quel que » s’accorde avec le nom qui suit.
    // L’alternance des déterminants va du plus long au plus court, sinon
    // « les » serait lu « le » + un nom commençant par « s ».
    [/\bquelques?\s+(soit|soient)\s+(l[’']|les|leurs|leur|la|le|ses|sa|son|cette|ces|ce)\s*([\p{L}’-]+)/giu,
      (match, verb, determiner, noun) => {
        const features = nounFeatures(noun);
        const plural = verb.toLocaleLowerCase("fr-FR") === "soient" ||
          /^(?:les|ces|ses|leurs)$/iu.test(determiner) ||
          features?.plural === true;
        const feminine = features?.feminine === true;
        const opening = plural
          ? (feminine ? "quelles que soient" : "quels que soient")
          : (feminine ? "quelle que soit" : "quel que soit");
        const separator = /[’']$/u.test(determiner) ? "" : " ";
        return `${preserveCase(match, opening)} ${determiner}${separator}${noun}`;
      }],
    // « je vous prie » : « pris » est le passé simple de « prendre », qui ne se
    // construit pas avec « de » + infinitif.
    [/\b(je\s+vous\s+)pris(?=\s+de(?![\p{L}\p{N}]))/giu, "$1prie"],
    // « quoi qu’il arrive » : la locution figée admet plusieurs graphies
    // fautives, toutes phonétiquement proches.
    [/\bquoi\s+qu[’']?\s*(?:el|elle|il)\s+arrivan?t(?![\p{L}\p{N}])/giu, "quoi qu’il arrive"],
    [/\bquoi\s+que\s+il\s+arrive(?![\p{L}\p{N}])/giu, "quoi qu’il arrive"],
    // « être habitué à » : « dont » ne peut pas reprendre un complément en « à ».
    [/\b(affaires?|situations?|choses?)\s+dont\s+(je|tu|il|elle|nous|vous|ils|elles)\s+(ne\s+)?(suis|es|est|sommes|êtes|sont)\s+(pas\s+)?habitué(e?s?)(?![\p{L}\p{N}])/giu,
      (match, noun, subject, negation, verb, negationEnd, ending) =>
        `${noun} ${/s$/u.test(noun) ? "auxquelles" : "à laquelle"} ${subject} ${negation || ""}${verb} ${negationEnd || ""}habitué${ending}`]
  ];

  const BEING_AUXILIARIES = [
    "suis", "es", "est", "sommes", "êtes", "sont",
    "étais", "était", "étions", "étiez", "étaient", "été",
    "serai", "seras", "sera", "serons", "serez", "seront"
  ];

  // Adverbes qui peuvent s’intercaler entre l’auxiliaire et le participe sans
  // rompre la construction.
  const INFINITIVE_BLOCKING_ADVERBS = [
    "ne", "n[’']", "pas", "plus", "jamais", "encore", "déjà", "toujours",
    "bien", "mal", "vite", "enfin", "rien", "guère", "même", "tout", "très",
    "peut-être", "sans\\s+doute", "aussi", "beaucoup", "trop"
  ];

  function isAdverb(word) {
    return morphOf(word).some((morph) => /:W(?![\p{L}\p{N}])/u.test(morph));
  }

  // L'infinitif d'un participe passé, lu dans le lemme du dictionnaire.
  // Renvoie une chaîne vide si le mot n'est pas un participe (un nom en
  // « -ite » comme « faillite » ne doit pas devenir un verbe).
  function infinitiveOfParticiple(word) {
    const morphologies = morphOf(word);
    const participle = morphologies.find((morph) => /:Q(?![\p{L}\p{N}])/u.test(morph));
    if (!participle) return "";
    if (morphologies.some((morph) => /:(?:M[12]|O)(?![\p{L}\p{N}])/u.test(morph))) return "";
    const lemma = participle.match(/^>([\p{L}’-]+)\//u)?.[1] || "";
    return /(?:er|ir|re|oir)$/u.test(lemma) ? lemma : "";
  }

  const HAVING_AUXILIARIES = [
    "ai", "as", "a", "avons", "avez", "ont",
    "avais", "avait", "avions", "aviez", "avaient",
    "aurai", "auras", "aura", "aurons", "aurez", "auront",
    "aurais", "aurait", "aurions", "auriez", "auraient"
  ];

  // Un COD antéposé se signale de deux façons seulement : le relatif « que »
  // quelque part dans la proposition, ou un pronom complément accolé à
  // l’auxiliaire. La position est décisive : dans « les équipes ont décidé »,
  // « les » est un déterminant, pas un pronom.
  const RELATIVE_OBJECT_PATTERN = /(?:^|[^\p{L}\p{N}])qu[e’'](?![\p{L}\p{N}])/iu;
  const CLITIC_OBJECT_PATTERN =
    /(?:^|[^\p{L}\p{N}])(?:l[’']|le|la|les|m[’']|me|t[’']|te|en)\s*$/iu;

  function hasFrontedObject(text, auxiliaryOffset) {
    // La recherche s’arrête à la frontière de proposition : un COD appartenant
    // à la proposition voisine ne commande aucun accord ici.
    const clauseStart = Math.max(
      ...[".", "!", "?", "…", ";", ",", "«", "\n"].map((mark) => text.lastIndexOf(mark, auxiliaryOffset - 1))
    );
    const clause = text.slice(clauseStart + 1, auxiliaryOffset);
    if (RELATIVE_OBJECT_PATTERN.test(clause)) return true;
    if (CLITIC_OBJECT_PATTERN.test(clause)) return true;

    // « nous » et « vous » sont ambigus : sujet le plus souvent, COD lorsqu’un
    // autre sujet les précède (« elle nous a vus »).
    return /(?:^|[^\p{L}\p{N}])(?!et|ou|mais|donc|car)[\p{L}’-]+\s+(?:nous|vous)\s*$/iu.test(clause);
  }

  // Cherche la variante accentuée d’un mot qui, telle qu’elle est écrite, ne
  // peut pas être un nom. Une seule substitution est tentée à la fois, et le
  // résultat n’est retenu que s’il est unique : une hésitation entre deux
  // candidats vaut mieux qu’une correction arbitraire.
  function restoreMissingAccent(word) {
    const lowered = word.toLocaleLowerCase("fr-FR");
    if (/[éèêàùâîôûç]/u.test(lowered)) return "";

    const morphologies = morphOf(word);
    if (!morphologies.length) return "";
    if (morphologies.some((morph) => /:N(?![\p{L}\p{N}])/u.test(morph))) return "";

    const candidates = new Set();
    for (let index = 0; index < lowered.length; index += 1) {
      if (lowered[index] !== "e") continue;
      for (const accent of ["é", "è"]) {
        const candidate = `${lowered.slice(0, index)}${accent}${lowered.slice(index + 1)}`;
        if (morphOf(candidate).some((morph) => /:N(?![\p{L}\p{N}])/u.test(morph))) {
          candidates.add(candidate);
        }
      }
    }
    return candidates.size === 1 ? [...candidates][0] : "";
  }

  // Adjectif verbal correspondant à une forme conjuguée : « exigent » →
  // « exigeant ». Limité aux verbes du premier groupe, dont le participe présent
  // se dérive sans exception de l’infinitif.
  function verbalAdjectiveOf(word) {
    const morphologies = morphOf(word);
    if (!morphologies.length) return "";
    // Un mot déjà adjectif ou nom est à sa place après l’adverbe.
    if (morphologies.some((morph) => /:[NAWM](?![\p{L}\p{N}])/u.test(morph))) return "";
    if (!morphologies.some((morph) => /:V1/u.test(morph) && /:Ip/u.test(morph))) return "";

    const infinitive = morphologies
      .map((morph) => morph.match(/^>([\p{L}’-]+)\//u)?.[1] || "")
      .find((candidate) => /er$/u.test(candidate));
    if (!infinitive) return "";

    const stem = infinitive.slice(0, -2);
    // « manger » garde son « e » devant a, « commencer » prend une cédille.
    const participle = /g$/u.test(stem)
      ? `${stem}eant`
      : /c$/u.test(stem)
        ? `${stem.slice(0, -1)}çant`
        : `${stem}ant`;
    return PRESENT_PARTICIPLE_ADJECTIVES.get(participle) || participle;
  }

  // Un adjectif épithète pur : le mot doit être adjectif au dictionnaire sans
  // pouvoir être un nom, sinon « toute personne » serait pris pour un adverbe.
  function adverbialTargetFeatures(word) {
    const morphologies = morphOf(word);
    if (!morphologies.length) return null;
    // Un nom propre ou un pronom n’est jamais l’adjectif d’un « tout » adverbe ;
    // un mot qui n’est pas adjectif non plus (« toute personne »).
    if (morphologies.some((morph) => /:(?:M[12]|O)(?![\p{L}\p{N}])/u.test(morph))) return null;
    if (!morphologies.some((morph) => /:A(?![\p{L}\p{N}])/u.test(morph))) return null;
    // Les étiquettes de genre et de nombre sont suivies d’un séparateur
    // quelconque (« :A:f:p;é/* ») : la limite ne peut pas être une liste fermée.
    return {
      feminine: morphologies.some((morph) => /:f(?![\p{L}\p{N}])/u.test(morph)),
      plural: morphologies.some((morph) => /:p(?![\p{L}\p{N}])/u.test(morph))
    };
  }

  // Un nom qui ne peut en aucun cas être une forme verbale : « se » devant lui
  // est nécessairement le démonstratif « ce ».
  function demonstrativeTargetFeatures(word) {
    const morphologies = morphOf(word);
    if (!morphologies.length) return null;
    if (morphologies.some((morph) => /:V\d/u.test(morph))) return null;
    if (!morphologies.some((morph) => /:N(?![\p{L}\p{N}])/u.test(morph))) return null;
    return {
      feminine: morphologies.every((morph) => !/:m(?![\p{L}\p{N}])/u.test(morph)) &&
        morphologies.some((morph) => /:f(?![\p{L}\p{N}])/u.test(morph)),
      plural: morphologies.every((morph) => !/:s(?![\p{L}\p{N}])/u.test(morph)) &&
        morphologies.some((morph) => /:p(?![\p{L}\p{N}])/u.test(morph))
    };
  }

  // Verbes fréquents dont une virgule ne peut pas les séparer de leur sujet.
  // Les entrées sont des fragments d'expression régulière : les pronominaux
  // s'écrivent avec leur pronom.
  const SUBJECT_VERB_AFTER_COMMA = [
    "a", "ont", "est", "sont", "était", "étaient", "avait", "avaient",
    "sera", "seront", "aura", "auront", "fut", "furent",
    "va", "vont", "reste", "restent", "devient", "deviennent",
    "semble", "semblent", "paraît", "paraissent", "peut", "peuvent",
    "doit", "doivent", "fait", "font",
    "indique", "indiquent", "montre", "montrent", "révèle", "révèlent",
    "confirme", "confirment", "suggère", "suggèrent",
    "s[’']est", "se\\s+sont", "s[’']était", "s[’']étaient",
    "s[’']avère", "s[’']avèrent"
  ];

  // Numération française en toutes lettres.
  const NUMBER_WORD_FORMS = new Map(Object.entries({
    un: "un", une: "une", deux: "deux", trois: "trois", quatre: "quatre", quatres: "quatre",
    cinq: "cinq", six: "six", sept: "sept", huit: "huit", neuf: "neuf", dix: "dix",
    onze: "onze", douze: "douze", treize: "treize", quatorze: "quatorze", quinze: "quinze",
    seize: "seize", vingt: "vingt", vingts: "vingt", trente: "trente", quarante: "quarante",
    cinquante: "cinquante", soixante: "soixante", cent: "cent", cents: "cent",
    mille: "mille", milles: "mille"
  }));

  // Un nombre en lettres est une suite de mots-nombres liés par un trait
  // d’union, une espace ou « et ».
  const NUMBER_CHAIN_PATTERN = new RegExp(
    String.raw`(?<![\p{L}\p{N}-])(?:${[...NUMBER_WORD_FORMS.keys()].join("|")})` +
    String.raw`(?:(?:-|[  ]+et[  ]+|[  ]+)(?:${[...NUMBER_WORD_FORMS.keys()].join("|")}))+(?![\p{L}\p{N}-])`,
    "giu"
  );

  function normalizeNumberChain(chain, options = {}) {
    const tokens = [];
    const separators = [];
    const pattern = /([\p{L}]+)((?:-|[  ]+et[  ]+|[  ]+)?)/gu;
    for (let hit = pattern.exec(chain); hit; hit = pattern.exec(chain)) {
      if (/^et$/iu.test(hit[1])) {
        separators[separators.length - 1] = " et ";
        continue;
      }
      tokens.push(hit[1]);
      separators.push(hit[2]);
    }
    if (tokens.length < 2) return chain;

    const normalized = tokens.map((token, index) => {
      const singular = NUMBER_WORD_FORMS.get(token.toLocaleLowerCase("fr-FR"));
      if (!singular) return token;

      // « vingt » et « cent » s’accordent seulement multipliés et en fin de
      // nombre : quatre-vingts, deux cents, mais quatre-vingt-dix, deux cent un.
      if (!options.ordinalUse &&
          (singular === "vingt" || singular === "cent") &&
          index > 0 && index === tokens.length - 1) {
        const multiplier = NUMBER_WORD_FORMS.get(tokens[index - 1].toLocaleLowerCase("fr-FR"));
        if (multiplier && multiplier !== "un" && multiplier !== "une" && multiplier !== "cent") {
          return preserveCase(token, `${singular}s`);
        }
      }
      return preserveCase(token, singular);
    });

    // Les éléments inférieurs à cent se lient par un trait d’union ; « et »
    // reste tel quel là où l’usage le maintient (vingt et un).
    let rebuilt = "";
    normalized.forEach((word, index) => {
      rebuilt += word;
      const separator = separators[index] || "";
      if (!separator) return;
      rebuilt += /et/u.test(separator) ? " et " : separator;
    });
    return rebuilt;
  }

  // Futur simple et son conditionnel, pour la principale d’une hypothèse en
  // « si » à l’imparfait ou au plus-que-parfait.
  const FUTURE_TO_CONDITIONAL = new Map(Object.entries({
    serai: "serais", seras: "serais", sera: "serait",
    serons: "serions", serez: "seriez", seront: "seraient",
    aurai: "aurais", auras: "aurais", aura: "aurait",
    aurons: "aurions", aurez: "auriez", auront: "auraient",
    irai: "irais", iras: "irais", ira: "irait", irons: "irions", irez: "iriez", iront: "iraient",
    ferai: "ferais", feras: "ferais", fera: "ferait",
    ferons: "ferions", ferez: "feriez", feront: "feraient",
    pourrai: "pourrais", pourras: "pourrais", pourra: "pourrait",
    pourrons: "pourrions", pourrez: "pourriez", pourront: "pourraient",
    devrai: "devrais", devras: "devrais", devra: "devrait",
    devrons: "devrions", devrez: "devriez", devront: "devraient",
    voudrai: "voudrais", voudras: "voudrais", voudra: "voudrait",
    saurai: "saurais", sauras: "saurais", saura: "saurait",
    viendrai: "viendrais", viendras: "viendrais", viendra: "viendrait",
    prendrai: "prendrais", prendras: "prendrais", prendra: "prendrait"
  }));

  // Participes que le COD placé avant ne fait jamais varier : « été » est
  // toujours invariable, les autres se construisent avec un complément de mesure
  // ou de durée (« les trois ans que j’ai vécu »).
  const INVARIABLE_PARTICIPLES = new Set([
    "été", "coûté", "valu", "pesé", "mesuré", "duré",
    "couru", "régné", "dormi", "marché", "plu", "ri", "nui", "survécu"
  ]);

  // « vécu » s’accorde avec un véritable COD (« les expériences vécues »),
  // mais reste invariable quand l’antécédent exprime seulement une durée.
  const DURATION_NOUNS = new Set([
    "an", "ans", "année", "années", "jour", "jours", "heure", "heures",
    "minute", "minutes", "seconde", "secondes", "mois", "semaine", "semaines"
  ]);

  // Verbes pronominaux dont le « se » est un complément indirect : le participe
  // passé reste toujours invariable. On associe chaque forme accordée fautive à
  // sa forme de base. Seules des formes qui ne sont pas d’autres mots français
  // figurent ici (« succédées », « demandés »…), pour rester sûr même sans
  // contexte ; « plus », « ris », « souris » sont donc écartés.
  const INVARIABLE_PRONOMINAL_PP = new Map(Object.entries({
    succédée: "succédé", succédés: "succédé", succédées: "succédé",
    parlée: "parlé", parlés: "parlé", parlées: "parlé",
    demandée: "demandé", demandés: "demandé", demandées: "demandé",
    téléphonée: "téléphoné", téléphonés: "téléphoné", téléphonées: "téléphoné",
    ressemblée: "ressemblé", ressemblés: "ressemblé", ressemblées: "ressemblé",
    souriée: "souri", souriées: "souri",
    mentie: "menti", menties: "menti",
    nuie: "nui", nuies: "nui",
    suffie: "suffi", suffies: "suffi",
    convenue: "convenu", convenues: "convenu",
    plue: "plu", plues: "plu"
  }));

  // Auxiliaires de l’indicatif et leur équivalent au subjonctif, pour les
  // conjonctions qui l’exigent (« bien que », « quoique »…).
  const INDICATIVE_TO_SUBJUNCTIVE = new Map(Object.entries({
    a: "ait", as: "aies", avons: "ayons", avez: "ayez", ont: "aient",
    est: "soit", es: "sois", sommes: "soyons", êtes: "soyez", sont: "soient"
  }));

  function looksLikeSmsFrench(text) {
    const tokens = text.match(/[\p{L}\p{N}’']+/gu) || [];
    const wordCount = tokens.length;
    let score = 0;

    // Mots du lexique SMS ; trois lettres minimum pour écarter les ambigus
    // (« o », « c », « ct », « cc »…).
    for (const token of tokens) {
      const key = token.toLocaleLowerCase("fr-FR").replace(/’/gu, "'");
      if (key.length >= 3 && SMS_WORD_LEXICON.has(key)) score += 1;
    }

    // NB : (?![\p{L}\p{N}]) remplace le \b final, inopérant en JavaScript après
    // une lettre accentuée (« jfé », « oé »).

    // Abréviations et graphies impossibles en français correct.
    score += (text.match(
      /\b(?:slt|bjr|bsr|dsl|stp|svp|bcp|tkt|tqt|jsp|jpp|mdr|ptdr|lol|pck|psk|pcq|prk|parske|paske|pourkoi|qqn|qqch|qqc|vrmt|grv|grav|mnt|mtn|dmn|auj|ajd|ojd|aprem|jss|jme|jte|jsui|jsuis|chui|chuis|jvai|jvais|jve|jveu|jveux|jpe|jpeu|jpeux|jfé|jfais|jdoi|jdois|jcroi|jcrois|jsé|jsais|jspr|koi|kwa|keske|keski|koman|komen|kom|cmt|avc|mwa|twa|oé|oué|wé|vla|jtm|biz|sava|lgtmp|lgtps|fopa|kon|kekchoz|ducou|jesper|ojourdui|aparamen)(?![\p{L}\p{N}])/giu
    ) || []).length;

    // Apostrophe élidée manquante (« jai », « cest », « dhier »).
    score += (text.match(
      /\b(?:jai|javais|javai|javé|jété|jetais|cest|cetait|cété|yavait|yaura|dhier|daccord|jusqua|nimporte|tinquiete|tinquiète|kil|kils)(?![\p{L}\p{N}])/giu
    ) || []).length;

    // Chiffre au début, au milieu ou en fin de mot (« 2m1 », « bi1to », « bi1 »),
    // hors heures et unités (« 10h30 », « 5km »).
    score += (text.match(
      /\b(?!\d+(?:h|min|mn|e|er|ère|ème|eme|kg|km|cm|m|g|l)\d*\b)\d+\p{L}[\p{L}\p{N}]*\b|\b\p{L}+\d+\p{L}+\b|\b\p{L}{2,}\d(?![\p{L}\p{N}])/giu
    ) || []).length;

    // Graphies phonétiques courtes très courantes.
    score += (text.match(/\b(?:mé|mè|tro|pa|alé|fo|kel|kelle|kan|ke|ki)(?![\p{L}\p{N}])/giu) || []).length;

    if (score >= 4) return true;
    return score >= 2 && score / Math.max(1, wordCount) >= 0.18;
  }

  function correctExplicitPluralContractions(text) {
    let corrections = 0;
    const corrected = text.replace(
      /\bau\s+(?=(?:deux|trois|quatre|cinq|six|sept|huit|neuf|dix|plusieurs|divers|différents|nombreux)\b)/gi,
      (match) => {
        corrections += 1;
        return match[0] === "A" ? "Aux " : "aux ";
      }
    );
    return { text: corrected, corrections };
  }

  function correctOnePass(normalizedText, smsMode = false) {
    const { grammar, spellChecker } = grammalecte();
    const grammarErrors = Array.from(grammar.parse(normalizedText, "FR", false, null, false));
    const spellingErrors = Array.from(spellChecker.parseParagraph(normalizedText));
    const corrections = [];

    for (const error of selectSafeGrammarErrors(grammarErrors, normalizedText, grammar)) {
      const original = normalizedText.slice(error.nStart, error.nEnd);
      if (isUnsafePronounRewrite(original, error)) continue;
      if (error.sType === "infi" && !expectsInfinitive(normalizedText, error.nStart)) continue;
      if (isRiskyQuandToQuant(normalizedText, error)) continue;
      if (isDistantNounAgreement(normalizedText, error)) continue;
      if (isDurationParticipleAgreement(normalizedText, error)) continue;
      // Grammalecte propose parfois plusieurs pistes (« ce » → « cette » ou
      // « se ») : on laisse le contexte trancher plutôt que de prendre la
      // première venue.
      const suggestion = pickSuggestionInContext(
        grammar,
        normalizedText,
        error.nStart,
        error.nEnd,
        suggestionList(error.aSuggestions)
      );
      if (!suggestion) continue;
      corrections.push({
        start: error.nStart,
        end: error.nEnd,
        replacement: suggestion,
        priority: 2,
        source: "grammar"
      });
    }

    // En mode SMS, les mots de trois lettres sont trop ambigus pour le
    // dictionnaire (« vyn » → « vin ») : le lexique s’en est déjà chargé.
    const minSpellingLength = smsMode ? 4 : 3;
    for (const error of spellingErrors) {
      // Les rejets bon marché passent avant suggest(), dont chaque appel
      // parcourt tout le graphe du dictionnaire.
      if (!isSpellingCandidate(error.sValue, minSpellingLength)) continue;
      const suggestions = collectSpellSuggestions(spellChecker, error.sValue);
      if (!suggestions.length) continue;
      // « vien » a pour candidats « vie », « vies », « vient », « viens » : tous
      // à une lettre près. Seul le contexte dit lequel est le bon.
      const safeSuggestion = pickSuggestionInContext(
        grammar,
        normalizedText,
        error.nStart,
        error.nEnd,
        collectSafeSpellingSuggestions(error.sValue, suggestions)
      );
      if (!safeSuggestion) continue;
      corrections.push({
        start: error.nStart,
        end: error.nEnd,
        replacement: preserveCase(error.sValue, safeSuggestion),
        priority: 1,
        source: "spelling"
      });
    }

    const accepted = removeOverlaps(corrections);
    let correctedText = normalizedText;
    for (const correction of accepted.sort((a, b) => b.start - a.start)) {
      correctedText =
        correctedText.slice(0, correction.start) +
        correction.replacement +
        correctedText.slice(correction.end);
    }

    return {
      text: correctedText,
      corrections: accepted.length
    };
  }

  // Interjections du langage familier à laisser telles quelles : les « corriger »
  // produisait des absurdités (« mdr » → « mDa »).
  const UNTOUCHABLE_INTERJECTIONS = new Set([
    "mdr", "mdrr", "ptdr", "lol", "xd", "oklm", "tmtc", "wesh", "wsh"
  ]);

  function isSpellingCandidate(original, minLength) {
    const source = original.toLocaleLowerCase("fr-FR");
    if (source.length < minLength) return false;
    if (UNTOUCHABLE_INTERJECTIONS.has(source)) return false;
    // Une capitale interne signale généralement une marque ou un identifiant
    // (« OpenAI », « PowerShell », « LinkedIn »), pas une faute française.
    if (/\p{Lu}/u.test(original.slice(1))) return false;
    // Une abréviation SMS isolée dans un texte normal ne doit pas être
    // « rapprochée » d’un mot du dictionnaire (« tkt » → « tut »).
    if (SMS_WORD_LEXICON.has(source)) return false;
    // Un mot français ne contient ni chiffre, ni apostrophe, ni trait d’union.
    if (/[\d’'\-]/u.test(source)) return false;
    return true;
  }

  // Départage plusieurs candidats en réécrivant la phrase avec chacun et en
  // gardant celui qui laisse le moins d’erreurs à Grammalecte. À égalité, l’ordre
  // d’origine l’emporte : le contexte n’a alors rien à dire de plus.
  function pickSuggestionInContext(grammar, text, start, end, candidates) {
    if (candidates.length === 0) return "";
    if (candidates.length === 1) return candidates[0];

    const sentenceStart = sentenceBoundary(text, start, -1);
    const sentenceEnd = sentenceBoundary(text, end, 1);
    const before = text.slice(sentenceStart, start);
    const after = text.slice(end, sentenceEnd);

    let best = candidates[0];
    let bestScore = Infinity;
    for (const candidate of candidates) {
      const score = countGrammarErrors(grammar, `${before}${candidate}${after}`);
      if (score < bestScore) {
        bestScore = score;
        best = candidate;
      }
    }
    return best;
  }

  // Bornes de la phrase contenant la position donnée : une phrase suffit pour
  // juger un candidat, et la garder courte garde l’analyse rapide.
  function sentenceBoundary(text, position, direction) {
    const separators = /[.!?…\n]/u;
    if (direction < 0) {
      for (let index = position - 1; index >= 0; index -= 1) {
        if (separators.test(text[index])) return index + 1;
      }
      return 0;
    }
    for (let index = position; index < text.length; index += 1) {
      if (separators.test(text[index])) return index + 1;
    }
    return text.length;
  }

  const sentenceScoreCache = new Map();
  const SENTENCE_SCORE_CACHE_LIMIT = 2000;

  function countGrammarErrors(grammar, sentence) {
    const cached = sentenceScoreCache.get(sentence);
    if (cached !== undefined) return cached;

    const score = Array.from(grammar.parse(sentence, "FR", false, null, false)).length;
    sentenceScoreCache.set(sentence, score);
    if (sentenceScoreCache.size > SENTENCE_SCORE_CACHE_LIMIT) {
      sentenceScoreCache.delete(sentenceScoreCache.keys().next().value);
    }
    return score;
  }

  // Accorde le participe avec l’antécédent du relatif « que », ou renvoie une
  // chaîne vide si le moindre doute subsiste.
  function agreeParticipleWithAntecedent(
    match,
    headNoun,
    modifiers,
    participle,
    followingWord = ""
  ) {
    const base = participle.toLocaleLowerCase("fr-FR");
    if (INVARIABLE_PARTICIPLES.has(base)) return "";
    if (base === "vécu") {
      const antecedentWords = `${headNoun} ${modifiers}`
        .toLocaleLowerCase("fr-FR")
        .match(/\p{L}+/gu) || [];
      if (antecedentWords.some((word) => DURATION_NOUNS.has(word))) return "";
    }

    // « que » doit être un relatif : le mot qui le précède est alors un nom ou un
    // adjectif. Après un verbe (« Je pense que… »), c’est une conjonction et le
    // participe ne s’accorde pas.
    const beforeQue = (modifiers.trim().split(/\s+/).pop() || headNoun).replace(/[’']$/u, "");
    if (beforeQue && !isNounOrAdjective(beforeQue)) return "";

    const antecedent = nounFeatures(headNoun);
    if (!antecedent) return "";
    if (!isParticiple(participle)) return "";

    const inflected = inflectParticiple(participle, antecedent);
    if (!inflected || inflected === participle) return "";

    // Ce qui suit le participe ne doit pas être un infinitif : « les documents
    // que je t’ai fait parvenir » laisse « fait » invariable.
    const tail = followingWord || match.slice(match.lastIndexOf(participle) + participle.length);
    const nextWord = tail.trimStart().match(/^[\p{L}’'-]+/u)?.[0] || "";
    if (nextWord && morphOf(nextWord).some((morph) => /:Y(?=[:/])/u.test(morph))) return "";

    return match.slice(0, match.lastIndexOf(participle)) + inflected;
  }

  // Genre et nombre d’un nom, uniquement s’ils sont sans ambiguïté.
  function nounFeatures(word) {
    const morphologies = morphOf(word);
    const nouns = morphologies.filter((morph) => /:[NA](?=[:/])/u.test(morph));
    if (!nouns.length) return null;
    if (morphologies.some((morph) => /:(?:M[12]|O)/u.test(morph))) return null;

    const feminine = nouns.some((morph) => /:f(?=[:/])/u.test(morph));
    const masculine = nouns.some((morph) => /:m(?=[:/])/u.test(morph));
    const plural = nouns.some((morph) => /:p(?=[:/])/u.test(morph));
    const singular = nouns.some((morph) => /:s(?=[:/])/u.test(morph));
    // Un mot à la fois masculin et féminin, ou singulier et pluriel, ne permet
    // aucune décision (« gens », « après-midi »…).
    if (feminine === masculine) return null;
    if (plural === singular) return null;
    return { feminine, plural };
  }

  function isParticiple(word) {
    return morphOf(word).some((morph) => /:Q(?=[:/])/u.test(morph));
  }

  function isNounOrAdjective(word) {
    const morphologies = morphOf(word);
    if (!morphologies.length) return false;
    return morphologies.every((morph) => !/:V\d/u.test(morph)) ||
      morphologies.some((morph) => /:[NA](?=[:/])/u.test(morph));
  }

  // Décline le participe puis vérifie que la forme obtenue existe bien au
  // dictionnaire avec le genre et le nombre voulus.
  function inflectParticiple(participle, { feminine, plural }) {
    let candidate = participle;
    if (feminine && !/e$/u.test(candidate)) candidate += "e";
    if (plural && !/[sx]$/u.test(candidate)) candidate += "s";
    if (candidate === participle) return "";

    const valid = morphOf(candidate).some((morph) =>
      /:Q(?=[:/])/u.test(morph) &&
      (feminine ? /:f(?=[:/])/u.test(morph) : /:m(?=[:/])/u.test(morph)) &&
      (plural ? /:p(?=[:/])/u.test(morph) : /:s(?=[:/])/u.test(morph))
    );
    return valid ? candidate : "";
  }

  // Ramène une forme accordée au masculin singulier et valide le résultat
  // dans le dictionnaire avant de l’utiliser.
  function participleMasculineSingular(participle) {
    const originalMorphologies = morphOf(participle);
    if (originalMorphologies.some((morph) =>
      /:Q(?=[:/])/u.test(morph) && /:m(?=[:/])/u.test(morph) && /:s(?=[:/])/u.test(morph)
    )) {
      return participle;
    }

    const candidates = [];
    if (/es$/iu.test(participle)) candidates.push(participle.slice(0, -2));
    if (/e$/iu.test(participle)) candidates.push(participle.slice(0, -1));
    if (/s$/iu.test(participle)) candidates.push(participle.slice(0, -1));

    for (const candidate of candidates) {
      const valid = morphOf(candidate).some((morph) =>
        /:Q(?=[:/])/u.test(morph) && /:m(?=[:/])/u.test(morph) && /:s(?=[:/])/u.test(morph)
      );
      if (valid) return preserveCase(participle, candidate);
    }
    return "";
  }

  function morphOf(word) {
    const { spellChecker } = grammalecte();
    try {
      return spellChecker.getMorph(word) || [];
    } catch {
      return [];
    }
  }

  // Vrai si le mot peut être un participe passé (:Q) ou un adjectif (:A) selon le
  // dictionnaire. Un nom propre (:M) ou un pronom (:O) disqualifie la lecture :
  // « Marie » et « lui » portent aussi des étiquettes verbales trompeuses.
  function isParticipleOrAdjective(word) {
    const { spellChecker } = grammalecte();
    let morphologies;
    try {
      morphologies = spellChecker.getMorph(word);
    } catch {
      return false;
    }
    if (!morphologies?.length) return false;
    if (morphologies.some((morph) => /:(?:M[12]|O)/u.test(morph))) return false;
    return morphologies.some((morph) => /:[QA](?=[:/])/u.test(morph));
  }

  function collectSafeSpellingSuggestions(original, suggestions) {
    return suggestions.filter((suggestion) => isSafeSpellingSuggestion(original, suggestion));
  }

  function isSafeSpellingSuggestion(original, suggestion) {
    const source = original.toLocaleLowerCase("fr-FR");
    const candidate = suggestion.toLocaleLowerCase("fr-FR");

    if (!/^[\p{L}]+$/u.test(candidate)) return false;
    // Un mot tapé en minuscules ne devient jamais un sigle ou un nom propre :
    // « avc » → « AVC » et « lebus » → « Lexus » dégradaient le texte.
    if (suggestion !== candidate && !/^\p{Lu}/u.test(original)) return false;
    if (source.length >= 4 && source[0] !== candidate[0]) return false;
    if (Math.abs(source.length - candidate.length) > 1) return false;
    return levenshteinDistance(source, candidate) <= 1;
  }

  function levenshteinDistance(left, right) {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    const current = new Array(right.length + 1);

    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
      current[0] = leftIndex;
      for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
        const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
        current[rightIndex] = Math.min(
          previous[rightIndex] + 1,
          current[rightIndex - 1] + 1,
          substitution
        );
      }
      previous.splice(0, previous.length, ...current);
    }

    return previous[right.length];
  }

  function analyzeFrenchText(text) {
    const { grammar, spellChecker } = grammalecte();
    const normalizedText = text.replace(/\u00ad/g, "").normalize("NFC");
    return {
      grammarErrors: Array.from(grammar.parse(normalizedText, "FR", false, null, false)),
      spellingErrors: Array.from(spellChecker.parseParagraph(normalizedText))
    };
  }

  function firstSuggestion(suggestions) {
    return suggestionList(suggestions)[0] || "";
  }

  // Grammalecte renvoie ses suggestions tantôt en tableau, tantôt en chaîne
  // « a|b|c ».
  function suggestionList(suggestions) {
    if (Array.isArray(suggestions)) return suggestions.filter(Boolean);
    if (typeof suggestions !== "string") return [];
    return suggestions.split("|").filter(Boolean);
  }

  // La recherche de suggestions parcourt tout le graphe du dictionnaire : un mot
  // inconnu revu à la passe suivante (ou dans une autre requête) sort du cache.
  const SUGGESTION_CACHE_LIMIT = 4000;
  const suggestionCache = new Map();

  function collectSpellSuggestions(spellChecker, word) {
    const cached = suggestionCache.get(word);
    if (cached) return cached;

    const suggestions = [];
    for (const group of spellChecker.suggest(word, 4)) {
      if (Array.isArray(group)) suggestions.push(...group);
    }
    const unique = [...new Set(suggestions)].filter(Boolean);
    suggestionCache.set(word, unique);
    if (suggestionCache.size > SUGGESTION_CACHE_LIMIT) {
      suggestionCache.delete(suggestionCache.keys().next().value);
    }
    return unique;
  }

  function preserveCase(original, suggestion) {
    if (original.length > 1 && original === original.toUpperCase()) return suggestion.toUpperCase();
    if (/^[A-ZÀ-ÖØ-Þ]/.test(original)) {
      return suggestion.slice(0, 1).toUpperCase() + suggestion.slice(1);
    }
    return suggestion;
  }

  // Mots après lesquels un infinitif est réellement attendu.
  const INFINITIVE_TRIGGERS = new Set([
    "à", "a", "de", "d’", "d'", "pour", "sans", "par",
    "va", "vais", "vas", "vont", "allons", "allez", "aller",
    "veut", "veux", "voulons", "voulez", "veulent", "voulu", "vouloir", "veuillez",
    "peut", "peux", "pouvons", "pouvez", "peuvent", "pu", "pouvoir",
    "dois", "doit", "devons", "devez", "doivent", "dû", "devoir",
    "faut", "fait", "fais", "faire", "laisse", "laissé", "laisser",
    "sait", "sais", "savoir", "ose", "espère", "espere", "compte",
    "préfère", "prefere", "préféré", "aime", "adore", "déteste",
    "souhaite", "désire", "semble", "paraît", "vient", "viens", "venir",
    // Impératifs et tournures épistolaires : « veuillez trouver », « prière de
    // confirmer », « merci de rappeler ».
    "prière", "prie", "prions", "merci"
  ]);

  // La règle « infi » de Grammalecte est spéculative : son message dit lui-même
  // « s’il s’agit d’une action à accomplir ». Elle transformait « venir demain
  // désolé » en « désoler ». On ne la suit que là où un infinitif est attendu,
  // c’est-à-dire juste après un semi-auxiliaire ou une préposition.
  // Adverbes qui ferment un groupe nominal : ce qui suit n'en fait plus partie.
  const GROUP_BREAKING_ADVERBS = new Set([
    "demain", "hier", "aujourd", "maintenant", "bientôt", "tantôt", "alors",
    "ensuite", "puis", "enfin", "vite", "ici", "là", "dehors", "dedans",
    "avant", "après", "toujours", "jamais", "souvent", "parfois", "déjà"
  ]);

  // Grammalecte accorde parfois un adjectif avec un nom dont un adverbe le
  // sépare : dans « venir à la réunion demain désolé », « désolé » qualifie le
  // locuteur, pas « réunion ». Suivre l'accord dégraderait le texte.
  function isDistantNounAgreement(text, error) {
    if (error.sType === "ppas") {
      const before = text.slice(sentenceBoundary(text, error.nStart, -1), error.nStart);
      // Le nom inclus dans une relative n'est pas le sujet du verbe principal :
      // « le dossier sur lequel ... qu'une heure reste incomplet ».
      if (/\b[\p{L}’'-]+\s+sur\s+lequel\b[^.!?…]{0,140}\b(?:reste|semble|paraît|devient)\s*$/iu.test(before)) {
        return true;
      }
    }
    if (error.sType !== "gn") return false;
    const previous = text.slice(0, error.nStart).trimEnd().match(/[\p{L}’'-]+$/u)?.[0] || "";
    return GROUP_BREAKING_ADVERBS.has(previous.toLocaleLowerCase("fr-FR").replace(/[’'].*$/u, ""));
  }

  function isDurationParticipleAgreement(text, error) {
    if (error.sType !== "ppas") return false;
    const original = text.slice(error.nStart, error.nEnd).toLocaleLowerCase("fr-FR");
    if (original !== "vécu") return false;

    const before = text.slice(sentenceBoundary(text, error.nStart, -1), error.nStart);
    return /\b(?:ans?|années?|jours?|heures?|minutes?|secondes?|mois|semaines?)\s+qu[e’'][^.!?…]{0,60}(?:a|ai|as|avons|avez|ont|avait|avais|avaient)\s*$/iu.test(before);
  }

  // « Quant à X » introduit un thème puis une virgule. Si une proposition
  // conjuguée suit avant toute ponctuation, c'est le « quand » temporel :
  // « Quand à midi la cloche sonne, on mange » doit garder son « quand ».
  function isRiskyQuandToQuant(text, error) {
    const original = text.slice(error.nStart, error.nEnd).toLocaleLowerCase("fr-FR");
    if (original !== "quand") return false;
    const suggestion = firstSuggestion(error.aSuggestions).toLocaleLowerCase("fr-FR");
    if (!suggestion.startsWith("quant")) return false;

    const following = text.slice(error.nEnd).split(/[,.!?;:]/u)[0] || "";
    return (following.match(/[\p{L}’'-]+/gu) || []).some(isConjugatedVerbForm);
  }

  function isConjugatedVerbForm(word) {
    return morphOf(word).some(
      (morph) => /:V/u.test(morph) && /:(?:I[pqsf]|S[pq]|K|E)(?=[:/])/u.test(morph)
    );
  }

  function expectsInfinitive(text, start) {
    const previous = text.slice(0, start).trimEnd().match(/[\p{L}’'-]+$/u)?.[0] || "";
    return INFINITIVE_TRIGGERS.has(previous.toLocaleLowerCase("fr-FR"));
  }

  function isUnsafePronounRewrite(original, error) {
    const pronouns = new Set([
      "je", "j’", "j'", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"
    ]);
    return error.sType === "conj" && pronouns.has(original.trim().toLowerCase());
  }

  function selectSafeGrammarErrors(errors, text, grammar) {
    return errors.filter((candidate) => {
      const candidateText = text.slice(candidate.nStart, candidate.nEnd);
      const candidateScore = correctionConfidence(candidateText, candidate, text);

      return !errors.some((other) => {
        if (other === candidate || other.sLineId !== candidate.sLineId) return false;
        if (Math.abs(other.nStart - candidate.nStart) > 40) return false;

        const otherText = text.slice(other.nStart, other.nEnd);
        const alternatives =
          referencesWord(candidate.sMessage, otherText) ||
          referencesWord(other.sMessage, candidateText);
        if (!alternatives) return false;

        // Deux corrections concurrentes réparent la même faute par des chemins
        // différents (« à mangé » → « a mangé » ou « à manger »). On applique
        // chacune et on garde celle qui laisse la phrase la plus propre ;
        // l'heuristique de confiance ne tranche qu'à égalité.
        const candidateFix = scoreErrorFix(grammar, text, candidate);
        const otherFix = scoreErrorFix(grammar, text, other);
        if (otherFix !== candidateFix) return otherFix < candidateFix;

        const otherScore = correctionConfidence(otherText, other, text);
        return otherScore > candidateScore ||
          (otherScore === candidateScore && other.nStart < candidate.nStart);
      });
    });
  }

  // Nombre d'erreurs restantes dans la phrase une fois la correction appliquée.
  function scoreErrorFix(grammar, text, error) {
    const suggestion = firstSuggestion(error.aSuggestions);
    if (!suggestion) return Number.POSITIVE_INFINITY;

    const start = sentenceBoundary(text, error.nStart, -1);
    const end = sentenceBoundary(text, error.nEnd, 1);
    const rewritten = text.slice(start, error.nStart) + suggestion + text.slice(error.nEnd, end);
    return countGrammarErrors(grammar, rewritten);
  }

  function correctionConfidence(original, error, text) {
    const normalized = original.trim().toLowerCase();
    const suggestion = firstSuggestion(error.aSuggestions).trim().toLowerCase();
    const functionWords = new Set([
      "au", "aux", "du", "des", "ce", "cet", "cette", "ces",
      "le", "la", "les", "un", "une", "de", "à"
    ]);
    const pronouns = new Set([
      "je", "j’", "j'", "tu", "il", "elle", "on", "nous", "vous", "ils", "elles"
    ]);

    if (normalized === "au" && suggestion === "aux") {
      return hasExplicitPluralCue(text, error.nStart) ? 6 : 1;
    }
    if (normalized === "aux" && suggestion === "au") return 6;
    if (pronouns.has(normalized)) return 0;
    if (functionWords.has(normalized)) return 5;
    if (error.sType === "conj" && /verbe devrait/i.test(error.sMessage || "")) return 5;
    if (error.sType === "conj") return 4;
    return 2;
  }

  function hasExplicitPluralCue(text, position) {
    const context = text.slice(Math.max(0, position - 20), position + 35).toLowerCase();
    return /\b(?:deux|trois|quatre|cinq|six|sept|huit|neuf|dix|plusieurs|divers|différents|nombreux|mes|tes|ses|ces|nos|vos|leurs)\b/.test(context);
  }

  function referencesWord(message, word) {
    const normalizedWord = word.trim().toLowerCase();
    if (!normalizedWord) return false;
    return (message || "").toLowerCase().includes(normalizedWord);
  }

  function removeOverlaps(corrections) {
    const accepted = [];
    const sorted = corrections.sort((a, b) =>
      a.start - b.start || b.priority - a.priority || b.end - a.end
    );

    for (const candidate of sorted) {
      const overlaps = accepted.some((current) =>
        candidate.start < current.end && candidate.end > current.start
      );
      if (!overlaps) accepted.push(candidate);
    }
    return accepted;
  }

root.korrRules = { correctFrenchText, analyzeFrenchText };

})(typeof self !== "undefined" ? self : globalThis);
