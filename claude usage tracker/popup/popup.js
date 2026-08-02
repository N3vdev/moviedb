const creatureEl = document.getElementById("creature");
const metaEl = document.getElementById("meta");
const progressFillEl = document.getElementById("progressFill");
const progressLabelEl = document.getElementById("progressLabel");
const barsEl = document.getElementById("bars");
const refreshBtn = document.getElementById("refreshBtn");
const refreshStatusEl = document.getElementById("refreshStatus");
const demoBtn = document.getElementById("demoBtn");
const optionsBtn = document.getElementById("optionsBtn");

const MOOD_LABEL = window.ClaudeBuddyMascot.MOOD_LABEL;
const MOOD_COLORS = window.ClaudeBuddyMascot.MOOD_COLORS;

// The mascot's tail-wag/ear-flick/blink animations are defined once in
// shared/mascot.js and reused here so the popup preview matches the overlay.
const animStyle = document.createElement("style");
animStyle.textContent = window.ClaudeBuddyMascot.css;
document.head.appendChild(animStyle);

function moodFromPercent(pct) {
  if (pct >= 90) return "stressed";
  if (pct >= 75) return "concerned";
  if (pct >= 40) return "content";
  return "happy";
}

let currentMood = "sleeping";
let currentCharacter = "cat";
let demoTimer = null;
const DEMO_SEQUENCE = ["happy", "content", "concerned", "stressed", "sleeping"];
let demoIndex = 0;

function renderState(state, character) {
  currentMood = state.mood || "sleeping";
  if (character) currentCharacter = character;
  creatureEl.innerHTML = window.ClaudeBuddyMascot.svg(currentCharacter, currentMood);

  const known = typeof state.percent === "number";
  const pct = known ? state.percent : 0;
  progressFillEl.style.width = Math.max(0, Math.min(100, pct)) + "%";
  progressFillEl.style.background = MOOD_COLORS[currentMood] || MOOD_COLORS.sleeping;
  progressFillEl.style.opacity = known ? "1" : "0.4";
  progressLabelEl.textContent = known ? `${pct}%` : "—";

  barsEl.innerHTML =
    state.bars && state.bars.length > 1
      ? state.bars
          .map((b) => {
            const color = MOOD_COLORS[moodFromPercent(b.pct)] || MOOD_COLORS.happy;
            return `
            <div class="bar-row">
              <span class="bar-label">${b.label}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${b.pct}%;background:${color}"></span></span>
              <span class="bar-pct">${b.pct}%</span>
            </div>`;
          })
          .join("")
      : "";

  const bits = [];
  if (state.plan) bits.push(state.plan);
  if (state.stale) bits.push("checking for fresh data…");
  if (state.updatedAt) {
    const mins = Math.max(0, Math.round((Date.now() - state.updatedAt) / 60000));
    bits.push(mins === 0 ? "updated just now" : `updated ${mins}m ago`);
  }
  metaEl.textContent = bits.join(" · ");
}

function refresh() {
  chrome.runtime.sendMessage({ type: "get-state" }).then((res) => {
    if (res && res.state) renderState(res.state, res.settings && res.settings.character);
  });
}

refresh();

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;
  if (changes.buddyState) renderState(changes.buddyState.newValue || {});
  if (changes.buddySettings) refresh(); // character (or other settings) may have changed
});

refreshBtn.addEventListener("click", () => {
  refreshBtn.disabled = true;
  refreshStatusEl.textContent = "Fetching from claude.ai…";
  chrome.runtime.sendMessage({ type: "request-refresh" }).then((res) => {
    refreshBtn.disabled = false;
    if (res && res.state) {
      renderState(res.state);
      refreshStatusEl.textContent = res.state.source === "live" ? "Refreshed." : res.state.message;
    } else {
      refreshStatusEl.textContent = "Couldn't refresh.";
    }
    setTimeout(() => (refreshStatusEl.textContent = ""), 4000);
  });
});

demoBtn.addEventListener("click", () => {
  if (demoTimer) {
    clearInterval(demoTimer);
    demoTimer = null;
    demoBtn.textContent = "Preview moods";
    refresh(); // restore the real state
    return;
  }
  demoBtn.textContent = "Stop preview";
  demoIndex = 0;
  const tick = () => {
    const mood = DEMO_SEQUENCE[demoIndex % DEMO_SEQUENCE.length];
    demoIndex++;
    chrome.runtime.sendMessage({
      type: "demo-update",
      payload: {
        mood,
        // "stressed" hits exactly 100 so the preview also shows the
        // web-slinger's thread-snap/fall — (demoIndex*17)%100 alone can
        // never reach 100, and that's the whole point of "stressed".
        percent: mood === "sleeping" ? null : mood === "stressed" ? 100 : (demoIndex * 17) % 100,
        message: `Preview: ${MOOD_LABEL[mood]}`,
        resetHint: null,
        bars: [],
      },
    });
  };
  tick();
  demoTimer = setInterval(tick, 2500);
});

optionsBtn.addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});
