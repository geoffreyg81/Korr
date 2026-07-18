import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
const desktopRoot = path.join(root, "dist", "desktop", "Korr");
const engineRoot = path.join(desktopRoot, "Korr engine - moteur - do not modify");
const webRoot = path.join(root, "dist", "web");
const extensionRoot = path.join(root, "dist", "extension");

const required = [
  path.join(root, "dist", `Korr-Setup-${version}.exe`),
  path.join(root, "dist", `korr-windows-${version}.zip`),
  path.join(root, "dist", `korr-${version}.zip`),
  path.join(webRoot, "index.html"),
  path.join(webRoot, "english-rules.js"),
  path.join(webRoot, "vendor", "harper", "harper_wasm_bg.wasm"),
  path.join(extensionRoot, "english-rules.js"),
  path.join(extensionRoot, "vendor", "harper", "harper_wasm_bg.wasm"),
  path.join(engineRoot, "english-engine.js"),
  path.join(engineRoot, "english-rules.js"),
  path.join(engineRoot, "language-detection.js"),
  path.join(engineRoot, "vendor", "harper", "binaryInlined.js"),
  path.join(engineRoot, "vendor", "harper", "LICENSE-HARPER"),
  path.join(engineRoot, "vendor", "harper", "LICENSE-FFLATE"),
  path.join(engineRoot, "runtime", "node.exe")
];
for (const file of required) assert.ok(fs.existsSync(file), `Artefact absent : ${path.relative(root, file)}`);

const setup = fs.readFileSync(path.join(root, "dist", `Korr-Setup-${version}.exe`));
assert.equal(setup.subarray(0, 2).toString("ascii"), "MZ", "L'installateur Windows n'est pas un EXE valide.");

const extensionManifest = JSON.parse(fs.readFileSync(path.join(extensionRoot, "manifest.json"), "utf8"));
assert.equal(extensionManifest.version, version);
assert.ok(extensionManifest.host_permissions?.includes("http://127.0.0.1:8787/*"));
assert.ok(Number(extensionManifest.minimum_chrome_version) >= 116);

const webManifest = JSON.parse(fs.readFileSync(path.join(webRoot, "manifest.webmanifest"), "utf8"));
assert.equal(webManifest.lang, "en");
for (const icon of webManifest.icons) {
  assert.ok(fs.existsSync(path.join(webRoot, icon.src)), `Icône PWA absente : ${icon.src}`);
}

const serviceWorker = fs.readFileSync(path.join(webRoot, "sw.js"), "utf8");
assert.ok(!serviceWorker.includes("__BUILD_ID__"), "Le cache du service worker n'est pas versionné.");
assert.match(serviceWorker, /english-rules\.js/u);
assert.match(serviceWorker, /SKIP_WAITING/u, "Le service worker ne peut pas activer une mise à jour en attente.");

const webApp = fs.readFileSync(path.join(webRoot, "app.js"), "utf8");
assert.match(webApp, /updateViaCache:\s*"none"/u, "Le navigateur peut réutiliser un ancien service worker HTTP.");
assert.match(webApp, /controllerchange/u, "La page ne s'actualise pas lorsque le nouveau cache prend le contrôle.");
assert.match(webApp, /hadController/u, "La première installation risque de provoquer un rechargement inutile.");

await verifyBundledBackend();
console.log("Site, extension, installateur et backend Windows : artefacts vérifiés.");

async function verifyBundledBackend() {
  const port = 18_788;
  const child = spawn(path.join(engineRoot, "runtime", "node.exe"), ["server.js"], {
    cwd: engineRoot,
    env: { ...process.env, PORT: String(port) },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  let logs = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { logs += chunk; });
  child.stderr.on("data", (chunk) => { logs += chunk; });

  try {
    const deadline = Date.now() + 20_000;
    while (!logs.includes("Korr prêt") && Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Le backend Windows s'est arrêté.\n${logs}`);
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    assert.match(logs, /Korr prêt/u, `Le backend Windows ne démarre pas.\n${logs}`);

    await assertCorrection(port, "Je suis aller au magasin hier.", "Je suis allé au magasin hier.", "grammalecte");
    await assertCorrection(port, "I has went home yesterday.", "I went home yesterday.", "harper");

    const mixedSource = "Bonjour, this is a test.";
    const mixed = await requestCorrection(port, mixedSource);
    assert.equal(mixed.text, mixedSource);
    assert.equal(mixed.engine, "mixed");
  } finally {
    child.kill();
  }
}

async function assertCorrection(port, source, expected, engine) {
  const result = await requestCorrection(port, source);
  assert.equal(result.text, expected);
  assert.equal(result.engine, engine);
}

async function requestCorrection(port, text) {
  const response = await fetch(`http://127.0.0.1:${port}/api/correct`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "instant", language: "auto", text })
  });
  assert.equal(response.status, 200);
  return response.json();
}
