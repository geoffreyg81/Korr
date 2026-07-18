// Construit l'application de bureau autonome, à télécharger depuis le site.
//
// L'utilisateur final n'a pas Node.js : le paquet embarque donc le runtime
// (licence MIT, redistribuable) à côté du correcteur. Aucune installation
// préalable, aucune ligne de commande.
//
//   npm run build:desktop   ->  dist/korr-windows-<version>.zip

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const VERSION = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, "package.json"), "utf8")).version;
const OUT_DIR = path.join(PROJECT_DIR, "dist", "desktop");
const APP_DIR = path.join(OUT_DIR, "Korr");
const INTERNAL_DIR = path.join(APP_DIR, "Fichiers de Korr - ne pas modifier");
const ZIP_PATH = path.join(PROJECT_DIR, "dist", `korr-windows-${VERSION}.zip`);
const ICO_PATH = path.join(OUT_DIR, "korr.ico");
const SETUP_PATH = path.join(PROJECT_DIR, "dist", `Korr-Setup-${VERSION}.exe`);

const FILES = [
  "server.js",
  "grammar-engine.js",
  "grammar-rules.js",
  "stop.js",
  "app-tray.ps1",
  "LICENSE",
  "PRIVACY.md"
];

fs.rmSync(OUT_DIR, { recursive: true, force: true });
fs.rmSync(ZIP_PATH, { force: true });
fs.mkdirSync(INTERNAL_DIR, { recursive: true });

for (const file of FILES) {
  const source = path.join(PROJECT_DIR, file);
  if (!fs.existsSync(source)) {
    console.error(`Fichier manquant : ${file}`);
    process.exit(1);
  }
  fs.copyFileSync(source, path.join(INTERNAL_DIR, file));
}

// Le moteur : Grammalecte complet est inutile, seul le sous-ensemble embarqué
// sert. On le range là où grammar-engine.js le cherche.
fs.cpSync(
  path.join(PROJECT_DIR, "vendor", "grammalecte"),
  path.join(INTERNAL_DIR, ".vendor", "grammalecte-js", "grammalecte"),
  { recursive: true }
);
fs.cpSync(path.join(PROJECT_DIR, "icons"), path.join(INTERNAL_DIR, "icons"), { recursive: true });
createIcoFromPng(path.join(PROJECT_DIR, "icons", "icon-32.png"), ICO_PATH);
fs.copyFileSync(ICO_PATH, path.join(INTERNAL_DIR, "icons", "korr.ico"));

// Runtime Node, embarqué sous licence MIT.
const runtimeDir = path.join(INTERNAL_DIR, "runtime");
fs.mkdirSync(runtimeDir);
fs.copyFileSync(process.execPath, path.join(runtimeDir, "node.exe"));
fs.writeFileSync(
  path.join(runtimeDir, "LICENCE-NODEJS.txt"),
  [
    "Ce dossier contient Node.js, redistribué sous licence MIT.",
    "Node.js est un projet de la OpenJS Foundation.",
    "Texte complet de la licence : https://github.com/nodejs/node/blob/main/LICENSE",
    ""
  ].join("\r\n"),
  "latin1"
);

writeWindowsFile(path.join(APP_DIR, "1 - DÉMARRER KORR.vbs"), [
  "' Lance Korr sans fenêtre. Ne pas déplacer ce fichier hors du dossier Korr.",
  "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
  "rootDir = fso.GetParentFolderName(WScript.ScriptFullName)",
  "appDir = fso.BuildPath(rootDir, \"Fichiers de Korr - ne pas modifier\")",
  "If Not fso.FolderExists(appDir) Then",
  "  MsgBox \"Korr est encore dans le fichier ZIP. Fermez cette fenêtre, faites un clic droit sur le ZIP, choisissez 'Extraire tout', puis lancez Korr depuis le dossier extrait.\", 48, \"Korr - extraction nécessaire\"",
  "  WScript.Quit 1",
  "End If",
  "Set shell = CreateObject(\"WScript.Shell\")",
  "shell.CurrentDirectory = appDir",
  "shell.Run \"powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File \"\"\" & appDir & \"\\app-tray.ps1\"\"\", 0, False",
  ""
]);

