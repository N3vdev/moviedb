import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'

const WORDMARK = 'Nevflix'
const PARTICLE_COUNT = 42

// Full sequence timing (ms), ~2.9s end to end:
// 1. A field of glowing dots fades in scattered far out from the center and
//    immediately begins drifting inward, slow and continuous, for the whole
//    ride — while the logo smoothly zooms in on its own (no spring/bounce —
//    a deliberate, sleek grow).
// 2. The wordmark eases in letter by letter, slow and soft, while the
//    particles keep drifting toward center in the background, fading and
//    shrinking progressively as they get closer (dimmest and smallest right
//    as they near it, not a sudden late cutoff).
// 3. Well before the particles actually reach the logo, the exit zoom
//    already kicks off underneath them, so the two beats clearly overlap
//    instead of the zoom waiting for the convergence to finish.
// 4. The logo alone then zooms up hugely (the camera flying into it) while
//    the text and remaining particles fade out, handing off to the canvas.
const PARTICLE_FADE_IN = 350
const LOGO_DELAY = 400
const TEXT_START = 850
const LETTER_STAGGER = 55
const LETTER_DURATION = 600
// Total duration of each particle's drift-and-fade journey (see
// useParticles/JSX below) — each particle also gets a small random extra
// delay for organic variation, so this is the common baseline, not a hard
// deadline. Position (x/y) tweens continuously across this whole span;
// opacity/scale fade in quickly then taper off continuously alongside it.
const PARTICLE_TOTAL = 2400
// How long before the particles finish their journey the exit zoom starts —
// kicking off while they're still well short of the center, not after.
const WIPE_LEAD = 400
const WIPE_START = PARTICLE_TOTAL - WIPE_LEAD
const WIPE_DURATION = 550
const UNMOUNT_AT = WIPE_START + WIPE_DURATION + 150
// Exported so Disclaimer can wait for the intro to actually finish before
// popping in, instead of appearing on top of the reveal sequence.
export const INTRO_DURATION_MS = UNMOUNT_AT

interface Particle {
  dx: number
  dy: number
  size: number
  delay: number
  color: string
}

const PARTICLE_COLORS = ['rgba(255,255,255,0.95)', 'rgba(199,146,255,0.95)', 'rgba(140,225,255,0.95)']

function useParticles(count: number): Particle[] {
  return useMemo(
    () =>
      Array.from({ length: count }, () => {
        const angle = Math.random() * Math.PI * 2
        // Far out from center — comfortably past most viewport edges, so
        // they read as arriving from a genuine distance rather than just
        // scattered nearby.
        const radius = 320 + Math.random() * 720
        return {
          dx: Math.cos(angle) * radius,
          dy: Math.sin(angle) * radius,
          size: 2 + Math.random() * 3,
          delay: Math.random() * 200,
          color: PARTICLE_COLORS[Math.floor(Math.random() * PARTICLE_COLORS.length)],
        }
      }),
    [count],
  )
}

