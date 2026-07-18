const i18n = globalThis.korrExtensionI18n;
const t = (key, values) => i18n.t(key, values);
i18n.apply(document);

const status = document.getElementById("status");
const backendState = document.getElementById("backend-state");
const siteEnabledInput = document.getElementById("site-enabled");
const currentSiteLabel = document.getElementById("current-site");
const stylePicker = document.getElementById("style-picker");
const styleHint = document.getElementById("style-hint");
const styleInputs = [...document.querySelectorAll('input[name="style"]')];
const languageInputs = [...document.querySelectorAll('input[name="language"]')];

const STYLE_HINT_KEYS = {
  corriger: "styleHintCorrect",
  professionnel: "styleHintProfessional",
  amical: "styleHintFriendly",
  concis: "styleHintConcise"
};

let currentSite = "";
let backendAvailable = false;
let statusTimer = null;

initialize();

async function initialize() {
  // Nettoie les clés des versions précédentes (clé OpenAI du MVP, mode
  // « instant »/« deep » remplacé par la détection automatique du backend).
  await chrome.storage.local.remove(["apiKey", "mode"]);
  const { style = "corriger", language = "auto" } = await chrome.storage.local.get(["style", "language"]);
  selectStyle(style);
  selectLanguage(language);

  await initializeSiteSetting();
  await checkBackend();
}

function selectLanguage(value) {
  const target = languageInputs.find((input) => input.value === value) || languageInputs[0];
  if (target) target.checked = true;
}

for (const input of languageInputs) {
  input.addEventListener("change", async () => {
    await chrome.storage.local.set({ language: input.value });
    const languageName = input.value === "auto"
      ? t("automatic")
      : input.value === "fr" ? t("french") : t("english");
    flashStatus(t("languageSaved", { language: languageName }));
  });
}

function selectStyle(value) {
  const target = styleInputs.find((input) => input.value === value) || styleInputs[0];
  if (target) target.checked = true;
  reflectStyleAvailability();
}

function selectedStyle() {
  return styleInputs.find((input) => input.checked)?.value || "corriger";
}

for (const input of styleInputs) {
  input.addEventListener("change", async () => {
    if (input.value !== "corriger" && !backendAvailable) {
      // Sans backend, seul le moteur embarqué est disponible.
      selectStyle("corriger");
      await chrome.storage.local.set({ style: "corriger" });
      flashStatus(t("styleRequiresAi"));
      return;
    }
    await chrome.storage.local.set({ style: input.value });
    reflectStyleAvailability();
    flashStatus(t("styleSaved"));
  });
}

function reflectStyleAvailability() {
  stylePicker.classList.toggle("is-muted", !backendAvailable);
  const style = selectedStyle();

  if (!backendAvailable) {
    styleHint.textContent = t("offlineStylesHint");
    return;
  }
  styleHint.textContent = STYLE_HINT_KEYS[style] ? t(STYLE_HINT_KEYS[style]) : "";
}

async function initializeSiteSetting() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  try {
    const url = new URL(tab?.url || "");
    if (!/^https?:$/.test(url.protocol)) throw new Error("unsupported");
    currentSite = url.hostname.toLowerCase();
  } catch {
    currentSite = "";
  }

  if (!currentSite) {
    currentSiteLabel.textContent = t("unavailablePage");
    siteEnabledInput.disabled = true;
    return;
  }

  currentSiteLabel.textContent = currentSite;
  const { enabledSites = {} } = await chrome.storage.local.get("enabledSites");
  siteEnabledInput.checked = enabledSites[currentSite] === true;
}

siteEnabledInput.addEventListener("change", async () => {
  if (!currentSite) return;

  const { enabledSites = {} } = await chrome.storage.local.get("enabledSites");
  const updatedSites = { ...enabledSites };
  if (siteEnabledInput.checked) updatedSites[currentSite] = true;
  else delete updatedSites[currentSite];

  await chrome.storage.local.set({ enabledSites: updatedSites });
  flashStatus(siteEnabledInput.checked
    ? t("siteEnabled", { site: currentSite })
    : t("siteHidden", { site: currentSite }));
});

async function checkBackend() {
  let result = null;
  try {
    result = await chrome.runtime.sendMessage({ type: "CHECK_BACKEND" });
  } catch {}
  backendAvailable = Boolean(result?.ollama);

  backendState.className = `backend-state ${backendAvailable ? "is-online" : "is-local"}`;
  backendState.textContent = backendAvailable
    ? t("backendReadyAi")
    : t("backendReady");

  if (!backendAvailable && selectedStyle() !== "corriger") {
    selectStyle("corriger");
    await chrome.storage.local.set({ style: "corriger" });
  }
  reflectStyleAvailability();
}

function flashStatus(message) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ""; }, 2600);
}