writeWindowsFile(path.join(APP_DIR, "2 - LANCER KORR AVEC WINDOWS.vbs"), [
  "' Ajoute (ou retire) Korr au démarrage de Windows.",
  "Set fso = CreateObject(\"Scripting.FileSystemObject\")",
  "Set shell = CreateObject(\"WScript.Shell\")",
  "appDir = fso.GetParentFolderName(WScript.ScriptFullName)",
  "engineDir = fso.BuildPath(appDir, \"Fichiers de Korr - ne pas modifier\")",
  "If Not fso.FolderExists(engineDir) Then",
  "  MsgBox \"Korr est encore dans le fichier ZIP. Utilisez d'abord 'Extraire tout', puis recommencez depuis le dossier extrait.\", 48, \"Korr - extraction nécessaire\"",
  "  WScript.Quit 1",
  "End If",
  "startup = shell.SpecialFolders(\"Startup\")",
  "linkPath = startup & \"\\Korr.lnk\"",
  "If fso.FileExists(linkPath) Then",
  "  fso.DeleteFile linkPath",
  "  MsgBox \"Korr ne démarrera plus automatiquement.\", 64, \"Korr\"",
  "Else",
  "  Set link = shell.CreateShortcut(linkPath)",
  "  link.TargetPath = appDir & \"\\1 - DÉMARRER KORR.vbs\"",
  "  link.WorkingDirectory = appDir",
  "  link.Description = \"Correcteur de français Korr\"",
  "  link.Save",
  "  MsgBox \"Korr démarrera avec Windows.\", 64, \"Korr\"",
  "End If",
  ""
]);

writeWindowsFile(path.join(APP_DIR, "0 - À LIRE AVANT DE COMMENCER.txt"), [
  "KORR - DÉMARRAGE RAPIDE",
  "======================================",
  "",
  "SI WINDOWS BLOQUE KORR",
  "",
  "  1. Revenez au fichier ZIP que vous avez téléchargé.",
  "  2. Clic droit sur le ZIP, puis « Propriétés ».",
  "  3. Cochez « Débloquer » en bas de la fenêtre, puis « Appliquer ».",
  "  4. Décompressez de nouveau le ZIP et ouvrez le nouveau dossier Korr.",
  "",
  "  Cette protection apparaît parce que Korr n'est pas encore signé avec un",
  "  certificat payant. Le programme fonctionne entièrement hors ligne.",
  "",
  "1. DÉMARRER KORR",
  "",
  "  Double-cliquez sur « 1 - DÉMARRER KORR ».",
  "  Il n'y a rien à installer et aucune fenêtre ne reste ouverte.",
  "",
  "  Une icône violette apparaît près de l'horloge. Si vous ne la voyez pas,",
  "  cliquez sur le chevron ^ à gauche de l'horloge, puis faites-la glisser",
  "  sur la barre des tâches pour l'y garder.",
  "",
  "UTILISER - dans n'importe quelle application",
  "",
  "  1. Sélectionnez du texte (Word, navigateur, messagerie, courriel...).",
  "  2. Appuyez sur Ctrl+Alt+C.",
  "  3. Le texte corrigé remplace la sélection. Ctrl+Z pour annuler.",
  "",
  "  Ctrl+Alt+P   réécrit en style professionnel *",
  "  Ctrl+Alt+A   réécrit en style amical *",
  "  Ctrl+Alt+R   raccourcit le texte *",
  "",
  "  * Ces trois styles demandent Ollama, à installer séparément. La",
  "    correction avec Ctrl+Alt+C fonctionne sans rien d'autre.",
  "",
  "2. LANCER AUTOMATIQUEMENT AVEC WINDOWS (FACULTATIF)",
  "",
  "  Double-cliquez sur « 2 - LANCER KORR AVEC WINDOWS ».",
  "  Un second double-clic désactive le démarrage automatique.",
  "",
  "À NE PAS MODIFIER",
  "",
  "  Le dossier « Fichiers de Korr - ne pas modifier » contient le moteur.",
  "  Vous pouvez l'ignorer, mais ne le supprimez pas et ne le déplacez pas.",
  "",
  "QUITTER",
  "",
  "  Clic droit sur l'icône, puis « Quitter ».",
  "",
  "VIE PRIVÉE",
  "",
  "  Tout se passe sur votre ordinateur. Aucun texte n'est envoyé sur",
  "  Internet : il n'y a ni serveur, ni compte, ni traceur. Voir PRIVACY.md.",
  "",
  "AVERTISSEMENT WINDOWS",
  "",
  "  L'application n'étant pas signée, Windows peut afficher « Windows a",
  "  protégé votre ordinateur ». Cliquez sur « Informations complémentaires »",
  "  puis « Exécuter quand même ». Le code est public et vérifiable :",
  "  https://github.com/ggine/korr",
  "",
  "LICENCE",
  "",
  "  Logiciel libre sous GNU GPL 3.0 (voir LICENSE).",
  "  Correcteur Grammalecte 2.3.0 - https://grammalecte.net",
  "  Runtime Node.js sous licence MIT (dans le dossier technique).",
  ""
]);

