// Règles de correction de Zéro Friction — partagées par le backend Node et
// l'extension de navigateur.
//
// Ce fichier est un script classique, sans import ni export : il s'exécute dans
// une portée où Grammalecte est déjà chargé — le contexte « vm » côté Node,
// la portée globale du Worker côté navigateur. Les deux environnements y
// trouvent donc « gc_engine » comme variable globale.
//
// Il expose self.zeroFrictionRules = { correctFrenchText, analyzeFrenchText }.

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

    const cached = resultCache.get(normalizedText);
    if (cached) {
      resultCache.delete(normalizedText);
      resultCache.set(normalizedText, cached);
      return { ...cached, durationMs: Math.round(performance.now() - startedAt) };
    }

    let correctedText = normalizedText;
    const contextualResult = correctHighConfidenceContextualPatterns(correctedText);
    correctedText = contextualResult.text;
    const contractionResult = correctExplicitPluralContractions(correctedText);
    correctedText = contractionResult.text;
    let correctionCount = contextualResult.corrections + contractionResult.corrections;

    // Grammalecte travaille paragraphe par paragraphe : chaque paragraphe
    // converge donc séparément, et un paragraphe déjà correct n’est analysé
    // qu’une seule fois même si un voisin demande trois passes. Les paragraphes
    // déjà vus (brouillon re-corrigé après ajout d’un passage) sortent du cache.
    correctedText = correctedText
      .split("\n")
      .map((paragraph) => {
        if (!paragraph.trim()) return paragraph;

        const cacheKey = `${contextualResult.smsDetected ? "s" : "n"}:${paragraph}`;
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
          const result = correctOnePass(current, contextualResult.smsDetected);
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

    const result = {
      text: correctedText,
      corrections: correctionCount,
      smsDetected: contextualResult.smsDetected
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
    replace(/\bJe\s*pense\s*que(?![\p{L}\p{N}])/giu, "Je pense que");
    replace(/\b(J[’']aimerais)bien(?![\p{L}\p{N}])/giu, "$1 bien");
    replace(/\bparceque(?![\p{L}\p{N}])/giu, "parce que");
    replace(/\bsurlequel(?![\p{L}\p{N}])/giu, "sur lequel");
    replace(/\bunpeu(?![\p{L}\p{N}])/giu, "un peu");
    replace(/\bdesfois(?![\p{L}\p{N}])/giu, "des fois");
    replace(/\b(plein(?:e)?s?\s+de\s+)(truc|chose|idée|problème)(?!\p{L})/giu, "$1$2s");

    // « sa » devant un verbe est le pronom « ça » : « sa fait longtemps » →
    // « ça fait longtemps ». Sans cette règle, Grammalecte proposait « son
    // fait ». La liste ne contient que des verbes, jamais des noms.
    replace(/\bsa(?=\s+(?:va|fait|marche|dépend|craint|suffit|ira|irait|allait|passe|change|commence|continue|recommence|m’|t’|me|te|nous|vous)\b)/giu, "ça");

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
    replace(/\b(pallier)\s+aux\b/giu, "$1 les");
    replace(/\b(pallier)\s+au\b/giu, "$1 le");
    replace(/\b(pallier)\s+à\s+(la|l’|l'|ce|cet|cette|ces|son|sa|ses|leur|leurs|mon|ma|mes|un|une)\b/giu, "$1 $2");
    replace(/\b(pallier)\s+à\b/giu, "$1");

    // « d’urgence » est une locution invariable ; le pluriel « d’urgences » est
    // fautif (à distinguer du nom « les urgences » d’un hôpital, jamais élidé).
    replace(/\bd[’']urgences(?![\p{L}\p{N}])/giu, (match) => match.replace(/urgences/iu, "urgence"));

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
        const imperfect = CONDITIONAL_TO_IMPERFECT.get(verb.toLocaleLowerCase("fr-FR"));
        if (!imperfect) return match;

        // « si je étais » est impossible : le pronom s’élide devant la voyelle.
        const normalizedPronoun = /^j[’']$/u.test(pronoun) ? "je" : pronoun;
        const elides = normalizedPronoun.toLocaleLowerCase("fr-FR") === "je" &&
          /^[aeéêiouy]/iu.test(imperfect);
        const subject = elides ? "j’" : `${normalizedPronoun} `;
        return `${prefix}${si} ${subject}${imperfect}`;
      }
    );

    // Subjonctif obligatoire après « bien que », « quoique », « encore que ».
    // Seul l’auxiliaire change : « a validé » → « ait validé », « est » → « soit ».
    // Le sujet ne peut pas franchir une virgule, ce qui empêche d’atteindre le
    // verbe de la proposition principale.
    replace(
      /\b((?:Bien que|Quoique|Encore que)\s+|(?:Bien qu|Quoiqu|Encore qu)[’'])([^.!?;:,]{1,40}?)\s*\b(a|as|avons|avez|ont|est|es|sommes|êtes|sont)\b(?=\s+\p{L})/gu,
      (match, conjunction, subject, auxiliary) => {
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
      // L’hypothèse doit être à l’imparfait ou au plus-que-parfait.
      if (!/\b(?:avais|avait|avions|aviez|avaient|étais|était|étions|étiez|étaient|[\p{L}]+ai[st]|[\p{L}]+aient)(?![\p{L}])/u.test(hypothesis)) {
        return sentence;
      }

      const main = sentence.slice(separator);
      const rewritten = main.replace(/\b([\p{L}]+)(?![\p{L}])/gu, (word) => {
        const conditional = FUTURE_TO_CONDITIONAL.get(word.toLocaleLowerCase("fr-FR"));
        if (!conditional) return word;
        corrections += 1;
        return preserveCase(word, conditional);
      });
      return sentence.slice(0, separator) + rewritten;
    });

    // Accord du participe passé avec le COD placé avant l’auxiliaire « avoir ».
    // Grammalecte s’en charge déjà, sauf dès qu’un mot suit le participe
    // (« que j’ai vu hier »). Le raisonnement : si « que » est un relatif ayant un
    // nom pour antécédent, le COD est « que » lui-même, donc ce qui suit est
    // forcément circonstanciel et l’accord s’impose.
    replace(
      /\b(?:Les|Des|Ces|Mes|Tes|Ses|Nos|Vos|Leurs|La|Le|Cette|Cet|Ce|Une|Un|Quelques|Plusieurs)\s+([\p{L}’'-]+)((?:\s+[\p{L}’'-]+){0,3}?)\s+qu[e’']\s*([^,;:.!?]{1,40}?)\s+(?:a|ai|as|avons|avez|ont|avait|avais|avaient|aura|aurai|auras|aurez|auront|aurait|auraient)\s+([\p{L}]+)(?=\s+[\p{L}])/gu,
      (match, headNoun, modifiers, subject, participle) => {
        const agreed = agreeParticipleWithAntecedent(match, headNoun, modifiers, participle);
        return agreed || match;
      }
    );

    // Participe passé invariable des verbes pronominaux à complément indirect
    // (se succéder, se parler, se demander…) : le « se » est alors un COI, donc
    // le participe ne s’accorde jamais. « ils se sont succédés » → « succédé ».
    replace(
      /\b(s[’']|se\s+)(sont|étaient|seraient|furent|soient)\s+((?:déjà|bien|mal|toujours|souvent|longtemps|tous|toutes|peu|beaucoup|enfin)\s+)?([\p{L}]+)(?![\p{L}])/giu,
      (match, reflexive, auxiliary, adverb, participle) => {
        const base = INVARIABLE_PRONOMINAL_PP.get(participle.toLocaleLowerCase("fr-FR"));
        if (!base) return match;
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
    // « ou » suivie d’une inversion — c’est l’adverbe de lieu.
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
    replace(/\bsur\s+lequel\s+on\s+n[’']a\s+travaillé(?!\p{L})/giu, "sur lequel on a travaillé");
    replace(/\bqu[’']on\s+n[’']y\s+a\s+mit(?![\p{L}\p{N}])/giu, "qu’on y a mis");
    replace(/\bquoi\s+que\s+se\s+soit(?![\p{L}\p{N}])/giu, "quoi que ce soit");
    replace(/(?<![\p{L}’'])\bhésite\s+pas(?![\p{L}\p{N}])/giu, "N’hésite pas");
    replace(/([.!?])(?=N[’']hésite\b)/gu, "$1 ");
    replace(/\bj[’']éspère(?![\p{L}\p{N}])/giu, "j’espère");
    replace(/\bil\s+(?:était|etait)\s+(?:déjà|deja)\s+partit(?![\p{L}\p{N}])/giu, "il était déjà parti");

    // Accords à distance dans des constructions fréquentes.
    replace(
      /\b(journée\b[^.!?]{0,60}\bqui\s+)c[’']est\s+très\s+mal\s+passé(?!\p{L})/giu,
      "$1s’est très mal passée"
    );
    replace(/\b(fleurs\s+que\s+j[’']ai\s+)cueilli(?![\p{L}\p{N}])/giu, "$1cueillies");
    replace(/\b(fleurs\b[^.!?]{0,100}?)\b(?:on|ont)\s+est\s+déjà\s+fane(?![\p{L}\p{N}])/giu, "$1sont déjà fanées");
    replace(/\b(fleurs\b[^.!?]{0,100}?)\bon\s+déjà\s+fané(?:e?s?)(?![\p{L}\p{N}])/giu, "$1sont déjà fanées");
    replace(/\b(Les\s+chevaux\b[^.!?]{0,100}?)\bavait\s+l[’']air(?![\p{L}\p{N}])/gu, "$1avaient l’air");
    replace(/\bd[’']a\s+coté(?!\p{L})/giu, "d’à côté");
    replace(/\bOn\s+se\s+voit\s+très\s+bientôt\s+j[’']espère(?![\p{L}\p{N}])/gu, "On se voit très bientôt, j’espère");
    replace(/(?:\?\s*){2,}/gu, (match) => match.replace(/\s/gu, ""));
    replace(/(?:!\s*){2,}/gu, (match) => match.replace(/\s/gu, ""));
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
      (match, subject) => `${subject} se sont ${/(?:elles|certaines|nombreuses|tes|es)\s*$/iu.test(match.trim()) ? "plaintes" : "plaints"}`
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
    "été", "fait", "laissé", "coûté", "valu", "pesé", "mesuré", "duré",
    "vécu", "couru", "régné", "dormi", "marché", "plu", "ri", "nui", "survécu"
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
  function agreeParticipleWithAntecedent(match, headNoun, modifiers, participle) {
    const base = participle.toLocaleLowerCase("fr-FR");
    if (INVARIABLE_PARTICIPLES.has(base)) return "";

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
    const tail = match.slice(match.lastIndexOf(participle) + participle.length);
    if (/^\s+[\p{L}]+(?:er|ir|re)(?![\p{L}])/u.test(tail)) return "";

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
    if (error.sType !== "gn") return false;
    const previous = text.slice(0, error.nStart).trimEnd().match(/[\p{L}’'-]+$/u)?.[0] || "";
    return GROUP_BREAKING_ADVERBS.has(previous.toLocaleLowerCase("fr-FR").replace(/[’'].*$/u, ""));
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

root.zeroFrictionRules = { correctFrenchText, analyzeFrenchText };

})(typeof self !== "undefined" ? self : globalThis);
