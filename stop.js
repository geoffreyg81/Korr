// Arrête le backend, y compris lorsqu'il a été lancé sans fenêtre par le
// démarrage automatique. Le processus est retrouvé par le port qu'il écoute,
// puis son identité et sa ligne de commande sont vérifiées avant tout arrêt.
//
//   npm stop

import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PORT = Number(process.env.PORT) || 8787;
const PROJECT_DIR = path.dirname(fileURLToPath(import.meta.url));
const EXPECTED_SERVER_PATH = path.normalize(path.join(PROJECT_DIR, "server.js")).toLowerCase();

let pids;
try {
  pids = findListeningPids(PORT);
} catch (error) {
  console.error(`Impossible d'identifier le processus qui écoute sur le port ${PORT} : ${error.message}`);
  process.exit(1);
}

if (!pids.length) {
  console.log(`Aucun backend n'écoute sur le port ${PORT}. Rien à arrêter.`);
  process.exit(0);
}

// La ligne de commande prouve que le processus exécute server.js ; cette
// signature HTTP confirme en plus que le port répond bien comme Zéro Friction.
// Sans les deux preuves, npm stop échoue fermé et ne tue rien.
if (!(await hasBackendSignature(PORT))) {
  console.error(
    `Refus d'arrêter le processus du port ${PORT} : la signature HTTP de Zéro Friction n'a pas été confirmée.`
  );
  process.exit(1);
}

let stopped = 0;
for (const pid of pids) {
  let info;
  try {
    info = processInfo(pid);
  } catch (error) {
    console.error(`PID ${pid} ignoré : identité impossible à confirmer (${error.message}).`);
    continue;
  }

  const verification = verifyBackendProcess(info);
  if (!verification.ok) {
    console.error(`PID ${pid} ignoré : ${verification.reason}.`);
    continue;
  }

  try {
    process.kill(pid);
    console.log(`Backend arrêté (PID ${pid}).`);
    stopped += 1;
  } catch (error) {
    console.error(`Impossible d'arrêter le PID ${pid} : ${error.message}`);
  }
}

if (stopped !== pids.length) process.exitCode = 1;

function findListeningPids(port) {
  const output = execFileSync("netstat", ["-ano", "-p", "TCP"], {
    encoding: "utf8",
    windowsHide: true
  });

  const pids = new Set();
  for (const line of output.split(/\r?\n/u)) {
    // Ex. :  TCP    127.0.0.1:8787    0.0.0.0:0    LISTENING    17028
    const columns = line.trim().split(/\s+/u);
    if (columns.length < 5) continue;
    if (!/^LISTENING$/iu.test(columns[3])) continue;
    if (!columns[1].endsWith(`:${port}`)) continue;

    const pid = Number(columns[4]);
    if (Number.isInteger(pid) && pid > 0) pids.add(pid);
  }
  return [...pids];
}

function processInfo(pid) {
  // tasklist ne donne que le nom. CIM fournit aussi la ligne de commande, qui
  // permet d'éviter d'arrêter un autre serveur Node utilisant le même port.
  const command = [
    "$ErrorActionPreference = 'Stop'",
    "[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)",
    `$process = Get-CimInstance Win32_Process -Filter \"ProcessId = ${pid}\"`,
    "if ($null -eq $process) { throw 'Processus introuvable' }",
    "[pscustomobject]@{ Name = [string]$process.Name; ExecutablePath = [string]$process.ExecutablePath; CommandLine = [string]$process.CommandLine } | ConvertTo-Json -Compress"
  ].join("; ");

  const output = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", command], {
    encoding: "utf8",
    windowsHide: true
  })
    .replace(/^\uFEFF/u, "")
    .trim();

  if (!output) throw new Error("aucune information renvoyée par Windows");

  let info;
  try {
    info = JSON.parse(output);
  } catch {
    throw new Error("réponse Windows illisible");
  }

  if (!info || typeof info !== "object") throw new Error("identité Windows absente");
  return info;
}

function verifyBackendProcess(info) {
  const name = typeof info.Name === "string" ? info.Name.trim() : "";
  if (!name) return { ok: false, reason: "nom du processus inconnu" };
  if (!/^node(?:\.exe)?$/iu.test(name)) {
    return { ok: false, reason: `le processus n'est pas Node (${name})` };
  }

  const commandLine = typeof info.CommandLine === "string" ? info.CommandLine.trim() : "";
  if (!commandLine) return { ok: false, reason: "ligne de commande inaccessible" };

  const args = splitWindowsCommandLine(commandLine);
  if (!args.slice(1).some(isExpectedServerArgument)) {
    return { ok: false, reason: "la ligne de commande ne lance pas le server.js de Zéro Friction" };
  }

  return { ok: true };
}

function isExpectedServerArgument(argument) {
  if (typeof argument !== "string" || !argument) return false;

  if (path.isAbsolute(argument)) {
    return path.normalize(argument).toLowerCase() === EXPECTED_SERVER_PATH;
  }

  // npm start lance « node server.js » depuis la racine du projet. Dans ce
  // cas, la signature HTTP vérifiée plus haut lève l'ambiguïté du chemin relatif.
  const relative = argument.replaceAll("/", "\\").replace(/^\.\\/u, "").toLowerCase();
  return relative === "server.js";
}

function splitWindowsCommandLine(commandLine) {
  const args = [];
  let argument = "";
  let inQuotes = false;
  let started = false;

  for (let index = 0; index < commandLine.length; index += 1) {
    const character = commandLine[index];

    if (character === '"') {
      inQuotes = !inQuotes;
      started = true;
      continue;
    }

    if (/\s/u.test(character) && !inQuotes) {
      if (started) {
        args.push(argument);
        argument = "";
        started = false;
      }
      continue;
    }

    argument += character;
    started = true;
  }

  if (started) args.push(argument);
  return args;
}

async function hasBackendSignature(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(2_000)
    });
    if (!response.ok) return false;

    const data = await response.json();
    return (
      data?.status === "backend actif" &&
      data?.health === "/api/health" &&
      typeof data?.defaultEngine === "string" &&
      data.defaultEngine.includes("Grammalecte")
    );
  } catch {
    return false;
  }
}
