import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("popup.html", "utf8");
const popupSource = fs.readFileSync("popup.js", "utf8");
const contentSource = fs.readFileSync("content.js", "utf8");
const i18nSource = fs.readFileSync("extension-i18n.js", "utf8");
const keys = new Set([
  ...[...html.matchAll(/data-korr-i18n(?:-html|-title)?="([^"]+)"/gu)].map((match) => match[1]),
  ...[...`${popupSource}\n${contentSource}`.matchAll(/\bt\(\s*"([^"]+)"/gu)].map((match) => match[1]),
  ...[...popupSource.matchAll(/:\s*"(styleHint[^"]+)"/gu)].map((match) => match[1])
]);
keys.add("correctionOne");
keys.add("correctionMany");

for (const [browserLanguage, expectedLocale] of [["fr-FR", "fr"], ["en-US", "en"]]) {
  const context = vm.createContext({
    chrome: { i18n: { getUILanguage: () => browserLanguage } },
    navigator: { language: browserLanguage },
    document: {
      documentElement: { lang: "" },
      querySelectorAll: () => []
    }
  });
  vm.runInContext(i18nSource, context, { filename: "extension-i18n.js" });
  const api = context.korrExtensionI18n;
  if (api.locale !== expectedLocale) {
    throw new Error(`Langue d'extension incorrecte : ${browserLanguage} -> ${api.locale}`);
  }
  for (const key of keys) {
    const translated = api.t(key, { count: 2, duration: " · 1 ms", language: "English", site: "example.com", style: "rewritten" });
    if (!translated || translated === key) {
      throw new Error(`Traduction ${expectedLocale} manquante : ${key}`);
    }
  }
}

const manifest = JSON.parse(fs.readFileSync("manifest.json", "utf8"));
if (manifest.default_locale !== "en") {
  throw new Error("Le manifeste doit utiliser le catalogue anglais par défaut.");
}

const manifestMessageKeys = new Set();
collectManifestMessageKeys(manifest, manifestMessageKeys);
for (const locale of ["fr", "en"]) {
  const catalog = JSON.parse(fs.readFileSync(`_locales/${locale}/messages.json`, "utf8"));
  for (const key of manifestMessageKeys) {
    if (typeof catalog[key]?.message !== "string" || !catalog[key].message.trim()) {
      throw new Error(`Message natif ${locale} manquant : ${key}`);
    }
  }
}

const contentScripts = manifest.content_scripts?.[0]?.js || [];
if (contentScripts.indexOf("extension-i18n.js") < 0 ||
    contentScripts.indexOf("extension-i18n.js") > contentScripts.indexOf("content.js")) {
  throw new Error("extension-i18n.js doit être chargé avant content.js.");
}
if (html.indexOf('src="extension-i18n.js"') > html.indexOf('src="popup.js"')) {
  throw new Error("extension-i18n.js doit être chargé avant popup.js.");
}

console.log(`Interface d'extension FR/EN vérifiée : ${keys.size} clés.`);

function collectManifestMessageKeys(value, destination) {
  if (typeof value === "string") {
    const match = /^__MSG_([^_].*)__$/u.exec(value);
    if (match) destination.add(match[1]);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectManifestMessageKeys(item, destination);
    return;
  }
  if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectManifestMessageKeys(item, destination);
  }
}
