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
  // « Mixte » suppose un équilibre : une formule de politesse isolée ne fait
  // pas basculer un texte entier, sinon l'outil refuserait de le corriger.
  [
    "Hey team, the group of devs who is working on the api have met many troubles. It is crucial that everyone downloads the update before the version expires. Merci!",
    "en"
  ],
  ["Hi Marie, I will assist to the meeting tomorrow and send you the report. Bonne journée!", "en"],
  [
    "Bonjour, je vous envoie le rapport que j'ai écrit hier. Le deadline est vendredi, merci de faire un feedback rapide sur le planning.",
    "fr"
  ],
  ["OK", "fr"],
  // Espagnol : détecté avec ou sans accents, puisqu'un correcteur reçoit
  // surtout du texte non accentué.
  ["Hola, ¿cómo estás? Muy bien, gracias.", "es"],
  ["El corazón de María está roto y no sé qué hacer.", "es"],
  ["Mi corazon esta roto. Como estas? Enserio, aveces dudo.", "es"],
  ["Los nuevos empleados llegaron ayer por la noche.", "es"],
  ["Buenos días, quiero hacer una pregunta sobre el trabajo.", "es"],
  // Un courriel professionnel espagnol : ses « que », « de » et « la » sont
  // aussi français, ils ne doivent plus peser d'un seul côté.
  [
    "Hola equipo, fyi os escribo rapido xq la mayoria de los servidores han sido apagados por error, no puedo mas. La pila de informes financieros que contienen los datos clave se han perdido, no se que hacer. Los archivos de los que me hablasteis esta mañana no los he encontrado.",
    "es"
  ],
  [
    "Es vital que el director apruebe el nuevo planning antes de que termine el trimestre actual. Decirme vuestras dispo para un call de emergencia antes de que el jefe se vaya.",
    "es"
  ],
  ["Te confirmo que el pedido de los clientes se ha enviado esta tarde.", "es"],
  // Italien : détecté avec ou sans accents, et distingué de l'espagnol.
  ["Ciao a tutti, questo è il nuovo programma della settimana.", "it"],
  ["Buongiorno, ho già inviato il documento ma non ho ricevuto risposta.", "it"],
  ["Perché non ci vediamo domani per discutere del progetto?", "it"],
  ["cmq nn so se vengo, xké ho gia un meeting alle tre.", "it"],
  ["Gli obiettivi sono molto chiari e la scadenza è vicina.", "it"],
  ["Vorrei sapere qual è il problema con la riunione di oggi.", "it"],
  // L'italien et l'espagnol ne se confondent pas.
  ["El corazón de María está roto y no sé qué hacer.", "es"],
  ["Non so cosa fare, il cuore di Maria è a pezzi.", "it"],
  // Garde-fous : le français et l'anglais ne basculent jamais vers l'espagnol.
  // Un texte français saturé de mots communs aux deux langues reste français.
  [
    "Le rapport que je vous ai envoyé hier contient les chiffres de la réunion, mais il faut que nous en discutions avant que le directeur ne le valide.",
    "fr"
  ],
  ["Bonjour, je vous envoie le rapport que j'ai écrit hier.", "fr"],
  ["Les nouveaux employés sont arrivés hier soir.", "fr"],
  ["Le président de la République a reçu le maire.", "fr"],
  ["On n'a pas le temps de voir ça.", "fr"],
  ["The new employees arrived yesterday evening.", "en"],
  ["I look forward to hearing from you.", "en"]
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
