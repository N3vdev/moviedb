const enabledEl = document.getElementById("enabled");
const opacityEl = document.getElementById("opacity");
const resetPositionBtn = document.getElementById("resetPosition");
const scopeRadios = document.querySelectorAll('input[name="scope"]');
const usageReadoutEl = document.getElementById("usageReadout");
const refreshUsageBtn = document.getElementById("refreshUsage");
const characterGridEl = document.getElementById("characterGrid");
const characterNoteEl = document.getElementById("characterNote");

const MOOD_COLORS = window.ClaudeBuddyMascot.MOOD_COLORS;
const CHARACTERS = window.ClaudeBuddyMascot.CHARACTERS;

const CHARACTER_NOTES = {
  cat: "Draggable — click and drag it anywhere on the page. A plain click refreshes usage.",
  hero: "Fixed at the top-right, hanging from a web thread. The thread gets tenser, thinner and shakier as usage climbs — at 100% it snaps and he falls, respawning once usage drops back down. Click him to refresh.",
};

function moodFromPercent(pct) {
  if (pct >= 90) return "stressed";
  if (pct >= 75) return "concerned";
  if (pct >= 40) return "content";
  return "happy";
}

function renderUsage(state) {
  if (!state || !state.bars || state.bars.length === 0) {
    usageReadoutEl.textContent = (state && state.message) || "No data yet.";
    return;
  }
  usageReadoutEl.innerHTML = state.bars
    .map((b) => {
      const color = MOOD_COLORS[moodFromPercent(b.pct)] || MOOD_COLORS.happy;
      return `
      <div class="usage-bar-row">
        <span class="usage-bar-label">${b.label}</span>
        <span class="usage-bar-track"><span class="usage-bar-fill" style="width:${b.pct}%;background:${color}"></span></span>
        <span class="usage-bar-pct">${b.pct}%</span>
      </div>`;
    })
    .join("");
}

CHARACTERS.forEach((c) => {
  const card = document.createElement("div");
  card.className = "character-card";
  card.dataset.characterId = c.id;
  card.innerHTML = `
    <div class="preview">${window.ClaudeBuddyMascot.svg(c.id, "happy")}</div>
    <div class="label">${c.label}</div>
  `;
  card.addEventListener("click", () => patch({ character: c.id }));
  characterGridEl.appendChild(card);
});

function selectCharacterCard(characterId) {
  characterGridEl.querySelectorAll(".character-card").forEach((card) => {
    card.classList.toggle("selected", card.dataset.characterId === characterId);
  });
  characterNoteEl.textContent = CHARACTER_NOTES[characterId] || "";
  resetPositionBtn.style.display = characterId === "hero" ? "none" : "";
}

function load() {
  chrome.runtime.sendMessage({ type: "get-state" }).then((res) => {
    const settings = (res && res.settings) || {};
    enabledEl.checked = settings.enabled !== false;
    opacityEl.value = settings.opacity ?? 0.95;
    const scope = settings.scope || "all";
    scopeRadios.forEach((r) => (r.checked = r.value === scope));
    selectCharacterCard(settings.character || "cat");
    renderUsage(res && res.state);
  });
}

function patch(payload) {
  chrome.runtime.sendMessage({ type: "update-settings", payload }).then(load);
}

enabledEl.addEventListener("change", () => patch({ enabled: enabledEl.checked }));
opacityEl.addEventListener("input", () => patch({ opacity: parseFloat(opacityEl.value) }));
scopeRadios.forEach((r) =>
  r.addEventListener("change", () => {
    if (r.checked) patch({ scope: r.value });
  })
);
resetPositionBtn.addEventListener("click", () => patch({ position: { right: 20, bottom: 20 } }));

refreshUsageBtn.addEventListener("click", () => {
  usageReadoutEl.textContent = "Fetching from claude.ai…";
  chrome.runtime.sendMessage({ type: "request-refresh" }).then((res) => {
    renderUsage(res && res.state);
  });
});

load();