export default function IntroReveal() {
  const [wiping, setWiping] = useState(false)
  const [visible, setVisible] = useState(true)
  const particles = useParticles(PARTICLE_COUNT)
  const logoRef = useRef<HTMLDivElement>(null)
  // The logo sits above the vertical midpoint of the logo+wordmark column
  // (the wordmark and progress bar below it pull the column's center down),
  // so particles converging on (0, 0) — the screen/overlay center — land in
  // the gap between the logo and the text, not on the logo itself. Measuring
  // the logo's real position gives the exact offset to converge on instead.
  const [convergeTarget, setConvergeTarget] = useState({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!logoRef.current) return
    const rect = logoRef.current.getBoundingClientRect()
    setConvergeTarget({
      x: rect.left + rect.width / 2 - window.innerWidth / 2,
      y: rect.top + rect.height / 2 - window.innerHeight / 2,
    })
  }, [])

  useEffect(() => {
    const wipeTimer = setTimeout(() => setWiping(true), WIPE_START)
    const hideTimer = setTimeout(() => setVisible(false), UNMOUNT_AT)
    return () => {
      clearTimeout(wipeTimer)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <motion.div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center overflow-hidden bg-[#05050a]"
      animate={{ opacity: wiping ? 0 : 1 }}
      transition={{ duration: WIPE_DURATION / 1000, ease: [0.76, 0, 0.24, 1] }}
    >
      {/* Particle field: fades in far out and immediately starts drifting
          inward, slow and continuous, the whole time the logo and wordmark
          are doing their own thing — arriving at the center and fading out
          there as a final "gathering" beat once the text has settled. */}
      {particles.map((p, i) => (
        <motion.div
          key={i}
          className="absolute rounded-full"
          style={{ width: p.size, height: p.size, background: p.color, boxShadow: `0 0 6px ${p.color}` }}
          initial={{ x: p.dx, y: p.dy, opacity: 0, scale: 0.5 }}
          animate={{
            x: convergeTarget.x,
            y: convergeTarget.y,
            opacity: [0, 1, 0],
            scale: [0.5, 1, 0.15],
          }}
          transition={{
            // x/y get their own continuous tween across the full span (no
            // times/hold) so the drift toward center starts immediately and
            // stays smooth the entire time, instead of sitting still until a
            // late "converge" keyframe kicks in.
            x: { duration: PARTICLE_TOTAL / 1000, delay: p.delay / 1000, ease: 'easeInOut' },
            y: { duration: PARTICLE_TOTAL / 1000, delay: p.delay / 1000, ease: 'easeInOut' },
            // opacity/scale fade in quickly, then shrink/fade continuously
            // across the rest of the journey using an eased-in curve — they
            // stay near full while still far out and taper off more as the
            // particle actually nears the center, instead of holding flat
            // and only dropping in a late fixed-time segment.
            opacity: {
              duration: PARTICLE_TOTAL / 1000,
              delay: p.delay / 1000,
              times: [0, PARTICLE_FADE_IN / PARTICLE_TOTAL, 1],
              ease: ['easeOut', 'easeIn'],
            },
            scale: {
              duration: PARTICLE_TOTAL / 1000,
              delay: p.delay / 1000,
              times: [0, PARTICLE_FADE_IN / PARTICLE_TOTAL, 1],
              ease: ['easeOut', 'easeIn'],
            },
          }}
        />
      ))}

      <motion.div
        className="absolute h-72 w-72 rounded-full bg-white/10 blur-3xl"
        initial={{ opacity: 0, scale: 0.6 }}
        animate={{ opacity: wiping ? 0 : 0.5, scale: 1 }}
        transition={{ duration: 0.8, delay: LOGO_DELAY / 1000, ease: [0.16, 1, 0.3, 1] }}
      />

      <div className="relative z-10 flex flex-col items-center gap-5">
        {/* The logo is the hero of the exit: instead of the whole group
            just lifting slightly, IT scales up hugely — like the camera is
            flying straight into it — while staying opaque for most of the
            zoom before fading, so it reads as passing through rather than
            just growing. z-10 (plus particles/glow being earlier in the DOM
            with no z-index of their own) keeps this stacked above the
            particle field, so particles gather and fade out behind it. */}
        <motion.div
          ref={logoRef}
          className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-white to-white/60 shadow-[0_0_60px_rgba(255,255,255,0.4)]"
          initial={{ scale: 0, opacity: 0 }}
          animate={
            wiping
              ? { scale: [1, 2.5, 8, 26], opacity: [1, 1, 1, 0] }
              : { scale: 1, opacity: 1 }
          }
          transition={
            wiping
              ? {
                  // Explicit keyframes (not a single extreme easing curve) so
                  // the growth reads as a continuous zoom throughout the
                  // transition, rather than sitting nearly still and then
                  // snapping to huge in the last sliver of the duration.
                  duration: WIPE_DURATION / 1000,
                  times: [0, 0.35, 0.65, 1],
                  ease: ['easeIn', 'easeIn', 'easeIn'],
                }
              : {
                  // A smooth, deliberate zoom-in — no spring/bounce — so it
                  // reads as sleek rather than a bouncy pop.
                  duration: 0.7,
                  ease: [0.16, 1, 0.3, 1],
                  delay: LOGO_DELAY / 1000,
                }
          }
        >
          <img src={`${import.meta.env.BASE_URL}fmhy.ico`} alt="" className="h-full w-full object-cover" />
        </motion.div>

        <motion.div
          className="flex flex-col items-center gap-5"
          animate={{ opacity: wiping ? 0 : 1 }}
          transition={{ duration: 0.18, ease: 'easeIn' }}
        >
          <div className="flex text-4xl font-extrabold tracking-tight text-white sm:text-5xl">
            {WORDMARK.split('').map((ch, i) => (
              <motion.span
                key={i}
                className={i < 3 ? 'text-white' : 'font-medium text-white/55'}
                initial={{ opacity: 0, y: 14, filter: 'blur(5px)' }}
                animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                transition={{
                  duration: LETTER_DURATION / 1000,
                  delay: (TEXT_START + i * LETTER_STAGGER) / 1000,
                  ease: [0.22, 1, 0.36, 1],
                }}
              >
                {ch}
              </motion.span>
            ))}
          </div>

          <div className="h-px w-40 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-white/70"
              initial={{ width: '0%' }}
              animate={{ width: wiping ? '100%' : '70%' }}
              transition={{
                duration: (wiping ? WIPE_DURATION : WIPE_START) / 1000,
                ease: 'easeInOut',
              }}
            />
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