execFileSync("powershell.exe", [
  "-NoProfile",
  "-Command",
  `Compress-Archive -Path "${APP_DIR}" -DestinationPath "${ZIP_PATH}" -Force`
], { windowsHide: true });

const sizeMo = fs.statSync(ZIP_PATH).size / 1024 / 1024;
console.log(`Application prête : ${path.relative(PROJECT_DIR, ZIP_PATH)}`);
console.log(`Téléchargement : ${sizeMo.toFixed(0)} Mo (runtime Node inclus, rien à installer)`);

// Installateur Windows en un seul EXE. Inno Setup reste un outil de build :
// l'utilisateur final n'a rien d'autre à télécharger.
const innoCompiler = process.env.ISCC_PATH || path.join(PROJECT_DIR, ".tools", "inno-setup", "ISCC.exe");
if (fs.existsSync(innoCompiler)) {
  fs.rmSync(SETUP_PATH, { force: true });
  execFileSync(innoCompiler, [
    `/DAppVersion=${VERSION}`,
    path.join(PROJECT_DIR, "installer.iss")
  ], { cwd: PROJECT_DIR, windowsHide: true, stdio: "inherit" });
  const setupSizeMo = fs.statSync(SETUP_PATH).size / 1024 / 1024;
  console.log(`Installateur prêt : ${path.relative(PROJECT_DIR, SETUP_PATH)} (${setupSizeMo.toFixed(0)} Mo)`);
} else {
  console.warn("Inno Setup absent : ZIP créé, mais pas Korr-Setup.exe. Définissez ISCC_PATH ou installez Inno Setup.");
}

// Les fins de ligne Windows et l'encodage latin1 évitent les caractères
// illisibles dans le Bloc-notes et dans les scripts VBScript.
function writeWindowsFile(target, lines) {
  fs.writeFileSync(target, lines.join("\r\n"), "latin1");
}

function createIcoFromPng(pngPath, icoPath) {
  const png = fs.readFileSync(pngPath);
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (png.length < 24 || !png.subarray(0, 8).equals(signature)) {
    throw new Error(`Image PNG invalide : ${path.relative(PROJECT_DIR, pngPath)}`);
  }
  const width = png.readUInt32BE(16);
  const height = png.readUInt32BE(20);
  const header = Buffer.alloc(6);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  const entry = Buffer.alloc(16);
  entry[0] = width === 256 ? 0 : width;
  entry[1] = height === 256 ? 0 : height;
  entry.writeUInt16LE(1, 4);
  entry.writeUInt16LE(32, 6);
  entry.writeUInt32LE(png.length, 8);
  entry.writeUInt32LE(header.length + entry.length, 12);
  fs.writeFileSync(icoPath, Buffer.concat([header, entry, png]));
}
