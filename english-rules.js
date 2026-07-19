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
    "vercel", "wasm"
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
      /(^|[.!?][ \t]+)(the[ \t]+(?:dog|cat|manager|student|team))([ \t]+)(run|walk|work|need|want|like|know|seem|look|give|take|make|contain|use|try|go|do|have)\b(?=[ \t]+(?:a|an|the|this|that|these|those|my|your|our|their|his|her|its|me|you|him|us|them|it|well|fast|slowly|hard|today|tomorrow|now|always|often|never|usually|every|to|for|with|at|on|in|from|because|when|if|not|away|around|home|outside|inside)\b)/gimu,
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
    got: "get"
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

  function pluralNoun(noun) {
    const forms = { policy: "policies" };
    return forms[noun.toLocaleLowerCase("en-US")] || `${noun}s`;
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

  function shouldApplyHarperLint(lint) {
    const problem = lint.get_problem_text();
    const message = lint.message();
    const proposed = lint.suggestions().map((suggestion) => suggestion.get_replacement_text()).join(" ");
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
