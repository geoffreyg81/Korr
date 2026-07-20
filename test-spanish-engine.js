import { correctSpanishText } from "./spanish-engine.js";

const cases = [
  // --- Orthographe : accents manquants et confusions phonétiques ----------
  ["Mi corazon esta roto.", "Mi corazón está roto."],
  ["Despues de la reunion hablamos.", "Después de la reunión hablamos."],
  ["Nunca habia visto algo asi de dificil.", "Nunca había visto algo así de difícil."],
  ["Es vital que el director aprueve el informe.", "Es vital que el director apruebe el informe."],
  // --- Graphies soudées, abréviations et numéraux -------------------------
  ["Enserio, aveces dudo.", "En serio, a veces dudo."],
  ["Osea que no vienes porke trabajas.", "O sea que no vienes porque trabajas."],
  ["Nos vemos el finde, porfavor.", "Nos vemos el fin de semana, por favor."],
  ["Vinieron dos-cientos clientes.", "Vinieron doscientos clientes."],
  ["Tenemos diez y seis pedidos.", "Tenemos dieciséis pedidos."],
  // --- Homophones à accent diacritique (le contexte tranche) --------------
  ["No se que hacer.", "No sé qué hacer."],
  ["No se como decirtelo.", "No sé cómo decírtelo."],
  ["Tu tienes razon.", "Tú tienes razón."],
  ["El me dijo la verdad.", "Él me dijo la verdad."],
  ["Para mi, esto es urgente.", "Para mí, esto es urgente."],
  ["Aun no hemos terminado.", "Aún no hemos terminado."],
  ["Creo que si.", "Creo que sí."],
  ["Todavia no e recibido tu respuesta.", "Todavía no he recibido tu respuesta."],
  ["El pedido a sido cancelado.", "El pedido ha sido cancelado."],
  ["Ya he echo el resumen.", "Ya he hecho el resumen."],
  ["Ay que avisar al jefe.", "Hay que avisar al jefe."],
  ["Te lo dije una ves.", "Te lo dije una vez."],
  ["Ayer me dijistes lo contrario.", "Ayer me dijiste lo contrario."],
  // --- Accord à distance : la tête singulière commande le verbe -----------
  [
    "La pila de informes financieros que contienen los datos clave se han perdido.",
    "La pila de informes financieros que contiene los datos clave se ha perdido."
  ],
  ["La caja de herramientas costaron mucho.", "La caja de herramientas costó mucho."],
  ["La versión de los documentos fueron aprobadas.", "La versión de los documentos fue aprobada."],
  // --- Mise en relief au pluriel (calque du « c'est … qui ») --------------
  [
    "Es los problemas que he dejado ocurrir que han causado esto.",
    "Son los problemas que he dejado ocurrir los que han causado esto."
  ],
  ["Es las cifras que preocupan al comité.", "Son las cifras las que preocupan al comité."],
  // --- Calques de bureau : le déterminant suit le genre espagnol ----------
  ["Aprueba el nuevo planning.", "Aprueba el nuevo calendario."],
  ["Te llamo para un call urgente.", "Te llamo para una llamada urgente."],
  ["Aunque estemos short de tiempo, seguimos.", "Aunque estemos cortos de tiempo, seguimos."],
  ["Estoy short de tiempo.", "Estoy corto de tiempo."],
  ["Confirma la deadline del proyecto.", "Confirma la fecha límite del proyecto."],
  ["Decirme vuestras dispo.", "Decidme vuestras disponibilidades."],
  // --- Impératif de vosotros ---------------------------------------------
  ["Decirme la hora de la reunion.", "Decidme la hora de la reunión."],
  ["Callaros un momento.", "Callaos un momento."],
  ["Enviarnos el informe antes del lunes.", "Enviadnos el informe antes del lunes."],
  // --- Ponctuation ouvrante et interrogatifs accentués --------------------
  ["Como estas?", "¿Cómo estás?"],
  ["Que quieres?", "¿Qué quieres?"],
  ["Donde vives?", "¿Dónde vives?"],
  ["Que bien!", "¡Qué bien!"],
  ["Porque no viniste?", "¿Por qué no viniste?"],

  // === Garde-fous : rien à corriger, donc rien ne bouge ===================
  ["El corazón de María está bien.", "El corazón de María está bien."],
  ["¿Cómo estás? ¡Qué bien!", "¿Cómo estás? ¡Qué bien!"],
  ["Madrid es la capital de España.", "Madrid es la capital de España."],
  ["El libro que me diste es bueno.", "El libro que me diste es bueno."],
  ["Como pan cada día.", "Como pan cada día."],
  ["Vivo en Toulouse desde 2019.", "Vivo en Toulouse desde 2019."],
  // Le collectif de quantité garde son accord ad sensum : c'est du bon
  // espagnol, le moteur ne doit pas le « corriger ».
  [
    "La mayoría de los clientes han esperado durante horas.",
    "La mayoría de los clientes han esperado durante horas."
  ],
  ["El grupo de expertos se han reunido.", "El grupo de expertos se han reunido."],
  // « esta » démonstratif devant un nom, et « que » conjonction.
  ["Esta llamada es urgente.", "Esta llamada es urgente."],
  ["Sé que es difícil de aceptar.", "Sé que es difícil de aceptar."],
  ["No se sabe nada del asunto.", "No se sabe nada del asunto."],
  // Un infinitif sujet n'est pas un impératif mal orthographié.
  ["Decirme la verdad no es fácil.", "Decirme la verdad no es fácil."],
  ["Podéis decirme la verdad.", "Podéis decirme la verdad."],
  // Une copule singulière devant un singulier reste au singulier.
  ["Es la mejor opción del equipo.", "Es la mejor opción del equipo."],
  // Adresses et noms propres : intouchables.
  ["Escríbeme a soporte@korr.es el lunes.", "Escríbeme a soporte@korr.es el lunes."],
  ["La lista de tareas que están pendientes se ha enviado.", "La lista de tareas que están pendientes se ha enviado."]
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
