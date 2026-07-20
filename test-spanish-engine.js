import { correctSpanishText } from "./spanish-engine.js";

const cases = [
  // Restauration d'accents sur mots inconnus sans accent.
  ["Mi corazon esta roto.", "Mi corazón esta roto."],
  ["Despues de la reunion hablamos.", "Después de la reunión hablamos."],
  ["Nunca habia visto algo asi de dificil.", "Nunca había visto algo así de difícil."],
  // Graphies soudées et abréviations univoques.
  ["Enserio, aveces dudo.", "En serio, a veces dudo."],
  ["Osea que no vienes porke trabajas.", "O sea que no vienes porque trabajas."],
  ["Nos vemos el finde, porfavor.", "Nos vemos el fin de semana, por favor."],
  // Ponctuation ouvrante et interrogatif accentué.
  ["Como estas?", "¿Cómo estas?"],
  ["Que quieres?", "¿Qué quieres?"],
  ["Donde vives?", "¿Dónde vives?"],
  ["Que bien!", "¡Qué bien!"],
  // Garde-fous : espagnol déjà correct, laissé intact.
  ["El corazón de María está bien.", "El corazón de María está bien."],
  ["¿Cómo estás? ¡Qué bien!", "¿Cómo estás? ¡Qué bien!"],
  ["Madrid es la capital de España.", "Madrid es la capital de España."],
  ["El libro que me diste es bueno.", "El libro que me diste es bueno."],
  ["Como pan cada día.", "Como pan cada día."],
  // Un nom propre inconnu n'est pas « corrigé » vers un mot voisin.
  ["Vivo en Toulouse desde 2019.", "Vivo en Toulouse desde 2019."]
];

let failures = 0;
for (const [input, expected] of cases) {
  const { text, durationMs } = correctSpanishText(input);
  console.log(`${durationMs} ms | ${input} -> ${text}`);
  if (text !== expected) {
    console.error(`Attendu : ${expected}`);
    failures += 1;
  }
}

if (failures) {
  console.error(`${failures} correction(s) espagnole(s) ont échoué.`);
  process.exitCode = 1;
} else {
  console.log(`Corrections espagnoles vérifiées : ${cases.length} cas.`);
}
