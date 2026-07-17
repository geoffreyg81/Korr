import assert from "node:assert/strict";
import {
  STYLES,
  hasSameProtectedEntities,
  isPlausibleCorrection,
  preservesLikelyProperNames
} from "./server.js";

const correctionSource =
  "Bonjour Marie, confirme le rendez-vous du 17/09/2026 à 14h30 pour 1 250 € à contact@example.com. Détails : https://exemple.fr/a?x=1 #Projet API.";

assert.equal(isPlausibleCorrection(correctionSource, correctionSource, STYLES.corriger), true);
assert.equal(
  isPlausibleCorrection(correctionSource, correctionSource.replace("14h30", "15h30"), STYLES.corriger),
  false,
  "une heure modifiée doit être rejetée"
);
assert.equal(
  isPlausibleCorrection(correctionSource, correctionSource.replace("contact@example.com", "contact@evil.test"), STYLES.corriger),
  false,
  "une adresse e-mail modifiée doit être rejetée"
);
assert.equal(
  isPlausibleCorrection(correctionSource, correctionSource.replace("https://exemple.fr/a?x=1", "https://evil.test"), STYLES.corriger),
  false,
  "une URL modifiée doit être rejetée"
);
assert.equal(
  isPlausibleCorrection(correctionSource, correctionSource.replace("API", "SDK"), STYLES.corriger),
  false,
  "un acronyme modifié doit être rejeté"
);
assert.equal(
  preservesLikelyProperNames(correctionSource, correctionSource.replace("Marie", "Sophie")),
  false,
  "un nom propre ne doit pas être remplacé"
);

const professionalSource =
  "Marie présentera le rapport Q3 à Lyon le 18 septembre 2026. Le budget est de 12 500 €.";
const professionalCandidate =
  "Le 18 septembre 2026 à Lyon, Marie présentera le rapport Q3. Le budget prévu s’élève à 12 500 €.";
assert.equal(
  isPlausibleCorrection(professionalSource, professionalCandidate, STYLES.professionnel),
  true,
  "une reformulation professionnelle fidèle doit rester possible"
);

const conciseSource =
  "Le comité doit envoyer le rapport financier final à Marie avant vendredi, car la réunion de lundi nécessite ces chiffres.";
const conciseCandidate =
  "Envoyer le rapport financier à Marie avant vendredi pour la réunion de lundi.";
assert.equal(
  isPlausibleCorrection(conciseSource, conciseCandidate, STYLES.concis),
  true,
  "un résumé fidèle doit rester possible"
);
assert.equal(
  isPlausibleCorrection(
    "Le comité doit envoyer le rapport financier avant vendredi car la réunion nécessite ces chiffres.",
    "La météo sera agréable demain et le déjeuner est prêt.",
    STYLES.concis
  ),
  false,
  "un résumé sans rapport doit être rejeté"
);
assert.equal(
  isPlausibleCorrection("Le rapport est prêt.", "Voici la version corrigée : Le rapport est prêt.", STYLES.corriger),
  false,
  "un commentaire d’assistant doit être rejeté"
);
assert.equal(hasSameProtectedEntities("Budget 42 € #Projet", "Budget 42 € #Projet"), true);
assert.equal(hasSameProtectedEntities("Budget 42 € #Projet", "Budget 43 € #Projet"), false);

console.log("Garde-fous IA : tests réussis.");
