const status = document.getElementById("status");
const backendState = document.getElementById("backend-state");
const checkBackendButton = document.getElementById("check-backend");
const siteEnabledInput = document.getElementById("site-enabled");
const currentSiteLabel = document.getElementById("current-site");
const stylePicker = document.getElementById("style-picker");
const styleHint = document.getElementById("style-hint");
const modeInputs = [...document.querySelectorAll('input[name="mode"]')];
const styleInputs = [...document.querySelectorAll('input[name="style"]')];

const STYLE_HINTS = {
  corriger: "Corrige les fautes sans rien reformuler.",
  professionnel: "Réécrit dans un ton professionnel et courtois.",
  amical: "Réécrit dans un ton chaleureux et détendu.",
  concis: "Raccourcit le texte en gardant l’essentiel."
};

let currentSite = "";
let statusTimer = null;

initialize();

async function initialize() {
  // Nettoie une éventuelle clé conservée par l'ancienne version OpenAI du MVP.
  await chrome.storage.local.remove("apiKey");
  const { mode = "instant", style = "corriger" } = await chrome.storage.local.get(["mode", "style"]);

  selectRadio(modeInputs, mode);
  selectRadio(styleInputs, style);
  await chrome.storage.local.set({ mode: selectedValue(modeInputs), style: selectedValue(styleInputs) });
  reflectStyleAvailability();

  await initializeSiteSetting();
  await checkBackend();
}

function selectRadio(inputs, value) {
  const target = inputs.find((input) => input.value === value) || inputs[0];
  if (target) target.checked = true;
}

function selectedValue(inputs) {
  return inputs.find((input) => input.checked)?.value || inputs[0]?.value || "";
}

for (const input of modeInputs) {
  input.addEventListener("change", async () => {
    await chrome.storage.local.set({ mode: input.value });
    reflectStyleAvailability();
    flashStatus(input.value === "instant" ? "Mode instantané activé." : "Mode IA approfondie activé.");
  });
}

for (const input of styleInputs) {
  input.addEventListener("change", async () => {
    await chrome.storage.local.set({ style: input.value });
    reflectStyleAvailability();

    // Un style de réécriture n'a d'effet qu'avec l'IA : bascule automatique.
    if (input.value !== "corriger" && selectedValue(modeInputs) === "instant") {
      selectRadio(modeInputs, "deep");
      await chrome.storage.local.set({ mode: "deep" });
      flashStatus("Style enregistré · mode IA activé automatiquement.");
      return;
    }
    flashStatus("Style enregistré.");
  });
}

function reflectStyleAvailability() {
  const style = selectedValue(styleInputs);
  const instant = selectedValue(modeInputs) === "instant";
  stylePicker.classList.toggle("is-muted", instant && style === "corriger");
  styleHint.textContent = instant && style === "corriger"
    ? "Les styles Pro, Amical et Concis utilisent le mode IA."
    : STYLE_HINTS[style] || "";
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

checkBackendButton.addEventListener("click", checkBackend);

async function checkBackend() {
  backendState.className = "backend-state is-checking";
  backendState.textContent = "Vérification du backend…";
  const result = await chrome.runtime.sendMessage({ type: "CHECK_BACKEND" });

  if (result?.ok) {
    backendState.className = "backend-state is-online";
    backendState.textContent = result.ollama
      ? "Mode instantané prêt · IA approfondie prête"
      : "Mode instantané prêt · IA approfondie arrêtée";
    return;
  }

  backendState.className = "backend-state is-offline";
  backendState.textContent = result?.error || "Backend arrêté";
}

function flashStatus(message) {
  clearTimeout(statusTimer);
  status.textContent = message;
  statusTimer = setTimeout(() => { status.textContent = ""; }, 2200);
}
