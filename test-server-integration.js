import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 18_787;
const baseUrl = `http://127.0.0.1:${port}`;
const child = spawn(process.execPath, ["server.js"], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(port) },
  stdio: ["ignore", "pipe", "pipe"]
});

let logs = "";
child.stdout.setEncoding("utf8");
child.stderr.setEncoding("utf8");
child.stdout.on("data", (chunk) => { logs += chunk; });
child.stderr.on("data", (chunk) => { logs += chunk; });

try {
  await waitUntilReady();

  const favicon = await fetch(`${baseUrl}/favicon.ico`);
  assert.equal(favicon.status, 204);

  await assertCorrection(
    { text: "Je suis aller au magasin hier.", mode: "instant", language: "auto" },
    { text: "Je suis allé au magasin hier.", engine: "grammalecte", language: "fr" }
  );
  await assertCorrection(
    { text: "I has went home yesterday.", mode: "instant", language: "auto" },
    { text: "I went home yesterday.", engine: "harper", language: "en" }
  );
  await assertCorrection(
    { text: "Their is alot of work.", mode: "instant", language: "en" },
    { text: "There is a lot of work.", engine: "harper", language: "en" }
  );

  const shortEnglish = await postCorrection({ text: "Best regards.", mode: "instant", language: "auto" });
  assert.equal(shortEnglish.engine, "harper");
  assert.equal(shortEnglish.language, "en");

  await assertCorrection(
    { text: "helo how ar yu", mode: "instant", language: "auto" },
    { text: "Hello, how are you?", engine: "harper", language: "en" }
  );

  const shortFrench = await postCorrection({ text: "Bon anniversaire !", mode: "instant", language: "auto" });
  assert.equal(shortFrench.engine, "grammalecte");
  assert.equal(shortFrench.language, "fr");

  const mixedSource = "Bonjour, this is a test.";
  const mixed = await postCorrection({ text: mixedSource, mode: "instant", language: "auto" });
  assert.equal(mixed.text, mixedSource);
  assert.equal(mixed.engine, "mixed");
  assert.equal(mixed.language, "mixed");
  assert.match(mixed.fallback, /choisissez/u);

  console.log("API FR/EN et protection des textes mixtes : tests réussis.");
} finally {
  child.kill();
}

async function assertCorrection(body, expected) {
  const result = await postCorrection(body);
  assert.equal(result.text, expected.text);
  assert.equal(result.engine, expected.engine);
  assert.equal(result.language, expected.language);
}

async function postCorrection(body) {
  const response = await fetch(`${baseUrl}/api/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  assert.equal(response.status, 200);
  return response.json();
}

async function waitUntilReady() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (logs.includes("Korr prêt")) return;
    if (child.exitCode !== null) throw new Error(`Le serveur de test s'est arrêté.\n${logs}`);
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Délai de démarrage dépassé.\n${logs}`);
}
