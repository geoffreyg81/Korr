import "./language-detection.js";

const cases = [
  ["I went to the store yesterday.", "en"],
  ["This sentence contains several mistakes.", "en"],
  ["Can you help me?", "en"],
  ["We need better results.", "en"],
  ["She goes to work every day.", "en"],
  ["Your report is ready for review.", "en"],
  ["I don't know.", "en"],
  ["Email me ASAP.", "en"],
  ["Call me later.", "en"],
  ["It looks fine.", "en"],
  ["My car broke down.", "en"],
  ["Try again later.", "en"],
  ["Meet me on Monday.", "en"],
  ["Don't worry.", "en"],
  ["Won't work.", "en"],
  ["Isn't ready.", "en"],
  ["Doesn't work.", "en"],
  ["Couldn't connect.", "en"],
  ["Let's go.", "en"],
  ["The café is open.", "en"],
  ["Please send your résumé.", "en"],
  ["She is naïve.", "en"],
  ["The façade is beautiful.", "en"],
  ["Her fiancé is here.", "en"],
  ["helo how ar yu", "en"],
  ["i cant conect", "en"],
  ["thx see u tmrrw", "en"],
  ["need hlp", "en"],
  ["wher r u", "en"],
  ["yes", "en"],
  ["Best regards.", "en"],
  ["Kind regards,", "en"],
  ["Happy birthday!", "en"],
  ["Well done!", "en"],
  ["Good luck!", "en"],
  ["Sorry!", "en"],
  ["Welcome!", "en"],
  ["Cheers!", "en"],
  ["Bye!", "en"],
  ["Congratulations!", "en"],
  ["Good night!", "en"],
  ["Happy new year!", "en"],
  ["See ya!", "en"],
  ["No problem.", "en"],
  ["Sounds good.", "en"],
  ["Talk soon.", "en"],
  ["Take care.", "en"],
  ["Je suis allé au magasin hier.", "fr"],
  ["Bonjour, comment ça va ?", "fr"],
  ["Merci beaucoup pour votre aide.", "fr"],
  ["Le rapport est prêt pour demain.", "fr"],
  ["Le project works well avec English.", "fr"],
  ["Partie I du rapport.", "fr"],
  ["Chapitre I : introduction.", "fr"],
  ["Oui.", "fr"],
  ["Bon anniversaire !", "fr"],
  ["Bonne chance !", "fr"],
  ["Bien joué !", "fr"],
  ["Cordialement,", "fr"],
  ["J'ai besoin d'aide.", "fr"],
  ["Désolé !", "fr"],
  ["Bienvenue !", "fr"],
  ["Santé !", "fr"],
  ["Au revoir !", "fr"],
  ["Félicitations !", "fr"],
  ["Bonne nuit !", "fr"],
  ["Bonne année !", "fr"],
  ["À plus !", "fr"],
  ["Pas de problème.", "fr"],
  ["Ça marche.", "fr"],
  ["À bientôt.", "fr"],
  ["Prends soin de toi.", "fr"],
  ["Bonjour, this is a test.", "mixed"],
  ["Merci for your help.", "mixed"],
  ["Je suis ready for the meeting.", "mixed"],
  ["Bonjour, notre team is ready.", "mixed"],
  ["Hello, je suis late.", "mixed"],
  ["OK", "fr"]
];

let failures = 0;
for (const [text, expected] of cases) {
  const actual = globalThis.korrLanguage.detectLanguage(text);
  console.log(`${actual} | ${text}`);
  if (actual !== expected) {
    console.error(`Attendu : ${expected}`);
    failures += 1;
  }
}

if (failures) {
  console.error(`${failures} détection(s) de langue ont échoué.`);
  process.exitCode = 1;
} else {
  console.log(`Détection FR/EN vérifiée : ${cases.length} cas.`);
}
