/* background.js v12 — alarms + storage cache + tinted toolbar icon */

const ALARM_NAME    = 'autoRefresh';
const STALE_MS      = 30 * 60 * 1000;   // last good data shown for ≤30 min
const COLOR_GREEN   = '#10b981';
const COLOR_AMBER   = '#f59e0b';
const COLOR_RED     = '#ef4444';        // 100% — saturated for standout
const BADGE_GREEN   = '#059669';
const BADGE_AMBER   = '#d97706';
const BADGE_RED     = '#dc2626';

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'FETCH_USAGE')        return fetchAndCache();
  if (msg.type === 'RESET_AUTO_REFRESH') return resetAlarm().then(() => ({ ok: true }));
});

browser.runtime.onStartup.addListener(resetAlarm);
browser.runtime.onInstalled.addListener(resetAlarm);

browser.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) fetchAndCache();
});

async function resetAlarm() {
  await browser.alarms.clear(ALARM_NAME);
  const data = await browser.storage.local.get(['autoRefreshInterval', 'customMinutes']);
  const mins = intervalToMinutes(data.autoRefreshInterval || 'off', data.customMinutes || '');
  if (mins > 0) {
    browser.alarms.create(ALARM_NAME, {
      delayInMinutes:  mins,
      periodInMinutes: mins,
    });
  }
  await updateBrowserAction();
}

function intervalToMinutes(interval, custom) {
  if (interval === '1m')  return 1;
  if (interval === '5m')  return 5;
  if (interval === '30m') return 30;
  if (interval === 'custom') {
    const v = parseInt(custom, 10);
    return Number.isFinite(v) && v >= 1 ? v : 0;
  }
  return 0;
}

async function fetchAndCache() {
  const result = await fetchUsage();
  const now = new Date().toISOString();
  const updates = {
    lastResult:    result,
    lastFetchedAt: now,
  };
  if (result.ok) {
    updates.lastSuccessResult = result;
    updates.lastSuccessAt     = now;
  } else if (result.error === 'not_logged_in') {
    // User signed out — drop the success cache so the toolbar stops showing
    // stale data. The alarm keeps ticking and will repopulate on next sign-in.
    updates.lastSuccessResult = null;
    updates.lastSuccessAt     = null;
  }
  await browser.storage.local.set(updates);
  await updateBrowserAction();
  return result;
}

async function fetchUsage() {
  try {
    const orgsResp = await fetch('https://claude.ai/api/organizations', {
      credentials: 'include',
      headers: { 'accept': 'application/json', 'cache-control': 'no-cache' }
    });
    if (orgsResp.status === 401 || orgsResp.status === 403) return { ok: false, error: 'not_logged_in' };
    if (!orgsResp.ok) return { ok: false, error: 'HTTP ' + orgsResp.status };

    const orgs = await orgsResp.json();
    const org = Array.isArray(orgs) ? orgs[0] : orgs;
    const orgId = org.uuid || org.id;
    const planRaw = org.plan_name || org.plan || '';

    const usageResp = await fetch(`https://claude.ai/api/organizations/${orgId}/usage`, {
      credentials: 'include',
      headers: { 'accept': 'application/json', 'cache-control': 'no-cache' }
    });
    if (!usageResp.ok) return { ok: false, error: 'Usage HTTP ' + usageResp.status };

    const usage = await usageResp.json();

    const LABELS = {
      five_hour:        'Current session',
      seven_day:        'Weekly — All models',
      seven_day_opus:   'Weekly — Opus',
      seven_day_sonnet: 'Weekly — Sonnet',
    };

    const ORDER = ['five_hour', 'seven_day', 'seven_day_opus', 'seven_day_sonnet'];
    const bars = [];

    for (const key of ORDER) {
      const item = usage[key];
      if (!item || item.utilization == null) continue;

      const pct = Math.min(Math.max(item.utilization, 0), 100);

      bars.push({
        key,
        label: LABELS[key] || key,
        pct: Math.round(pct),
        resets_at: item.resets_at || null   // send raw ISO string to popup for live countdown
      });
    }

    return bars.length > 0
      ? { ok: true, bars, plan: planRaw }
      : { ok: false, error: 'No usage data found' };

  } catch (e) {
    return { ok: false, error: 'Network error: ' + e.message };
  }
}

// ── Toolbar icon ─────────────────────────────────────────────────────────────

