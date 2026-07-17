// Installe ou retire le démarrage automatique du backend à l'ouverture de la
// session Windows. Aucune dépendance, aucun droit administrateur : un simple
// script .vbs est déposé dans le dossier « Démarrage » de l'utilisateur, qui
// lance « node server.js » sans fenêtre.
//
//   npm run autostart:install       → active le démarrage automatique du backend
//   npm run autostart:remove        → le désactive
//   npm run autostart:install-app   → idem pour l'application de bureau (Ctrl+Alt+C)
//   npm run autostart:remove-app    → la retire du démarrage
//   npm run autostart:status        → état des deux

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const LAUNCHER_NAME = "zero-friction-backend.vbs";
const APP_LAUNCHER_NAME = "zero-friction-app.vbs";

const startupDir = process.env.APPDATA
  ? path.join(process.env.APPDATA, "Microsoft", "Windows", "Start Menu", "Programs", "Startup")
  : "";
const launcherPath = startupDir ? path.join(startupDir, LAUNCHER_NAME) : "";
const appLauncherPath = startupDir ? path.join(startupDir, APP_LAUNCHER_NAME) : "";

const action = process.argv[2];

if (process.platform !== "win32" || !startupDir) {
  console.error("Le démarrage automatique n'est disponible que sous Windows.");
  process.exit(1);
}

if (action === "install") {
  const nodePath = process.execPath;
  const serverPath = path.join(PROJECT_DIR, "server.js");
  const command = `"${nodePath}" "${serverPath}"`;
  const script = [
    "' Démarre le backend Zéro Friction sans fenêtre à l'ouverture de session.",
    "' Généré par « npm run autostart:install ». Supprimable par « npm run autostart:remove »",
    "' ou en effaçant simplement ce fichier.",
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = ${vbsString(PROJECT_DIR)}`,
    `shell.Run ${vbsString(command)}, 0, False`,
    ""
  ].join("\r\n");

  writeUnicodeVbs(launcherPath, script);
  console.log("Démarrage automatique activé.");
  console.log(`Lanceur : ${launcherPath}`);
  console.log("Le backend se lancera sans fenêtre à la prochaine ouverture de session.");
  console.log(`Pour le lancer dès maintenant : wscript "${launcherPath}"`);
} else if (action === "remove") {
  if (fs.existsSync(launcherPath)) {
    fs.unlinkSync(launcherPath);
    console.log("Démarrage automatique désactivé.");
  } else {
    console.log("Le démarrage automatique n'était pas activé.");
  }
} else if (action === "install-app") {
  const command = `wscript.exe "${path.join(PROJECT_DIR, "app.vbs")}"`;
  const script = [
    "' Lance l'application de bureau Zéro Friction à l'ouverture de session.",
    "' Généré par « npm run autostart:install-app ».",
    'Set shell = CreateObject("WScript.Shell")',
    `shell.CurrentDirectory = ${vbsString(PROJECT_DIR)}`,
    `shell.Run ${vbsString(command)}, 0, False`,
    ""
  ].join("\r\n");

  writeUnicodeVbs(appLauncherPath, script);
  console.log("Application de bureau ajoutée au démarrage de session.");
  console.log(`Lanceur : ${appLauncherPath}`);
} else if (action === "remove-app") {
  if (fs.existsSync(appLauncherPath)) {
    fs.unlinkSync(appLauncherPath);
    console.log("Application de bureau retirée du démarrage.");
  } else {
    console.log("L'application n'était pas au démarrage.");
  }
} else if (action === "status") {
  console.log(
    fs.existsSync(launcherPath)
      ? `Backend au démarrage : oui (${launcherPath}).`
      : "Backend au démarrage : non."
  );
  console.log(
    fs.existsSync(appLauncherPath)
      ? `Application au démarrage : oui (${appLauncherPath}).`
      : "Application au démarrage : non."
  );
} else {
  console.error("Usage : node autostart.js install | remove | install-app | remove-app | status");
  process.exit(1);
}

function vbsString(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function writeUnicodeVbs(filePath, script) {
  // Windows Script Host reconnaît de façon fiable l'Unicode lorsque le VBS est
  // en UTF-16LE avec BOM. Les chemins contenant accents ou caractères non
  // latins ne sont donc plus dégradés par l'ancien encodage latin1.
  const bom = Buffer.from([0xff, 0xfe]);
  const contents = Buffer.from(script, "utf16le");
  fs.writeFileSync(filePath, Buffer.concat([bom, contents]));
}
