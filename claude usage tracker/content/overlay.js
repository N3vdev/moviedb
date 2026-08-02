// Claude Buddy — persistent overlay (runs on every page)
//
// Renders whichever character is chosen in Settings, fixed on top of the
// page inside a closed shadow root so host-page CSS can't reach in and the
// page can't read our DOM back out:
//
// - "cat": a draggable pixel-art cat in the corner with its percent/progress
//   bar directly underneath, always visible.
// - "hero": bundled images (assets/hero-rope-mask.png + hero-body.png,
//   personal use only — see README) hanging top-right. The rope is a
//   separate masked layer whose color runs white -> red with usage tension;
//   the rig sways/shakes harder as it climbs; at 100% it "snaps" and the
//   whole thing falls off-screen, respawning once usage drops back under
//   100%.
//
// Both: click (no drag) triggers an immediate refresh; a small toggle
// minimizes rather than closes.

(() => {
  const STATE_KEY = "buddyState";
  const SETTINGS_KEY = "buddySettings";

  const MOOD_COLORS = window.ClaudeBuddyMascot.MOOD_COLORS;
  const mascotSVG = window.ClaudeBuddyMascot.svg;

  let settings = {
    enabled: true,
    scope: "all",
    opacity: 0.95,
    minimized: false,
    position: null,
    character: "cat",
  };
  let state = { mood: "sleeping", percent: null, resetHint: null, bars: [], stale: false };

  const host = document.createElement("div");
  host.id = "claude-buddy-host";
  host.style.all = "initial";
  host.style.position = "fixed";
  host.style.zIndex = "2147483647";
  const shadow = host.attachShadow({ mode: "closed" });

  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }

    /* ---- Cat rig ---- */
    .wrap {
      position: fixed;
      right: 20px;
      bottom: 20px;
      display: flex;
      flex-direction: column;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      z-index: 2147483647;
    }
    .creature-btn {
      cursor: grab;
      border-radius: 50%;
      background: rgba(20, 18, 32, 0.15);
      box-shadow: 0 6px 16px rgba(0,0,0,0.22);
      padding: 4px;
      line-height: 0;
      touch-action: none;
    }
    .creature-btn:active { cursor: grabbing; }
    .creature-btn:active svg { animation-play-state: paused; }
    .creature-btn.minimized svg { width: 22px; height: 22px; }
    .readout { margin-top: 5px; display: flex; align-items: center; gap: 5px; }
    .percent {
      font-size: 11px; font-weight: 600; color: #f4f2ff;
      text-shadow: 0 1px 2px rgba(0,0,0,0.5); min-width: 22px; text-align: center;
    }
    .progress-track {
      width: 46px; height: 6px; border-radius: 4px;
      background: rgba(20, 18, 32, 0.35); overflow: hidden;
    }
    .progress-fill {
      height: 100%; border-radius: 4px; width: 0%; background: #7dd3a8;
      transition: width 0.5s ease, background-color 0.4s ease;
    }
    .wrap.minimized .readout { display: none; }

    /* ---- Hero rig ---- */
    .web-wrap {
      position: fixed;
      top: 0;
      right: 40px;
      display: flex;
      flex-direction: column;
      align-items: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      z-index: 2147483647;
    }
    .web-rig {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-top: -10px; /* reaches up toward the gap between the stat cards, where the old connector sat */
    }
    .web-strain {
      width: 14px; height: 6px; margin-top: 6px; opacity: 0;
      transition: opacity 0.4s ease;
      background: linear-gradient(45deg, transparent 45%, #fff 45%, #fff 55%, transparent 55%);
    }
    .hero-faller { cursor: grab; line-height: 0; touch-action: none; }
    .hero-faller:active { cursor: grabbing; }
    .hero-faller img { display: block; filter: drop-shadow(0 2px 5px rgba(0,0,0,0.35)); }
    .hero-rope-mask {
      background-color: #ffffff;
      transform-origin: top center;
      transition: background-color 0.4s ease;
    }
    .hero-stats {
      display: flex;
      flex-direction: row;
      align-items: stretch;
      gap: 16px;
      position: relative;
      z-index: 1;
    }
    .hero-stats.pulse { animation: buddy-pulse 0.3s ease; }
    @keyframes buddy-pulse { 0% { transform: scale(1); } 50% { transform: scale(1.08); } 100% { transform: scale(1); } }
    .stat-row {
      display: flex;
      flex-direction: row;
      align-items: baseline;
      gap: 4px;
      padding: 2px 7px;
      border-radius: 7px 7px 3px 3px;
      background: rgba(20, 18, 32, 0.6);
      border-bottom: 1px solid rgba(255,255,255,0.08);
    }
    .stat-tag {
      font-size: 8.5px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.4px;
      color: rgba(244,242,255,0.55);
      white-space: nowrap;
    }
    .stat-val {
      font-size: 11px;
      font-weight: 700;
      color: #f4f2ff;
      transition: color 0.4s ease;
      white-space: nowrap;
    }
    .web-wrap.minimized .web-strain,
    .web-wrap.minimized .hero-faller,
    .web-wrap.minimized .hero-stats { display: none; }
    .web-snap-text { top: 26px; right: 20px; }

    /* ---- Shared ---- */
    .toggle {
      margin-top: 4px;
      font-size: 10px;
      color: rgba(255,255,255,0.55);
      background: rgba(30,27,46,0.7);
      border-radius: 8px;
      padding: 2px 6px;
      cursor: pointer;
      user-select: none;
    }

    /* All the continuous CSS animations (cat bob/tail-wag/ear-flick, hero
       sway/shake/zzz/sweat) freeze the instant the window isn't focused or
       the tab isn't visible — browsers throttle background-tab animations
       on their own, but not necessarily an unfocused-but-visible window,
       so this is an explicit belt-and-suspenders stop rather than relying
       on that. */
    :host(.buddy-unfocused) * { animation-play-state: paused !important; }

    ${window.ClaudeBuddyMascot.css}
  `;
  shadow.appendChild(style);

  const stage = document.createElement("div");
  shadow.appendChild(stage);

  function applyFocusState() {
    const unfocused = document.hidden || !document.hasFocus();
    host.classList.toggle("buddy-unfocused", unfocused);
  }
  document.addEventListener("visibilitychange", applyFocusState);
  window.addEventListener("blur", applyFocusState);
  window.addEventListener("focus", applyFocusState);
  applyFocusState();

  function persistSettings(patch) {
    Object.assign(settings, patch);
    chrome.runtime.sendMessage({ type: "update-settings", payload: patch }).catch(() => {});
  }

  function requestRefresh() {
    chrome.runtime.sendMessage({ type: "request-refresh" }).catch(() => {});
  }

  function moodColorFor(pct) {
    if (pct >= 90) return MOOD_COLORS.stressed;
    if (pct >= 75) return MOOD_COLORS.concerned;
    if (pct >= 40) return MOOD_COLORS.content;
    return MOOD_COLORS.happy;
  }

  function findBar(bars, key) {
    return (bars || []).find((b) => b.key === key);
  }

  // ---- Cat mode ----
  function mountCat() {
    const wrap = document.createElement("div");
    wrap.className = "wrap";

    const btn = document.createElement("div");
    btn.className = "creature-btn";
    btn.setAttribute("role", "button");
    btn.setAttribute("aria-label", "Claude usage buddy — click to refresh, drag to move");

    const readout = document.createElement("div");
    readout.className = "readout";
    const percentLabel = document.createElement("span");
    percentLabel.className = "percent";
    const progressTrack = document.createElement("div");
    progressTrack.className = "progress-track";
    const progressFill = document.createElement("div");
    progressFill.className = "progress-fill";
    progressTrack.appendChild(progressFill);
    readout.appendChild(percentLabel);
    readout.appendChild(progressTrack);

    const toggle = document.createElement("div");
    toggle.className = "toggle";
    toggle.textContent = "–";
    toggle.title = "Minimize / expand";

    wrap.appendChild(btn);
    wrap.appendChild(readout);
    wrap.appendChild(toggle);
    stage.appendChild(wrap);

    function applyPosition() {
      if (settings.position && typeof settings.position.right === "number") {
        wrap.style.right = settings.position.right + "px";
        wrap.style.bottom = settings.position.bottom + "px";
      }
    }

    let dragging = false;
    let dragStart = null;
    let startPos = { right: 20, bottom: 20 };
    let moved = false;

    btn.addEventListener("pointerdown", (e) => {
      dragging = true;
      moved = false;
      dragStart = { x: e.clientX, y: e.clientY };
      startPos = settings.position || { right: 20, bottom: 20 };
      btn.setPointerCapture(e.pointerId);
    });

    btn.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) moved = true;
      settings.position = {
        right: Math.max(4, startPos.right - dx),
        bottom: Math.max(4, startPos.bottom - dy),
      };
      applyPosition();
    });

    btn.addEventListener("pointerup", (e) => {
      dragging = false;
      try { btn.releasePointerCapture(e.pointerId); } catch {}
      if (moved) {
        persistSettings({ position: settings.position });
      } else {
        btn.classList.add("buddy-blink");
        setTimeout(() => btn.classList.remove("buddy-blink"), 140);
        requestRefresh();
      }
    });

    toggle.addEventListener("click", () => {
      persistSettings({ minimized: !settings.minimized });
      render();
    });

    function scheduleBlink() {
      const delay = 2800 + Math.random() * 3200;
      setTimeout(() => {
        if (state.mood !== "sleeping") {
          btn.classList.add("buddy-blink");
          setTimeout(() => btn.classList.remove("buddy-blink"), 140);
        }
        scheduleBlink();
      }, delay);
    }
    scheduleBlink();

    function render() {
      btn.innerHTML = mascotSVG("cat", state.mood);
      btn.classList.toggle("minimized", !!settings.minimized);
      wrap.classList.toggle("minimized", !!settings.minimized);
      wrap.style.opacity = String(settings.opacity ?? 0.95);

      const known = typeof state.percent === "number";
      const pct = known ? state.percent : 0;
      percentLabel.textContent = known ? `${pct}%` : "—";
      progressFill.style.width = Math.max(0, Math.min(100, pct)) + "%";
      progressFill.style.background = MOOD_COLORS[state.mood] || MOOD_COLORS.sleeping;
      readout.style.opacity = known ? "1" : "0.4";

      const bits = (state.bars || []).map((b) => `${b.label} ${b.pct}%`);
      const extra = bits.length > 1 ? ` (${bits.join(", ")})` : "";
      wrap.title = known
        ? `${pct}% used${extra}${state.resetHint ? " — resets " + state.resetHint : ""}. Click to refresh.`
        : "Log in to claude.ai to track usage. Click to refresh.";

      applyPosition();
    }

    return { render };
  }

  // ---- Hero mode ----
  function mountHero() {
    const wrap = document.createElement("div");
    wrap.className = "web-wrap";

    const rig = document.createElement("div");
    rig.className = "web-rig";

    const strain = document.createElement("div");
    strain.className = "web-strain";

    // Built together (heroImg() returns both pieces as one string) then
    // split into independent siblings — the rope needs its own transform
    // (rotate + stretch toward the pointer) separate from the character's
    // (a plain follow-the-pointer translate), so they can't stay nested.
    const buildScratch = document.createElement("div");
    buildScratch.innerHTML = mascotSVG("hero", "happy");
    const ropeMask = buildScratch.querySelector(".hero-rope-mask");
    const bodyImg = buildScratch.querySelector("img");

    const faller = document.createElement("div");
    faller.className = "hero-faller";
    faller.setAttribute("role", "button");
    faller.setAttribute("aria-label", "Web-Slinger — click to refresh, drag to pull");
    if (bodyImg) {
      bodyImg.draggable = false; // suppress native HTML5 image drag, which would fight the pointer-based pull
      faller.appendChild(bodyImg);
    }

    rig.appendChild(strain);
    if (ropeMask) rig.appendChild(ropeMask);
    rig.appendChild(faller);

    const stats = document.createElement("div");
    stats.className = "hero-stats";
    function buildStatRow(tag) {
      const row = document.createElement("div");
      row.className = "stat-row";
      const tagEl = document.createElement("span");
      tagEl.className = "stat-tag";
      tagEl.textContent = tag;
      const valEl = document.createElement("span");
      valEl.className = "stat-val";
      row.appendChild(tagEl);
      row.appendChild(valEl);
      stats.appendChild(row);
      return valEl;
    }
    const sessionVal = buildStatRow("Session");
    const weekVal = buildStatRow("Week");

    const toggle = document.createElement("div");
    toggle.className = "toggle";
    toggle.textContent = "–";
    toggle.title = "Minimize / expand";

    const snapText = document.createElement("div");
    snapText.className = "web-snap-text";
    snapText.textContent = "SNAP!";

    wrap.appendChild(stats);
    wrap.appendChild(rig);
    wrap.appendChild(toggle);
    stage.appendChild(wrap);
    stage.appendChild(snapText);

    let prevPercent; // undefined until first render — used to detect live transitions
    let fallen = false;

    // White at 0% tension, red at 100% — a continuous interpolation rather
    // than discrete mood-tier colors, so the rope visibly creeps toward red
    // as the exact percentage climbs, not just when it crosses a threshold.
    const ROPE_COLD = { r: 255, g: 255, b: 255 };
    const ROPE_HOT = { r: 229, g: 57, b: 53 };
    function ropeColor(t) {
      t = Math.max(0, Math.min(1, t));
      const r = Math.round(ROPE_COLD.r + (ROPE_HOT.r - ROPE_COLD.r) * t);
      const g = Math.round(ROPE_COLD.g + (ROPE_HOT.g - ROPE_COLD.g) * t);
      const b = Math.round(ROPE_COLD.b + (ROPE_HOT.b - ROPE_COLD.b) * t);
      return `rgb(${r}, ${g}, ${b})`;
    }

    // Sway amplitude/speed as a continuous function of the exact percentage
    // (via CSS custom properties the single buddy-web-tension keyframe
    // reads), not four fixed tiers — so it escalates smoothly rather than
    // jumping. Eased toward the high end (t^1.6) so it stays fairly calm
    // through the low-to-mid range and ramps up fast near the limit, the
    // way a real rubber band feels stable for a while then destabilizes
    // quickly right before it snaps. Still pure CSS underneath (just two
    // numbers recomputed per render) — no extra animation loop.
    function tensionParams(t) {
      t = Math.pow(Math.max(0, Math.min(1, t)), 1.6);
      return {
        amplitude: 3 + t * 17, // degrees: 3 -> 20
        duration: Math.max(0.32, 3.6 - t * 3.28), // seconds: 3.6 -> 0.32
      };
    }

    function replay(el, className) {
      el.classList.remove(className);
      void el.offsetWidth; // force reflow so the animation restarts
      el.classList.add(className);
    }

    // ---- Pull-and-release rubber-band ----
    // Dragging the character is a direct 1:1 follow (cheap: transform only,
    // driven by real pointer events, no loop needed). Releasing hands off to
    // a damped-spring requestAnimationFrame loop that runs ONLY until it
    // settles, then cancels itself — nothing ticks while at rest.
    const MAX_PULL = 70; // px, so it can't be yanked absurdly far
    const SPRING_K = 170; // stiffness
    const SPRING_C = 9; // damping
    let ropeRestHeight = 40; // recomputed from the live element on first grab
    let pullX = 0;
    let pullY = 0;
    let pullVX = 0;
    let pullVY = 0;
    let bounceRAF = null;
    let lastBounceTime = 0;
    let dragging = false;
    let dragStart = null;
    let dragMoved = false;

    function applyPull(dx, dy) {
      faller.style.transform = `translate(${dx}px, ${dy}px)`;
      if (!ropeMask) return;
      // The rope's rest length already covers the vertical gap between the
      // anchor and the character's resting position — the pull target for
      // the rope's *tip* is that rest length plus the drag delta, not the
      // drag delta alone, or the two visibly drift apart on a horizontal
      // pull (increasingly so the less vertical the pull is).
      const targetY = ropeRestHeight + dy;
      const requiredLength = Math.sqrt(dx * dx + targetY * targetY);
      const stretch = requiredLength / ropeRestHeight;
      // atan2(-dx, targetY): CSS rotate() is clockwise, which moves a
      // straight-down point's x toward -sin(angle) — negating dx here is
      // what makes a positive (rightward) pull rotate the rope right
      // instead of mirrored left.
      const angleDeg = (Math.atan2(-dx, targetY) * 180) / Math.PI;
      ropeMask.style.transform = `rotate(${angleDeg}deg) scaleY(${stretch})`;
    }

    function settleRest() {
      faller.style.transform = "";
      if (ropeMask) ropeMask.style.transform = "";
    }

    function stopBounce() {
      if (bounceRAF !== null) {
        cancelAnimationFrame(bounceRAF);
        bounceRAF = null;
      }
    }

    function stepBounce(now) {
      const dt = Math.min(0.032, (now - lastBounceTime) / 1000 || 0.016);
      lastBounceTime = now;
      const ax = -SPRING_K * pullX - SPRING_C * pullVX;
      const ay = -SPRING_K * pullY - SPRING_C * pullVY;
      pullVX += ax * dt;
      pullVY += ay * dt;
      pullX += pullVX * dt;
      pullY += pullVY * dt;

      const settled =
        Math.abs(pullX) < 0.5 && Math.abs(pullY) < 0.5 && Math.abs(pullVX) < 3 && Math.abs(pullVY) < 3;
      if (settled) {
        pullX = pullY = pullVX = pullVY = 0;
        settleRest();
        bounceRAF = null;
        return;
      }
      applyPull(pullX, pullY);
      bounceRAF = requestAnimationFrame(stepBounce);
    }

    function startBounce(fromX, fromY) {
      stopBounce();
      pullX = fromX;
      pullY = fromY;
      pullVX = 0;
      pullVY = 0;
      lastBounceTime = performance.now();
      bounceRAF = requestAnimationFrame(stepBounce);
    }

    function clampPull(dx, dy) {
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= MAX_PULL || dist === 0) return [dx, dy];
      const scale = MAX_PULL / dist;
      return [dx * scale, dy * scale];
    }

    faller.addEventListener("pointerdown", (e) => {
      if (fallen) return;
      stopBounce();
      dragging = true;
      dragMoved = false;
      dragStart = { x: e.clientX, y: e.clientY };
      const rect = ropeMask ? ropeMask.getBoundingClientRect() : null;
      if (rect && rect.height > 0) ropeRestHeight = rect.height;
      faller.setPointerCapture(e.pointerId);
    });

    faller.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      let dx = e.clientX - dragStart.x;
      let dy = e.clientY - dragStart.y;
      if (Math.abs(dx) > 4 || Math.abs(dy) > 4) dragMoved = true;
      [dx, dy] = clampPull(dx, dy);
      applyPull(dx, dy);
    });

    function endDrag(e) {
      if (!dragging) return;
      dragging = false;
      try { faller.releasePointerCapture(e.pointerId); } catch {}
      if (dragMoved) {
        let dx = e.clientX - dragStart.x;
        let dy = e.clientY - dragStart.y;
        [dx, dy] = clampPull(dx, dy);
        startBounce(dx, dy);
      } else {
        refreshNow();
      }
    }
    faller.addEventListener("pointerup", endDrag);
    faller.addEventListener("pointercancel", () => {
      dragging = false;
      stopBounce();
      settleRest();
    });

    function doFall() {
      stopBounce();
      dragging = false;
      const rect = faller.getBoundingClientRect();
      stage.appendChild(faller); // reparent out of the rotating rig (FLIP technique)
      faller.style.position = "fixed";
      faller.style.left = rect.left + "px";
      faller.style.top = rect.top + "px";
      faller.style.margin = "0";
      replay(faller, "falling");
      replay(snapText, "show");
      if (ropeMask) ropeMask.style.display = "none"; // nothing left hanging at the end of it
      setTimeout(() => {
        faller.style.display = "none";
      }, 900);
    }

    function doRespawn() {
      faller.style.display = "";
      faller.classList.remove("falling");
      faller.style.position = "";
      faller.style.left = "";
      faller.style.top = "";
      faller.style.margin = "";
      rig.appendChild(faller);
      if (ropeMask) ropeMask.style.display = "";
      settleRest();
    }

    function refreshNow() {
      stats.classList.add("pulse");
      setTimeout(() => stats.classList.remove("pulse"), 300);
      requestRefresh();
    }
    // The character (faller) handles its own click-vs-drag distinction via
    // pointer events above; this only covers clicks on the rope/strain.
    rig.addEventListener("click", (e) => {
      if (faller.contains(e.target)) return;
      refreshNow();
    });

    toggle.addEventListener("click", () => {
      persistSettings({ minimized: !settings.minimized });
      render();
    });

    function render() {
      const known = typeof state.percent === "number";
      const pct = known ? state.percent : 0;
      const broken = known && pct >= 100;

      const { amplitude, duration } = tensionParams(pct / 100);
      rig.style.setProperty("--tension-amp", amplitude.toFixed(1));
      rig.style.setProperty("--tension-dur", duration.toFixed(2) + "s");
      // Strain lines fade in continuously over the last 40 points rather
      // than snapping on at a fixed mood boundary.
      strain.style.opacity = broken ? 0 : Math.max(0, Math.min(1, (pct - 60) / 40));
      if (ropeMask) ropeMask.style.backgroundColor = ropeColor(pct / 100);

      const sessionBar = findBar(state.bars, "five_hour");
      const weekBar = findBar(state.bars, "seven_day");
      sessionVal.textContent = sessionBar ? `${sessionBar.pct}%` : "—";
      sessionVal.style.color = sessionBar ? moodColorFor(sessionBar.pct) : "rgba(244,242,255,0.4)";
      weekVal.textContent = weekBar ? `${weekBar.pct}%` : "—";
      weekVal.style.color = weekBar ? moodColorFor(weekBar.pct) : "rgba(244,242,255,0.4)";
      stats.style.opacity = known ? "1" : "0.5";

      wrap.classList.toggle("minimized", !!settings.minimized);
      wrap.style.opacity = String(settings.opacity ?? 0.95);

      const bits = (state.bars || []).map((b) => `${b.label} ${b.pct}%`);
      const extra = bits.length > 1 ? ` (${bits.join(", ")})` : "";
      wrap.title = known
        ? `${pct}% used${extra}${state.resetHint ? " — resets " + state.resetHint : ""}. Click to refresh.`
        : "Log in to claude.ai to track usage. Click to refresh.";

      if (prevPercent === undefined) {
        // First paint on this page: reflect current state instantly, no animation.
        if (broken) {
          faller.style.display = "none";
          if (ropeMask) ropeMask.style.display = "none";
          fallen = true;
        }
      } else if (broken && !fallen) {
        doFall();
        fallen = true;
      } else if (!broken && fallen) {
        doRespawn();
        fallen = false;
      }
      prevPercent = pct;
    }

    // An unfocused window or a backgrounded tab is exactly where a stray
    // rAF loop would burn cycles for nothing visible — cut it immediately
    // in either case rather than let it keep ticking while unseen, and
    // don't leave the sprite stuck mid-pull if focus was lost mid-drag.
    function onFocusLost() {
      stopBounce();
      dragging = false;
      settleRest();
    }
    function onVisibilityChange() {
      if (document.hidden) onFocusLost();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onFocusLost);

    function destroy() {
      stopBounce();
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onFocusLost);
    }

    return { render, destroy };
  }

  // ---- Mode switching ----
  let mounted = null; // { el, render, extra? }

  function ensureMode() {
    const wanted = settings.character === "hero" ? "hero" : "cat";
    if (mounted && mounted.mode === wanted) return;
    if (mounted && mounted.destroy) mounted.destroy();
    stage.innerHTML = "";
    mounted = wanted === "hero" ? mountHero() : mountCat();
    mounted.mode = wanted;
  }

  function render() {
    ensureMode();
    mounted.render();
  }

  // ---- Storage sync ----
  function shouldRenderForScope() {
    if (!settings.enabled) return false;
    if (settings.scope === "claude-only" && !location.hostname.endsWith("claude.ai")) return false;
    return true;
  }

  function mountOrUnmount() {
    if (shouldRenderForScope()) {
      if (!host.isConnected) document.documentElement.appendChild(host);
    } else if (host.isConnected) {
      host.remove();
    }
  }

  chrome.runtime.sendMessage({ type: "get-state" }).then((res) => {
    if (!res) return;
    state = res.state || state;
    settings = res.settings || settings;
    mountOrUnmount();
    render();
  }).catch(() => {
    // Background not ready yet on very first install tick — still show a
    // default creature rather than nothing.
    mountOrUnmount();
    render();
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes[STATE_KEY]) {
      state = changes[STATE_KEY].newValue || state;
      render();
    }
    if (changes[SETTINGS_KEY]) {
      settings = changes[SETTINGS_KEY].newValue || settings;
      mountOrUnmount();
      render();
    }
  });
})();
