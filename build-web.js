// Construit le site (et l'application installable) dans dist/web.
//
// Le site réutilise tel quel le moteur de l'extension : le Worker, les règles
// et le dictionnaire sont les mêmes fichiers. Il n'y a donc qu'une seule
// implémentation de la correction à maintenir.
//
//   npm run build:web

import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(PROJECT_DIR, "dist", "web");

function version() {
  return JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "package.json"), "utf8")).version;
}

// Fichiers propres au site.
const WEB_FILES = ["index.html", "app.css", "app.js", "i18n.js", "sw.js", "manifest.webmanifest"];
// Moteur partagé avec l'extension.
const SHARED_FILES = [
  "grammalecte-worker.js", "harper-worker.js", "language-detection.js",
  "grammar-rules.js", "english-rules.js", "LICENSE", "PRIVACY.md", "PRIVACY.en.md"
];
const DIRECTORIES = ["icons", "vendor"];
const HARPER_FILES = [
  "index.js", "binary.js", "BinaryModule-DTTQwokQ.js", "harper_wasm_bg.wasm",
  "LICENSE-HARPER", "LICENSE-FFLATE"
];

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

// Le contenu éditorial du site utilise uniquement le tiret simple. Ce contrôle
// empêche une ancienne formulation avec un tiret cadratin ou demi-cadratin de
// revenir silencieusement lors d'une prochaine modification.
for (const file of WEB_FILES.filter((name) => /\.(?:html|css|js|webmanifest)$/u.test(name))) {
  const output = path.join(OUT_DIR, file);
  if (/[—–]/u.test(fs.readFileSync(output, "utf8"))) {
    console.error(`Tiret long interdit dans le contenu web : web/${file}`);
    process.exit(1);
  }
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
copyHarperRuntime(OUT_DIR);

// Les navigateurs demandent encore /favicon.ico même lorsqu'une icône PNG est
// déclarée. On génère un véritable conteneur ICO à partir de notre PNG 32 px,
// sans dépendance supplémentaire et sans dupliquer un fichier binaire source.
const faviconPath = path.join(OUT_DIR, "favicon.ico");
createIcoFromPng(path.join(PROJECT_DIR, "icons", "icon-32.png"), faviconPath);

// L'application Windows. Deux façons de la distribuer :
//
// - ZF_DOWNLOAD_URL défini : le bouton pointe vers cette adresse, typiquement
//   une release GitHub. Le déploiement reste léger et échappe aux limites de
//   taille des hébergeurs.
// - sinon : l'installateur EXE est copié dans le site, pratique en local.
const downloadUrl = process.env.ZF_DOWNLOAD_URL;
const desktopSetup = path.join(PROJECT_DIR, "dist", `Korr-Setup-${version()}.exe`);
const releaseDownloadUrl = `https://github.com/geoffreyg81/Korr/releases/download/v${version()}/Korr-Setup-${version()}.exe`;

if (downloadUrl) {
  const indexPath = path.join(OUT_DIR, "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replace(
    /href="Korr-Setup\.exe" download/u,
    `href="${downloadUrl}" rel="noopener"`
  );
  fs.writeFileSync(indexPath, html);
  console.log(`Téléchargement externe : ${downloadUrl}`);
} else if (fs.existsSync(desktopSetup)) {
  fs.copyFileSync(desktopSetup, path.join(OUT_DIR, "Korr-Setup.exe"));
  const mo = fs.statSync(desktopSetup).size / 1024 / 1024;
  console.log(`Installateur Windows inclus dans le site : ${mo.toFixed(0)} Mo`);
  console.log("  (définissez ZF_DOWNLOAD_URL pour pointer vers une release à la place)");
} else {
  const indexPath = path.join(OUT_DIR, "index.html");
  const html = fs.readFileSync(indexPath, "utf8").replace(
    /href="Korr-Setup\.exe" download/u,
    `href="${releaseDownloadUrl}" rel="noopener"`
  );
  fs.writeFileSync(indexPath, html);
  console.log(`Téléchargement GitHub Release : ${releaseDownloadUrl}`);
  // Ce lien est fabriqué à partir du numéro de version : rien ne garantit que
  // la release correspondante ait été publiée. Sans ce contrôle, une montée de
  // version livre un bouton de téléchargement mort, en silence.
  await warnIfDownloadMissing(releaseDownloadUrl);
}

async function warnIfDownloadMissing(url) {
  let status;
  try {
    const response = await fetch(url, { method: "HEAD", redirect: "follow",
      signal: AbortSignal.timeout(15_000) });
    status = response.status;
  } catch {
    console.log("  (release non vérifiée : pas de réseau pendant la construction)");
    return;
  }
  if (status === 200) {
    console.log("  Release vérifiée : le fichier est téléchargeable.");
    return;
  }
  console.warn(`\n  ATTENTION : la release renvoie ${status}. Le bouton de téléchargement du site`);
  console.warn(`  mènera vers une page introuvable. Publiez-la avant de déployer :`);
  console.warn(`    gh release create v${version()} "dist/Korr-Setup-${version()}.exe" --repo geoffreyg81/Korr\n`);
}

// Empreinte déterministe de l'enveloppe publiée. Le service worker change dès
// que le site ou le moteur partagé change, puis supprime l'ancien cache durant
// son activation. Les visiteurs ne restent donc plus bloqués sur une ancienne
// version après un déploiement.
const buildHash = createHash("sha256");
for (const file of [...WEB_FILES, ...SHARED_FILES, "favicon.ico"]) {
  buildHash.update(fs.readFileSync(path.join(OUT_DIR, file)));
}
for (const directory of ["icons", path.join("vendor", "grammalecte"), path.join("vendor", "harper")]) {
  hashDirectory(buildHash, path.join(OUT_DIR, directory), directory);
}
const buildId = buildHash.digest("hex").slice(0, 12);
const serviceWorkerPath = path.join(OUT_DIR, "sw.js");
const serviceWorker = fs.readFileSync(serviceWorkerPath, "utf8");
if (!serviceWorker.includes("__BUILD_ID__")) {
  console.error("Jeton de version du service worker absent : __BUILD_ID__");
  process.exit(1);
}
fs.writeFileSync(serviceWorkerPath, serviceWorker.replace("__BUILD_ID__", buildId));

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
console.log(`Poids brut : ${(totalBytes / 1024 / 1024).toFixed(1)} Mo (Harper est chargé uniquement pour l'anglais)`);
console.log(`Icônes vérifiées : ${manifest.icons.length}`);
console.log(`Cache web : korr-${buildId}`);

function directorySize(directory) {
  let total = 0;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    total += entry.isDirectory() ? directorySize(full) : fs.statSync(full).size;
  }
  return total;
}

