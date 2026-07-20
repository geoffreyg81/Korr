import fs from "node:fs";
import vm from "node:vm";

const html = fs.readFileSync("web/index.html", "utf8");
const source = fs.readFileSync("web/i18n.js", "utf8");
const keys = new Set([...html.matchAll(/data-i18n(?:-html|-placeholder)?="([^"]+)"/gu)].map((match) => match[1]));

for (const key of [
  "loadError", "engineUnavailable", "engineTimeout", "readyMs", "harperFirst", "ready",
  "correcting", "loadingHarper", "correctionFailed", "engineEnglish",
  "engineFrench", "mixedDetected", "mixedHelp", "noErrors", "correctionOne", "correctionMany", "copied",
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

const LOCALES = ["fr", "en", "es"];

for (const locale of LOCALES) {
  context.korrI18n.apply(locale);
  for (const key of keys) {
    if (context.korrI18n.t(key) === key) {
      throw new Error(`Traduction ${locale} manquante : ${key}`);
    }
  }
}

// Une clé absente d'une langue retombe silencieusement sur le français : rien
// ne plante et la traduction manquante passe inaperçue. Interroger t() ne
// peut donc pas la détecter — il faut lire les catalogues eux-mêmes.
function catalogueKeys(locale) {
  const start = source.indexOf(`\n    ${locale}: {`);
  if (start < 0) throw new Error(`Catalogue absent : ${locale}`);
  const block = source.slice(start, source.indexOf("\n    }", start));
  return new Set([...block.matchAll(/^ {6}([A-Za-z0-9_]+):/gmu)].map((match) => match[1]));
}

const catalogues = new Map(LOCALES.map((locale) => [locale, catalogueKeys(locale)]));
const reference = catalogues.get("fr");

for (const [locale, catalogue] of catalogues) {
  const missing = [...reference].filter((key) => !catalogue.has(key));
  const extra = [...catalogue].filter((key) => !reference.has(key));
  if (missing.length) throw new Error(`Clés absentes de ${locale} : ${missing.join(", ")}`);
  if (extra.length) throw new Error(`Clés en trop dans ${locale} : ${extra.join(", ")}`);
}

if (!fs.existsSync("PRIVACY.en.md")) throw new Error("Politique de confidentialité anglaise absente.");
console.log(`Traductions FR/EN/ES vérifiées : ${keys.size} clés × ${LOCALES.length} langues.`);
