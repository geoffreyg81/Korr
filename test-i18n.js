import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("web/index.html", "utf8");
const source = fs.readFileSync("web/i18n.js", "utf8");
const keys = new Set([...html.matchAll(/data-i18n(?:-html|-placeholder)?="([^"]+)"/gu)].map((match) => match[1]));

for (const key of [
  "loadError", "engineUnavailable", "readyMs", "harperFirst", "ready",
  "correcting", "loadingHarper", "correctionFailed", "engineEnglish",
  "engineFrench", "noErrors", "correctionOne", "correctionMany", "copied",
  "selected", "installed"
]) keys.add(key);

const storage = new Map();
const context = vm.createContext({
  console,
  navigator: { language: "fr-FR" },
  localStorage: {
    getItem: (key) => storage.get(key) || null,
    setItem: (key, value) => storage.set(key, value)
  },
  document: {
    documentElement: { lang: "fr" },
    title: "",
    getElementById: () => null,
    querySelector: () => null,
    querySelectorAll: () => []
  },
  window: { dispatchEvent: () => {} },
  CustomEvent: class CustomEvent {}
});
vm.runInContext(source, context, { filename: "web/i18n.js" });

for (const locale of ["fr", "en"]) {
  context.korrI18n.apply(locale);
  for (const key of keys) {
    if (context.korrI18n.t(key) === key) {
      throw new Error(`Traduction ${locale} manquante : ${key}`);
    }
  }
}

if (!fs.existsSync("PRIVACY.en.md")) throw new Error("Politique de confidentialité anglaise absente.");
console.log(`Traductions FR/EN vérifiées : ${keys.size} clés.`);
