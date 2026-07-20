// Traduction de l'interface. Les deux dictionnaires sont embarqués afin que le
// changement de langue fonctionne aussi hors ligne.

"use strict";

(() => {
  const messages = {
    fr: {
      metaTitle: "Korr - correcteur français et anglais hors ligne",
      metaDescription: "Corrigez votre français et votre anglais dans le navigateur. Gratuit, sans compte et 100 % hors ligne.",
      interfaceLanguage: "Interface",
      heroTitle: "Le correcteur français et anglais<br>qui ne voit <em>jamais</em> votre texte",
      heroPitch: "Tout se passe dans votre navigateur. Aucun serveur, aucun compte, aucune limite. Fonctionne même sans connexion.",
      badgeOffline: "🔒 100 % hors ligne",
      badgeFast: "⚡ Correction locale rapide",
      badgeFree: "🆓 Libre et gratuit",
      toolTitle: "Correcteur",
      yourText: "Votre texte",
      textLanguage: "Langue du texte",
      french: "Français",
      english: "English",
      tryExample: "Essayer un exemple",
      inputPlaceholder: "Collez ou tapez votre texte ici, puis appuyez sur Corriger…",
      loading: "Chargement du correcteur…",
      correct: "Corriger",
      correctedText: "Texte corrigé",
      copy: "Copier",
      reuse: "Remplacer mon texte",
      featuresTitle: "Deux langues, deux moteurs spécialisés",
      agreementTitle: "Accords difficiles",
      agreementText: "Participe passé avec le COD placé avant, verbes pronominaux, accords à distance.",
      tenseTitle: "Concordance et subjonctif",
      tenseText: "La règle des « si », le subjonctif après « bien que » ou « quoique ».",
      homophonesTitle: "Homophones français",
      homophonesText: "et/est, ou/où, sa/ça, quand/quant - avec le contexte pour trancher.",
      smsTitle: "Langage SMS",
      smsText: "Près de 180 abréviations reconnues et remises en français.",
      typographyTitle: "Typographie française",
      typographyText: "L'espace insécable avant <code>! ? : ;</code>, sans toucher aux URL ni aux heures.",
      englishGrammarTitle: "Grammaire anglaise",
      englishGrammarText: "Temps composés, confusions fréquentes, mots manquants et expressions incorrectes.",
      naturalEnglishTitle: "Anglais naturel",
      naturalEnglishText: "Harper détecte les formulations comme <code>could of</code> ou les mots mal séparés.",
      falseFriendsTitle: "Faux amis du francophone",
      falseFriendsText: "Les traductions mot à mot que seul un francophone écrit, repérées et remises en anglais courant.",
      englishPrepositionsTitle: "Prépositions et indénombrables",
      englishPrepositionsText: "La préposition qui suit chaque verbe, et les noms anglais qui ne prennent jamais de pluriel.",
      privacyTitle: "Pourquoi « hors ligne » n'est pas qu'une promesse",
      privacyText1: "Les moteurs libres <a href=\"https://grammalecte.net\" rel=\"noopener\">Grammalecte</a> et <a href=\"https://writewithharper.com\" rel=\"noopener\">Harper</a> sont exécutés sur votre appareil. La page ne fait aucune requête vers un serveur d'analyse, parce qu'il n'en existe aucun.",
      privacyText2: "Le code est public sous licence GPL&nbsp;3.0 : cette affirmation est <strong>vérifiable</strong>, pas seulement déclarée. Après une première correction dans la langue choisie, vous pouvez couper la connexion : son moteur reste disponible hors ligne.",
      downloadTitle: "Corrigez partout sur votre PC",
      downloadPitch: "Installez l'application Windows : sélectionnez du texte dans <strong>n'importe quel logiciel</strong> - Word, Outlook, Discord ou un jeu - appuyez sur <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>, et c'est corrigé sur place.",
      downloadButton: "Télécharger Korr pour Windows",
      downloadSize: "Installateur · environ 31 Mo",
      step1: "Téléchargez <code>Korr-Setup.exe</code>",
      step2: "Double-cliquez sur l’installateur",
      step3: "Suivez les quelques étapes affichées",
      step4: "Lancez Korr depuis le menu Démarrer",
      step5: "Sélectionnez du texte, puis <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>",
      windowsHint: "Korr n’est pas encore signé numériquement. Si Edge bloque le téléchargement, ouvrez-le avec <kbd>Ctrl</kbd>+<kbd>J</kbd>, puis choisissez <strong>Conserver</strong> et <strong>Conserver quand même</strong>. Si Windows affiche SmartScreen, cliquez sur <strong>Informations complémentaires</strong>, puis <strong>Exécuter quand même</strong>.",
      otherWays: "Autres façons de l'utiliser",
      webAppTitle: "Application web",
      webAppText: "Installez cette page comme application : elle s'ouvre hors ligne, sur ordinateur comme sur téléphone.",
      install: "Installer",
      installHint: "Depuis le menu du navigateur : « Installer l'application ».",
      extensionTitle: "Extension navigateur",
      extensionText: "Pour corriger directement dans Gmail, Slack ou n'importe quel champ de saisie, sans copier-coller.",
      extensionSoon: "Bientôt sur Edge Add-ons et Chrome Web Store.",
      footer: "Logiciel libre sous <a href=\"LICENSE\">GNU GPL 3.0</a> · <a href=\"PRIVACY.md\">Confidentialité</a> · <a href=\"LEGAL.md\">Mentions légales</a> · <a href=\"TERMS.md\">CGU</a> · Propulsé par <a href=\"https://grammalecte.net\" rel=\"noopener\">Grammalecte</a> et <a href=\"https://writewithharper.com\" rel=\"noopener\">Harper</a>",
      loadError: "Le correcteur n'a pas pu se charger : {error}",
      engineUnavailable: "Moteur indisponible.",
      engineTimeout: "Le moteur a mis trop de temps à répondre.",
      readyMs: "Correcteur prêt en {ms} ms · hors ligne",
      harperFirst: "Harper sera chargé à la première correction anglaise · hors ligne",
      ready: "Correcteur prêt · hors ligne",
      correcting: "Correction…",
      loadingHarper: "Chargement de Harper…",
      correctionFailed: "La correction a échoué.",
      engineEnglish: "Harper · English · hors ligne",
      engineFrench: "Grammalecte · Français · hors ligne",
      mixedDetected: "Texte bilingue détecté · choisissez sa langue",
      mixedHelp: "Le français et l’anglais sont mélangés. Choisissez Français ou English pour éviter de modifier les mots de l’autre langue.",
      mixedAsk: "Ce texte mélange le français et l’anglais. Dans quelle langue faut-il le corriger ?",
      noErrors: "Aucune faute détectée",
      correctionOne: "1 correction · {ms} ms",
      correctionMany: "{count} corrections · {ms} ms",
      copied: "Copié ✓",
      selected: "Sélectionné",
      installed: "Application installée ✓"
    },
    en: {
      metaTitle: "Korr - offline French and English grammar checker",
      metaDescription: "Correct French and English directly in your browser. Free, private and 100% offline.",
      interfaceLanguage: "Interface",
      heroTitle: "The French and English grammar checker<br>that <em>never</em> sees your text",
      heroPitch: "Everything runs in your browser. No server, no account and no limits. It even works without an internet connection.",
      badgeOffline: "🔒 100% offline",
      badgeFast: "⚡ Fast local correction",
      badgeFree: "🆓 Free and open source",
      toolTitle: "Grammar checker",
      yourText: "Your text",
      textLanguage: "Text language",
      french: "French",
      english: "English",
      tryExample: "Try an example",
      inputPlaceholder: "Paste or type your text here, then select Correct…",
      loading: "Loading the grammar checker…",
      correct: "Correct",
      correctedText: "Corrected text",
      copy: "Copy",
      reuse: "Use corrected text",
      featuresTitle: "Two languages, two specialized engines",
      agreementTitle: "Complex French agreements",
      agreementText: "Past participles, pronominal verbs and long-distance agreements.",
      tenseTitle: "French tenses and subjunctive",
      tenseText: "Conditional clauses and the subjunctive after expressions such as « bien que ».",
      homophonesTitle: "French homophones",
      homophonesText: "et/est, ou/où, sa/ça and quand/quant, resolved using context.",
      smsTitle: "French text-message language",
      smsText: "Nearly 180 abbreviations are recognized and expanded into proper French.",
      typographyTitle: "French typography",
      typographyText: "Correct spacing before <code>! ? : ;</code> without changing URLs or times.",
      englishGrammarTitle: "English grammar",
      englishGrammarText: "Compound tenses, common confusions, missing words and incorrect expressions.",
      naturalEnglishTitle: "Natural English",
      naturalEnglishText: "Harper catches phrases such as <code>could of</code> and incorrectly joined words.",
      falseFriendsTitle: "French-speaker false friends",
      falseFriendsText: "The word-for-word translations only a French speaker writes, caught and turned into idiomatic English.",
      englishPrepositionsTitle: "Prepositions and uncountables",
      englishPrepositionsText: "The preposition each verb takes, and the English nouns that never go plural.",
      privacyTitle: "Why “offline” is more than a promise",
      privacyText1: "The open-source <a href=\"https://grammalecte.net\" rel=\"noopener\">Grammalecte</a> and <a href=\"https://writewithharper.com\" rel=\"noopener\">Harper</a> engines run on your device. This page never sends text to an analysis server because no such server exists.",
      privacyText2: "The source code is public under the GPL&nbsp;3.0 license, so this claim is <strong>verifiable</strong>. After the first correction in a selected language, its engine remains available offline.",
      downloadTitle: "Correct text anywhere on your PC",
      downloadPitch: "Install the Windows app, select text in <strong>any program</strong> - Word, Outlook, Discord or a game - press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>, and Korr replaces it with the correction.",
      downloadButton: "Download Korr for Windows",
      downloadSize: "Installer · about 31 MB",
      step1: "Download <code>Korr-Setup.exe</code>",
      step2: "Double-click the installer",
      step3: "Follow the short setup wizard",
      step4: "Launch Korr from the Start menu",
      step5: "Select text, then press <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>C</kbd>",
      windowsHint: "Korr is not digitally signed yet. If Edge blocks the download, open downloads with <kbd>Ctrl</kbd>+<kbd>J</kbd>, then choose <strong>Keep</strong> and <strong>Keep anyway</strong>. If Windows SmartScreen appears, select <strong>More info</strong>, then <strong>Run anyway</strong>.",
      otherWays: "Other ways to use Korr",
      webAppTitle: "Web app",
      webAppText: "Install this page as an app. It opens offline on desktop and mobile devices.",
      install: "Install",
      installHint: "From your browser menu, select “Install app”.",
      extensionTitle: "Browser extension",
      extensionText: "Correct text directly in Gmail, Slack or any text field without copying and pasting.",
      extensionSoon: "Coming soon to Edge Add-ons and the Chrome Web Store.",
      footer: "Open-source software under <a href=\"LICENSE\">GNU GPL 3.0</a> · <a href=\"PRIVACY.en.md\">Privacy</a> · <a href=\"LEGAL.en.md\">Legal notice</a> · <a href=\"TERMS.en.md\">Terms</a> · Powered by <a href=\"https://grammalecte.net\" rel=\"noopener\">Grammalecte</a> and <a href=\"https://writewithharper.com\" rel=\"noopener\">Harper</a>",
      loadError: "The grammar checker could not load: {error}",
      engineUnavailable: "Grammar engine unavailable.",
      engineTimeout: "The grammar engine took too long to respond.",
      readyMs: "Grammar checker ready in {ms} ms · offline",
      harperFirst: "Harper will load with the first English correction · offline",
      ready: "Grammar checker ready · offline",
      correcting: "Correcting…",
      loadingHarper: "Loading Harper…",
      correctionFailed: "Correction failed.",
      engineEnglish: "Harper · English · offline",
      engineFrench: "Grammalecte · French · offline",
      mixedDetected: "Mixed-language text detected · choose its language",
      mixedHelp: "French and English are mixed. Select French or English to avoid changing words from the other language.",
      mixedAsk: "This text mixes French and English. Which language should Korr correct it in?",
      noErrors: "No errors detected",
      correctionOne: "1 correction · {ms} ms",
      correctionMany: "{count} corrections · {ms} ms",
      copied: "Copied ✓",
      selected: "Selected",
      installed: "App installed ✓"
    }
  };

  // L'anglais est la langue par défaut d'une première visite, quelle que soit
  // celle du navigateur : le site s'adresse d'abord à un public international.
  // Le choix explicite du visiteur, lui, est mémorisé et prime toujours.
  let locale = localStorage.getItem("korr-ui-language") || "en";
  if (!messages[locale]) locale = "en";

  function t(key, values = {}) {
    const template = messages[locale][key] || messages.fr[key] || key;
    return template.replace(/\{(\w+)\}/gu, (_match, name) => String(values[name] ?? ""));
  }

  function apply(nextLocale) {
    if (messages[nextLocale]) locale = nextLocale;
    localStorage.setItem("korr-ui-language", locale);
    document.documentElement.lang = locale;
    document.title = t("metaTitle");
    document.querySelector('meta[name="description"]')?.setAttribute("content", t("metaDescription"));
    document.querySelector('meta[property="og:title"]')?.setAttribute("content", t("metaTitle"));
    document.querySelector('meta[property="og:description"]')?.setAttribute("content", t("metaDescription"));
    for (const element of document.querySelectorAll("[data-i18n]")) {
      element.textContent = t(element.dataset.i18n);
    }
    for (const element of document.querySelectorAll("[data-i18n-html]")) {
      element.innerHTML = t(element.dataset.i18nHtml);
    }
    for (const element of document.querySelectorAll("[data-i18n-placeholder]")) {
      element.setAttribute("placeholder", t(element.dataset.i18nPlaceholder));
    }
    const picker = document.getElementById("ui-language");
    if (picker) picker.value = locale;
    window.dispatchEvent(new CustomEvent("korr:locale", { detail: { locale } }));
  }

  globalThis.korrI18n = Object.freeze({
    t,
    apply,
    get locale() { return locale; }
  });

  document.getElementById("ui-language")?.addEventListener("change", (event) => apply(event.target.value));
  apply(locale);
})();
