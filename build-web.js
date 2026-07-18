// Construit le site (et l'application installable) dans dist/web.
//
// Le site réutilise tel quel le moteur de l'extension : le Worker, les règles
// et le dictionnaire sont les mêmes fichiers. Il n'y a donc qu'une seule
// implémentation de la correction à maintenir.
//
//   npm run build:web

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(PROJECT_DIR, "dist", "web");

function version() {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "package.json"), "utf8")).version;
}

// Fichiers propres au site.
const WEB_FILES = ["index.html", "app.css", "app.js", "sw.js", "manifest.webmanifest"];
// Moteur partagé avec l'extension.
const SHARED_FILES = ["grammalecte-worker.js", "grammar-rules.js", "LICENSE", "PRIVACY.md"];
const DIRECTORIES = ["icons", "vendor"];

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

for (const file of WEB_FILES) {
  const source = path.join(PROJECT_DIR, "web", file);
  if (!fs.existsSync(source)) {
    console.error(`Fichier manquant : web/${file}`);
    process.exit(1);
  }
  fs.copyFileSync(source, path.join(OUT_DIR, file));
}
for (const file of SHARED_FILES) {
  const source = path.join(PROJECT_DIR, file);
  if (!fs.existsSync(source)) {
    console.error(`Fichier manquant : ${file}`);
    process.exit(1);
  }
  fs.copyFileSync(source, path.join(OUT_DIR, file));
}
for (const directory of DIRECTORIES) {
  fs.cpSync(path.join(PROJECT_DIR, directory), path.join(OUT_DIR, directory), { recursive: true });
}

// L'application Windows. Deux façons de la distribuer :
//
// - ZF_DOWNLOAD_URL défini : le bouton pointe vers cette adresse, typiquement
//   une release GitHub. Le déploiement reste léger et échappe aux limites de
//   taille des hébergeurs.
// - sinon : le zip est copié dans le site, pratique pour tester en local.
const downloadUrl = process.env.ZF_DOWNLOAD_URL;
const desktopZip = path.join(PROJECT_DIR, "dist", `korr-windows-${version()}.zip`);

if (downloadUrl) {
  const indexPath = path.join(OUT_DIR, "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replace(
    /href="korr-windows\.zip" download/u,
    `href="${downloadUrl}" rel="noopener"`
  );
  fs.writeFileSync(indexPath, html);
  console.log(`Téléchargement externe : ${downloadUrl}`);
} else if (fs.existsSync(desktopZip)) {
  fs.copyFileSync(desktopZip, path.join(OUT_DIR, "korr-windows.zip"));
  const mo = fs.statSync(desktopZip).size / 1024 / 1024;
  console.log(`Application Windows incluse dans le site : ${mo.toFixed(0)} Mo`);
  console.log("  (définissez ZF_DOWNLOAD_URL pour pointer vers une release à la place)");
} else {
  console.warn("⚠ Application Windows absente : lancez « npm run build:desktop », ou définissez ZF_DOWNLOAD_URL.");
}

// Les icônes déclarées dans le manifeste doivent exister, sinon l'application
// n'est pas installable et le navigateur reste silencieux sur la cause.
const manifest = JSON.parse(fs.readFileSync(path.join(OUT_DIR, "manifest.webmanifest"), "utf8"));
for (const icon of manifest.icons) {
  if (!fs.existsSync(path.join(OUT_DIR, icon.src))) {
    console.error(`Icône déclarée mais absente : ${icon.src}`);
    process.exit(1);
  }
}

const totalBytes = directorySize(OUT_DIR);
console.log(`Site prêt : ${path.relative(PROJECT_DIR, OUT_DIR)}`);
console.log(`Poids brut : ${(totalBytes / 1024 / 1024).toFixed(1)} Mo (~2 Mo transférés, gzip)`);
console.log(`Icônes vérifiées : ${manifest.icons.length}`);

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(full) : fs.statSync(full).size;
  }
  return total;
}
