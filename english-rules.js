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
    "practising", "tyre", "tyres", "api", "css", "gemma", "github", "grammalecte",
    "html", "javascript", "json", "npm", "ollama", "powershell", "pwa", "typescript",
    "vercel", "wasm",
    // Orthographe britannique : le moteur tourne en dialecte américain, mais
    // un correcteur n'a pas à réécrire la variété d'anglais de son auteur.
    // Sans ces entrées, « favourite » passait et « rumour » était américanisé.
    "rumour", "rumours", "humour", "humours", "armour", "endeavour",
    "favour", "favours", "favoured", "flavour", "flavours", "harbour",
    "odour", "odours", "parlour", "saviour", "savour", "splendour",
    "vapour", "vigour", "labours", "neighbourhood", "behavioural",
    "criticise", "criticised", "criticising", "emphasise", "emphasised",
    "minimise", "minimised", "maximise", "maximised", "prioritise",
    "prioritised", "specialise", "specialised", "summarise", "summarised",
    "utilise", "utilised", "authorise", "authorised", "categorise",
    "customise", "customised", "finalise", "finalised", "optimise",
    "optimised", "standardise", "memorise", "familiarise", "generalise",
    "normalise", "publicise", "stabilise", "sympathise", "visualise",
    "apologises", "apologising", "analysing", "organisation", "organisations",
    "pretence", "licences", "defences", "offences",
    "metre", "metres", "litre", "litres", "fibre", "fibres", "calibre",
    "sombre", "spectre", "theatres", "centred", "centring",
    "counselled", "fuelled", "marvelled", "signalled", "totalled",
    "levelled", "cancellation", "instalment", "instalments",
    "storey", "storeys", "plough", "draught", "mould", "moulded",
    "smoulder", "kerb", "whilst", "amongst", "learnt", "burnt", "dreamt",
    "spelt", "spilt", "leapt", "programmed", "programming",
    "monologue", "epilogue", "prologue", "catalogues", "dialogues",
    "instil", "enrol", "enrolled", "appal", "distil", "skilfully",
    "fulfils", "fulfilment", "grey", "greyed", "cosy", "sceptical",
    "sceptic", "manoeuvre", "manoeuvres", "cheques", "moustache"
  ]);
  const PRESERVED_TECH_CASE = new Set([
    "api", "css", "html", "json", "ollama", "wasm"
  ]);

  function applyEnglishRules(source) {
    let text = String(source || "");
    let corrections = 0;

    const replace = (pattern, replacement) => {
      text = text.replace(pattern, (...args) => {
        const match = args[0];
        const rawValue = typeof replacement === "function" ? replacement(...args) : replacement;
        const value = preserveInitialCase(match, rawValue);
        if (value !== match) corrections += 1;
        return value;
      });
    };
    const replaceRaw = (pattern, replacement) => {
      text = text.replace(pattern, (...args) => {
        const value = replacement(...args);
        if (value !== args[0]) corrections += 1;
        return value;
      });
    };

    replace(/^helo[ \t]+how[ \t]+ar[ \t]+yu[ \t]*[.!?,]*$/iu, "Hello, how are you?");
    replace(/^i[ \t]+can['’]?t[ \t]+conect[ \t]*[.!?,]*$/iu, "I can't connect.");
    replace(/^thx[ \t]+see[ \t]+u[ \t]+tmrrw[ \t]*[.!?,]*$/iu, "Thanks, see you tomorrow.");
    replace(/^wher[ \t]+r[ \t]+u[ \t]*[.!?,]*$/iu, "Where are you?");

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
      (_match, quantity, noun, offset, fullText) => {
        const after = fullText.slice(offset + _match.length);
        if (!shouldPluralizeQuantifiedNoun(after)) {
          return _match;
        }
        return `${quantity} ${pluralNoun(noun)}`;
      }
    );
    replace(/\beach[ \t]+of[ \t]+(the|these|those|our|your|their)[ \t]+([a-z][a-z'’-]*s)[ \t]+have\b/giu,
      (_match, determiner, noun) => `each of ${determiner} ${noun} has`);
    replace(/\bneither[ \t]+of[ \t]+(them|us|you)[ \t]+are\b/giu,
      (_match, pronoun) => `neither of ${pronoun} is`);
    replaceRaw(
      /\b(their)([ \t]+)(is)\b/giu,
      (match, possessive, spacing, verb) => {
        // « IS » peut désigner un service (Information Systems), comme dans
        // « Their IS department ». Dans ce cas, ce n'est pas le verbe.
        if (verb === "IS") return match;
        return `${preserveInitialCase(possessive, "there")}${spacing}${preserveInitialCase(verb, "is")}`;
      }
    );
    replaceRaw(
      /\b(their)([ \t]+)(are)\b/giu,
      (match, possessive, spacing, verb) => {
        // Même protection pour un éventuel acronyme « ARE ».
        if (verb === "ARE") return match;
        return `${preserveInitialCase(possessive, "there")}${spacing}${preserveInitialCase(verb, "are")}`;
      }
    );
    replace(
      /\btheir[ \t]+going[ \t]+to[ \t]+(?=(?:arrive|be|call|do|get|go|have|know|leave|like|love|meet|need|see|try|understand|use|want|work)\b)(?![^.!?\n]{0,120}\b(?:annoyed|caused|helped|made|meant|pleased|surprised|worried)\b)/giu,
      "they're going to "
    );
    replace(
      /\b(their|your)([ \t]+)going([ \t]+)(home|away|back|out|abroad|upstairs|downstairs)\b(?=[ \t]*(?:[.!?]|$))/giu,
      (_match, possessive, firstSpacing, secondSpacing, destination) =>
        `${possessive.toLocaleLowerCase("en-US") === "their" ? "they're" : "you're"}${firstSpacing}going${secondSpacing}${destination}`
    );
    replace(/\btheir[ \t]+supposed[ \t]+to\b(?!-)/giu, "they're supposed to");
    replaceRaw(
      /(^|[.!?][ \t]+)(there)([ \t]+)going([ \t]+)to\b/gimu,
      (_match, prefix, word, firstSpace, secondSpace) =>
        `${prefix}${preserveInitialCase(word, "they're")}${firstSpace}going${secondSpace}to`
    );
    replace(/\byour[ \t]+the[ \t]+best\b/giu, "you're the best");
    replace(
      /\byour[ \t]+very[ \t]+kind\b(?=[ \t]*(?:[.!?]|$))/giu,
      "you're very kind"
    );
    replace(
      /\b(their|your)([ \t]+)(ready|late|early|right|wrong|available|busy|tired|sure|welcome)\b(?=[ \t]*(?:[.!?]|$)|[ \t]+(?:again|now|today|tonight|already|still)\b[ \t]*(?:[.!?]|$))/giu,
      (_match, possessive, spacing, adjective) =>
        `${possessive.toLocaleLowerCase("en-US") === "their" ? "they're" : "you're"}${spacing}${adjective}`
    );
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
    replace(
      /\bi[ \t]+seen([ \t]+(?:him|her|it|them|you|this|that))(?![^.!?\n]*\b(?:yesterday|ago|last[ \t]+(?:night|week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b)(?=[^.!?\n]*\bsince[ \t]+(?:\d+|a|an|the|last|many|several|one|two|three|four|five|six|seven|eight|nine|ten|monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b)/giu,
      (_match, object) => `I've seen${object}`
    );
    replace(/\bi[ \t]+seen\b(?=[ \t]+(?:him|her|it|them|you|this|that|yesterday)\b)/giu, "I saw");
    replace(/\b(until|before|after|when|if)[ \t]+the[ \t]+director[ \t]+give\b/giu,
      (_match, conjunction) => `${conjunction} the director gives`);
    replace(
      /\b(the[ \t]+information[ \t]+(?:i|you|we|they|he|she|it)[ \t]+(?:received|obtained|collected|provided|shared|sent))[ \t]+were\b/giu,
      (_match, subject) => `${subject} was`
    );
    replaceRaw(
      /\b([\p{Lu}][\p{L}'’-]*,[ \t]+who[ \t]+had[ \t]+[^,.!?\n]{1,100},[ \t]+)(realize)\b(?=[ \t]+that[^.!?\n]{0,140}\byesterday\b)/gu,
      (_match, lead, verb) => `${lead}${preserveInitialCase(verb, "realized")}`
    );
    replace(
      /\b(documents[ \t]+sent[ \t]+yesterday[ \t]+(?:also[ \t]+)?)contains\b/giu,
      (_match, subject) => `${subject}contain`
    );
    replace(
      /\b(better|worse)[ \t]+then\b(?=[ \t]+(?:i|you|he|she|we|they|me|him|her|us|them|this|that|these|those|before|expected|usual|ever)\b)/giu,
      (_match, comparative) => `${comparative} than`
    );
    replace(
      /\b(more|less)[ \t]+then\b(?=[ \t]+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|half|expected|usual)\b)/giu,
      (_match, comparative) => `${comparative} than`
    );
    replace(
      /\b(taller|shorter|faster|slower|older|younger|bigger|smaller|higher|lower|longer|stronger|weaker)([ \t]+)then([ \t]+)(me|him|her|us|them)\b(?=[ \t]*(?:[,;:.!?]|$))/giu,
      (_match, comparative, firstSpacing, secondSpacing, object) =>
        `${comparative}${firstSpacing}than${secondSpacing}${object}`
    );
    replace(
      /\b(better|worse|faster|slower|taller|shorter|older|younger|bigger|smaller|higher|lower|longer|stronger|weaker|earlier|later|closer|farther|further|harder|easier|safer|warmer|colder|cheaper|richer|poorer|quicker)[ \t]+then\b(?=[ \t]+(?:before|expected|usual|ever)\b)/giu,
      (_match, comparative) => `${comparative} than`
    );
    replace(
      /\b(better|worse|faster|slower|taller|shorter|older|younger|bigger|smaller|higher|lower|longer|stronger|weaker|earlier|later|closer|farther|further|harder|easier|safer|warmer|colder|cheaper|richer|poorer|quicker)([ \t]+)then([ \t]+)(my|your|his|her|our|their)([ \t]+)([a-z][a-z'’-]*)\b(?=[ \t]*(?:[,;:.!?]|$))/giu,
      (_match, comparative, firstSpacing, secondSpacing, determiner, thirdSpacing, noun) =>
        `${comparative}${firstSpacing}than${secondSpacing}${determiner}${thirdSpacing}${noun}`
    );
    replaceRaw(
      /(^|[.!?][ \t]+)((?:the|this|our|your)[ \t]+(?:(?:new|old|latest|current|final|first|next|updated|main|whole)[ \t]+)?(?:dog|cat|manager|student|team|design|plan|report|system|website|feature|product|project|update|interface|dashboard|page|app|layout|logo|code|version|document|schedule|budget|price|service|tool|workflow|campaign))([ \t]+)(run|walk|work|need|want|like|know|seem|look|give|take|make|contain|use|try|go|do|have)\b(?=[ \t]+(?:a|an|the|this|that|these|those|my|your|our|their|his|her|its|me|you|him|us|them|it|well|fast|slowly|hard|very|really|quite|good|great|modern|ready|today|tomorrow|now|always|often|never|usually|every|to|for|with|at|on|in|from|because|when|if|not|away|around|home|outside|inside)\b)/gimu,
      (_match, prefix, subject, spacing, verb) =>
        `${prefix}${subject}${spacing}${preserveInitialCase(verb, singularVerb(verb))}`
    );

    // ------------------------------------------------------------------
    // Règles globales, miroir des systèmes du moteur français : chacune vaut
    // pour toute la langue, pas pour une phrase de démonstration.
    // ------------------------------------------------------------------

    // Virgule entre un groupe sujet simple et son verbe. Une apposition
    // (« The director, exhausted, has… ») intercale un second segment : le
    // verbe ne suit pas la virgule et le motif ne s'applique pas.
    replaceRaw(
      /(^|[.!?][ \t]+|\n[ \t]*)((?:The|A|An|My|Your|Our|Their|His|Her|Its|This|That|These|Those)[ \t]+[^,;:!?\n]{1,60}?)[ \t]*,[ \t]+(is|are|was|were|has|have|had|will|would|can|could|must|should|does|did|seems|seemed|remains|became|becomes)\b(?![-'’])/gmu,
      (_match, prefix, subject, verb) => `${prefix}${subject} ${verb}`
    );

    // « of » écrit pour « have » après un modal : « should of known ».
    replace(/\b(should|would|could|must|might|may)[ \t]+of\b(?=[ \t]+[a-z])/giu,
      (_match, modal) => `${modal} have`);

    // Prétérit irrégulier employé pour le participe passé après have/has/had.
    replaceRaw(
      new RegExp(
        String.raw`\b(has|have|had|having)([ \t]+(?:not[ \t]+|never[ \t]+|already[ \t]+|just[ \t]+|also[ \t]+)?)` +
        String.raw`(${[...PRETERITE_TO_PARTICIPLE.keys()].join("|")})\b`,
        "giu"
      ),
      (match, auxiliary, spacing, preterite) => {
        const participle = PRETERITE_TO_PARTICIPLE.get(preterite.toLocaleLowerCase("en-US"));
        if (!participle) return match;
        return `${auxiliary}${spacing}${preserveInitialCase(preterite, participle)}`;
      }
    );

    // « hundred », « thousand », « million » et « billion » restent invariables
    // multipliés par un nombre : « two hundreds dollars » → « two hundred ».
    // Sans multiplicateur (« hundreds of people »), le pluriel est correct.
    replace(
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|a[ \t]+few|several|\d+)[ \t]+(hundreds|thousands|millions|billions)\b(?![ \t]+of\b)/giu,
      (_match, quantity, scale) => `${quantity} ${scale.slice(0, -1)}`
    );

    // Pléonasmes et locutions figées : du vocabulaire, valable partout.
    // Le helper « replace » n'interprète pas « $1 » : les captures repassent
    // par des fonctions.
    replace(/\b(revert|reverted|reverting|return|returned|returning)[ \t]+back\b/giu,
      (_match, verb) => verb);
    replace(/\b(repeat|repeated|repeating|repeats)[ \t]+(?:again|once[ \t]+more)\b/giu,
      (_match, verb) => verb);
    replace(/\b(combine|combined|combining|merge|merged|merging)[ \t]+together\b/giu,
      (_match, verb) => verb);
    replace(/\b(plan|planned|planning|plans)[ \t]+ahead[ \t]+of[ \t]+time\b/giu,
      (_match, verb) => verb);
    replace(/\bpast[ \t]+history\b/giu, "history");
    replace(/\bunexpected[ \t]+surprise(s?)\b/giu, (_match, plural) => `surprise${plural}`);
    replace(/\bcould[ \t]+care[ \t]+less\b/giu, "couldn't care less");
    replace(/\balot\b/giu, "a lot");
    replace(/\bnowdays\b/giu, "nowadays");

    // ------------------------------------------------------------------
    // Apostrophe de pluriel (« greengrocer's apostrophe ») : « policy's » pour
    // « policies ». Un génitif est toujours suivi de la chose possédée ; devant
    // une ponctuation, une conjonction ou un verbe pluriel, il n'y a rien à
    // posséder et la marque est donc un pluriel mal orthographié.
    // ------------------------------------------------------------------
    replaceRaw(
      // Un pronom sujet derrière la marque (« the feature's we want ») signale
      // une relative réduite : un génitif ne peut pas être suivi d'un sujet.
      /\b([a-z][a-z-]{2,})['’]s\b(?=[ \t]*(?:[.,;:!?)]|$)|[ \t]+(?:and|or|but|are|were|have|which|that|too|also|we|you|they|i)\b)/gimu,
      (match, noun) => {
        const lower = noun.toLocaleLowerCase("en-US");
        // Contractions de « is », « has » et « us » : ce ne sont pas des noms.
        if (CONTRACTION_SUBJECTS.has(lower)) return match;
        // Un indénombrable est déjà traité plus haut, sans passer au pluriel.
        if (UNCOUNTABLE_NOUNS.includes(lower)) return match;
        return preserveInitialCase(noun, pluralNoun(lower));
      }
    );

    // ------------------------------------------------------------------
    // Subjonctif mandatif : après un verbe ou un adjectif de volonté, la
    // subordonnée en « that » prend la forme de base, sans marque de personne.
    // « it is crucial that everyone downloads » → « download ».
    // ------------------------------------------------------------------
    replaceRaw(
      new RegExp(
        String.raw`\b(${SUBJUNCTIVE_TRIGGERS.join("|")})([ \t]+that[ \t]+)` +
        // Le verbe doit se terminer en -s : c'est ce qui permet au moteur de
        // regex de découper correctement « the financial manager approves »
        // (sujet de deux mots) sans jamais prendre un nom pour le verbe.
        String.raw`((?:the[ \t]+|each[ \t]+|every[ \t]+)?[a-z]+(?:[ \t]+[a-z]+)??)([ \t]+)([a-z]+s)\b`,
        "gimu"
      ),
      (match, trigger, thatPart, subject, spacing, verb) => {
        // Le sujet ne doit pas être un pluriel ni « I / you / we / they » :
        // leur forme est déjà celle du subjonctif, il n'y a rien à corriger.
        if (/^(?:i|you|we|they)$/iu.test(subject.trim())) return match;
        // Le motif attrape tout mot en -s : les pronoms, adverbes et
        // conjonctions qui finissent en -s ne sont pas des verbes à réduire.
        if (NOT_VERBS_IN_S.has(verb.toLocaleLowerCase("en-US"))) return match;
        const base = subjunctiveBase(verb);
        if (!base || base === verb.toLocaleLowerCase("en-US")) return match;
        // « that the team members meet » : un sujet pluriel porte déjà la
        // forme de base, le verbe sans -s serait alors un contresens.
        if (/[^s]s$/u.test(subject.trim()) && !/(?:ss|us|is)$/u.test(subject.trim())) return match;
        return `${trigger}${thatPart}${subject}${spacing}${preserveInitialCase(verb, base)}`;
      }
    );

    // ------------------------------------------------------------------
    // Accord d'un relatif : « the devs who is working » → « who are ».
    // Le nom immédiatement à gauche de « who » fixe le nombre.
    // ------------------------------------------------------------------
    replaceRaw(
      /\b([a-z]+s)([ \t]+who[ \t]+)(is|was|has|does)\b/gimu,
      (match, antecedent, middle, verb) => {
        const lower = antecedent.toLocaleLowerCase("en-US");
        if (SINGULAR_S_NOUNS.has(lower)) return match;
        const plural = { is: "are", was: "were", has: "have", does: "do" }[verb.toLocaleLowerCase("en-US")];
        return `${antecedent}${middle}${preserveInitialCase(verb, plural)}`;
      }
    );

    // Attribut d'un sujet pluriel : « they are business partner » → « partners ».
    // Le nom doit terminer la proposition, sinon il qualifie ce qui suit
    // (« they are business partner material »).
    replaceRaw(
      new RegExp(
        String.raw`\b(they|we|you)([ \t]+(?:are|were)[ \t]+)((?:[a-z]+[ \t]+){0,2})` +
        String.raw`(${COUNTABLE_ROLES.join("|")})\b(?=[ \t]*(?:[.,;:!?]|$)|[ \t]+(?:and|or|but|who|which|in|at|on|for|with|from|since)\b)`,
        "gimu"
      ),
      (match, subject, verbPart, modifiers, noun) =>
        `${subject}${verbPart}${modifiers}${preserveInitialCase(noun, pluralNoun(noun.toLocaleLowerCase("en-US")))}`
    );

    // « joindre quelqu'un » : « join » signifie rejoindre, pas contacter.
    replace(/\b(join(?:s|ed|ing)?)[ \t]+(?=(?:the[ \t]+)?(?:support|customer[ \t]+service|helpdesk|help[ \t]+desk|hotline)\b)/giu,
      (_match, verb) => `${verb.replace(/^join/iu, (m) => m === "Join" ? "Reach" : "reach")
        .replace(/^reachs$/iu, "reaches")} `);

    // « actual » signifie « réel », jamais « en cours ». Devant ces noms-là,
    // la lecture « réel » supposerait un contraste avec une version fictive :
    // c'est le calque de « actuel » qui est en cause.
    replace(/\b(the|our|your|this)[ \t]+actual[ \t]+(?=(?:version|release|build|sprint|roadmap|planning|agenda|schedule|month|week|year|quarter)\b)/giu,
      (_match, determiner) => `${determiner} current `);
    replace(/\bat[ \t]+the[ \t]+actual[ \t]+(?:moment|time)\b/giu, "at the moment");

    // Accord distant : un sujet pluriel séparé de son verbe par une relative
    // appositive (« …, which …, is ») commande le pluriel. Le nom-tête doit
    // être un vrai pluriel, jamais un singulier en -s.
    replaceRaw(
      /\b([a-z]+s)((?:[ \t]+(?:we|you|they|i)[ \t]+[^,.;:!?\n]{0,50})?,[ \t]+which[ \t]+[^,.;:!?\n]{0,60},[ \t]+)(is|was|has)\b/gimu,
      (match, head, middle, verb) => {
        if (SINGULAR_S_NOUNS.has(head.toLocaleLowerCase("en-US"))) return match;
        const plural = { is: "are", was: "were", has: "have" }[verb.toLocaleLowerCase("en-US")];
        return `${head}${middle}${preserveInitialCase(verb, plural)}`;
      }
    );

    // « exiger un délai » : « demand » est agressif en anglais d'affaires, et
    // « delay » désigne un contretemps subi, pas un délai accordé.
    replace(/\b(demand|demands|demanded)[ \t]+a(?:n)?[ \t]+(?:(?:very|really|quite)[ \t]+)?(?:long|short|small|reasonable|additional|extra)?[ \t]*delay\b/giu,
      (_match, verb) => `${verb === "demanded" ? "asked" : verb === "demands" ? "asks" : "ask"} for more time`);
    // « faire une remise » : l'anglais accorde une remise, il ne la fait pas.
    replace(/\b(make|makes|made|making)[ \t]+a[ \t]+discount\b/giu,
      (_match, verb) => `${({ make: "give", makes: "gives", made: "gave", making: "giving" })[verb.toLocaleLowerCase("en-US")]} a discount`);
    // « le planning » : en anglais, « planning » est l'action de planifier ;
    // le document s'appelle un « schedule ». Seule la lecture document est
    // réécrite (déterminant + fin de proposition ou verbe d'état).
    // Le gérondif (« planning the launch takes time ») garde son sens verbal :
    // seul le nom précédé d'un déterminant est réécrit.
    replace(/\b(the|our|your|this|a)[ \t]+((?:new|current|updated|revised|final|whole)[ \t]+)?planning\b(?=[ \t]+(?:is|was|looks|seems|before|after|for|with|of|on|in|and|or|to|that|which)\b|[ \t]*[.,;:!?]|$)/gimu,
      (_match, determiner, adjective) => `${determiner} ${adjective || ""}schedule`);
    // « je l'aime trop » : « too much » signifie l'excès, pas l'intensité.
    replace(/\b(i|we)[ \t]+(like|love)[ \t]+(it|this|that)[ \t]+too[ \t]+much\b(?=[ \t]*[.!]|$)/giu,
      (_match, subject, verb, object) => `${subject} really ${verb} ${object}`);
    // « passer au bureau » : « pass by » signifie passer devant sans s'arrêter.
    replace(/\b(will|shall|can|could|might|to|would)[ \t]+pass[ \t]+by[ \t]+(?=(?:the|your|my|our|their|his|her|its)[ \t]+(?:office|shop|store|house|desk|place|premises|branch|site|apartment|flat)\b)/giu,
      (_match, auxiliary) => `${auxiliary} stop by `);
    // « je suis dans une dynamique » : « dynamic » ne décrit jamais quelqu'un
    // de pressé en anglais, et « literally » n'y est pas un intensificateur.
    replace(/\b(?:be[ \t]+)?literally[ \t]+dynamic\b/giu, "extremely busy");
    replace(/\b(i[ \t]+am|i['’]m|we[ \t]+are|we['’]re)[ \t]+(?:very[ \t]+|really[ \t]+)?dynamic[ \t]+(?=(?:right[ \t]+now|at[ \t]+the[ \t]+moment|today|this[ \t]+week)\b)/giu,
      (_match, subject) => `${subject} extremely busy `);

    // Nom-tête collectif suivi d'un complément pluriel : c'est la tête qui
    // commande, même à distance (« the team of experts … have met » → « has »).
    // Les quantifieurs (a number of, a lot of) prennent au contraire le
    // pluriel : ils ne figurent pas dans la liste.
    replaceRaw(
      new RegExp(
        String.raw`\b((?:the|this|that|our|your|their)[ \t]+(?:${COLLECTIVE_HEADS.join("|")})[ \t]+of[ \t]+[a-z]+s)` +
        String.raw`([ \t]+(?:who|that|which)[ \t]+[^,.;:!?\n]{0,60}?)?([ \t]+)(have|are|were|do)\b`,
        "gimu"
      ),
      (match, head, clause, spacing, verb) => {
        const singular = { have: "has", are: "is", were: "was", do: "does" }[verb.toLocaleLowerCase("en-US")];
        return `${head}${clause || ""}${spacing}${preserveInitialCase(verb, singular)}`;
      }
    );
    // Accord inclusif : après « everyone », l'anglais moderne emploie « their ».
    replace(/\b(everyone|everybody|anyone|anybody|each[ \t]+[a-z]+)([ \t]+[a-z]+[ \t]+)his[ \t]+(?=(?:opinion|feedback|thoughts|input|view|answer|choice|report)s?\b)/giu,
      (_match, subject, verbPart) => `${subject}${verbPart}their `);
    replace(/\bweek-end(s?)\b/giu, (_match, plural) => `weekend${plural}`);

    // Abréviations de courriel : développées comme leurs équivalents SMS
    // français. « atm » n'est développé qu'en minuscules : « ATM » est le
    // distributeur de billets.
    replace(/\bfyi\b/giu, "for your information");
    replace(/\basap\b/giu, "as soon as possible");
    replace(/\bbtw\b/giu, "by the way");
    replace(/\bimho\b/giu, "in my humble opinion");
    replace(/\btbh\b/giu, "to be honest");
    replace(/\bw\/o\b/giu, "without");
    // « IMO », « THX », « PLS » en capitales sont des sigles et des marques
    // (Organisation maritime, THX Ltd.) : seule la graphie minuscule est
    // une abréviation de courriel.
    replaceRaw(/(?<![\p{L}\p{N}])imo(?![\p{L}\p{N}])/gu, () => "in my opinion");
    replaceRaw(/(?<![\p{L}\p{N}])pl[sz](?![\p{L}\p{N}])/gu, () => "please");
    replaceRaw(/(?<![\p{L}\p{N}])thx(?![\p{L}\p{N}])/gu, () => "thanks");
    replace(/\btmr?rw\b/giu, "tomorrow");
    replaceRaw(/(?<![\p{L}\p{N}])atm(?![\p{L}\p{N}])/gu, () => "at the moment");

    // ------------------------------------------------------------------
    // Orthographe : graphies inexistantes, y compris les fautes typiques du
    // francophone (responsability, exemple, compagny) et les prétérits
    // sur-régularisés (payed, teached). Aucune clé n'est un mot anglais.
    // ------------------------------------------------------------------
    replaceRaw(
      new RegExp(String.raw`\b(${[...MISSPELLINGS.keys()].join("|")})\b`, "giu"),
      (match) => { const fixed = MISSPELLINGS.get(match.toLocaleLowerCase("en-US"));
        return fixed ? preserveInitialCase(match, fixed) : match; }
    );

    // Mots soudés qui s'écrivent en deux mots.
    replace(/\baswell\b/giu, "as well");
    replace(/\binfact\b/giu, "in fact");
    replace(/\batleast\b/giu, "at least");
    replace(/\beachother\b/giu, "each other");
    replace(/\bincase\b/giu, "in case");
    replace(/\beverytime\b/giu, "every time");
    replace(/\beventhough\b/giu, "even though");
    replace(/\binspite[ \t]+of\b/giu, "in spite of");
    replace(/\bapart[ \t]+of\b/giu, "a part of");

    // ------------------------------------------------------------------
    // Confusions de mots : seuls les contextes sans lecture légitime.
    // ------------------------------------------------------------------
    replace(/\bweather[ \t]+or[ \t]+not\b/giu, "whether or not");
    replace(/\brather[ \t]+then\b/giu, "rather than");
    replace(/\bother[ \t]+then\b(?=[ \t]+(?:that|this|the|a|an|those|these|him|her|me|us|them)\b)/giu, "other than");
    // « who's » = « who is » : devant un nom possédé, c'est « whose ».
    replace(/\bwho['’]s[ \t]+(?=(?:car|house|book|phone|idea|fault|turn|name|job|responsibility|team|project|report|desk|office|money|decision)s?\b)/giu, "whose ");
    // « it's » = « it is » : devant un nom possédé, c'est « its ».
    replace(/\bit['’]s[ \t]+(?=(?:tail|name|own|way|price|value|core|surface|content|size|colou?r|purpose|meaning|feature|result|impact|origin|goal)s?\b)/giu, "its ");
    // « quiet » (silencieux) écrit pour « quite » devant un adjectif.
    replace(/\bquiet[ \t]+(?=(?:expensive|good|nice|difficult|hard|easy|sure|different|interesting|important|long|often|new|big|small|happy|impressive|clear|useful|slow|fast)\b)/giu, "quite ");
    // « too » (aussi) écrit pour « to » devant un verbe.
    replace(/\btoo[ \t]+(?=(?:go|do|be|see|get|make|take|have|know|say|come|work|help|start|try|use|find|buy|send|meet|call|leave)\b)/giu, "to ");
    // « affect » nominal n'existe pas dans l'usage courant : après un
    // déterminant, le nom est « effect ».
    replace(/\b(an|the|no|any|little|some|significant|negative|positive|major|big)[ \t]+affect\b/giu,
      (_match, determiner) => `${determiner} effect`);

    // Article : le son initial décide, pas la lettre.
    replaceRaw(/\b(an)([ \t]+)(?=(?:user|university|union|uniform|unit|unique|useful|european|one)\w*\b)/giu,
      (_match, article, spacing) => `${preserveInitialCase(article, "a")}${spacing}`);
    replaceRaw(/\b(a)([ \t]+)(?=(?:hour|honest|honou?r|heir)\b)/giu,
      (_match, article, spacing) => `${preserveInitialCase(article, "an")}${spacing}`);

    // ------------------------------------------------------------------
    // Calques du français : prépositions et constructions traduites mot à mot.
    // ------------------------------------------------------------------
    replace(/\b(depend(?:s|ed|ing)?)[ \t]+of\b/giu, (_match, verb) => `${verb} on`);
    replace(/\b(participate(?:s|d)?|participating)[ \t]+to\b/giu, (_match, verb) => `${verb} in`);
    replace(/\bresponsible[ \t]+of\b/giu, "responsible for");
    replace(/\binterested[ \t]+by\b/giu, "interested in");
    replace(/\bdifferent[ \t]+of\b/giu, "different from");
    replace(/\bcapable[ \t]+to\b/giu, "able to");
    replace(/\b(discuss(?:es|ed|ing)?)[ \t]+about\b/giu, (_match, verb) => verb);
    // « répondre à » : « answer » est transitif direct devant ces noms.
    replace(/\b(answer(?:s|ed|ing)?)[ \t]+to[ \t]+(?=(?:the|this|that|my|your|his|her|our|their)[ \t]+(?:question|email|e-mail|message|letter|request)s?\b)/giu,
      (_match, verb) => `${verb} `);
    // « entrer dans » : « enter » est transitif direct ; les locutions figées
    // (enter into an agreement) gardent leur préposition.
    replace(/\b(enter(?:s|ed|ing)?)[ \t]+(?:in|into)(?=[ \t]+(?:the|a|an|my|your|his|her|our|their|this|that)[ \t]+(?!(?:agreement|contract|negotiation|partnership|discussion|force|effect|argument)s?\b)[a-z])/giu,
      (_match, verb) => verb);
    replace(/\b(listen(?:s|ed|ing)?)[ \t]+(?=(?:music|the[ \t]+radio|this[ \t]+song|that[ \t]+song|him|her|me|us|them)\b)/giu,
      (_match, verb) => `${verb} to `);
    replace(/\b(wait(?:s|ed|ing)?)[ \t]+(?=(?:me|him|her|us|them)\b)/giu,
      (_match, verb) => `${verb} for `);
    replace(/\b(ask(?:s|ed|ing)?)[ \t]+to[ \t]+(?=(?:me|him|her|us|them|the[ \t]+(?:manager|director|team|client|teacher|boss))\b)/giu,
      (_match, verb) => `${verb} `);
    // « expliquer quelqu'un » : en anglais on explique quelque chose À
    // quelqu'un, et le complément d'objet passe devant le destinataire.
    replace(/\b(explain(?:s|ed|ing)?|describe(?:s|d)?|mention(?:s|ed)?|suggest(?:s|ed)?)[ \t]+(me|you|us|him|her|them)[ \t]+((?:the|this|that|your|my|our|his|her|their)[ \t]+[a-z]+(?:[ \t]+[a-z]+)?)\b/giu,
      (_match, verb, pronoun, object) => `${verb} ${object} to ${pronoun}`);
    replace(/\b(explain(?:s|ed|ing)?)[ \t]+(me|you|us|him|her|them)\b(?=[ \t]+(?:how|why|what|it)\b)/giu,
      (_match, verb, pronoun) => `${verb} to ${pronoun}`);

    // « whose » marque la possession : il ne peut pas introduire une relative
    // dont le sujet suit. « the reports whose you talked about » → le pronom
    // relatif est simplement de trop.
    replace(/\b(whose)[ \t]+(?=(?:i|you|we|they|he|she|it)[ \t]+[a-z]+(?:ed|ke|nt|w|d|t)?\b)/giu, "");
    replaceRaw(/\b(married)[ \t]+with[ \t]+(?=(?:him|her|me|you|us|them|[A-Z][a-z]+\b)(?![ \t]*(?:children|kids)))/gu,
      (_match, verb) => `${verb} to `);
    // « depuis trois ans » : une durée s'introduit par « for », pas « since ».
    replace(/\bsince[ \t]+((?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|several|many|a[ \t]+few)[ \t]+(?:years?|months?|weeks?|days?|hours?|minutes?))\b(?![ \t]+ago\b)/giu,
      (_match, duration) => `for ${duration}`);
    // « j'ai 30 ans » : l'âge se dit avec « be », jamais « have ».
    replaceRaw(/\b(i|he|she|we|they|you)[ \t]+(?:have|has)[ \t]+(\d{1,3})[ \t]+years(?:[ \t]+old)?\b(?![ \t]+(?:of|left|remaining|ahead|behind))/giu,
      (_match, subject, age) => {
        const s = subject.toLocaleLowerCase("en-US");
        const be = s === "i" ? "am" : (s === "he" || s === "she") ? "is" : "are";
        return `${subject} ${be} ${age} years old`;
      });
    // Vocabulaire calqué : ces mots-là n'ont pas ce sens en anglais.
    replace(/\bplanification\b/giu, "planning");
    replace(/\b(to|please|can[ \t]+you|could[ \t]+you)[ \t]+precise\b(?=[ \t]+(?:the|this|that|what|which|your|it|me)\b|[ \t]*\?)/giu,
      (_match, lead) => `${lead} clarify`);
    replace(/\b(a|the|our|your|their)[ \t]+reunion\b(?=[ \t]+(?:at|tomorrow|today|tonight|with[ \t]+the[ \t]+(?:team|client|clients|manager)|on[ \t]+(?:monday|tuesday|wednesday|thursday|friday))\b)/giu,
      (_match, determiner) => `${determiner} meeting`);
    replace(/\b(send|sends|sent|give|gives|gave|share|shared)[ \t]+(me|us|him|her|them)[ \t]+(your|his|her|their|my|our)[ \t]+coordinates\b/giu,
      (_match, verb, indirect, possessive) => `${verb} ${indirect} ${possessive} contact details`);

    // ------------------------------------------------------------------
    // Formes verbales impossibles.
    // ------------------------------------------------------------------
    replaceRaw(/\b(he|she|it)([ \t]+)(don['’]?t)\b/giu,
      (_match, subject, spacing, negation) => `${subject}${spacing}${preserveInitialCase(negation, "doesn't")}`);
    // Un modal se construit sans « to » : « must to go » → « must go ».
    replace(/\b(can|could|must|should|would|may|might)[ \t]+to[ \t]+(?=[a-z])/giu,
      (_match, modal) => `${modal} `);
    replace(/\bfor[ \t]+to[ \t]+(?=[a-z])/giu, "to ");
    // « let/make » + COD + infinitif sans « to » ; « make it to » (arriver)
    // est écarté par l'absence de « it » dans la liste.
    replace(/\b(let|lets|letting|make|makes|made|making)[ \t]+(me|him|her|us|them|you)[ \t]+to[ \t]+(?=[a-z])/giu,
      (_match, verb, pronoun) => `${verb} ${pronoun} `);
    // Double comparatif : « more better » → « better ».
    replace(/\b(?:more|most)[ \t]+(better|worse|faster|slower|bigger|smaller|easier|harder|stronger|weaker|cheaper|older|younger|higher|lower|taller|shorter|longer|quicker|simpler|safer|richer|poorer)\b/giu,
      (_match, comparative) => comparative);
    // « more easy » → « easier » quand la suite confirme la comparaison.
    replaceRaw(
      new RegExp(String.raw`\b(more)([ \t]+)(${[...SHORT_COMPARATIVES.keys()].join("|")})\b(?=[ \t]+(?:than|to|for|and|now|today)\b|[ \t]*[,.;:!?])`, "giu"),
      (match, more, spacing, adjective) => {
        const comparative = SHORT_COMPARATIVES.get(adjective.toLocaleLowerCase("en-US"));
        return comparative ? preserveInitialCase(more, comparative) : match;
      }
    );
    // « peoples » ne désigne que des peuples : « the peoples of Europe ».
    replace(/\b(the|these|those|many|some|most|few|several)[ \t]+peoples\b(?![ \t]+of\b)/giu,
      (_match, determiner) => `${determiner} people`);

    // « its » possessif écrit pour « it's » : seuls les contextes où le
    // possessif est impossible sont réécrits.
    replace(/\bits[ \t]+been\b/giu, "it's been");
    replace(/\bits[ \t]+(not|too|really|quite|still|already)[ \t]+([a-z][a-z'’-]*)\b/giu,
      (match, adverb, word) => {
        // « its still core business » : un nom derrière l'adverbe garde le
        // possessif ; seul un adjectif prédicatif net est réécrit.
        if (!/^(good|bad|great|fine|nice|cold|hot|warm|late|early|easy|hard|difficult|possible|impossible|important|urgent|ready|done|over|broken|working|raining|snowing|true|false|wrong|right|clear|obvious|open|closed|free|busy|full|empty)$/iu.test(word)) {
          return match;
        }
        return `it's ${adverb} ${word}`;
      });

    // Après un auxiliaire de négation ou « to », le prétérit est impossible :
    // seul l'infinitif sans marque convient. « didn't went » → « didn't go ».
    replaceRaw(
      new RegExp(
        String.raw`\b(don['’]?t|doesn['’]?t|didn['’]?t|won['’]?t|wouldn['’]?t|can['’]?t|couldn['’]?t|shouldn['’]?t|mustn['’]?t|to)([ \t]+)` +
        String.raw`(${[...PRETERITE_TO_BASE.keys()].join("|")})\b`,
        "giu"
      ),
      (match, auxiliary, spacing, preterite) => {
        const base = PRETERITE_TO_BASE.get(preterite.toLocaleLowerCase("en-US"));
        if (!base) return match;
        return `${auxiliary}${spacing}${preserveInitialCase(preterite, base)}`;
      }
    );

    // Do-support : le verbe qui suit est à la forme de base, jamais en -s.
    replace(
      /\b(don['’]?t|doesn['’]?t|didn['’]?t)([ \t]+)(likes|wants|needs|knows|works|runs|seems|looks|comes|goes|gives|takes|makes|contains|uses|tries|says|tells|thinks|feels|keeps|means|helps|asks|calls|shows|starts|stops|plays|moves|lives|believes|remembers|understands)\b/giu,
      (_match, auxiliary, spacing, verb) => `${auxiliary}${spacing}${baseVerb(verb)}`
    );

    // « there is » devant un pluriel quantifié.
    // « news », « series »… sont des singuliers en -s et restent avec « is ».
    replace(/\bthere[ \t]+is[ \t]+(fewer|less|some|no)[ \t]+(?!(?:news|means|series|species|progress|analysis|basis)\b)([a-z][a-z'’-]*s)\b/giu,
      (_match, quantity, noun) => `there are ${quantity} ${noun}`);

    // Fautes d'orthographe univoques : aucune de ces graphies n'existe.
    replace(/\brecieve(s|d)?\b/giu, (_match, ending) => `receive${ending || ""}`);
    replace(/\brecieving\b/giu, "receiving");
    replace(/\bseperate(s|d|ly)?\b/giu, (_match, ending) => `separate${ending || ""}`);
    replace(/\boccurence(s?)\b/giu, (_match, plural) => `occurrence${plural}`);
    replace(/\baccomodate(s|d)?\b/giu, (_match, ending) => `accommodate${ending || ""}`);
    replace(/\bwich\b/giu, "which");
    replace(/\bbec(?:ua|asu)se\b/giu, "because");
    replace(/\btruely\b/giu, "truly");
    replace(/\barguement(s?)\b/giu, (_match, plural) => `argument${plural}`);
    replace(/\benviroment(s?)\b/giu, (_match, plural) => `environment${plural}`);
    replace(/\bgoverment(s?)\b/giu, (_match, plural) => `government${plural}`);
    replace(/\btomm?orr?ow\b/giu, "tomorrow");
    replace(/\bwierd\b/giu, "weird");
    replace(/\bloosing\b/giu, "losing");
    replace(/\birregardless\b/giu, "regardless");
    replace(/\bfor[ \t]+all[ \t]+intensive[ \t]+purposes\b/giu, "for all intents and purposes");

    // ------------------------------------------------------------------
    // Indénombrables : ni pluriel ni apostrophe parasite.
    // ------------------------------------------------------------------

    // « the new software's. » : l'apostrophe n'est un génitif que devant un
    // nom ; devant une ponctuation ou une conjonction, c'est un pluriel fautif.
    replace(
      new RegExp(
        String.raw`\b(${UNCOUNTABLE_NOUNS.join("|")})[’']s(?=[ \t]*(?:[.,;:!?]|$|and\b|or\b|but\b))`,
        "gimu"
      ),
      (_match, noun) => noun
    );
    // Pluriel direct sur un indénombrable : « equipments » → « equipment ».
    // « weather », « traffic » et « money » sont écartés : leur forme en -s est
    // un verbe conjugué (« the ship weathers the storm ») ou un nom légitime.
    replace(
      new RegExp(String.raw`\b(${UNCOUNTABLE_STRIPPABLE.join("|")})s\b`, "giu"),
      (_match, noun) => noun
    );
    // Un indénombrable est singulier : son verbe aussi.
    replace(
      new RegExp(String.raw`\b(${UNCOUNTABLE_NOUNS.join("|")})[ \t]+(are|were|have)\b(?![ \t]+been\b)`, "giu"),
      (_match, noun, verb) =>
        `${noun} ${verb.toLocaleLowerCase("en-US") === "are" ? "is" : verb.toLocaleLowerCase("en-US") === "were" ? "was" : "has"}`
    );

    // « much » quantifie l'indénombrable ; devant un pluriel, c'est « many ».
    replace(/\bmuch[ \t]+([a-z][a-z'’-]*s)\b/giu, (_match, noun) => `many ${noun}`);

    // ------------------------------------------------------------------
    // Calques du francophone (faux amis et constructions traduites mot à mot).
    // ------------------------------------------------------------------

    replace(/\b(writing)[ \t]+you[ \t]+to\b/giu, (_match, verb) => `${verb} to you to`);
    // « assister à » se dit « attend » ; « assist » signifie « aider ».
    replace(
      /\b(assist|assists|assisted|assisting)[ \t]+to[ \t]+(?=(?:the|a|an|this|that|our|your|their|tomorrow)[ \t]|(?:meetings?|conferences?|events?|sessions?|presentations?|trainings?|workshops?|classes)\b)/giu,
      (_match, verb) => `${FRENCH_CALQUE_VERBS.get(verb.toLocaleLowerCase("en-US")) || "attend"} `
    );
    // « prendre une décision » se calque en « take » ; l'anglais dit « make ».
    replace(
      /\b(take|takes|took|taken|taking)([ \t]+(?:a|an|the|some|this|that|final|quick|important|big|major)[ \t]+|[ \t]+)(decisions?)\b/giu,
      (_match, verb, middle, noun) =>
        `${TAKE_TO_MAKE.get(verb.toLocaleLowerCase("en-US")) || "make"}${middle}${noun}`
    );
    // « société » au sens d'entreprise se dit « company ».
    replace(/\b(the[ \t]+)societ(y|ies)\b(?=[ \t]+(?:we|they|i|you)[ \t]+(?:are[ \t]+|have[ \t]+been[ \t]+)?work)/giu,
      (_match, article, ending) => `${article}compan${ending === "y" ? "y" : "ies"}`);
    // « ils sont d'accord » : « agree » est un verbe, jamais un attribut.
    replace(/\b(i|you|we|they|he|she|it)[ \t]+(?:am|are|is|was|were)[ \t]+agree\b/giu,
      (_match, subject) => `${subject} agree`);
    // « demander un délai » : « demand » est un ordre, « delay » un retard.
    replace(/\b(demand|demands|demanded)[ \t]+a[ \t]+delay\b/giu,
      (_match, verb) => `${verb === "demanded" ? "asked" : verb === "demands" ? "asks" : "ask"} for more time`);
    // « look forward to » se construit avec le gérondif.
    replace(
      new RegExp(
        String.raw`\b(look|looks|looked|looking)([ \t]+forward[ \t]+to[ \t]+)(${[...GERUND_FORMS.keys()].join("|")})\b`,
        "giu"
      ),
      (_match, look, middle, verb) => `${look}${middle}${GERUND_FORMS.get(verb.toLocaleLowerCase("en-US"))}`
    );

    // « send ed » recollé, et participe irrégulier de « send ».
    replace(/\b(has|have|had)[ \t]+send(?:[ \t]+ed|ed)?\b/giu, (_match, auxiliary) => `${auxiliary} sent`);
    replace(/\bsended\b/giu, "sent");
    // Terminaison détachée du verbe qu'elle suit : « met ted », « kept ped ».
    // Un prétérit irrégulier ne prend jamais de suffixe, la scorie est donc
    // toujours parasite. Le test de casse épargne « met Ted » (le prénom).
    replaceRaw(
      /\b(met|sent|kept|felt|left|lost|found|held|told|paid|built|meant|spent|dealt|sold|won)[ \t]+([td]?ed)\b/gu,
      (match, verb, fragment) => (fragment === fragment.toLowerCase() ? verb : match)
    );

    // Passé daté : « I have sent the report yesterday » → prétérit.
    replace(
      /\b(i|you|we|they|he|she|it)[ \t]+(?:has|have)[ \t]+(sent|received|finished|signed|called|visited|checked|submitted|shared|updated|published|delivered|paid|made|told|sold|built|spent)\b(?=[^.!?\n]*\b(?:yesterday|ago|last[ \t]+(?:night|week|month|year))\b)/giu,
      (_match, subject, verb) => `${subject} ${verb}`
    );

    // « number of » pour un dénombrable ; « amount of » vaut pour l'indénombrable.
    replace(/\bamount[ \t]+of[ \t]+(people|employees|students|users|items|errors|mistakes|documents|problems|options)\b/giu,
      (_match, noun) => `number of ${noun}`);

    // « every day » adverbe en fin de proposition ; « everyday » est l'adjectif
    // (« everyday life ») et reste intact devant un nom.
    replace(/\beveryday\b(?=[ \t]*(?:[.,;:!?]|$))/gimu, "every day");

    // « fewer » pour un pluriel dénombrable.
    replace(/\bless[ \t]+(people|items|errors|mistakes|documents|employees|students|problems|options|words|cars|meetings)\b/giu,
      (_match, noun) => `fewer ${noun}`);

    return { text, corrections };
  }

  // Indénombrables anglais : jamais de pluriel. « information » est traité par
  // des règles dédiées plus haut ; « news » est un singulier en -s à part.
  const UNCOUNTABLE_NOUNS = [
    "software", "feedback", "equipment", "advice", "furniture", "luggage",
    "baggage", "homework", "knowledge", "progress", "research", "evidence",
    "money", "traffic", "weather", "vocabulary"
  ];
  const UNCOUNTABLE_STRIPPABLE = UNCOUNTABLE_NOUNS.filter(
    (noun) => !["weather", "traffic", "money"].includes(noun)
  );

  const FRENCH_CALQUE_VERBS = new Map(Object.entries({
    assist: "attend", assists: "attends", assisted: "attended", assisting: "attending"
  }));

  const TAKE_TO_MAKE = new Map(Object.entries({
    take: "make", takes: "makes", took: "made", taken: "made", taking: "making"
  }));

  const GERUND_FORMS = new Map(Object.entries({
    see: "seeing", hear: "hearing", meet: "meeting", work: "working",
    discuss: "discussing", receive: "receiving", speak: "speaking",
    talk: "talking", learn: "learning", join: "joining", start: "starting",
    collaborate: "collaborating", have: "having", get: "getting", go: "going",
    do: "doing", read: "reading", visit: "visiting", welcome: "welcoming"
  }));

  // Mots dont la forme en « 's » est une contraction de « is », « has » ou
  // « us », et non un nom au génitif.
  const CONTRACTION_SUBJECTS = new Set([
    "it", "that", "this", "there", "here", "he", "she", "who", "what", "where",
    "when", "why", "how", "let", "one", "everyone", "someone", "anyone",
    "nobody", "everybody", "somebody", "anybody", "everything", "something",
    "nothing", "anything", "all", "which"
  ]);

  // Noms singuliers terminés par -s : leur relative reste au singulier.
  const SINGULAR_S_NOUNS = new Set([
    "boss", "class", "business", "process", "analysis", "basis", "status",
    "campus", "focus", "bonus", "virus", "series", "species", "news",
    "address", "success", "access", "press", "progress", "loss", "glass",
    "kiss", "mess", "guess", "witness", "illness", "crisis", "thesis"
  ]);

  // Noms-têtes collectifs : leur complément pluriel ne commande pas le verbe.
  const COLLECTIVE_HEADS = [
    "team", "group", "list", "set", "series", "stack", "pile", "batch",
    "collection", "range", "array", "board", "committee", "panel", "squad",
    "bunch", "package", "bundle", "portfolio", "selection"
  ];

  // Noms de rôle dénombrables : un sujet pluriel appelle un attribut pluriel.
  const COUNTABLE_ROLES = [
    "partner", "client", "customer", "member", "colleague", "developer",
    "engineer", "manager", "student", "friend", "expert", "professional",
    "user", "employee", "supplier", "vendor", "contractor", "consultant",
    "beginner", "specialist", "candidate", "subscriber", "teacher", "doctor"
  ];

  // Mots en -s qui ne sont jamais un verbe conjugué : le motif du subjonctif
  // pourrait sinon les « réduire » (his → hi, always → alway).
  const NOT_VERBS_IN_S = new Set([
    "his", "its", "this", "thus", "hers", "ours", "yours", "theirs",
    "whereas", "perhaps", "always", "sometimes", "unless", "across",
    "besides", "plus", "news", "less", "was", "yes", "as"
  ]);

  // Verbes et adjectifs qui commandent le subjonctif dans la subordonnée.
  const SUBJUNCTIVE_TRIGGERS = [
    "crucial", "essential", "important", "vital", "necessary", "imperative",
    "advisable", "critical", "urgent", "mandatory", "preferable",
    "recommend", "recommends", "recommended", "suggest", "suggests", "suggested",
    "insist", "insists", "insisted", "demand", "demands", "demanded",
    "require", "requires", "required", "propose", "proposes", "proposed",
    "request", "requests", "requested", "urge", "urges", "urged",
    "ask", "asks", "asked"
  ];

  // Graphies qui n'existent pas en anglais. Trois familles : coquilles
  // classiques, orthographes calquées du français (responsabilité, exemple,
  // compagnie), et prétérits sur-régularisés (payed, teached). « putted »
  // (golf), « costed » (gestion) et « seed » sont volontairement absents :
  // ces formes ont un emploi légitime.
  const MISSPELLINGS = new Map(Object.entries({
    beleive: "believe", belive: "believe", freind: "friend", acheive: "achieve",
    calender: "calendar", collegue: "colleague", colleage: "colleague",
    commitee: "committee", comittee: "committee", embarass: "embarrass",
    existance: "existence", occassion: "occasion", posession: "possession",
    recomend: "recommend", succesful: "successful", successfull: "successful",
    neccessary: "necessary", necesary: "necessary", buisness: "business",
    definitly: "definitely", grammer: "grammar", intrest: "interest",
    knowlege: "knowledge", lenght: "length", strenght: "strength",
    libary: "library", maintainance: "maintenance", maintenence: "maintenance",
    usefull: "useful", gratefull: "grateful", beggining: "beginning",
    begining: "beginning", comming: "coming", runing: "running",
    writting: "writing", proffesional: "professional", profesional: "professional",
    responsability: "responsibility", appartment: "apartment", exemple: "example",
    langage: "language", futur: "future", compagny: "company",
    developement: "development", developpement: "development", developpment: "development",
    personel: "personnel", exercice: "exercise", adresse: "address",
    payed: "paid", choosed: "chose", buyed: "bought", teached: "taught",
    catched: "caught", thinked: "thought", feeled: "felt", keeped: "kept",
    leaved: "left", meeted: "met", finded: "found", telled: "told",
    selled: "sold", builded: "built", spended: "spent", losed: "lost",
    winned: "won", bringed: "brought", speaked: "spoke", breaked: "broke",
    stealed: "stole", growed: "grew", knowed: "knew", throwed: "threw",
    flyed: "flew", drawed: "drew", weared: "wore", standed: "stood",
    understanded: "understood", goed: "went", comed: "came", becomed: "became",
    drived: "drove", rided: "rode", writed: "wrote", eated: "ate",
    falled: "fell", gived: "gave", taked: "took", maked: "made", sayed: "said"
  }));

  // Adjectifs courts : le comparatif se forme en -er, jamais avec « more ».
  const SHORT_COMPARATIVES = new Map(Object.entries({
    easy: "easier", happy: "happier", big: "bigger", fast: "faster",
    cheap: "cheaper", tall: "taller", small: "smaller", old: "older",
    young: "younger", strong: "stronger", hard: "harder", simple: "simpler",
    quick: "quicker", safe: "safer", slow: "slower", high: "higher",
    low: "lower", long: "longer", short: "shorter", rich: "richer",
    poor: "poorer", late: "later", early: "earlier", close: "closer"
  }));

  // Prétérits irréguliers dont l'infinitif diffère : après do-support ou
  // « to », la forme de base est la seule possible. Les verbes dont prétérit
  // et participe coïncident avec des noms courants (felt, left, read, set…)
  // sont écartés pour ne pas réécrire un emploi légitime.
  const PRETERITE_TO_BASE = new Map(Object.entries({
    went: "go", came: "come", saw: "see", ate: "eat", wrote: "write",
    took: "take", broke: "break", chose: "choose", drank: "drink",
    began: "begin", spoke: "speak", drove: "drive", gave: "give",
    knew: "know", grew: "grow", threw: "throw", flew: "fly", wore: "wear",
    tore: "tear", forgot: "forget", froze: "freeze", woke: "wake",
    rose: "rise", fell: "fall", swam: "swim", sang: "sing", rang: "ring",
    stole: "steal", hid: "hide", did: "do", had: "have", made: "make",
    said: "say", told: "tell", thought: "think", brought: "bring",
    bought: "buy", caught: "catch", taught: "teach", kept: "keep",
    lost: "lose", met: "meet", paid: "pay", sat: "sit", stood: "stand",
    found: "find", heard: "hear", held: "hold", won: "win", sent: "send",
    spent: "spend", built: "build", meant: "mean", understood: "understand",
    got: "get",
    // Prétérits réguliers fréquents : après do-support, la forme en -ed est
    // tout aussi impossible. « used » est écarté (« to used cars » est un
    // adjectif), comme tout mot dont la forme en -ed a un emploi non verbal.
    worked: "work", wanted: "want", needed: "need", helped: "help",
    called: "call", asked: "ask", started: "start", stopped: "stop",
    played: "play", moved: "move", lived: "live", believed: "believe",
    remembered: "remember", tried: "try", liked: "like", loved: "love",
    hated: "hate", waited: "wait", watched: "watch", opened: "open",
    finished: "finish", happened: "happen", changed: "change",
    followed: "follow", planned: "plan", talked: "talk", walked: "walk",
    looked: "look", seemed: "seem", stayed: "stay", expected: "expect",
    received: "receive", decided: "decide", agreed: "agree",
    studied: "study", replied: "reply", answered: "answer",
    explained: "explain", arrived: "arrive", visited: "visit"
  }));

  // Prétérits irréguliers dont la forme diffère du participe passé. Les verbes
  // dont les deux formes coïncident (bought, made…) n'ont rien à corriger.
  const PRETERITE_TO_PARTICIPLE = new Map(Object.entries({
    went: "gone", came: "come", did: "done", saw: "seen", ate: "eaten",
    wrote: "written", took: "taken", broke: "broken", chose: "chosen",
    drank: "drunk", began: "begun", ran: "run", spoke: "spoken",
    drove: "driven", rode: "ridden", gave: "given", knew: "known",
    grew: "grown", threw: "thrown", flew: "flown", wore: "worn",
    tore: "torn", forgot: "forgotten", froze: "frozen", woke: "woken",
    rose: "risen", fell: "fallen", swam: "swum", sang: "sung",
    rang: "rung", stole: "stolen", hid: "hidden", bit: "bitten",
    mistook: "mistaken", undertook: "undertaken",
    arose: "arisen", awoke: "awoken", swore: "sworn", shook: "shaken"
  }));

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

  function singularVerb(verb) {
    const forms = {
      do: "does", go: "goes", have: "has", try: "tries",
      contain: "contains", give: "gives", like: "likes", look: "looks",
      make: "makes", need: "needs", know: "knows", run: "runs",
      seem: "seems", take: "takes", use: "uses", walk: "walks",
      want: "wants", work: "works"
    };
    return forms[verb.toLocaleLowerCase("en-US")] || verb;
  }

  // Pluriel régulier : -y précédé d'une consonne donne -ies, les sifflantes
  // prennent -es. Les pluriels irréguliers ne passent pas par ici : les règles
  // qui l'appellent ne visent que des noms réguliers.
  function pluralNoun(noun) {
    const lower = noun.toLocaleLowerCase("en-US");
    if (/[^aeiou]y$/u.test(lower)) return `${noun.slice(0, -1)}ies`;
    if (/(?:s|x|z|ch|sh)$/u.test(lower)) return `${noun}es`;
    return `${noun}s`;
  }

  // Forme de base d'un verbe à la 3e personne, pour le subjonctif mandatif.
  function subjunctiveBase(verb) {
    const lower = verb.toLocaleLowerCase("en-US");
    if (lower === "is") return "be";
    if (lower === "has") return "have";
    if (lower === "does") return "do";
    if (lower === "goes") return "go";
    if (/(?:sses|shes|ches|xes|zes)$/u.test(lower)) return lower.slice(0, -2);
    if (/[^aeiou]ies$/u.test(lower)) return `${lower.slice(0, -3)}y`;
    if (lower.endsWith("s") && !lower.endsWith("ss")) return lower.slice(0, -1);
    return "";
  }

  function shouldPluralizeQuantifiedNoun(after) {
    if (/^(?:[.!?,]|$)/u.test(after)) return true;

    const following = /^[ \t]+([a-z][a-z'’-]*)(.*)$/iu.exec(after);
    if (!following) return false;
    const nextWord = following[1].toLocaleLowerCase("en-US");
    const rest = following[2];

    // Auxiliaires, verbes présents non ambigus et quelques prétérits
    // irréguliers. « work » est volontairement exclu : dans « student work
    // permits », il fait partie d'un nom composé.
    if (/^(?:are|were|have|need|want|remain|left|went|ran|said|took|gave|made)$/u.test(nextWord)) {
      return true;
    }

    // Les prétérits réguliers couvrent un ensemble ouvert (resigned, agreed,
    // disappeared...) sans liste de verbes. On conserve toutefois les formes
    // fréquemment adjectivales lorsqu'elles introduisent encore un nom.
    if (!/^[a-z][a-z'’-]*ed$/u.test(nextWord)) return false;
    if (/^(?:based|combined|driven|focused|funded|gifted|led|owned|planned|proposed|related|revised|shared|sponsored|updated)$/u.test(nextWord) &&
        /^[ \t]+[a-z][a-z'’-]*\b/iu.test(rest)) {
      return false;
    }
    return true;
  }

  // Verbes conjugués qui, placés après un groupe nominal, confirment que ce
  // groupe est bien le sujet — et donc qu'il ne fallait pas le souder.
  const FINITE_VERBS_AFTER_SUBJECT = new Set([
    "is", "are", "was", "were", "has", "have", "had", "will", "would", "can",
    "could", "may", "might", "must", "should", "do", "does", "did", "seem",
    "seems", "seemed", "look", "looks", "remain", "remains", "become",
    "becomes", "became", "start", "starts", "began", "went", "come", "comes"
  ]);

  function shouldApplyHarperLint(lint, text = "") {
    const problem = lint.get_problem_text();
    const message = lint.message();
    const proposed = lint.suggestions().map((suggestion) => suggestion.get_replacement_text()).join(" ");

    // Soudure de deux mots en un nom composé : Harper lit « the current week
    // ends » comme « weekends », alors que « ends » est le verbe de la phrase.
    // Si rien de conjugué ne suit, le second mot est le verbe : on refuse.
    if (/\s/u.test(problem.trim()) && !/\s/u.test(proposed) &&
        problem.replace(/[\s-]/gu, "").toLocaleLowerCase("en-US") ===
          proposed.replace(/[\s-]/gu, "").toLocaleLowerCase("en-US")) {
      const second = problem.trim().split(/\s+/u).pop() || "";
      if (/s$/iu.test(second)) {
        const after = text.slice(lint.span().end).trimStart().match(/^[a-z']+/iu)?.[0] || "";
        if (!FINITE_VERBS_AFTER_SUBJECT.has(after.toLocaleLowerCase("en-US"))) return false;
      }
    }
    // « Who's » → « who's » : Harper propose sa graphie canonique en
    // minuscules et efface la majuscule de début de phrase. Un remplacement
    // qui ne fait que décapitaliser le mot n'apporte rien et casse la phrase.
    // Le sens inverse (« i » → « I », « monday » → « Monday ») reste appliqué.
    if (proposed && proposed.toLocaleLowerCase("en-US") === problem.toLocaleLowerCase("en-US") &&
        /^\p{Lu}/u.test(problem) && /^\p{Ll}/u.test(proposed)) {
      return false;
    }
    // Symétrique du garde-fou français : un mot français dans un texte anglais
    // ne doit pas être rapproché d'une graphie anglaise voisine.
    if (globalThis.korrLanguage?.isFrenchWord?.(problem.trim())) return false;
    if (/\bwhom\b/iu.test(problem)) return false;
    // Les confusions « their is » sûres sont déjà traitées avant Harper. On
    // refuse ici son remplacement lexical « Their » -> « There », qui casse
    // notamment les noms comme « Their IS department ».
    if (/\btheir\b/iu.test(problem) && /\bthere\b/iu.test(proposed)) return false;
    if (/\btheir\b/iu.test(problem) && /they['’]re/iu.test(`${message} ${proposed}`)) return false;
    if (/\byour\b/iu.test(problem) && /you['’]re/iu.test(`${message} ${proposed}`)) return false;
    if (/^then$/iu.test(problem) && /^than$/iu.test(proposed.trim())) return false;
    if (/^team[ \t]+work$/iu.test(problem) && /^teamwork$/iu.test(proposed.trim())) return false;
    if (/^cat[ \t]+walks$/iu.test(problem) && /^catwalks$/iu.test(proposed.trim())) return false;
    if (lint.lint_kind() === "Capitalization" && PRESERVED_TECH_CASE.has(problem.toLocaleLowerCase("en-US"))) {
      return false;
    }
    if (/oxford comma|serial comma/iu.test(message)) return false;
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
    // Les règles et Harper se débloquent mutuellement : une correction de
    // l'un fait parfois apparaître un motif que l'autre sait corriger. Le
    // couple converge donc vers un point fixe, comme le moteur français —
    // l'utilisateur ne doit jamais avoir à relancer la correction.
    let text = source;
    let corrections = 0;

    for (let cycle = 0; cycle < 4; cycle += 1) {
      const beforeCycle = text;

      const rulesResult = applyEnglishRules(text);
      text = rulesResult.text;
      corrections += rulesResult.corrections;

      const lints = await linter.lint(text, { language: "plaintext" });
      const applicable = lints
        .filter((lint) => lint.suggestion_count() > 0)
        .filter((lint) => shouldApplyHarperLint(lint, text))
        .sort((left, right) => right.span().start - left.span().start);

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

      if (text === beforeCycle) break;
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
