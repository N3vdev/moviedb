// Claude Buddy — background service worker
//
// Fetches real usage directly from claude.ai's own internal API — the same
// endpoints the Settings → Usage page itself reads from — using the
// browser's existing claude.ai session cookies (`credentials: "include"`).
// No DOM scraping, no local message-counting, no user-configured "limit"
// guesswork. This is the single source of truth, stored in
// chrome.storage.local; every overlay/popup reacts to changes.

const STATE_KEY = "buddyState";
const SETTINGS_KEY = "buddySettings";
const ALARM_NAME = "buddy-refresh";
const REFRESH_MINUTES = 5;
const STALE_MS = 30 * 60 * 1000; // last good fetch shown as "stale" after this

const LABELS = {
  five_hour: "Current session",
  seven_day: "Weekly — All models",
  seven_day_opus: "Weekly — Opus",
  seven_day_sonnet: "Weekly — Sonnet",
};
const ORDER = ["five_hour", "seven_day", "seven_day_opus", "seven_day_sonnet"];

const DEFAULT_STATE = {
  mood: "sleeping",
  percent: null,
  message: "Log in to claude.ai to start tracking usage.",
  resetHint: null,
  bars: [],
  plan: null,
  updatedAt: 0,
  source: null, // "live" | "demo" | null
  stale: false,
  error: null,
};

const DEFAULT_SETTINGS = {
  enabled: true,
  scope: "all", // "all" | "claude-only"
  opacity: 0.95,
  minimized: false,
  position: null, // {right, bottom} offset in px, set on first drag (cat only)
  character: "cat", // "cat" | "hero"
};

function moodFromPercent(pct) {
  if (pct >= 90) return "stressed";
  if (pct >= 75) return "concerned";
  if (pct >= 40) return "content";
  return "happy";
}

function describeReset(iso) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - Date.now();
  if (!Number.isFinite(ms)) return null;
  if (ms <= 0) return "soon";
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `in ${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `in ${hours}h`;
  return `in ${Math.round(hours / 24)}d`;
}

async function fetchUsage() {
  try {
    const orgsResp = await fetch("https://claude.ai/api/organizations", {
      credentials: "include",
      headers: { accept: "application/json", "cache-control": "no-cache" },
    });
    if (orgsResp.status === 401 || orgsResp.status === 403) {
      return { ok: false, error: "not_logged_in" };
    }
    if (!orgsResp.ok) return { ok: false, error: `HTTP ${orgsResp.status}` };

    const orgs = await orgsResp.json();
    const org = Array.isArray(orgs) ? orgs[0] : orgs;
    if (!org) return { ok: false, error: "No organization found" };
    const orgId = org.uuid || org.id;
    const plan = org.plan_name || org.plan || null;

    const usageResp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
      credentials: "include",
      headers: { accept: "application/json", "cache-control": "no-cache" },
    });
    if (!usageResp.ok) return { ok: false, error: `Usage HTTP ${usageResp.status}` };

    const usage = await usageResp.json();
    const bars = [];
    for (const key of ORDER) {
      const item = usage[key];
      if (!item || item.utilization == null) continue;
      const pct = Math.min(Math.max(item.utilization, 0), 100);
      bars.push({
        key,
        label: LABELS[key] || key,
        pct: Math.round(pct),
        resetsAt: item.resets_at || null,
      });
    }

    return bars.length > 0 ? { ok: true, bars, plan } : { ok: false, error: "No usage data found" };
  } catch (e) {
    return { ok: false, error: `Network error: ${e.message}` };
  }
}

function stateFromResult(result, now) {
  if (!result.ok) {
    const message =
      result.error === "not_logged_in"
        ? "Log in to claude.ai to track usage."
        : `Couldn't fetch usage (${result.error}). Retrying automatically.`;
    return { ...DEFAULT_STATE, message, updatedAt: now, source: null, error: result.error };
  }

  const worst = result.bars.reduce((a, b) => (b.pct > a.pct ? b : a), result.bars[0]);
  const session = result.bars.find((b) => b.key === "five_hour") || worst;
  const mood = moodFromPercent(worst.pct);
  const message =
    session !== worst
      ? `${session.label} ${session.pct}% · ${worst.label} ${worst.pct}%`
      : `${worst.label}: ${worst.pct}% used`;

  return {
    mood,
    percent: worst.pct,
    message,
    resetHint: describeReset(worst.resetsAt),
    bars: result.bars,
    plan: result.plan,
    updatedAt: now,
    source: "live",
    stale: false,
    error: null,
  };
}

function badgeColorFor(mood) {
  switch (mood) {
    case "happy":
      return "#4ade80";
    case "content":
      return "#a3e635";
    case "concerned":
      return "#facc15";
    case "stressed":
      return "#f87171";
    default:
      return "#94a3b8";
  }
}

async function applyBadge(state) {
  try {
    if (state.source !== "live" || typeof state.percent !== "number") {
      await chrome.action.setBadgeText({ text: "" });
      return;
    }
    await chrome.action.setBadgeText({ text: String(state.percent) });
    await chrome.action.setBadgeBackgroundColor({ color: badgeColorFor(state.mood) });
  } catch {
    // action API can be unavailable very briefly during service worker wake-up
  }
}

async function readSettings() {
  const { [SETTINGS_KEY]: settings } = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(settings || {}) };
}

async function refreshAndStore() {
  const result = await fetchUsage();
  const now = Date.now();
  const state = stateFromResult(result, now);
  await chrome.storage.local.set({ [STATE_KEY]: state });
  await applyBadge(state);
  return state;
}

async function ensureDefaults() {
  const existing = await chrome.storage.local.get([STATE_KEY, SETTINGS_KEY]);
  const patch = {};
  if (!existing[STATE_KEY]) patch[STATE_KEY] = DEFAULT_STATE;
  if (!existing[SETTINGS_KEY]) patch[SETTINGS_KEY] = DEFAULT_SETTINGS;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

chrome.runtime.onInstalled.addListener(async () => {
  await ensureDefaults();
  await refreshAndStore();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES });
});

chrome.runtime.onStartup.addListener(async () => {
  await ensureDefaults();
  await refreshAndStore();
  chrome.alarms.create(ALARM_NAME, { periodInMinutes: REFRESH_MINUTES });
});

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) refreshAndStore();
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message || typeof message !== "object") return;

  if (message.type === "get-state") {
    (async () => {
      const [{ [STATE_KEY]: stored }, settings] = await Promise.all([
        chrome.storage.local.get(STATE_KEY),
        readSettings(),
      ]);
      let state = stored || DEFAULT_STATE;
      if (state.source === "live" && Date.now() - state.updatedAt > STALE_MS) {
        state = { ...state, stale: true };
      }
      sendResponse({ state, settings });
    })();
    return true;
  }

  if (message.type === "request-refresh") {
    refreshAndStore().then((state) => sendResponse({ ok: true, state }));
    return true;
  }

  if (message.type === "demo-update") {
    (async () => {
      const state = {
        ...DEFAULT_STATE,
        ...message.payload,
        updatedAt: Date.now(),
        source: "demo",
        stale: false,
      };
      await chrome.storage.local.set({ [STATE_KEY]: state });
      await applyBadge(state);
      sendResponse({ ok: true });
    })();
    return true;
  }

  if (message.type === "update-settings") {
    (async () => {
      const prev = await readSettings();
      const next = { ...prev, ...message.payload };
      await chrome.storage.local.set({ [SETTINGS_KEY]: next });
      sendResponse({ ok: true, settings: next });
    })();
    return true;
  }
});
