import { useLayoutEffect, useRef } from 'react'

// Ported from the "claude usage tracker" browser extension's web-slinger
// hero rig (content/overlay.js + shared/mascot.js) — same split-image
// technique and the same pull-and-release spring physics, minus the
// usage-tension bits (mood colors, stats, snap-on-100%) that don't apply
// here. Source image was 433x577; rope occupies rows 0-293, body 294-576.
const ROPE_IMG = `${import.meta.env.BASE_URL}spiderman/rope-mask.png`
const BODY_IMG = `${import.meta.env.BASE_URL}spiderman/body.png`

const IMG_W = 100
const SCALE = IMG_W / 433
const ROPE_H = Math.round(294 * SCALE)
const BODY_H = Math.round(283 * SCALE)
const ROPE_REST_COLOR = 'rgba(255, 255, 255, 0.9)'

// He's standing in for the old "Click here" button now, but pulling him
// isn't a plain 1:1 drag anymore — there's a "level" (LEVEL_RAW) up to which
// it's an easy, direct follow, same as flicking him around for fun. Push
// past that and resistance kicks in: each extra pixel of real pointer travel
// buys back less and less visual pull (a sqrt curve, not linear), so it
// takes a genuinely committed drag to visually reach BREAK_VISUAL, the point
// where the web actually snaps. That snap (not a release-past-a-threshold)
// is what fires onActivate. Releasing early, anywhere below BREAK_VISUAL,
// just bounces back like a normal pull — no partial credit.
const LEVEL_RAW = 40
const BREAK_VISUAL = 78

// The resistance curve's steepness is recomputed on every pointerdown (see
// resistanceForTarget/onPointerDown below) so the break point always lands
// right at the bottom edge of the viewport, measured from wherever the drag
// actually started — literally "pull the cursor down to the bottom of your
// screen, that's it", not a fixed pixel count or a fraction of the full
// viewport regardless of where he was grabbed. TARGET_RAW_MIN is just a
// sanity floor for the rare case he's grabbed within a few pixels of the
// bottom already.
const TARGET_RAW_MIN = 150

// Solves for the resistance value that makes visualPullMagnitude(targetRaw)
// land exactly on BREAK_VISUAL — i.e. "what resistance makes the break
// point require dragging targetRaw pixels".
function resistanceForTarget(targetRaw: number) {
  return (BREAK_VISUAL - LEVEL_RAW) / Math.sqrt(Math.max(1, targetRaw - LEVEL_RAW))
}

// The spring the character bounces back on, both for a normal early release
// and for the recoil right after the web breaks — same physics, so a snap
// reads as "the same pull, suddenly let go" rather than a different mode.
const SPRING_K = 170
const SPRING_C = 9

// Raw pointer delta -> actual on-screen pull distance, given the current
// drag's resistance (see resistanceForTarget above).
function visualPullMagnitude(rawDist: number, resistance: number) {
  if (rawDist <= LEVEL_RAW) return rawDist
  return LEVEL_RAW + resistance * Math.sqrt(rawDist - LEVEL_RAW)
}

const ROPE_COLD = { r: 255, g: 255, b: 255 }
const ROPE_HOT = { r: 229, g: 57, b: 53 }
function ropeTensionColor(t: number) {
  const clamped = Math.max(0, Math.min(1, t))
  const r = Math.round(ROPE_COLD.r + (ROPE_HOT.r - ROPE_COLD.r) * clamped)
  const g = Math.round(ROPE_COLD.g + (ROPE_HOT.g - ROPE_COLD.g) * clamped)
  const b = Math.round(ROPE_COLD.b + (ROPE_HOT.b - ROPE_COLD.b) * clamped)
  return `rgb(${r}, ${g}, ${b})`
}

// The tease pill: one line, shown only once they're already halfway to
// actually breaking it — not a running commentary the whole way down.
const TEASE_TEXT = 'taakat laga 💪'
const TEASE_PROGRESS_THRESHOLD = 0.5

interface SpiderBuddyProps {
  // Fires once when a pull actually breaks the web (crosses BREAK_VISUAL
  // mid-drag) — the parent's cue to advance past the "Click here" gate this
  // replaced.
  onActivate?: () => void
  // Fires right alongside onActivate, same moment — a separate prop (not
  // just folded into onActivate) since they mean different things to the
  // parent: onActivate advances the quiz, onBroken just says "he's gone
  // now, stop showing anything that assumes he's still hanging there" (the
  // "pull spidey" hint text, namely).
  onBroken?: () => void
}

