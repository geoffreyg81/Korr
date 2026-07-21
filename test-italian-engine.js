import { correctItalianText } from "./italian-engine.js";

const cases = [
  // --- Accent grave écrit pour l'aigu (faute la plus fréquente) -----------
  ["Non vengo perchè sono stanco.", "Non vengo perché sono stanco."],
  ["Aspetta finchè non torno.", "Aspetta finché non torno."],
  ["Non ho né tempo nè voglia.", "Non ho né tempo né voglia."],
  // --- Accents sur les oxytons -------------------------------------------
  ["Ho comprato piu caffe in citta.", "Ho comprato più caffè in città."],
  ["E gia troppo tardi, cosi non esco.", "È già troppo tardi, così non esco."],
  ["La qualita e la quantita contano.", "La qualità e la quantità contano."],
  ["Si puo fare, cioe dipende.", "Si può fare, cioè dipende."],
  ["Ci vediamo lunedi o martedi.", "Ci vediamo lunedì o martedì."],
  // --- Auxiliaire avere sans « h » ---------------------------------------
  ["Non e possibile.", "Non è possibile."],
  ["Lui a fatto tutto da solo.", "Lui ha fatto tutto da solo."],
  ["Tu ai visto il messaggio?", "Tu hai visto il messaggio?"],
  ["I clienti anno aspettato per ore.", "I clienti hanno aspettato per ore."],
  ["O deciso di restare a casa.", "Ho deciso di restare a casa."],
  ["e' arrivato il pacco.", "È arrivato il pacco."],
  // --- Élision de l'article -----------------------------------------------
  ["Ho visto una amica ieri.", "Ho visto un'amica ieri."],
  ["È un'altro problema.", "È un altro problema."],
  ["Ho aspettato una ora intera.", "Ho aspettato un'ora intera."],
  // --- Troncations --------------------------------------------------------
  ["Aspetta un po per favore.", "Aspetta un po' per favore."],
  ["Dammi un pò di tempo.", "Dammi un po' di tempo."],
  ["Qual'è il problema?", "Qual è il problema?"],
  // --- Abréviations SMS ---------------------------------------------------
  ["cmq nn lo so, xké non me lo ha detto.", "Comunque non lo so, perché non me lo ha detto."],
  ["e gia troppo tardi.", "È già troppo tardi."],
  ["Ti scrivo xké ho bisogno di te.", "Ti scrivo perché ho bisogno di te."],
  // --- Anglicismes di bureau avec accord de l'article ---------------------
  ["Ti chiamo per un meeting urgente.", "Ti chiamo per una riunione urgente."],
  ["Conferma il planning di domani.", "Conferma il programma di domani."],
  ["Abbiamo una call alle tre.", "Abbiamo una chiamata alle tre."],
  ["Rispetta la deadline del progetto.", "Rispetta la scadenza del progetto."],
  ["Il meeting è alle nove.", "La riunione è alle nove."],

  // === Garde-fous : italien correct, rien ne doit bouger ==================
  ["Il caffè della mattina è già pronto.", "Il caffè della mattina è già pronto."],
  ["Preferisci il pesce affumicato o salato?", "Preferisci il pesce affumicato o salato?"],
  ["L'anno scorso siamo andati a Roma.", "L'anno scorso siamo andati a Roma."],
  ["Vado a casa perché è tardi.", "Vado a casa perché è tardi."],
  ["Questo e quello sono uguali.", "Questo e quello sono uguali."],
  ["La meta del nostro viaggio è Milano.", "La meta del nostro viaggio è Milano."],
  ["Il papa vive a Roma.", "Il papa vive a Roma."],
  ["Ho mangiato una mela e una pera.", "Ho mangiato una mela e una pera."],
  ["Perché non vieni con noi?", "Perché non vieni con noi?"],
  ["Ci sono 3 x 4 possibilità.", "Ci sono 3 x 4 possibilità."],
  ["Marco è un amico di Sara.", "Marco è un amico di Sara."],
  ["La squadra è molto unita quest'anno.", "La squadra è molto unita quest'anno."]
];

let failures = 0;
for (const [input, expected] of cases) {
  const { text, durationMs } = correctItalianText(input);
  console.log(`${durationMs} ms | ${input} -> ${text}`);
  if (text !== expected) {
    console.error(`Atteso : ${expected}`);
    failures += 1;
  }
}

if (failures) {
  console.error(`${failures} correzione/i italiana/e non riuscita/e.`);
  process.exitCode = 1;
} else {
  console.log(`Correzioni italiane verificate: ${cases.length} casi.`);
}
