// Claude Buddy — shared pixel-art character renderers (cat + web-slinger
// hero). Loaded as a plain script (no bundler) by both the overlay content
// script and the popup page, so both always draw the exact same character
// and share the exact same animation rules (ClaudeBuddyMascot.css).
(function (global) {
  const MOOD_COLORS = {
    happy: "#7dd3a8",
    content: "#8ab4f8",
    concerned: "#f6c453",
    stressed: "#f28b82",
    sleeping: "#b9b3d9",
  };

  const MOOD_LABEL = {
    happy: "All clear",
    content: "Steady usage",
    concerned: "Getting close to your limit",
    stressed: "Limit reached",
    sleeping: "No claude.ai activity yet",
  };

  // 16x16 grid rendered as a soft circle body + triangular ears + tail,
  // with a couple of padding columns/rows left clear on every side for
  // whiskers, ears and tail to poke out of the body silhouette.
  const GRID_W = 16;
  const GRID_H = 16;
  const CELL = 4;
  const SIZE = GRID_W * CELL;
  const CENTER_X = 7.5;
  const CENTER_Y = 8.5;
  const RADIUS = 6.4;

  function bodyMask() {
    const cells = [];
    for (let y = 0; y < GRID_H; y++) {
      for (let x = 0; x < GRID_W; x++) {
        const dx = x - CENTER_X;
        const dy = y - CENTER_Y;
        if (Math.sqrt(dx * dx + dy * dy) <= RADIUS) cells.push([x, y]);
      }
    }
    return cells;
  }
  const BODY_CELLS = bodyMask();

  const EARS = {
    left: { row0: [4], row1: [3, 4, 5], row2: [3, 4, 5, 6], inner: [4, 1] },
    right: { row0: [11], row1: [10, 11, 12], row2: [9, 10, 11, 12], inner: [11, 1] },
  };

  const TAIL_CELLS = [
    [12, 12], [13, 12],
    [13, 13], [14, 13],
    [14, 14], [15, 14],
  ];

  function rect(x, y, color, w, h, opacity) {
    w = w || 1;
    h = h || 1;
    const op = opacity === undefined ? "" : ` fill-opacity="${opacity}"`;
    return (
      '<rect x="' + x * CELL + '" y="' + y * CELL + '" width="' + w * CELL +
      '" height="' + h * CELL + '" fill="' + color + '"' + op + '/>'
    );
  }

  function buildEars(bodyColor) {
    const inner = "#f7c6d9";
    function side(spec, className) {
      const parts = [];
      spec.row0.forEach((x) => parts.push(rect(x, 0, bodyColor)));
      spec.row1.forEach((x) => parts.push(rect(x, 1, bodyColor)));
      spec.row2.forEach((x) => parts.push(rect(x, 2, bodyColor)));
      parts.push(rect(spec.inner[0], spec.inner[1], inner));
      return `<g class="mascot-ear ${className}">${parts.join("")}</g>`;
    }
    return side(EARS.left, "mascot-ear-left") + side(EARS.right, "mascot-ear-right");
  }

  function whiskersMarkup() {
    const w = "#ffffff";
    const op = 0.85;
    return [
      rect(0, 9, w, 3, 1, op),
      rect(1, 11, w, 2, 1, op),
      rect(13, 9, w, 3, 1, op),
      rect(13, 11, w, 2, 1, op),
    ].join("");
  }

  function eyesMarkup(mood) {
    const ink = "#2b2740";
    if (mood === "sleeping") {
      return `<g class="mascot-eyes mascot-eyes-closed">${rect(5, 8, ink, 2, 1)}${rect(9, 8, ink, 2, 1)}</g>`;
    }
    if (mood === "stressed") {
      return `<g class="mascot-eyes">${rect(5, 7, ink, 2, 2)}${rect(9, 7, ink, 2, 2)}</g>`;
    }
    return `<g class="mascot-eyes">${rect(5, 8, ink, 2, 2)}${rect(9, 8, ink, 2, 2)}</g>`;
  }

  function mouthMarkup(mood) {
    const ink = "#2b2740";
    switch (mood) {
      case "happy":
        return (
          rect(6, 11, ink, 1, 1) + rect(7, 12, ink, 2, 1) + rect(9, 11, ink, 1, 1) +
          rect(3, 10, "#f4a3b8", 1, 1) + rect(12, 10, "#f4a3b8", 1, 1)
        );
      case "content":
        return rect(6, 11, ink, 4, 1);
      case "concerned":
        return rect(7, 11, ink, 2, 2);
      case "stressed":
        return (
          rect(5, 11, "#8a3b3b", 6, 3) +
          `<g class="mascot-sweat">${rect(12, 6, "#8ecbe8", 1, 2)}</g>`
        );
      case "sleeping":
        return rect(7, 11, ink, 2, 1);
      default:
        return "";
    }
  }

  function zzzMarkup(mood) {
    if (mood !== "sleeping") return "";
    return (
      '<g class="mascot-zzz">' +
      rect(11, 0, "#efe9ff", 2, 2, 0.9) +
      `<g class="mascot-zzz mascot-zzz-2">${rect(13, -3, "#efe9ff", 1.5, 1.5, 0.9)}</g>` +
      "</g>"
    );
  }

  function catSVG(mood) {
    const color = MOOD_COLORS[mood] || MOOD_COLORS.sleeping;
    const body = BODY_CELLS.map((c) => rect(c[0], c[1], color)).join("");
    const ears = buildEars(color);
    const tail = `<g class="mascot-tail">${TAIL_CELLS.map((c) => rect(c[0], c[1], color)).join("")}</g>`;
    const whiskers = whiskersMarkup();
    const eyes = eyesMarkup(mood);
    const mouth = mouthMarkup(mood);
    const zzz = zzzMarkup(mood);

    return (
      '<svg width="' + SIZE + '" height="' + SIZE + '" viewBox="0 0 ' + SIZE + " " + SIZE +
      '" data-mood="' + mood + '" shape-rendering="crispEdges" style="overflow:visible" ' +
      'xmlns="http://www.w3.org/2000/svg">' +
      tail + body + ears + whiskers + eyes + mouth + zzz +
      "</svg>"
    );
  }

  // ---- Web-slinger hero: a personal-use bundled image, split into two
  // pieces (see scripts/split-hero.ps1 or the split used to produce these —
  // cropped at the exact row where the source image's rope silhouette ends
  // and the character begins):
  //   - hero-rope-mask.png: just the rope lines, used as a CSS mask so its
  //     color can be driven by usage tension (white -> red), not baked in.
  //   - hero-body.png: the character, shown as-is, untouched by tension.
  // Original source image was 433x577; rope occupies rows 0-293, body 294-576.
  const HERO_IMG_W = 84;
  const HERO_SCALE = HERO_IMG_W / 433;
  const HERO_ROPE_H = Math.round(294 * HERO_SCALE);
  const HERO_BODY_H = Math.round(283 * HERO_SCALE);

  function heroImg() {
    const ropeUrl = chrome.runtime.getURL("assets/hero-rope-mask.png");
    const bodyUrl = chrome.runtime.getURL("assets/hero-body.png");
    const maskCss =
      "-webkit-mask-image:url(" + ropeUrl + ");mask-image:url(" + ropeUrl + ");" +
      "-webkit-mask-repeat:no-repeat;mask-repeat:no-repeat;" +
      "-webkit-mask-size:100% 100%;mask-size:100% 100%;";
    return (
      '<div class="hero-rope-mask" style="width:' + HERO_IMG_W + "px;height:" + HERO_ROPE_H +
      "px;" + maskCss + '"></div>' +
      '<img src="' + bodyUrl + '" width="' + HERO_IMG_W + '" height="' + HERO_BODY_H +
      '" alt="" style="display:block;" />'
    );
  }

  const CHARACTERS = [
    { id: "cat", label: "Cat" },
    { id: "hero", label: "Web-Slinger" },
  ];

  function svg(characterId, mood) {
    return characterId === "hero" ? heroImg() : catSVG(mood);
  }

  // Shared animation rules — appended verbatim into the overlay's shadow
  // <style> and injected into the popup document. Keeping this here (rather
  // than duplicated in two CSS files) means the mascot and its motion can
  // never drift out of sync between the two surfaces.
  const CSS = `
    .mascot-tail { transform-box: fill-box; transform-origin: 0% 0%; }
    svg[data-mood="happy"] .mascot-tail { animation: buddy-tail-happy 0.6s ease-in-out infinite; }
    svg[data-mood="content"] .mascot-tail { animation: buddy-tail-sway 2.4s ease-in-out infinite; }
    svg[data-mood="concerned"] .mascot-tail { animation: buddy-tail-nervous 0.9s ease-in-out infinite; }
    svg[data-mood="stressed"] .mascot-tail { animation: buddy-tail-frantic 0.22s linear infinite; }
    svg[data-mood="sleeping"] .mascot-tail { animation: buddy-tail-sway 4.5s ease-in-out infinite; }
    @keyframes buddy-tail-happy { 0%,100% { transform: rotate(-22deg); } 50% { transform: rotate(22deg); } }
    @keyframes buddy-tail-sway { 0%,100% { transform: rotate(-8deg); } 50% { transform: rotate(8deg); } }
    @keyframes buddy-tail-nervous { 0%,100% { transform: rotate(-14deg); } 50% { transform: rotate(10deg); } }
    @keyframes buddy-tail-frantic { 0%,100% { transform: rotate(-26deg); } 50% { transform: rotate(26deg); } }

    .mascot-ear { transform-box: fill-box; transform-origin: 50% 100%; animation: buddy-ear-flick 5.5s ease-in-out infinite; }
    .mascot-ear-right { animation-delay: 1.4s; }
    @keyframes buddy-ear-flick {
      0%, 90%, 100% { transform: rotate(0deg); }
      92% { transform: rotate(10deg); }
      95% { transform: rotate(-6deg); }
      97% { transform: rotate(0deg); }
    }

    .mascot-eyes { transform-box: fill-box; transform-origin: 50% 50%; transition: transform 90ms ease-in-out; }
    .buddy-blink .mascot-eyes:not(.mascot-eyes-closed) { transform: scaleY(0.08); }

    .mascot-sweat { transform-box: fill-box; transform-origin: 50% 0%; animation: buddy-sweat-drip 1.1s ease-in infinite; }
    @keyframes buddy-sweat-drip {
      0% { transform: translateY(0); opacity: 1; }
      80% { opacity: 1; }
      100% { transform: translateY(6px); opacity: 0; }
    }

    .mascot-zzz { animation: buddy-zzz-float 2.6s ease-in infinite; }
    .mascot-zzz-2 { animation-delay: 1.1s; }
    @keyframes buddy-zzz-float {
      0% { transform: translate(0, 4px); opacity: 0; }
      15% { opacity: 0.9; }
      100% { transform: translate(4px, -10px); opacity: 0; }
    }

    svg[data-mood="happy"] { animation: buddy-bob-happy 1.6s ease-in-out infinite; }
    svg[data-mood="content"] { animation: buddy-bob 3s ease-in-out infinite; }
    svg[data-mood="concerned"] { animation: buddy-bob 2.2s ease-in-out infinite; }
    svg[data-mood="stressed"] { animation: buddy-jitter 0.5s linear infinite; }
    svg[data-mood="sleeping"] { animation: buddy-breathe 4.2s ease-in-out infinite; }
    @keyframes buddy-bob-happy { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }
    @keyframes buddy-bob { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
    @keyframes buddy-breathe { 0%,100% { transform: translateY(0) scale(1); } 50% { transform: translateY(1px) scale(0.985); } }
    @keyframes buddy-jitter {
      0%, 100% { transform: translate(0, 0); }
      20% { transform: translate(-1px, -1px); }
      40% { transform: translate(1px, 1px); }
      60% { transform: translate(-1px, 1px); }
      80% { transform: translate(1px, -1px); }
    }

    /* Web-slinger hero: the tension lives in the thread, not the sprite.
       A single keyframe shape, scaled continuously by two custom properties
       (--tension-amp, --tension-dur) that overlay.js recomputes from the
       exact usage percentage on every render — so motion escalates smoothly
       as usage climbs instead of jumping between a handful of fixed tiers.
       The 4-point wobble (not a plain sine) is what makes a *fast, wide*
       version of it read as "shaking" rather than just "swinging quickly". */
    .web-rig {
      transform-box: fill-box;
      transform-origin: top center;
      animation: buddy-web-tension var(--tension-dur, 3.6s) ease-in-out infinite;
    }
    @keyframes buddy-web-tension {
      0%, 100% { transform: rotate(calc(var(--tension-amp, 3) * -1deg)); }
      25% { transform: rotate(calc(var(--tension-amp, 3) * 0.6deg)); }
      50% { transform: rotate(calc(var(--tension-amp, 3) * -0.8deg)); }
      75% { transform: rotate(calc(var(--tension-amp, 3) * 1deg)); }
    }

    .web-thread { transition: width 0.4s ease; }
    .web-strain { animation: buddy-strain-flicker 0.6s ease-in-out infinite; }
    @keyframes buddy-strain-flicker { 0%,100% { opacity: 0.4; } 50% { opacity: 1; } }

    .web-thread.snapped { height: 14px; animation: buddy-web-snap-remnant 1s ease-out; }
    @keyframes buddy-web-snap-remnant {
      0% { transform: rotate(0deg); } 30% { transform: rotate(35deg); }
      60% { transform: rotate(-20deg); } 100% { transform: rotate(4deg); }
    }
    .hero-faller.falling { animation: buddy-hero-fall 0.9s cubic-bezier(.4,0,1,1) forwards; }
    @keyframes buddy-hero-fall {
      15% { transform: rotate(18deg); }
      100% { top: 115vh; transform: rotate(260deg); opacity: 0.85; }
    }
    .web-snap-text {
      position: fixed;
      font-weight: 800;
      font-size: 13px;
      color: #f87171;
      text-shadow: 0 1px 3px rgba(0,0,0,0.6);
      opacity: 0;
      pointer-events: none;
    }
    .web-snap-text.show { animation: buddy-snap-text 0.9s ease-out forwards; }
    @keyframes buddy-snap-text {
      0% { opacity: 0; transform: scale(0.6) rotate(-8deg); }
      25% { opacity: 1; transform: scale(1.15) rotate(4deg); }
      45% { transform: scale(1) rotate(-2deg); }
      100% { opacity: 0; transform: scale(1) translateY(6px); }
    }
  `;

  global.ClaudeBuddyMascot = { svg, css: CSS, MOOD_LABEL, MOOD_COLORS, CHARACTERS };
})(typeof window !== "undefined" ? window : globalThis);
