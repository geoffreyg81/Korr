const model = process.argv[2] || "qwen3:0.6b";

const samples = [
  "Je suis aller au magasins hier.",
  "Bien que les responsables soient annoncés que les nouvelles mesures entreraient en vigueur dès lundi, plusieurs employés ce sont plaint de ne pas avoir été prévenu à temps. Les informations qu’ils ont reçu leur semblaient contradictoire, et certains se demandaient s’il fallait continuer à appliquer les anciennes procédures ou attendre que la direction leur donne des consignes plus claires. Marie, qui s’était permise de contacter directement le directeur, c’est aperçu que les documents envoyés la veille comportaient eux aussi plusieurs erreurs, ce qui à provoquer davantage de confusion parmi les équipes."
];

const system = `Tu es un correcteur professionnel de français. Corrige toutes les fautes d’orthographe, de grammaire, de conjugaison, d’accord, d’homophone et de syntaxe. Préserve exactement le sens, le ton, les personnes et la mise en forme. Ne reformule pas. Ne donne aucune variante ni explication. Réponds uniquement avec le texte final corrigé.`;

for (const prompt of samples) {
  const startedAt = performance.now();
  const response = await fetch("http://127.0.0.1:11434/api/generate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model,
      system,
      prompt,
      stream: false,
      think: false,
      keep_alive: -1,
      options: { temperature: 0, num_ctx: 2048, num_predict: Math.ceil(prompt.length / 2) + 24 }
    })
  });
  const data = await response.json();
  console.log(JSON.stringify({
    model,
    elapsedMs: Math.round(performance.now() - startedAt),
    evalMs: Math.round((data.eval_duration || 0) / 1e6),
    promptMs: Math.round((data.prompt_eval_duration || 0) / 1e6),
    response: data.response,
    error: data.error
  }, null, 2));
}