export default function SpiderBuddy({ onActivate, onBroken }: SpiderBuddyProps) {
  const ropeRef = useRef<HTMLDivElement>(null)
  const fallerRef = useRef<HTMLDivElement>(null)
  const pillRef = useRef<HTMLDivElement>(null)
  // Kept current on every render (not just at mount) so the effect below —
  // which only runs once — always calls whatever callbacks the parent last
  // passed, without needing them in a dependency array.
  const onActivateRef = useRef(onActivate)
  onActivateRef.current = onActivate
  const onBrokenRef = useRef(onBroken)
  onBrokenRef.current = onBroken

  useLayoutEffect(() => {
    const faller = fallerRef.current
    const ropeMask = ropeRef.current
    const pill = pillRef.current
    if (!faller || !ropeMask || !pill) return

    // Entrance: the thread grows down from the card's top edge (where it's
    // anchored) instead of the whole rig sliding in from off-screen above —
    // keeps him visibly attached to the card the entire time instead of
    // popping in from outside its bounds. useLayoutEffect (not useEffect) so
    // the 0-height/hidden starting state is applied before the browser ever
    // paints the full-height resting frame — no flash.
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reducedMotion) {
      ropeMask.style.height = `${ROPE_H}px`
      faller.style.opacity = '1'
    } else {
      ropeMask.style.height = '0px'
      faller.style.opacity = '0'
      ropeMask.animate([{ height: '0px' }, { height: `${ROPE_H}px` }], {
        duration: 1300,
        easing: 'cubic-bezier(0.65, 0, 0.35, 1)',
        fill: 'forwards',
      })
      // Finishes right as the rope does (500ms + 800ms = 1300ms, matching
      // the rope's own duration above) — he arrives at its tip exactly when
      // it stops growing, instead of turning fully visible partway through.
      faller.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: 800,
        delay: 500,
        easing: 'ease-out',
        fill: 'forwards',
      })
    }

    let ropeRestHeight = ROPE_H
    // Both recomputed fresh at the start of every drag (see onPointerDown)
    // from the live distance-to-bottom-of-viewport — see resistanceForTarget
    // above. targetRaw is kept separately (not just baked into resistance)
    // because the tease pill's "halfway" (see updateTeasePill) means halfway
    // through the actual physical drag, not halfway through the resisted
    // on-screen visual — those two diverge a lot given the resistance curve
    // is deliberately front-loaded (fast progress early, crawling near the
    // end), so "visual halfway" would fire the pill way too early.
    let targetRaw = TARGET_RAW_MIN
    let resistance = resistanceForTarget(targetRaw)
    let pullX = 0
    let pullY = 0
    let pullVX = 0
    let pullVY = 0
    let bounceRAF: number | null = null
    let lastBounceTime = 0
    let dragging = false
    let dragMoved = false
    let dragStart = { x: 0, y: 0 }
    // Once the web actually breaks, that's it for this modal session — he
    // falls away and stays gone (doesn't recoil back to hang there again
    // for video2, unlike a normal early-release bounce-back).
    let hasBroken = false

    function applyPull(dx: number, dy: number) {
      faller!.style.transform = `translate(${dx}px, ${dy}px)`
      // The rope's rest length already covers the vertical gap between the
      // anchor and the character's resting position — the pull target for
      // the rope's tip is that rest length plus the drag delta, not the
      // drag delta alone, or the two visibly drift apart on a horizontal pull.
      const targetY = ropeRestHeight + dy
      const requiredLength = Math.sqrt(dx * dx + targetY * targetY)
      const stretch = requiredLength / ropeRestHeight
      // atan2(-dx, targetY): CSS rotate() is clockwise, which moves a
      // straight-down point's x toward -sin(angle) — negating dx is what
      // makes a rightward pull rotate the rope right, not mirrored left.
      const angleDeg = (Math.atan2(-dx, targetY) * 180) / Math.PI
      ropeMask!.style.transform = `rotate(${angleDeg}deg) scaleY(${stretch})`

      // Tension feedback: the thread creeps from white toward hot red as the
      // pull nears BREAK_VISUAL, so "pull harder" has a visible signal
      // instead of the requirement being invisible/guessable. Shared by both
      // live dragging and the spring bounce-back below (same function, same
      // dx/dy), so it naturally cools back to white as a released pull settles.
      const dist = Math.sqrt(dx * dx + dy * dy)
      ropeMask!.style.backgroundColor = ropeTensionColor(dist / BREAK_VISUAL)
    }

    function updateTeasePill(rawDist: number) {
      // Halfway through the actual physical drag (not the resisted visual
      // pull, which — thanks to that same resistance curve — would already
      // be mostly "done" well before the halfway point). No escalating
      // commentary past that either; just the one line.
      pill!.style.opacity = rawDist / targetRaw > TEASE_PROGRESS_THRESHOLD ? '1' : '0'
      pill!.textContent = TEASE_TEXT
    }

    function hideTeasePill() {
      pill!.style.opacity = '0'
    }

    function settleRest() {
      faller!.style.transform = ''
      ropeMask!.style.transform = ''
      ropeMask!.style.backgroundColor = ROPE_REST_COLOR
      hideTeasePill()
    }

    function stopBounce() {
      if (bounceRAF !== null) {
        cancelAnimationFrame(bounceRAF)
        bounceRAF = null
      }
    }

    function stepBounce(now: number) {
      const dt = Math.min(0.032, (now - lastBounceTime) / 1000 || 0.016)
      lastBounceTime = now
      const ax = -SPRING_K * pullX - SPRING_C * pullVX
      const ay = -SPRING_K * pullY - SPRING_C * pullVY
      pullVX += ax * dt
      pullVY += ay * dt
      pullX += pullVX * dt
      pullY += pullVY * dt

      const settled =
        Math.abs(pullX) < 0.5 && Math.abs(pullY) < 0.5 && Math.abs(pullVX) < 3 && Math.abs(pullVY) < 3
      if (settled) {
        pullX = pullY = pullVX = pullVY = 0
        settleRest()
        bounceRAF = null
        return
      }
      applyPull(pullX, pullY)
      bounceRAF = requestAnimationFrame(stepBounce)
    }

    function startBounce(fromX: number, fromY: number) {
      stopBounce()
      pullX = fromX
      pullY = fromY
      pullVX = 0
      pullVY = 0
      lastBounceTime = performance.now()
      bounceRAF = requestAnimationFrame(stepBounce)
    }

    // Raw pointer delta -> the actual (resisted) visual pull, keeping the
    // same direction. Replaces the old hard clamp — there's no ceiling here,
    // just diminishing returns past LEVEL_RAW (see visualPullMagnitude).
    function resistPull(dx: number, dy: number): [number, number, number] {
      const rawDist = Math.sqrt(dx * dx + dy * dy)
      if (rawDist === 0) return [0, 0, 0]
      const visualDist = visualPullMagnitude(rawDist, resistance)
      const scale = visualDist / rawDist
      return [dx * scale, dy * scale, visualDist]
    }

    // Fires the instant a drag's visual pull crosses BREAK_VISUAL — not on
    // release. Ends the drag right there and lets it recoil via the normal
    // spring, same as any other release; onActivate fires exactly once per
    // successful break.
    //
    // Deliberately does NOT release pointer capture here. By the time this
    // fires, the cursor has been dragged well outside the card's bounds (all
    // the way toward the bottom of the viewport) — releasing capture early
    // would let the browser hit-test the eventual physical mouseup normally,
    // which lands on the modal's backdrop out there and (by the backdrop's
    // own click-outside-to-close behavior) closes the whole card. Keeping
    // capture until the browser's own natural release (which happens right
    // as it dispatches the real pointerup, regardless of our code) keeps
    // that mouseup routed to this still-inside-the-card element instead.
    function triggerBreak(vdx: number, vdy: number) {
      dragging = false
      hasBroken = true
      hideTeasePill()
      onActivateRef.current?.()
      onBrokenRef.current?.()
      // No bounce-back here — he's not springing back to hang there for
      // video2 like nothing happened. The web actually broke: it fades out
      // where it snapped, and he tumbles away and off, permanently (see
      // hasBroken guards below — no further drags do anything after this).
      faller!.style.pointerEvents = 'none'
      ropeMask!.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 220,
        easing: 'ease-in',
        fill: 'forwards',
      })
      faller!.animate(
        [
          { transform: `translate(${vdx}px, ${vdy}px) rotate(0deg)`, opacity: 1 },
          { transform: `translate(${vdx * 0.7}px, ${vdy + 260}px) rotate(220deg)`, opacity: 0 },
        ],
        { duration: 750, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
      )
    }

    function onPointerDown(e: PointerEvent) {
      // Belt-and-suspenders alongside faller's pointer-events:none (set the
      // instant the web breaks) — once broken, no further drag should do
      // anything at all.
      if (hasBroken) return
      stopBounce()
      dragging = true
      dragMoved = false
      dragStart = { x: e.clientX, y: e.clientY }
      const rect = ropeMask!.getBoundingClientRect()
      if (rect.height > 0) ropeRestHeight = rect.height
      // Re-derived every drag from where THIS drag actually started — the
      // real vertical room between the grab point and the bottom of the
      // screen, not a fixed fraction of the full viewport regardless of
      // where he happens to be hanging. The *0.85 is slack for real cursors:
      // OS-clamped movement rarely reaches the literal last pixel of the
      // screen, so "drag to the bottom" should mean "get close", not demand
      // sub-pixel precision at the exact edge.
      const distanceToBottom = (window.innerHeight - e.clientY) * 0.85
      targetRaw = Math.max(TARGET_RAW_MIN, distanceToBottom)
      resistance = resistanceForTarget(targetRaw)
      faller!.setPointerCapture(e.pointerId)
    }

    function onPointerMove(e: PointerEvent) {
      if (!dragging) return
      const rawDx = e.clientX - dragStart.x
      const rawDy = e.clientY - dragStart.y
      const rawDist = Math.sqrt(rawDx * rawDx + rawDy * rawDy)
      if (Math.abs(rawDx) > 4 || Math.abs(rawDy) > 4) dragMoved = true
      const [vdx, vdy, vdist] = resistPull(rawDx, rawDy)
      applyPull(vdx, vdy)
      updateTeasePill(rawDist)
      if (vdist >= BREAK_VISUAL) {
        triggerBreak(vdx, vdy)
      }
    }

    function onPointerUp(e: PointerEvent) {
      if (!dragging) return
      dragging = false
      try {
        faller!.releasePointerCapture(e.pointerId)
      } catch {
        // no-op — capture may already be gone (e.g. pointercancel fired first)
      }
      if (dragMoved) {
        const rawDx = e.clientX - dragStart.x
        const rawDy = e.clientY - dragStart.y
        const [vdx, vdy] = resistPull(rawDx, rawDy)
        // No partial credit — anything short of an actual break (handled
        // mid-drag in onPointerMove above) is just a normal bounce-back.
        startBounce(vdx, vdy)
      }
    }

    function onPointerCancel() {
      dragging = false
      stopBounce()
      settleRest()
    }

    faller.addEventListener('pointerdown', onPointerDown)
    faller.addEventListener('pointermove', onPointerMove)
    faller.addEventListener('pointerup', onPointerUp)
    faller.addEventListener('pointercancel', onPointerCancel)

    // An unfocused window or a backgrounded tab is exactly where a stray
    // rAF loop would burn cycles for nothing visible — cut it immediately,
    // and don't leave the sprite stuck mid-pull if focus was lost mid-drag.
    function onFocusLost() {
      stopBounce()
      dragging = false
      settleRest()
    }
    function onVisibilityChange() {
      if (document.hidden) onFocusLost()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    window.addEventListener('blur', onFocusLost)

    return () => {
      stopBounce()
      faller.removeEventListener('pointerdown', onPointerDown)
      faller.removeEventListener('pointermove', onPointerMove)
      faller.removeEventListener('pointerup', onPointerUp)
      faller.removeEventListener('pointercancel', onPointerCancel)
      document.removeEventListener('visibilitychange', onVisibilityChange)
      window.removeEventListener('blur', onFocusLost)
    }
  }, [])

  return (
    // absolute (not fixed) — meant to be nested inside the Srii card so it
    // rides along with the card's own position/scale/opacity instead of
    // being pinned to the browser viewport.
    // right-0 (not right-6) centers him over the Mute+Close button cluster in
    // the toolbar below (12px row padding + 32px Close + 8px gap + 32px Mute
    // — that cluster's midpoint sits almost exactly at the card's right
    // edge once IMG_W's own half-width is accounted for), so the rope reads
    // as hanging down from between the two rather than off to the side.
    <div className="pointer-events-none absolute right-0 top-0 z-30 flex flex-col items-center">
      <div className="spider-web-rig flex flex-col items-center">
        <div
          ref={ropeRef}
          style={{
            width: IMG_W,
            backgroundColor: ROPE_REST_COLOR,
            WebkitMaskImage: `url(${ROPE_IMG})`,
            maskImage: `url(${ROPE_IMG})`,
            WebkitMaskRepeat: 'no-repeat',
            maskRepeat: 'no-repeat',
            WebkitMaskSize: '100% 100%',
            maskSize: '100% 100%',
            transformOrigin: 'top center',
          }}
        />
        <div
          ref={fallerRef}
          role="button"
          aria-label="Spider-Man — pull hard enough to break the web"
          className="spider-faller pointer-events-auto -mt-0.5 cursor-grab touch-none leading-none active:cursor-grabbing"
        >
          <img
            src={BODY_IMG}
            width={IMG_W}
            height={BODY_H}
            alt=""
            draggable={false}
            className="block"
            style={{ filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.45))' }}
          />
        </div>
      </div>

      {/* The tease — hidden (opacity 0) until a drag is actually underway,
          text/urgency updated imperatively as the pull approaches
          BREAK_VISUAL (see updateTeasePill above). Offset to the left so it
          never sits under the character mid-drag. */}
      <div
        ref={pillRef}
        className="absolute -left-26 top-15.5 whitespace-nowrap rounded-full bg-black/80 px-2.5 py-1 text-[10px] font-semibold text-white opacity-0 shadow-[0_4px_16px_rgba(0,0,0,0.5)] backdrop-blur-sm transition-opacity duration-150"
      />
    </div>
  )
}