async function updateBrowserAction() {
  const data = await browser.storage.local.get([
    'autoRefreshInterval',
    'lastSuccessResult',
    'lastSuccessAt',
  ]);

  const interval = data.autoRefreshInterval || 'off';
  if (interval === 'off') {
    return setDefaultIcon();
  }

  const ts    = data.lastSuccessAt ? new Date(data.lastSuccessAt).getTime() : 0;
  const fresh = ts && (Date.now() - ts) < STALE_MS;
  const ok    = data.lastSuccessResult && data.lastSuccessResult.ok;
  if (!fresh || !ok) {
    return setDefaultIcon();
  }

  const bars = data.lastSuccessResult.bars || [];
  if (bars.length === 0) {
    return setDefaultIcon();
  }

  // Icon tint = worst-of-all bars (so weekly limits surface even when session is low)
  const worstBar = bars.reduce((a, b) => (b.pct > a.pct ? b : a), bars[0]);
  const worstPct = worstBar.pct;

  // Badge digits = current session bar
  const sessionBar = bars.find(b => b.key === 'five_hour');
  const sessionPct = sessionBar ? sessionBar.pct : worstPct;

  // Icon background = worst-of-all tier (so weekly limits surface even when
  // session is low). Badge background = session tier (matches the badge number,
  // so badge color and badge digits agree).
  let bg;
  if (worstPct >= 100)     bg = COLOR_RED;
  else if (worstPct >= 65) bg = COLOR_AMBER;
  else                     bg = COLOR_GREEN;

  let badge;
  if (sessionPct >= 100)     badge = BADGE_RED;
  else if (sessionPct >= 65) badge = BADGE_AMBER;
  else                       badge = BADGE_GREEN;

  await setTintedIcon(bg, String(sessionPct), badge);

  let title;
  if (sessionBar && sessionBar !== worstBar) {
    title = `Current session ${sessionPct}% · ${worstBar.label} ${worstPct}%`;
  } else {
    title = `${(sessionBar || worstBar).label} ${sessionPct}%`;
  }
  await browser.browserAction.setTitle({ title });
}

async function setTintedIcon(bgColor, badgeText, badgeColor) {
  await browser.browserAction.setIcon({
    imageData: {
      16: drawIcon(bgColor, 16),
      32: drawIcon(bgColor, 32),
    }
  });
  await browser.browserAction.setBadgeText({ text: badgeText });
  await browser.browserAction.setBadgeBackgroundColor({ color: badgeColor });
  if (browser.browserAction.setBadgeTextColor) {
    await browser.browserAction.setBadgeTextColor({ color: '#ffffff' });
  }
}

async function setDefaultIcon() {
  await browser.browserAction.setIcon({
    path: {
      48: 'icons/icon48.png',
      96: 'icons/icon96.png',
    }
  });
  await browser.browserAction.setBadgeText({ text: '' });
  await browser.browserAction.setTitle({ title: 'Claude Pro Usage Tracker' });
}

function drawIcon(color, size) {
  const canvas = document.createElement('canvas');
  canvas.width  = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  // Rounded square background
  const r = Math.max(2, Math.round(size * 0.22));
  ctx.beginPath();
  ctx.moveTo(r, 0);
  ctx.lineTo(size - r, 0);
  ctx.quadraticCurveTo(size, 0, size, r);
  ctx.lineTo(size, size - r);
  ctx.quadraticCurveTo(size, size, size - r, size);
  ctx.lineTo(r, size);
  ctx.quadraticCurveTo(0, size, 0, size - r);
  ctx.lineTo(0, r);
  ctx.quadraticCurveTo(0, 0, r, 0);
  ctx.closePath();

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, color);
  grad.addColorStop(1, darken(color, 0.32));
  ctx.fillStyle = grad;
  ctx.fill();

  // Asterisk: 3 white capsule strokes crossing at center at 60° intervals
  const cx  = size / 2;
  const cy  = size / 2;
  const aw  = size * 0.12;
  const ah  = size * 0.60;
  const arx = size * 0.06;

  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 3; i++) {
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate((i * 60) * Math.PI / 180);
    ctx.beginPath();
    ctx.roundRect(-aw / 2, -ah / 2, aw, ah, arx);
    ctx.fill();
    ctx.restore();
  }

  return ctx.getImageData(0, 0, size, size);
}

function darken(hex, amount) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * (1 - amount));
  const g = Math.round(((n >> 8) & 255) * (1 - amount));
  const b = Math.round((n & 255) * (1 - amount));
  return `rgb(${r}, ${g}, ${b})`;
}
