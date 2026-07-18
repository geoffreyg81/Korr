// Construit le paquet à envoyer aux boutiques d'extensions.
//
// Le dossier de développement contient aussi le backend Node et l'application
// Windows, qui n'ont rien à faire dans l'extension : les inclure gonflerait le
// paquet et attirerait l'attention des relecteurs sur du code inutilisé.
// Ce script ne copie que les fichiers réellement chargés par le manifeste.
//
//   npm run package   ->  dist/zero-friction-<version>.zip

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DIST_DIR = path.join(PROJECT_DIR, "dist");
const manifest = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "manifest.json"), "utf8"));
const STAGING_DIR = path.join(DIST_DIR, "extension");
const ZIP_PATH = path.join(DIST_DIR, `zero-friction-${manifest.version}.zip`);

// Tout ce que l'extension charge, et rien d'autre.
const FILES = [
  "manifest.json",
  "background.js",
  "content.js",
  "content.css",
  "popup.html",
  "popup.css",
  "popup.js",
  "offscreen.html",
  "offscreen.js",
  "grammalecte-worker.js",
  "grammar-rules.js",
  "LICENSE",
  "PRIVACY.md"
];
const DIRECTORIES = ["icons", "vendor"];

// On ne nettoie que ce que ce script produit : « dist » héberge aussi le site
// construit par build-web.js, qu'un effacement global détruirait.
fs.rmSync(STAGING_DIR, { recursive: true, force: true });
fs.rmSync(ZIP_PATH, { force: true });
fs.mkdirSync(STAGING_DIR, { recursive: true });

for (const file of FILES) {
  const source = path.join(PROJECT_DIR, file);
  if (!fs.existsSync(source)) {
    console.error(`Fichier manquant : ${file}`);
    process.exit(1);
  }
  fs.copyFileSync(source, path.join(STAGING_DIR, file));
}
for (const directory of DIRECTORIES) {
  const source = path.join(PROJECT_DIR, directory);
  if (!fs.existsSync(source)) {
    console.error(`Dossier manquant : ${directory}`);
    process.exit(1);
  }
  fs.cpSync(source, path.join(STAGING_DIR, directory), { recursive: true });
}

// Vérifie que rien de superflu n'a été embarqué.
const forbidden = ["server.js", "grammar-engine.js", "app-tray.ps1", "app.vbs", "stop.js", "autostart.js", ".vendor"];
for (const name of forbidden) {
  if (fs.existsSync(path.join(STAGING_DIR, name))) {
    console.error(`Le paquet contient ${name}, qui doit rester hors de l'extension.`);
    process.exit(1);
  }
}

execFileSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -Path "${STAGING_DIR}\\*" -DestinationPath "${ZIP_PATH}" -Force`
], { windowsHide: true });

const sizeMo = fs.statSync(ZIP_PATH).size / 1024 / 1024;
console.log(`Paquet prêt : ${path.relative(PROJECT_DIR, ZIP_PATH)}`);
console.log(`Taille : ${sizeMo.toFixed(1)} Mo (limite des boutiques : 100 Mo)`);
console.log(`Version : ${manifest.version}`);
