const status = document.getElementById("status");
const backendState = document.getElementById("backend-state");
const siteEnabledInput = document.getElementById("site-enabled");
const currentSiteLabel = document.getElementById("current-site");
const stylePicker = document.getElementById("style-picker");
const styleHint = document.getElementById("style-hint");
const styleInputs = [...document.querySelectorAll('input[name="style"]')];

const STYLE_HINTS = {
  corriger: "Corrige les fautes sans rien reformuler.",
  professionnel: "Réécrit dans un ton professionnel et courtois.",
  amical: "Réécrit dans un ton chaleureux et détendu.",
  concis: "Raccourcit le texte en gardant l’essentiel."
};

let currentSite = "";
let backendAvailable = false;
let statusTimer = null;

initialize();

async function initialize() {
  // Nettoie les clés des versions précédentes (clé OpenAI du MVP, mode
  // « instant »/« deep » remplacé par la détection automatique du backend).
  await chrome.storage.local.remove(["apiKey", "mode"]);
  const { style = "corriger" } = await chrome.storage.local.get("style");
  selectStyle(style);

  await initializeSiteSetting();
  await checkBackend();
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
      flashStatus("Ce style demande le mode IA (voir ci-dessous).");
      return;
    }
    await chrome.storage.local.set({ style: input.value });
    reflectStyleAvailability();
    flashStatus("Style enregistré.");
  });
}

function reflectStyleAvailability() {
  stylePicker.classList.toggle("is-muted", !backendAvailable);
  const style = selectedStyle();

  if (!backendAvailable) {
    styleHint.textContent = "Correction instantanée, hors ligne. Les styles de réécriture demandent le mode IA.";
    return;
  }
  styleHint.textContent = STYLE_HINTS[style] || "";
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
    currentSiteLabel.textContent = "Indisponible sur cette page";
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
    ? `Bouton activé sur ${currentSite}.`
    : `Bouton masqué sur ${currentSite}.`);
});

async function checkBackend() {
  const result = await chrome.runtime.sendMessage({ type: "CHECK_BACKEND" });
  backendAvailable = Boolean(result?.ollama);

  backendState.className = `backend-state ${backendAvailable ? "is-online" : "is-local"}`;
  backendState.textContent = backendAvailable
    ? "Correcteur hors ligne prêt · mode IA disponible"
    : "Correcteur hors ligne prêt";

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
