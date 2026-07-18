// Traductions légères de l'interface de l'extension. Les moteurs et les
// valeurs enregistrées restent indépendants de la langue de l'interface.

"use strict";

(() => {
  const messages = {
    fr: {
      popupSubtitle: "Français et anglais, hors ligne.",
      backendChecking: "Vérification…",
      siteButtonTitle: "Bouton ✓ sur ce site",
      siteDetecting: "Détection du site…",
      siteToggleTitle: "Afficher le bouton sur ce site",
      textLanguage: "Langue du texte",
      automatic: "Auto",
      french: "Français",
      english: "English",
      autoHint: "Auto choisit Grammalecte ou Harper selon le texte.",
      responseStyle: "Style de réponse",
      styleCorrect: "✓ Corriger",
      styleProfessional: "💼 Pro",
      styleFriendly: "😊 Amical",
      styleConcise: "✂️ Concis",
      footerHtml: "Tout se passe sur votre ordinateur : aucun texte n’est envoyé sur Internet.<br>Sélectionnez du texte ou cliquez dans un champ, puis <strong>✓</strong> ou <kbd>Alt</kbd>+<kbd>Maj</kbd>+<kbd>C</kbd>.",
      styleHintCorrect: "Corrige les fautes sans rien reformuler.",
      styleHintProfessional: "Réécrit dans un ton professionnel et courtois.",
      styleHintFriendly: "Réécrit dans un ton chaleureux et détendu.",
      styleHintConcise: "Raccourcit le texte en gardant l’essentiel.",
      languageSaved: "Langue : {language}.",
      styleRequiresAi: "Ce style demande le mode IA local.",
      styleSaved: "Style enregistré.",
      offlineStylesHint: "Correction instantanée, hors ligne. Les styles de réécriture demandent le mode IA local.",
      unavailablePage: "Indisponible sur cette page",
      siteEnabled: "Bouton activé sur {site}.",
      siteHidden: "Bouton masqué sur {site}.",
      backendReadyAi: "Correcteur hors ligne prêt · mode IA disponible",
      backendReady: "Correcteur hors ligne prêt",
      correctButtonTitle: "Corriger le texte (Alt+Maj+C)",
      correctButtonAria: "Corriger le texte",
      focusField: "Cliquez d’abord dans un champ de texte.",
      nothingToCorrect: "Aucun texte à corriger.",
      correcting: "Correction en cours…",
      correctionFailed: "La correction a échoué.",
      alreadyCorrect: "Texte déjà correct.",
      correctionOne: "1 correction",
      correctionMany: "{count} corrections",
      textCorrected: "Texte corrigé{count}{duration}.",
      stylePastProfessional: "réécrit en style professionnel",
      stylePastFriendly: "réécrit en style amical",
      stylePastConcise: "raccourci à l’essentiel",
      textStyledAi: "Texte {style} par l’IA.",
      textDeepAi: "Texte corrigé par l’IA approfondie.",
      undo: "Annuler",
      undoFailed: "Impossible d’annuler : le texte a été modifié depuis.",
      correctionUndone: "Correction annulée.",
      extensionUpdated: "Extension mise à jour : rechargez cette page puis réessayez.",
      textChanged: "Le texte a changé pendant la correction. Relancez-la pour éviter d’écraser vos modifications.",
      formatTooComplex: "Cette mise en forme est trop complexe pour une correction sûre. Sélectionnez un passage plus court.",
      textTooLong: "Le texte est trop long pour être corrigé en une fois.",
      engineUnavailable: "Le moteur de correction est indisponible. Réessayez dans un instant.",
      fallbackSms: "Langage SMS corrigé localement · IA inutile.",
      fallbackRejected: "Réponse IA écartée par sécurité · correction locale utilisée.",
      fallbackLocal: "Correction locale utilisée.",
      fallbackMixed: "Texte français et anglais mélangé : choisissez Français ou English dans les options."
    },
    en: {
      popupSubtitle: "French and English, offline.",
      backendChecking: "Checking…",
      siteButtonTitle: "✓ button on this site",
      siteDetecting: "Detecting website…",
      siteToggleTitle: "Show the correction button on this site",
      textLanguage: "Text language",
      automatic: "Auto",
      french: "French",
      english: "English",
      autoHint: "Auto selects Grammalecte or Harper based on the text.",
      responseStyle: "Writing style",
      styleCorrect: "✓ Correct",
      styleProfessional: "💼 Professional",
      styleFriendly: "😊 Friendly",
      styleConcise: "✂️ Concise",
      footerHtml: "Everything runs on your computer: no text is sent over the internet.<br>Select text or click inside a field, then choose <strong>✓</strong> or press <kbd>Alt</kbd>+<kbd>Shift</kbd>+<kbd>C</kbd>.",
      styleHintCorrect: "Corrects errors without rewriting your text.",
      styleHintProfessional: "Rewrites in a professional and courteous tone.",
      styleHintFriendly: "Rewrites in a warm and relaxed tone.",
      styleHintConcise: "Shortens the text while keeping its meaning.",
      languageSaved: "Text language: {language}.",
      styleRequiresAi: "This style requires the local AI mode.",
      styleSaved: "Style saved.",
      offlineStylesHint: "Instant offline correction. Rewriting styles require the local AI mode.",
      unavailablePage: "Unavailable on this page",
      siteEnabled: "Button enabled on {site}.",
      siteHidden: "Button hidden on {site}.",
      backendReadyAi: "Offline corrector ready · AI mode available",
      backendReady: "Offline corrector ready",
      correctButtonTitle: "Correct text (Alt+Shift+C)",
      correctButtonAria: "Correct text",
      focusField: "Click inside a text field first.",
      nothingToCorrect: "No text to correct.",
      correcting: "Correcting…",
      correctionFailed: "Correction failed.",
      alreadyCorrect: "Text is already correct.",
      correctionOne: "1 correction",
      correctionMany: "{count} corrections",
      textCorrected: "Text corrected{count}{duration}.",
      stylePastProfessional: "rewritten in a professional style",
      stylePastFriendly: "rewritten in a friendly style",
      stylePastConcise: "shortened to the essentials",
      textStyledAi: "Text {style} by AI.",
      textDeepAi: "Text corrected by the advanced AI mode.",
      undo: "Undo",
      undoFailed: "Unable to undo: the text has changed since the correction.",
      correctionUndone: "Correction undone.",
      extensionUpdated: "The extension was updated. Reload this page and try again.",
      textChanged: "The text changed during correction. Run it again to avoid overwriting your changes.",
      formatTooComplex: "This formatting is too complex to correct safely. Select a shorter passage.",
      textTooLong: "The text is too long to correct in one pass.",
      engineUnavailable: "The correction engine is unavailable. Please try again in a moment.",
      fallbackSms: "SMS language corrected locally · AI was not needed.",
      fallbackRejected: "AI result rejected for safety · local correction used.",
      fallbackLocal: "Local correction used.",
      fallbackMixed: "Mixed French and English text: select French or English in the options."
    }
  };

  const browserLanguage = globalThis.chrome?.i18n?.getUILanguage?.() ||
    globalThis.navigator?.language || "en";
  const locale = String(browserLanguage).toLowerCase().startsWith("fr") ? "fr" : "en";

  function t(key, values = {}) {
    const template = messages[locale][key] || messages.en[key] || key;
    return template.replace(/\{(\w+)\}/gu, (_match, name) => String(values[name] ?? ""));
  }

  function apply(root = document) {
    if (root.documentElement) root.documentElement.lang = locale;
    for (const element of root.querySelectorAll("[data-korr-i18n]")) {
      element.textContent = t(element.dataset.korrI18n);
    }
    for (const element of root.querySelectorAll("[data-korr-i18n-html]")) {
      element.innerHTML = t(element.dataset.korrI18nHtml);
    }
    for (const element of root.querySelectorAll("[data-korr-i18n-title]")) {
      element.title = t(element.dataset.korrI18nTitle);
    }
  }

  globalThis.korrExtensionI18n = Object.freeze({ locale, t, apply });
})();
