import { forwardRef, useImperativeHandle, useMemo, useRef } from 'react'

export interface SpaceBackdropHandle {
  /** Pan offset of the world, in px. Layers drift by their own small factor. */
  setParallax: (x: number, y: number) => void
  /** Mirrors the world's CSS transition so animated pans glide the sky too. */
  setTransition: (css: string) => void
}

// Deterministic PRNG (mulberry32) so the star field is generated once at
// module load and is byte-identical across renders/reloads — no flicker from
// re-randomising, and the SVG data URIs stay cacheable.
function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface LayerSpec {
  seed: number
  /** Tile size in px. Also the wrap period for the parallax translate. */
  tile: number
  count: number
  maxRadius: number
  /** Fraction of the world's pan applied to this layer. 0 = infinitely far. */
  factor: number
  opacity: number
}

// Three depths. The far layer is deliberately factor:0 — it never moves, so
// it needs no bleed area around the viewport and stays the cheapest possible
// composited layer. Only the two nearer layers pay for overdraw.
const LAYERS: LayerSpec[] = [
  { seed: 0x5eed01, tile: 300, count: 64, maxRadius: 0.8, factor: 0, opacity: 0.6 },
  { seed: 0x5eed03, tile: 320, count: 26, maxRadius: 1.6, factor: 0.055, opacity: 0.95 },
]

// Most stars read as white; a minority get a faint blue or warm cast, which
// is what stops a field like this from looking like flat noise.
const STAR_TINTS = ['%23ffffff', '%23ffffff', '%23ffffff', '%23ffffff', '%23c8dcff', '%23ffe6c4']

function starFieldUrl({ seed, tile, count, maxRadius, opacity }: LayerSpec) {
  const rand = mulberry32(seed)
  let circles = ''
  for (let i = 0; i < count; i++) {
    const cx = (rand() * tile).toFixed(1)
    const cy = (rand() * tile).toFixed(1)
    const r = (0.35 + rand() * maxRadius).toFixed(2)
    const o = (0.2 + rand() * opacity).toFixed(2)
    const fill = STAR_TINTS[Math.floor(rand() * STAR_TINTS.length)]
    circles += `<circle cx='${cx}' cy='${cy}' r='${r}' fill='${fill}' opacity='${o}'/>`
  }
  return `url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='${tile}' height='${tile}'>${circles}</svg>")`
}

/**
 * Ambient deep-space backdrop behind the poster canvas.
 *
 * Everything here animates on transform/opacity only, so it lives entirely on
 * the compositor and costs no main-thread work per frame — important because
 * it sits underneath a hot pan/zoom loop. Parallax is driven imperatively by
 * Canvas from the same funnel that writes the world transform: a single style
 * write per frame, with no React involvement.
 */
const SpaceBackdrop = forwardRef<SpaceBackdropHandle>(function SpaceBackdrop(_props, ref) {
  const layerRefs = useRef<(HTMLDivElement | null)[]>([])

  const layerUrls = useMemo(() => LAYERS.map(starFieldUrl), [])

  useImperativeHandle(ref, () => ({
    setParallax(x, y) {
      for (let i = 0; i < LAYERS.length; i++) {
        const spec = LAYERS[i]
        if (spec.factor === 0) continue
        const el = layerRefs.current[i]
        if (!el) continue
        // Wrapping by the tile size is visually identical to the raw offset
        // (the pattern repeats at exactly that period) but keeps the layer
        // within its bleed area forever, so an unbounded pan never exposes
        // an edge and the layer never needs to be viewport-sized + huge.
        const px = ((x * spec.factor) % spec.tile).toFixed(2)
        const py = ((y * spec.factor) % spec.tile).toFixed(2)
        el.style.transform = `translate3d(${px}px, ${py}px, 0)`
      }
      // The nebulae deliberately do NOT parallax. x/y here are absolute world
      // coordinates, and the world is ~396,000px across — so its centred
      // position is on the order of -197,000px. Even a 0.012 factor threw the
      // nebulae ~2,400px off-screen, silently leaving only the base gradient
      // visible. The star layers survive the same maths solely because their
      // modulo wrap bounds them; an untiled element has nothing to bound it.
      // Treating the nebulae as infinitely distant (fixed to the viewport) is
      // both the fix and the physically sensible reading.
    },
    setTransition(css) {
      for (let i = 0; i < LAYERS.length; i++) {
        if (LAYERS[i].factor === 0) continue
        const el = layerRefs.current[i]
        if (el) el.style.transition = css
      }
    },
  }))

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <div className="space-base absolute inset-0" />

      {LAYERS.map((spec, i) => (
        <div
          key={spec.seed}
          ref={(el) => {
            layerRefs.current[i] = el
          }}
          className="space-star-layer"
          style={{
            // Static layer needs no bleed; parallaxed ones need exactly one
            // tile of overhang on every side to cover the wrapped translate.
            inset: spec.factor === 0 ? 0 : -spec.tile,
            backgroundImage: layerUrls[i],
            backgroundSize: `${spec.tile}px ${spec.tile}px`,
          }}
        />
      ))}

      {/* A single element, visible for only a sliver of its long cycle — a
          rare, quiet punctuation rather than a constant effect. */}
      <div className="space-shooting-star" />
      <div className="space-shooting-star space-shooting-star-b" />
    </div>
  )
})

export default SpaceBackdrop

// Motes are laid out deterministically so they don't reshuffle on re-render.
const MOTES = (() => {
  const rand = mulberry32(0x5eed10)
  return Array.from({ length: 10 }, () => ({
    left: rand() * 100,
    top: rand() * 100,
    size: 1.5 + rand() * 2.5,
    duration: 26 + rand() * 26,
    delay: -rand() * 40,
    drift: (rand() - 0.5) * 90,
    opacity: 0.16 + rand() * 0.26,
  }))
})()

/**
 * Ambient layer that sits ABOVE the poster grid.
 *
 * The grid is dense enough to cover the backdrop almost completely at normal
 * zoom, so anything meant to be felt at 100% has to sit over the top. That
 * position is also the most expensive one — a full-screen element here gets
 * blended over moving content every frame — so it earns its keep with as
 * little as possible: a handful of small, slow dust motes and nothing else.
 *
 * Large colour-wash gradients were tried here too and cut: at an alpha low
 * enough to keep poster contrast intact they were imperceptible, while still
 * costing full-screen composite work. The colour they were meant to add now
 * comes from the nebulae in the backdrop instead, which sit below the grid.
 */
export function SpaceVeil() {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      {MOTES.map((m, i) => (
        <span
          key={i}
          className="space-mote"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: m.size,
            height: m.size,
            opacity: m.opacity,
            animationDuration: `${m.duration}s`,
            animationDelay: `${m.delay}s`,
            ['--mote-drift' as string]: `${m.drift}px`,
          }}
        />
      ))}
    </div>
  )
}