function hashDirectory(hash, directory, relativeDirectory) {
  const entries = fs.readdirSync(directory, { withFileTypes: true })
    .sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.join(relativeDirectory, entry.name).replaceAll("\\", "/");
    if (entry.isDirectory()) hashDirectory(hash, full, relative);
    else {
      hash.update(relative);
      hash.update(fs.readFileSync(full));
    }
  }
}

function copyHarperRuntime(destination) {
  const source = path.join(PROJECT_DIR, "node_modules", "harper.js", "dist");
  const target = path.join(destination, "vendor", "harper");
  fs.mkdirSync(target, { recursive: true });
  for (const file of HARPER_FILES.slice(0, 4)) {
    const input = path.join(source, file);
    if (!fs.existsSync(input)) throw new Error(`Harper incomplet : ${file}`);
    fs.copyFileSync(input, path.join(target, file));
  }
  fs.copyFileSync(path.join(PROJECT_DIR, "node_modules", "harper.js", "LICENSE"), path.join(target, "LICENSE-HARPER"));
  fs.copyFileSync(path.join(PROJECT_DIR, "node_modules", "fflate", "LICENSE"), path.join(target, "LICENSE-FFLATE"));
}

function createIcoFromPng(pngPath, icoPath) {
  const png = fs.readFileSync(pngPath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)) {
    throw new Error(`Image PNG invalide : ${path.relative(PROJECT_DIR, pngPath)}`);
  }

  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  if (width < 1 || width > 256 || height < 1 || height > 256) {
    throw new Error(`Dimensions incompatibles avec ICO : ${width}x${height}`);
  }

  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2); // type 1 : icône
  header.writeUInt16LE(1, 4); // une image

  const entry = Buffer.alloc(16);
  entry[0] = width === 256 ? 0 : width;
  entry[1] = height === 256 ? 0 : height;
  entry.writeUInt16LE(1, 4); // plans de couleur
  entry.writeUInt16LE(32, 6); // profondeur
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);

  fs.writeFileSync(icoPath, Buffer.concat([header, entry, png]));
}
