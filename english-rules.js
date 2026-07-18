// Règles anglaises très ciblées qui complètent Harper sur quelques fautes
// fréquentes. Elles restent volontairement conservatrices pour éviter de
// réécrire une phrase correcte ou de deviner le sens de l'utilisateur.

"use strict";

(() => {
  const ACCEPTED_WORDS = Object.freeze([
    "analyse", "analysed", "analyses", "analysing", "apologise", "apologised",
    "behaviour", "behaviours", "cancelled", "cancelling", "catalogue", "centre",
    "centres", "cheque", "colour", "colours", "defence", "dialogue", "favourite",
    "favourites", "fulfil", "fulfilled", "grey", "honour", "honours", "jewellery",
    "labelled", "labour", "licence", "modelling", "neighbour", "neighbours",
    "offence", "organise", "organised", "organises", "organising", "programme",
    "programmes", "realise", "realised", "realises", "realising", "recognise",
    "recognised", "recognises", "recognising", "skilful", "theatre", "travelled",
    "traveller", "travellers", "travelling", "bonjour", "merci", "salut", "korr",
    "aeroplane", "aeroplanes", "aluminium", "practise", "practised", "practises",
    "practising", "tyre", "tyres"
  ]);

  function applyEnglishRules(source) {
    let text = String(source || "");
    let corrections = 0;

    const replace = (pattern, replacement) => {
      text = text.replace(pattern, (...args) => {
        corrections += 1;
        const match = args[0];
        const value = typeof replacement === "function" ? replacement(...args) : replacement;
        return preserveInitialCase(match, value);
      });
    };
    const replaceRaw = (pattern, replacement) => {
      text = text.replace(pattern, (...args) => {
        const value = replacement(...args);
        if (value !== args[0]) corrections += 1;
        return value;
      });
    };

    replaceRaw(
      /\b(this)([ \t]+)(are)\b(?=[ \t]+(?:(the|my|your|our|their)[ \t]+)?([a-z][a-z'’-]*))/giu,
      (match, demonstrative, spacing, verb, determiner, noun) =>
        correctedDemonstrative(match, demonstrative, spacing, verb, determiner, noun)
    );
    replaceRaw(
      /\b(these|those)([ \t]+)(is)\b(?=[ \t]+(?:(the|my|your|our|their)[ \t]+)?([a-z][a-z'’-]*))/giu,
      (match, demonstrative, spacing, verb, determiner, noun) =>
        correctedDemonstrative(match, demonstrative, spacing, verb, determiner, noun)
    );
    replaceRaw(
      /(^|[.!?][ \t]+)(that)([ \t]+)(are)\b(?=[ \t]+(?:(the|my|your|our|their)[ \t]+)?([a-z][a-z'’-]*))/gimu,
      (match, prefix, demonstrative, spacing, verb, determiner, noun) =>
        `${prefix}${correctedDemonstrative(match.slice(prefix.length), demonstrative, spacing, verb, determiner, noun)}`
    );
    replace(/\byour[ \t]+welcome\b(?=[ \t]*(?:[.!?]|$))/giu, "you're welcome");
    replace(
      /\byour[ \t]+going[ \t]+to[ \t]+(?=(?:be|call|do|get|have|know|like|love|meet|need|see|try|understand|use|want)\b)/giu,
      "you're going to "
    );
    replace(/\bi[ \t]+am[ \t]+agree\b/giu, "I agree");
    replace(/\blook[ \t]+forward[ \t]+to[ \t]+hear\b/giu, "look forward to hearing");
    replace(
      /\bone[ \t]+of[ \t]+(the|my|our|your|their|these|those)[ \t]+([a-z][a-z'’-]*)[ \t]+are\b/giu,
      (_match, determiner, noun) => `one of ${determiner} ${noun} is`
    );
    replace(/\badress\b/giu, "address");
    replace(/\badresses\b/giu, "addresses");
    replace(/\bdefinately\b/giu, "definitely");
    replace(/\brecieved\b/giu, "received");
    replace(/\bseperate\b/giu, "separate");
    replace(/\boccured\b/giu, "occurred");
    replace(/\buntill\b/giu, "until");
    replace(/\binformations[ \t]+are\b/giu, "information is");
    replace(/\binformations[ \t]+were\b/giu, "information was");
    replace(/\binformations\b/giu, "information");
    replace(/\bthere[ \t]+is[ \t]+(many|several)[ \t]+([a-z][a-z'’-]*s)\b/giu,
      (_match, quantity, noun) => `there are ${quantity} ${noun}`);
    replace(/\b(wagged|wags|wagging)[ \t]+it[ \t]+tail\b/giu,
      (_match, verb) => `${verb} its tail`);
    replace(/\b(i|you|we|they|he|she|it)[ \t]+(?:has|have)[ \t]+went\b(?=[^.!?\n]*\byesterday\b)/giu,
      (_match, subject) => `${subject} went`);
    replace(/\b(i|you|we|they)[ \t]+has\b/giu,
      (_match, subject) => `${subject} have`);
    replace(/\b(he|she|it)[ \t]+have\b/giu,
      (_match, subject) => `${subject} has`);
    replace(/\b(we|they|you)[ \t]+was\b/giu,
      (_match, subject) => `${subject} were`);
    replace(
      /\b(he|she|it)[ \t]+don['’]?t[ \t]+(likes|wants|needs|knows|works|runs|seems|looks)\b/giu,
      (_match, subject, verb) => `${subject} doesn't ${verb.slice(0, -1)}`
    );
    replace(
      /\b(can|could|may|might|must|shall|should|will|would)[ \t]+(comes|goes|runs|works|needs|wants|likes|knows|seems|looks|gives|takes|makes|contains|uses|tries)\b/giu,
      (_match, modal, verb) => `${modal} ${baseVerb(verb)}`
    );
    replace(
      /\b(employees|managers|policies|documents|teams|problems|reasons|students|dogs|cats)[ \t]+(has|contains|works|gives|needs|wants|runs|likes|was)\b/giu,
      (_match, subject, verb) => `${subject} ${pluralVerb(verb)}`
    );
    replace(
      /\b(several|many|two|three|four|five|six|seven|eight|nine|ten)[ \t]+(employee|manager|policy|document|team|problem|reason|student)\b/giu,
      (_match, quantity, noun) => `${quantity} ${pluralNoun(noun)}`
    );
    replace(/\beach[ \t]+of[ \t]+(the|these|those|our|your|their)[ \t]+([a-z][a-z'’-]*s)[ \t]+have\b/giu,
      (_match, determiner, noun) => `each of ${determiner} ${noun} has`);
    replace(/\bneither[ \t]+of[ \t]+(them|us|you)[ \t]+are\b/giu,
      (_match, pronoun) => `neither of ${pronoun} is`);
    replace(/\btheir[ \t]+supposed[ \t]+to\b/giu, "they're supposed to");
    replaceRaw(
      /(^|[.!?][ \t]+)(there)([ \t]+)going([ \t]+)to\b/gimu,
      (_match, prefix, word, firstSpace, secondSpace) =>
        `${prefix}${preserveInitialCase(word, "they're")}${firstSpace}going${secondSpace}to`
    );
    replace(/\byour[ \t]+the\b/giu, "you're the");
    replace(/\bwere[ \t]+are[ \t]+(you|we|they|he|she|it)\b/giu,
      (_match, subject) => `where are ${subject}`);
    replace(/\btheyre[ \t]+(bags|books|cars|coats|documents|phones|reports|shoes)\b/giu,
      (_match, noun) => `their ${noun}`);
    replace(/\b(please|could[ \t]+you|can[ \t]+you)[ \t]+advice\b/giu,
      (_match, lead) => `${lead} advise`);
    replace(/\b(the|my|your|our|their)[ \t]+advise\b/giu,
      (_match, determiner) => `${determiner} advice`);
    replace(/\bloose[ \t]+(money|weight|time|hope|the[ \t]+game|the[ \t]+battle)\b/giu,
      (_match, object) => `lose ${object}`);
    replaceRaw(
      /\b(a)([ \t]+)(?=(?:apple|answer|animal|email|error|example|idea|issue|office|option|orange)\b)/giu,
      (_match, article, spacing) => `${article === "A" ? "An" : "an"}${spacing}`
    );
    replace(/\bi[ \t]+seen\b(?=[ \t]+(?:him|her|it|them|you|this|that|yesterday)\b)/giu, "I saw");
    replace(/\b(until|before|after|when|if)[ \t]+the[ \t]+director[ \t]+give\b/giu,
      (_match, conjunction) => `${conjunction} the director gives`);

    return { text, corrections };
  }

  function preserveInitialCase(source, replacement) {
    const letters = source.match(/\p{L}/gu) || [];
    if (letters.length && letters.every((letter) => /^\p{Lu}$/u.test(letter))) {
      return replacement.toLocaleUpperCase("en-US");
    }
    if (!/^\p{Lu}/u.test(source)) return replacement;
    return replacement.charAt(0).toLocaleUpperCase("en-US") + replacement.slice(1);
  }

  function correctedDemonstrative(match, demonstrative, spacing, verb, determiner, noun) {
    const lowerDemonstrative = demonstrative.toLocaleLowerCase("en-US");
    const lowerNoun = noun.toLocaleLowerCase("en-US");
    if (determiner && ["important", "new", "old", "large", "small", "first", "last", "other"].includes(lowerNoun)) {
      return match;
    }
    const irregularPlural = ["children", "people", "men", "women", "mice", "geese", "teeth", "feet"].includes(lowerNoun);
    const obviousPlural = irregularPlural || (lowerNoun.endsWith("s") &&
      !/(?:ss|us|is)$/u.test(lowerNoun) && !["news", "series", "species"].includes(lowerNoun));
    const obviousSingular = Boolean(determiner) && !obviousPlural;
    const plural = obviousPlural || (!obviousSingular && ["these", "those"].includes(lowerDemonstrative));
    const proximal = ["this", "these"].includes(lowerDemonstrative);
    const correctedWord = proximal ? (plural ? "these" : "this") : (plural ? "those" : "that");
    const correctedVerb = plural ? "are" : "is";
    const replacement = `${preserveInitialCase(demonstrative, correctedWord)}${spacing}${correctedVerb}`;
    return preserveInitialCase(match, replacement);
  }

  function baseVerb(verb) {
    const lower = verb.toLocaleLowerCase("en-US");
    if (lower.endsWith("ies")) return `${lower.slice(0, -3)}y`;
    if (["goes", "does"].includes(lower)) return lower.slice(0, -2);
    if (["uses", "comes", "gives", "takes", "makes"].includes(lower)) return lower.slice(0, -1);
    return lower.slice(0, -1);
  }

  function pluralVerb(verb) {
    const forms = {
      has: "have", contains: "contain", works: "work", gives: "give",
      needs: "need", wants: "want", runs: "run", likes: "like", was: "were"
    };
    return forms[verb.toLocaleLowerCase("en-US")] || verb;
  }

  function pluralNoun(noun) {
    const forms = { policy: "policies" };
    return forms[noun.toLocaleLowerCase("en-US")] || `${noun}s`;
  }

  function shouldApplyHarperLint(lint) {
    const problem = lint.get_problem_text();
    if (/\bwhom\b/iu.test(problem)) return false;
    if (/oxford comma|serial comma/iu.test(lint.message())) return false;
    if (lint.lint_kind() === "Regionalism") return false;
    if (lint.lint_kind() !== "Spelling") return true;

    // Une suggestion orthographique sur un mot capitalisé ou accentué est
    // trop souvent un nom propre ou un mot étranger. Harper proposait par
    // exemple Kerr pour Korr et Thence pour Étienne.
    if (/[\p{Lu}\p{M}]/u.test(problem.normalize("NFD"))) return false;
    return true;
  }

  async function configureHarper(linter) {
    await linter.importWords(ACCEPTED_WORDS);
    const config = await linter.getLintConfig();
    for (const key of ["WhomSubjectOfVerb", "OxfordComma", "NoOxfordComma", "Regionalisms"]) {
      if (Object.hasOwn(config, key)) config[key] = false;
    }
    await linter.setLintConfig(config);
  }

  async function correctWithHarper(linter, source) {
    const rulesResult = applyEnglishRules(source);
    const lints = await linter.lint(rulesResult.text, { language: "plaintext" });
    const applicable = lints
      .filter((lint) => lint.suggestion_count() > 0)
      .filter(shouldApplyHarperLint)
      .sort((left, right) => right.span().start - left.span().start);

    let text = rulesResult.text;
    let corrections = rulesResult.corrections;
    let nextBoundary = Infinity;

    for (const lint of applicable) {
      const span = lint.span();
      if (span.end > nextBoundary) continue;
      const suggestion = lint.suggestions()[0];
      const updated = await linter.applySuggestion(text, lint, suggestion);
      if (updated !== text) {
        text = updated;
        corrections += 1;
        nextBoundary = span.start;
      }
    }

    return { text, corrections };
  }

  globalThis.korrEnglishRules = Object.freeze({
    acceptedWords: ACCEPTED_WORDS,
    applyEnglishRules,
    configureHarper,
    correctWithHarper,
    shouldApplyHarperLint
  });
})();
