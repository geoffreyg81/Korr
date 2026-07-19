// Rend la démonstration Product Hunt en MP4.
//
// Le principe : la page expose seekTo(t) et positionne son animation à
// l'instant demandé. On photographie donc une image exacte par pas de temps,
// au lieu d'enregistrer un flux temps réel — la vidéo est parfaitement fluide
// même si le rendu d'une image prend 200 ms.
//
//   node demo/render-video.js [--fps 30] [--scale 1] [--out chemin.mp4]

import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import puppeteer from "puppeteer-core";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const index = args.indexOf(`--${name}`);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
};

const FPS = Number(flag("fps", 30));
const SCALE = Number(flag("scale", 1));
const OUT = path.resolve(ROOT, flag("out", "dist/korr-product-hunt.mp4"));
const PAGE = path.join(HERE, "product-hunt.html");
const WIDTH = 1920;
const HEIGHT = 1080;

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium"
];

// L'ordre compte : on privilégie une compilation qui embarque libx264. Sous
// Windows, l'encodeur système h264_mf reste bloqué en profil Constrained
// Baseline à bas débit, ce qui fait apparaître du banding dans les dégradés
// sombres de la scène.
const FFMPEG_CANDIDATES = [
  process.env.FFMPEG_PATH,
  path.join(ROOT, "node_modules/@ffmpeg-installer/win32-x64/ffmpeg.exe"),
  path.join(ROOT, "node_modules/@ffmpeg-installer/ffmpeg/ffmpeg"),
  path.join(ROOT, "node_modules/ffmpeg-static/ffmpeg.exe"),
  path.join(ROOT, "node_modules/ffmpeg-static/ffmpeg"),
  `${process.env.LOCALAPPDATA}/Programs/Softdeluxe/Free Download Manager/ffmpeg.exe`,
  "ffmpeg"
];

function findExecutable(candidates, label) {
  for (const candidate of candidates) {
    if (!candidate) continue;
    if (candidate === "ffmpeg") return candidate; // laissé au PATH
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(`${label} introuvable. Renseignez la variable d'environnement correspondante.`);
}

// Tous les ffmpeg n'embarquent pas libx264 ; MediaFoundation prend le relais
// sous Windows et produit un H.264 tout aussi lisible par les plateformes.
function pickEncoder(ffmpegPath) {
  const probe = spawn(ffmpegPath, ["-hide_banner", "-encoders"]);
  return new Promise((resolve) => {
    let out = "";
    probe.stdout.on("data", (chunk) => { out += chunk; });
    probe.on("close", () => {
      if (/\blibx264\b/.test(out)) resolve({ codec: "libx264", extra: ["-crf", "16", "-preset", "slow", "-profile:v", "high", "-level", "4.2"] });
      else if (/\bh264_mf\b/.test(out)) resolve({ codec: "h264_mf", extra: ["-b:v", "14M", "-rate_control", "quality", "-quality", "100"] });
      else resolve({ codec: "mpeg4", extra: ["-q:v", "2"] });
    });
    probe.on("error", () => resolve({ codec: "mpeg4", extra: ["-q:v", "2"] }));
  });
}

// Écriture avec gestion du contre-débit : sans cela, les images s'accumulent
// en mémoire quand l'encodeur est plus lent que le navigateur. L'écouteur
// d'erreur est posé une seule fois par l'appelant : en attacher un par image
// ferait fuir des milliers de gestionnaires sur le même flux.
const writeFrame = (stream, buffer) =>
  new Promise((resolve) => {
    if (stream.write(buffer)) resolve();
    else stream.once("drain", resolve);
  });

async function main() {
  const chromePath = findExecutable(CHROME_CANDIDATES, "Chrome");
  const ffmpegPath = findExecutable(FFMPEG_CANDIDATES, "ffmpeg");
  const { codec, extra } = await pickEncoder(ffmpegPath);

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  console.log(`Chrome  : ${chromePath}`);
  console.log(`ffmpeg  : ${ffmpegPath} (${codec})`);

  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: "new",
    args: [
      `--window-size=${WIDTH},${HEIGHT}`,
      "--hide-scrollbars",
      "--force-color-profile=srgb",
      "--font-render-hinting=none",
      "--disable-lcd-text",
      "--allow-file-access-from-files"
    ]
  });

  const page = await browser.newPage();
  await page.setViewport({ width: WIDTH, height: HEIGHT, deviceScaleFactor: SCALE });
  await page.goto(`file://${PAGE.replace(/\\/g, "/")}`, { waitUntil: "networkidle0" });
  await page.evaluate(() => document.fonts.ready);

  const duration = await page.evaluate(() => window.KORR_DURATION);
  const total = Math.round(duration * FPS);
  console.log(`Durée   : ${duration.toFixed(1)} s → ${total} images à ${FPS} i/s\n`);

  const ffmpeg = spawn(ffmpegPath, [
    "-y",
    "-f", "image2pipe", "-c:v", "png", "-framerate", String(FPS), "-i", "-",
    "-c:v", codec, ...extra,
    "-pix_fmt", "yuv420p",
    "-vf", `scale=${WIDTH}:${HEIGHT}`,
    "-movflags", "+faststart",
    OUT
  ], { stdio: ["pipe", "ignore", "pipe"] });

  let ffmpegLog = "";
  ffmpeg.stderr.on("data", (chunk) => { ffmpegLog += chunk; });
  // Un encodeur qui meurt en cours de route casse le tuyau : sans ce
  // gestionnaire, l'écriture de l'image suivante ferait planter le processus.
  ffmpeg.stdin.on("error", () => {});
  const finished = new Promise((resolve, reject) => {
    ffmpeg.on("close", (code) => code === 0 ? resolve() : reject(new Error(`ffmpeg a échoué (${code})\n${ffmpegLog.slice(-1500)}`)));
  });

  const startedAt = Date.now();
  for (let frame = 0; frame < total; frame++) {
    await page.evaluate((t) => window.seekTo(t), frame / FPS);
    const shot = await page.screenshot({ type: "png", optimizeForSpeed: true });
    await writeFrame(ffmpeg.stdin, shot);

    if (frame % 30 === 0 || frame === total - 1) {
      const done = frame + 1;
      const rate = done / ((Date.now() - startedAt) / 1000);
      const left = Math.round((total - done) / Math.max(rate, 0.01));
      process.stdout.write(`\r  ${String(Math.round(done / total * 100)).padStart(3)} %  ${done}/${total} images  ${rate.toFixed(1)} i/s  reste ~${left} s   `);
    }
  }

  ffmpeg.stdin.end();
  await finished;
  await browser.close();

  const size = fs.statSync(OUT).size;
  console.log(`\n\nVidéo prête : ${path.relative(ROOT, OUT)}  (${(size / 1e6).toFixed(1)} Mo, ${WIDTH}×${HEIGHT}, ${FPS} i/s)`);
}

main().catch((error) => {
  console.error(`\n${error.message}`);
  process.exitCode = 1;
});
