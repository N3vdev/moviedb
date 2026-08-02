import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { IMG_BASE, type SpecialCard } from '../lib/specialCards'
import SpiderBuddy from './SpiderBuddy'

// The post-video1 quiz's reaction images (see the overlay below) — one
// "correct" gif per step (they're deliberately different images, not
// reused) and a single "incorrect" image shared by both wrong answers.
const QUIZ_CORRECT_1_IMG = `${IMG_BASE}/srii-quiz-correct-1.gif`
const QUIZ_CORRECT_2_IMG = `${IMG_BASE}/srii-quiz-correct-2.gif`
const QUIZ_INCORRECT_IMG = `${IMG_BASE}/srii-quiz-incorrect.jpg`

interface SpecialCardModalProps {
  selected: SpecialCard | null
  onClose: () => void
}

const MODAL_SPRING = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 } as const
const BACKDROP_FADE = { duration: 0.3, ease: [0.16, 1, 0.3, 1] } as const
// Duration of the video1 -> video2 "flip" reveal (see the flip container
// below) — a crisp, symmetric ease so it reads as a snap rather than a
// floaty spring.
const FLIP_DURATION_MS = 650
const FLIP_EASE = [0.65, 0, 0.35, 1] as const
// How long the post-video1 quiz's angry/happy reaction shows before the
// actual outcome (replay, reveal quiz2, or flip to video2) fires — long
// enough to read as a genuine reaction, short enough not to feel laggy.
const QUIZ_REACTION_MS = 900
// video2 now has its own baked-in ~3s black-screen-with-audio intro (edited
// into the file itself) — this just paces the decorative overlay bar to
// match it. Purely cosmetic: the video is already playing underneath for
// its whole duration, this never gates or delays anything.
const INTRO_BAR_MS = 3000
// Fallback aspect ratio used only for the instant before a video's real
// metadata loads (see onAspectRatio) — brief enough in practice that the
// exact value barely matters.
const DEFAULT_ASPECT_RATIO = 1

// Deterministic — not random per render — scattered sparkles for the #Srii
// card's one-off "cute" theme (see the isSrii check below). Staggered
// delays so they twinkle out of sync with each other rather than in unison.
const SRII_SPARKLES = [
  { top: '7%', left: '9%', size: '1.1rem', delay: '0s', duration: '3.4s', emoji: '✨' },
  { top: '14%', left: '89%', size: '0.9rem', delay: '0.5s', duration: '4.1s', emoji: '✨' },
  { top: '88%', left: '90%', size: '1rem', delay: '1s', duration: '3.7s', emoji: '✨' },
  { top: '82%', left: '7%', size: '0.8rem', delay: '1.5s', duration: '4.4s', emoji: '💫' },
  { top: '48%', left: '95%', size: '0.75rem', delay: '2s', duration: '3.2s', emoji: '✨' },
  { top: '4%', left: '48%', size: '0.7rem', delay: '0.8s', duration: '4.6s', emoji: '💫' },
  { top: '32%', left: '4%', size: '0.65rem', delay: '2.4s', duration: '3.9s', emoji: '⭐' },
  { top: '66%', left: '93%', size: '0.7rem', delay: '1.2s', duration: '4.2s', emoji: '💫' },
  { top: '94%', left: '46%', size: '0.6rem', delay: '2.8s', duration: '3.5s', emoji: '✨' },
] as const

// Drifting colour blobs behind the hero portrait (see the .srii-aurora-blob
// CSS). Deliberately oversized and pushed past the card's edges so only the
// soft middles of each blob ever show through the clipped card.
const SRII_AURORA = [
  { className: 'left-[-25%] top-[-30%] h-72 w-72 bg-pink-500/45', animation: 'srii-aurora-a 14s ease-in-out infinite' },
  { className: 'right-[-30%] top-[10%] h-64 w-64 bg-fuchsia-500/40', animation: 'srii-aurora-b 18s ease-in-out infinite' },
  { className: 'bottom-[-35%] left-[15%] h-72 w-72 bg-rose-400/40', animation: 'srii-aurora-c 16s ease-in-out infinite' },
] as const

// One-shot particle burst fired on a correct quiz answer (see the quiz
// overlay). Fixed offsets rather than random ones so the burst reads the
// same every time — and so nothing has to be recomputed per render.
const QUIZ_CONFETTI = [
  { x: -96, y: -54, rotate: -140, delay: 0, emoji: '✨' },
  { x: -62, y: -92, rotate: 96, delay: 0.04, emoji: '💖' },
  { x: -18, y: -104, rotate: -70, delay: 0.02, emoji: '⭐' },
  { x: 30, y: -98, rotate: 150, delay: 0.06, emoji: '✨' },
  { x: 74, y: -66, rotate: -110, delay: 0.03, emoji: '💫' },
  { x: 100, y: -18, rotate: 80, delay: 0.07, emoji: '💖' },
  { x: -100, y: 8, rotate: 120, delay: 0.05, emoji: '💫' },
  { x: -70, y: 62, rotate: -95, delay: 0.08, emoji: '⭐' },
  { x: -14, y: 92, rotate: 135, delay: 0.06, emoji: '✨' },
  { x: 44, y: 80, rotate: -125, delay: 0.09, emoji: '💖' },
  { x: 88, y: 44, rotate: 105, delay: 0.04, emoji: '✨' },
  { x: 12, y: -60, rotate: -60, delay: 0.1, emoji: '💫' },
] as const

// Hero-screen content cascades in rather than appearing all at once — the
// container staggers, each child does the same short rise-and-fade.
const HERO_STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.08 } },
} as const

const HERO_ITEM = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] } },
} as const

// Same idea for the quiz card's inner content, but snappier — the prompt and
// its two answers pop in one after the other rather than landing flat.
const QUIZ_STAGGER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08, delayChildren: 0.05 } },
} as const

const QUIZ_ITEM = {
  hidden: { opacity: 0, y: 10, scale: 0.94 },
  show: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 24 } },
} as const

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 6l12 12M18 6 6 18" />
    </svg>
  )
}

function MuteIcon({ muted }: { muted: boolean }) {
  return muted ? (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="m23 9-6 6M17 9l6 6" />
    </svg>
  ) : (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M11 5 6 9H2v6h4l5 4V5Z" />
      <path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14" />
    </svg>
  )
}

export interface VideoFaceHandle {
  toggleMute: () => void
  /** Pauses whichever video is currently mounted — used to freeze video1
   *  the instant the post-video1 quiz overlay opens, so nothing keeps
   *  playing behind it. */
  pause: () => void
  /** Restarts playback from the beginning (or, for video2, from just past
   *  its baked-in intro — see handleReplay) — reused by both the video's
   *  own end-of-playback Replay button and the quiz's "wrong answer"
   *  outcomes, so there's only one implementation of "what replay means". */
  replay: () => void
}

// Fetches a video fully into memory before playback ever starts — the only
// way to actually guarantee zero mid-playback buffering, since the browser
// can't stall on network I/O for bytes that are already sitting in a Blob.
// Reports real byte-level progress via onProgress (0-1) when the server
// sends a Content-Length header (static hosts like GitHub Pages / Vite dev
// always do for these files); falls back to a single jump-to-1 report if
// it's ever missing rather than leaving the caller's progress bar stuck.
async function fetchVideoWithProgress(
  url: string,
  signal: AbortSignal,
  onProgress: (fraction: number) => void,
): Promise<Blob> {
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Failed to fetch video: HTTP ${response.status}`)

  const total = Number(response.headers.get('content-length') ?? 0)
  if (!response.body || !total) {
    const blob = await response.blob()
    onProgress(1)
    return blob
  }

  // Tap byte counts as they pass through a TransformStream, but let the
  // browser's own Response.blob() actually assemble the final Blob from
  // the (otherwise untouched) stream — manually reassembling one ourselves
  // from an array of reader.read() chunks produces a byte-perfect-sized
  // but genuinely unplayable Blob in Firefox specifically (readyState
  // stuck at 0 forever, confirmed via isolated testing); Response.blob()
  // doesn't have that problem.
  let received = 0
  const progressStream = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      received += chunk.length
      onProgress(received / total)
      controller.enqueue(chunk)
    },
  })
  const trackedResponse = new Response(response.body.pipeThrough(progressStream))
  return trackedResponse.blob()
}

interface VideoFaceProps {
  src?: string
  /** Extra style merged onto the face root — used to counter-rotate the back face. */
  style?: React.CSSProperties
  /** Reports the video's real intrinsic aspect ratio once known, so the
   *  container (see the flip box below) can be sized to fit it exactly —
   *  no cropping, no unnecessary letterboxing either. */
  onAspectRatio?: (ratio: number) => void
  /** video2 only — shows the loading-bar overlay described above. */
  showIntroBar?: boolean
  /** video2 only — real byte-download progress (0-1), blended with a 3s
   *  "fake" floor (see the introBar effect below) so the bar is genuinely
   *  accurate whenever the real download is ahead of schedule, but never
   *  gets stuck short of 100% for longer than the video's own baked-in
   *  intro — by the time the intro ends, real content needs to play
   *  regardless of true download state. */
  progress?: number
  /** Mirrors this face's mute state up to the parent's toolbar (see
   *  SpecialCardModal) so its Mute/Unmute icon stays in sync even though
   *  the toolbar itself lives outside this component. */
  onMutedChange?: (muted: boolean) => void
  /** True once playback has genuinely failed, so the parent can hide the
   *  toolbar's now-pointless Mute button. */
  onErrorChange?: (hasError: boolean) => void
  /** video1 only — fires as playback nears its end, so the parent can
   *  reveal the "Click here" flip prompt only in the last few seconds
   *  rather than for the whole video. */
  onNearEnd?: (nearEnd: boolean) => void
  /** video1 only — mirrors currentTime continuously (cheap; the parent
   *  stores it in a ref, not state) so that if the user backs out of
   *  video2 later, video1 can be restored to right where it was left
   *  rather than restarting from 0. */
  onCurrentTimeChange?: (time: number) => void
  /** video1 only — mirrors whether playback has genuinely reached the end
   *  (the DOM `ended` event), alongside onCurrentTimeChange, so that state
   *  can be restored too if the user backs out of video2 later. */
  onEndedChange?: (ended: boolean) => void
  /** video1 only, for the "Back from video2" case — mounts already seeked
   *  to this time and paused, instead of autoplaying from 0, so returning
   *  from video2 shows video1 exactly as it was left (paused near the end,
   *  Click-here prompt already showing) rather than restarting it. */
  resumeAt?: number
  /** Paired with resumeAt — if the video had actually finished (DOM
   *  `ended`) before flipping away, mounts with its own Replay overlay
   *  already showing too, matching exactly how it looked right before. */
  resumeEnded?: boolean
}

const NEAR_END_THRESHOLD_SECONDS = 3
// Neither video should blast at full system volume the instant it
// autoplays — applied on every mount (see the [src] effect below), so it
// covers video1, video2, and the "Back from video2" remount alike.
const DEFAULT_VOLUME = 0.5
const VIDEO1_DEFAULT_VOLUME = 0.3

// One "side" of the video area — used for both video1 and video2 in the
// flip container below (only ever one mounted at a time — see the comment
// there for why), so the (fairly involved) autoplay/mute-fallback/error-
// handling logic only has to be gotten right once. See the isMuted comment
// for why autoplay starts unmuted with a readyState-based fallback rather
// than trusting a `.play()` promise.
//
// Exposes toggleMute imperatively (via the forwarded ref) rather than
// rendering its own Mute button — Back/Mute/Close now live together in one
// dedicated toolbar row in the parent (see SpecialCardModal), not floating
// over the video, so this component owns the mute *logic* but not the
// button UI for it.
//
// object-contain (not object-cover) so the video is NEVER cropped — the
// parent container is sized to the video's real aspect ratio (via
// onAspectRatio) specifically so this rarely has to letterbox anything in
// practice; contain is the safety net for the brief window before that
// measurement lands, not the primary sizing mechanism.
const VideoFace = forwardRef<VideoFaceHandle, VideoFaceProps>(function VideoFace(
  {
    src,
    style,
    onAspectRatio,
    showIntroBar,
    progress,
    onMutedChange,
    onErrorChange,
    onNearEnd,
    onCurrentTimeChange,
    onEndedChange,
    resumeAt,
    resumeEnded,
  },
  ref,
) {
  const [isMuted, setIsMuted] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  // True in the vanishingly-rare case where even muted autoplay was
  // blocked — shows a custom centered play button instead of ever falling
  // back to the browser's native <video controls> bar, which would clash
  // with (and visually break) the custom toolbar.
  const [playBlocked, setPlayBlocked] = useState(false)
  // True once playback reaches the end — shows a centered Replay button
  // over the (now frozen-on-last-frame) video.
  const [videoEnded, setVideoEnded] = useState(false)
  const [introBarVisible, setIntroBarVisible] = useState(!!showIntroBar)
  // The "fake" floor described on the `progress` prop above — climbs from
  // 0 to 1 over INTRO_BAR_MS regardless of real download state.
  const [introBarFakeFloor, setIntroBarFakeFloor] = useState(0)
  const videoRef = useRef<HTMLVideoElement>(null)

  const handleReplay = () => {
    const el = videoRef.current
    if (!el) return
    // video2 (showIntroBar) has its own baked-in ~3s black-screen-with-
    // audio intro — already seen once by the time anyone reaches Replay,
    // so skip straight past it back to the real content. This is just a
    // seek within the already-downloaded blob already sitting in memory —
    // no network request, so no risk of buffering.
    el.currentTime = showIntroBar ? INTRO_BAR_MS / 1000 : 0
    setVideoEnded(false)
    onEndedChange?.(false)
    // This runs directly from a click (either the video's own Replay
    // button, or one of the post-video1 quiz's answer buttons), so it's a
    // genuine user gesture — autoplay restrictions should never block it.
    // Still falls back to the same custom Play button as the initial-load
    // case rather than assuming that, on the off chance it somehow doesn't.
    el.play().catch(() => setPlayBlocked(true))
  }

  useImperativeHandle(ref, () => ({
    toggleMute: () => {
      setIsMuted((m) => {
        const next = !m
        if (videoRef.current) videoRef.current.muted = next
        onMutedChange?.(next)
        return next
      })
    },
    pause: () => videoRef.current?.pause(),
    replay: handleReplay,
  }))

  useEffect(() => {
    setIsMuted(false)
    setVideoError(null)
    setPlayBlocked(false)
    setVideoEnded(false)
    if (videoRef.current) {
      videoRef.current.volume = showIntroBar ? DEFAULT_VOLUME : VIDEO1_DEFAULT_VOLUME
    }
    onMutedChange?.(false)
    onErrorChange?.(false)
    onEndedChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  // The "Back from video2" case — mounts paused at resumeAt instead of
  // autoplaying from 0 (see the `autoPlay` prop below, which is disabled
  // whenever resumeAt is set), and restores the Replay overlay too if
  // resumeEnded says it had genuinely finished before the flip away.
  // Waits for metadata if it isn't already available yet, since seeking
  // before that is a no-op in most browsers.
  useEffect(() => {
    if (resumeAt === undefined) return
    const el = videoRef.current
    if (!el) return
    const applyResume = () => {
      el.currentTime = resumeAt
      el.pause()
      if (resumeEnded) setVideoEnded(true)
    }
    if (el.readyState >= 1) {
      applyResume()
    } else {
      el.addEventListener('loadedmetadata', applyResume, { once: true })
      return () => el.removeEventListener('loadedmetadata', applyResume)
    }
  }, [resumeAt, resumeEnded, src])

  useEffect(() => {
    // Nothing to recover from here — resumeAt mounts intentionally paused,
    // not autoplaying, so there's no "was autoplay blocked?" question to
    // answer in the first place.
    if (resumeAt !== undefined) return
    const timer = setTimeout(() => {
      const el = videoRef.current
      // readyState >= 2 (HAVE_CURRENT_DATA) rules out "still loading" —
      // this only fires for a video that has data available but genuinely
      // isn't playing, i.e. autoplay was actually blocked.
      if (el && el.paused && el.currentTime === 0 && el.readyState >= 2) {
        setIsMuted(true)
        onMutedChange?.(true)
        el.play().catch(() => {
          // Even muted playback was refused — vanishingly rare. Never fall
          // back to the browser's native <video controls> bar here — it
          // renders its own play/timeline/volume UI on top of the video,
          // clashing with (and visually breaking) the custom toolbar.
          // Surface a matching custom play button instead.
          setPlayBlocked(true)
        })
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 700)
    return () => clearTimeout(timer)
  }, [src, resumeAt])

  useEffect(() => {
    if (!showIntroBar) return
    setIntroBarVisible(true)
    setIntroBarFakeFloor(0)
    // Paces the bar's visual fill from 0 to 1 over INTRO_BAR_MS, ALWAYS —
    // this is what gives the suspense-y reveal feel every single time,
    // regardless of how far along the real download is. Updating every
    // 100ms (not every frame) is plenty smooth once bridged by the bar's
    // own short CSS transition, and it's 30 state updates instead of ~180
    // — cheap, but no point being wasteful for a purely cosmetic ticker.
    const startTime = Date.now()
    const interval = setInterval(() => {
      setIntroBarFakeFloor(Math.min(1, (Date.now() - startTime) / INTRO_BAR_MS))
    }, 100)
    const hideTimer = setTimeout(() => setIntroBarVisible(false), INTRO_BAR_MS)
    return () => {
      clearInterval(interval)
      clearTimeout(hideTimer)
    }
  }, [showIntroBar, src])

  // The displayed value below (see the render) is capped to whichever is
  // LOWER — the timer's pace or the real download progress — so it never
  // visually overclaims ("100% done!") while genuinely still downloading.
  // Since video2 is preloaded so early now that it's very often already
  // fully downloaded by the time this bar even mounts, `progress` is
  // usually already 1 and the timer alone paces the fill — which is
  // exactly what restores the suspense-y ~3s reveal instead of it either
  // (a) snapping to 100% instantly, or (b) vanishing with no animation at
  // all. Once the timer itself reaches 1 (INTRO_BAR_MS has fully elapsed),
  // the bar is forced to show complete regardless of true download state —
  // the video needs to start now either way, per the "last stretch is
  // fake" spec.

  return (
    <div className="absolute inset-0 bg-black" style={{ backfaceVisibility: 'hidden', ...style }}>
      {!videoError ? (
        <video
          ref={videoRef}
          onLoadedMetadata={(e) => {
            const v = e.currentTarget
            if (v.videoWidth && v.videoHeight) onAspectRatio?.(v.videoWidth / v.videoHeight)
          }}
          onTimeUpdate={(e) => {
            const v = e.currentTarget
            onCurrentTimeChange?.(v.currentTime)
            if (!onNearEnd) return
            if (!Number.isFinite(v.duration)) return
            onNearEnd(v.duration - v.currentTime <= NEAR_END_THRESHOLD_SECONDS)
          }}
          onEnded={() => {
            setVideoEnded(true)
            onEndedChange?.(true)
          }}
          onError={(e) => {
            const err = e.currentTarget.error
            const messages: Record<number, string> = {
              1: 'Playback was aborted',
              2: 'A network error interrupted playback',
              3: 'The video could not be decoded — the file may be corrupted',
              4: "This browser can't play this video's format",
            }
            const message = err ? messages[err.code] ?? 'Unknown playback error' : 'Unknown playback error'
            setVideoError(message)
            onErrorChange?.(true)
          }}
          src={src}
          autoPlay={resumeAt === undefined}
          muted={isMuted}
          playsInline
          className="absolute inset-0 h-full w-full object-contain"
        />
      ) : (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
          <span className="text-sm font-medium text-white/80">Couldn't play this video</span>
          <span className="text-xs text-white/50">{videoError}</span>
        </div>
      )}

      {introBarVisible && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="h-0.75 w-40 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-linear-to-r from-pink-400 to-rose-400 transition-[width] duration-150 ease-out"
              style={{
                width: `${Math.round((introBarFakeFloor >= 1 ? 1 : Math.min(introBarFakeFloor, progress ?? 1)) * 100)}%`,
              }}
            />
          </div>
        </div>
      )}

      {playBlocked && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <button
            type="button"
            onClick={() => {
              videoRef.current?.play().then(() => setPlayBlocked(false))
            }}
            aria-label="Play"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6 translate-x-0.5" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </button>
        </div>
      )}

      {videoEnded && !videoError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40">
          <button
            type="button"
            onClick={handleReplay}
            aria-label="Replay"
            className="flex h-14 w-14 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur-md transition-colors hover:bg-white/25"
          >
            <svg viewBox="0 0 24 24" className="h-7 w-7" fill="currentColor">
              <path d="M12 5V1L7 6l5 5V7c3.31 0 6 2.69 6 6s-2.69 6-6 6-6-2.69-6-6H4c0 4.42 3.58 8 8 8s8-3.58 8-8-3.58-8-8-8z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  )
})

export default function SpecialCardModal({ selected, onClose }: SpecialCardModalProps) {
  const [stage, setStage] = useState<'hero' | 'video1-loading' | 'video1' | 'video2'>('hero')
  // Drives the 3D rotation independently of `stage` so the video content
  // can swap at the flip's rotation midpoint (see handleFlipToVideo2)
  // instead of instantly at click-time, which would show the new title
  // over the old, still-mid-flip content.
  const [flipped, setFlipped] = useState(false)
  // video1, fully preloaded into memory before playback starts (see the
  // preload effect below) — same rationale as video2's blob: a <video>
  // playing from a Blob URL can never stall on the network, since every
  // byte is already local. This now starts the INSTANT the card's popup
  // opens (see the effect's dependency on `selected` alone, not `stage`),
  // not when "Watch Now" is clicked — by the time anyone actually presses
  // it, video1 is very often already fully loaded, skipping the loading
  // bar entirely. video1Progress (0-1) drives that bar for the rarer case
  // where it isn't ready yet.
  const [video1LoadState, setVideo1LoadState] = useState<'idle' | 'loading' | 'ready'>('idle')
  const [video1Src, setVideo1Src] = useState<string | undefined>(undefined)
  const [video1Progress, setVideo1Progress] = useState(0)
  // The fully-preloaded video2, as a blob URL. Only starts downloading once
  // video1LoadState becomes 'ready' — not concurrently with video1's own
  // download — so the two fetches never compete for bandwidth and cause
  // each other to buffer. Since video1 now starts loading at card-open
  // time instead of at "Watch Now", video2 also gets a much earlier head
  // start than before, which is what actually fixes it usually being fully
  // ready well before anyone reaches the "Click here" flip. video2Progress
  // drives the real portion of the flip's overlay loading bar (see
  // VideoFace's `progress` prop and INTRO_BAR_MS' "fake floor" — the two
  // are blended so the bar is accurate when the real download is ahead of
  // schedule, but never blocks longer than the video's own baked-in
  // intro). Falls back to the plain src (ordinary browser streaming) if
  // the fetch hasn't finished yet or failed outright — the flip itself is
  // never blocked waiting on this.
  const [video2Src, setVideo2Src] = useState<string | undefined>(undefined)
  const [video2Progress, setVideo2Progress] = useState(0)
  const [video1Ratio, setVideo1Ratio] = useState<number | null>(null)
  const [video2Ratio, setVideo2Ratio] = useState<number | null>(null)
  // Mirrors from whichever VideoFace is currently mounted (see
  // onMutedChange/onErrorChange) purely so the toolbar row below — which
  // lives outside the flipping video, not floating over it — can show the
  // right icon and hide Mute once there's nothing playing to mute.
  const [isMuted, setIsMuted] = useState(false)
  const [hasVideoError, setHasVideoError] = useState(false)
  // True once video1 is within its last few seconds — gates the "Click
  // here" flip prompt so it only appears near the end, not for the whole
  // video (see the NEAR_END_THRESHOLD_SECONDS wiring on VideoFace). Also
  // gates the Srii card's Spider-Man mascot (see SpiderBuddy below), so he
  // spawns and descends during that same final stretch instead of waiting
  // for the video to fully end.
  const [video1NearEnd, setVideo1NearEnd] = useState(false)
  // True once SpiderBuddy's web has actually broken (see its onBroken
  // prop) — hides the "pull spidey for a surprise edit" hint once he's
  // fallen away and gone, since it'd otherwise keep pointing at an empty
  // corner for the rest of the session (video1NearEnd itself stays true).
  const [spideyGone, setSpideyGone] = useState(false)
  // A little joke gate between "Click here" and actually reaching video2 —
  // 'quiz1' asks the user to pick a word (wrong answer replays video1),
  // 'quiz2' is the fake-out follow-up (one option replays again, the other
  // finally flips to video2). video1 is explicitly paused for the whole
  // stretch this is up (see handleWebBreak/the overlay below) so nothing
  // plays behind it.
  const [quizStage, setQuizStage] = useState<'none' | 'quiz1' | 'quiz2'>('none')
  // Brief animated feedback shown in place of the question/buttons right
  // after an answer is picked — 'wrong' (angry) for samosa/Dikha bc,
  // 'right' (happy) for vadapav/Ruk Tu — before the actual outcome
  // (replay, advance to quiz2, or flip to video2) happens.
  const [quizReaction, setQuizReaction] = useState<'none' | 'wrong' | 'right'>('none')
  const quizReactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Mirrors video1's currentTime continuously (see VideoFace's
  // onCurrentTimeChange) — a ref, not state, since it updates ~4x/second
  // and is only ever read at the moment of backing out of video2, never
  // rendered directly.
  const video1LastTimeRef = useRef(0)
  // Mirrors whether video1 had genuinely reached its end (see
  // onEndedChange) — same ref-not-state rationale as video1LastTimeRef.
  const video1WasEndedRef = useRef(false)
  // Set right before reverse-flipping back to video1 from video2 (see
  // handleBackFromVideo2) — makes that video1 face mount already seeked to
  // this time and paused, instead of autoplaying from 0, so Back genuinely
  // restores "how it was" rather than restarting video1. undefined for
  // every other path (a fresh "Watch Now", a normal Back to hero, etc.).
  const [video1ResumeAt, setVideo1ResumeAt] = useState<number | undefined>(undefined)
  // Paired with video1ResumeAt — restores the Replay overlay too if video1
  // had actually finished before flipping away to video2.
  const [video1ResumeEnded, setVideo1ResumeEnded] = useState(false)
  const activeVideoFaceRef = useRef<VideoFaceHandle>(null)
  const flipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const video1BlobUrlRef = useRef<string | null>(null)
  const video2BlobUrlRef = useRef<string | null>(null)
  const open = selected !== null

  const revokeVideo1Blob = () => {
    if (video1BlobUrlRef.current) {
      URL.revokeObjectURL(video1BlobUrlRef.current)
      video1BlobUrlRef.current = null
    }
  }

  const revokeVideo2Blob = () => {
    if (video2BlobUrlRef.current) {
      URL.revokeObjectURL(video2BlobUrlRef.current)
      video2BlobUrlRef.current = null
    }
  }

  // Full reset — called when `selected` changes (a different card opened,
  // or the modal closed entirely). Clears the preloaded blobs too, so a
  // closed-and-reopened session starts genuinely fresh.
  const resetVideoState = () => {
    setStage('hero')
    setFlipped(false)
    setVideo1LoadState('idle')
    setVideo1Src(undefined)
    setVideo1Progress(0)
    setVideo2Src(undefined)
    setVideo2Progress(0)
    setVideo1Ratio(null)
    setVideo2Ratio(null)
    setIsMuted(false)
    setHasVideoError(false)
    setVideo1NearEnd(false)
    setSpideyGone(false)
    setQuizStage('none')
    setQuizReaction('none')
    setVideo1ResumeAt(undefined)
    setVideo1ResumeEnded(false)
    revokeVideo1Blob()
    revokeVideo2Blob()
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current)
      flipTimerRef.current = null
    }
    if (quizReactionTimerRef.current) {
      clearTimeout(quizReactionTimerRef.current)
      quizReactionTimerRef.current = null
    }
  }

  // Full "step all the way back to hero" reset — used when Back is
  // pressed from video1/video1-loading. Deliberately leaves
  // video1LoadState/video1Src/video2LoadState/video2Src untouched, so a
  // preload that already finished (or is still in progress) isn't thrown
  // away and re-fetched from scratch just because the user stepped back.
  // Pressing "Watch Now" again reuses it instantly.
  const handleBackToHero = () => {
    setStage('hero')
    setFlipped(false)
    setQuizStage('none')
    setQuizReaction('none')
    setVideo1ResumeAt(undefined)
    setVideo1ResumeEnded(false)
    setVideo1Ratio(null)
    setVideo2Ratio(null)
    setIsMuted(false)
    setHasVideoError(false)
    setVideo1NearEnd(false)
    setSpideyGone(false)
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current)
      flipTimerRef.current = null
    }
    if (quizReactionTimerRef.current) {
      clearTimeout(quizReactionTimerRef.current)
      quizReactionTimerRef.current = null
    }
  }

  // Reverse of handleFlipToVideo2 — pauses video2, animates the flip back
  // (180deg -> 0), and swaps which face is mounted at the rotation's
  // midpoint just like the forward flip does, so it reads as a genuine
  // "flip back" rather than an abrupt cut. video1 resumes exactly where it
  // was left off (paused, at the same currentTime, Click-here prompt
  // already showing since video1NearEnd is deliberately left untouched
  // here) via video1ResumeAt/video1LastTimeRef, rather than restarting
  // from 0 the way a full Back-to-hero would.
  const handleBackFromVideo2 = () => {
    activeVideoFaceRef.current?.pause()
    setQuizStage('none')
    setQuizReaction('none')
    setVideo1ResumeAt(video1LastTimeRef.current)
    setVideo1ResumeEnded(video1WasEndedRef.current)
    setFlipped(false)
    flipTimerRef.current = setTimeout(() => setStage('video1'), FLIP_DURATION_MS / 2)
  }

  // The toolbar's Back button — from video2 this reverse-flips to video1
  // right where it was left (see handleBackFromVideo2); from anywhere else
  // it's a full step back to the hero screen.
  const handleBack = () => {
    if (stage === 'video2') {
      handleBackFromVideo2()
      return
    }
    handleBackToHero()
  }

  useEffect(() => {
    resetVideoState()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  useEffect(() => {
    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
      if (quizReactionTimerRef.current) clearTimeout(quizReactionTimerRef.current)
      revokeVideo1Blob()
      revokeVideo2Blob()
    }
  }, [])

  // Fully preloads video1 into memory the INSTANT the card's popup opens —
  // not gated on "Watch Now" being clicked (see the dependency on
  // `selected` alone) — so it's very often already fully loaded by the
  // time anyone actually presses it, skipping the loading bar entirely.
  // See fetchVideoWithProgress above for why full preload is the only real
  // guarantee against mid-playback buffering. Falls back to the plain src
  // (ordinary streaming) if the fetch fails outright, rather than leaving
  // the modal stuck on a loading bar forever.
  useEffect(() => {
    if (!selected?.videoSrc) return
    let cancelled = false
    const controller = new AbortController()
    setVideo1LoadState('loading')
    setVideo1Progress(0)

    fetchVideoWithProgress(selected.videoSrc, controller.signal, (fraction) => {
      if (!cancelled) setVideo1Progress(fraction)
    })
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        video1BlobUrlRef.current = url
        setVideo1Src(url)
        setVideo1LoadState('ready')
      })
      .catch(() => {
        if (cancelled) return
        setVideo1Src(selected.videoSrc)
        setVideo1LoadState('ready')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [selected])

  // If the loading screen is showing when video1 finishes, advance
  // straight to playback automatically — the person is already sitting
  // there waiting on the bar, nothing left to click.
  useEffect(() => {
    if (stage === 'video1-loading' && video1LoadState === 'ready') {
      setStage('video1')
    }
  }, [stage, video1LoadState])

  // Preloads video2 entirely in the background only once video1LoadState
  // becomes 'ready' — not concurrently with video1's own download — so the
  // two fetches never compete for bandwidth and cause each other to
  // buffer. Since video1 now starts loading at card-open time rather than
  // at "Watch Now", this effectively gives video2 a much longer head start
  // too, which is what actually keeps it from still being mid-download by
  // the time the flip happens. Falls back to the plain src if the fetch
  // fails; either way this never blocks the flip itself.
  useEffect(() => {
    if (video1LoadState !== 'ready' || !selected?.secondVideoSrc) return
    let cancelled = false
    const controller = new AbortController()
    setVideo2Progress(0)

    fetchVideoWithProgress(selected.secondVideoSrc, controller.signal, (fraction) => {
      if (!cancelled) setVideo2Progress(fraction)
    })
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        video2BlobUrlRef.current = url
        setVideo2Src(url)
      })
      .catch(() => {
        // Fetch failed or was aborted — video2Src stays unset, so the flip
        // handler falls back to the plain src directly.
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [video1LoadState, selected])

  // Preloads the quiz's three reaction images the same moment video2 starts
  // (once video1LoadState is 'ready') — small enough (well under 200KB
  // combined) that they don't meaningfully compete with video2's own
  // download, but without this they'd otherwise only start fetching the
  // instant a reaction needs to show, which reads as a visible load delay
  // right when it should feel instant. Plain Image() objects are enough —
  // once loaded the browser's own HTTP cache serves the <img> in the quiz
  // overlay for free, no extra plumbing needed.
  useEffect(() => {
    if (video1LoadState !== 'ready' || selected?.id !== 'srii') return
    ;[QUIZ_CORRECT_1_IMG, QUIZ_CORRECT_2_IMG, QUIZ_INCORRECT_IMG].forEach((url) => {
      const img = new Image()
      img.src = url
    })
  }, [video1LoadState, selected])

  const handleFlipToVideo2 = () => {
    setFlipped(true)
    // Swap which video is mounted at the halfway point of the rotation —
    // that's the exact moment the rotating box is perpendicular to the
    // viewer (and so already invisible), so unmounting video1 and mounting
    // video2 there is imperceptible rather than an early, visible pop.
    flipTimerRef.current = setTimeout(() => setStage('video2'), FLIP_DURATION_MS / 2)
  }

  // Used to be a "Click here" button; now it's SpiderBuddy's onActivate,
  // fired only once a drag clears its pull-hard-enough threshold (see
  // ACTIVATE_THRESHOLD in SpiderBuddy.tsx). Either way it pauses video1 and
  // opens the little word-quiz gate first (see the overlay below). video1
  // stays paused for the entire quiz; only the outcomes below (fired after
  // their reaction animation, see playQuizReaction) ever touch playback
  // again. Guarded against re-entry — SpiderBuddy stays mounted (and
  // draggable) through the whole quiz, so a second hard pull mid-quiz would
  // otherwise just re-run this pointlessly.
  const handleWebBreak = () => {
    if (quizStage !== 'none') return
    activeVideoFaceRef.current?.pause()
    setQuizStage('quiz1')
  }

  // Shows the angry/happy reaction in place of the question+buttons for a
  // beat, THEN runs the real outcome — so picking an answer always reads
  // as "here's what that choice earned you" rather than an instant jump.
  const playQuizReaction = (kind: 'wrong' | 'right', after: () => void) => {
    setQuizReaction(kind)
    quizReactionTimerRef.current = setTimeout(() => {
      setQuizReaction('none')
      after()
    }, QUIZ_REACTION_MS)
  }

  // "Wrong" outcomes from either quiz step (samosa / Dikha bc) — angry
  // reaction, then dismiss the overlay, let SpiderBuddy be pulled again
  // once video1 nears its end this time round (see spideyGone), and replay
  // video1 from the start.
  const handleQuizWrong = () => {
    playQuizReaction('wrong', () => {
      setQuizStage('none')
      setSpideyGone(false)
      activeVideoFaceRef.current?.replay()
    })
  }

  // quiz1's "right" pick (vadapav) — happy reaction, then reveal quiz2
  // rather than actually finishing anything yet (the real fake-out).
  const handleQuizCorrectStep = () => {
    playQuizReaction('right', () => setQuizStage('quiz2'))
  }

  // The one true "right" path (quiz2's "Ruk Tu") — happy reaction, then
  // dismiss the overlay and finally do the real flip to video2. video1 is
  // left paused throughout; it's about to be unmounted at the flip's
  // midpoint anyway, so there's no need to resume it first.
  const handleQuizAdvance = () => {
    playQuizReaction('right', () => {
      setQuizStage('none')
      handleFlipToVideo2()
    })
  }

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const heroImage = selected?.popupBackground ?? selected?.cardImage
  // #Srii gets a one-off "cute" theme — pink glow, sparkles, tinted chips —
  // distinct from the plain dark styling every other special card shares.
  // A per-id check (rather than a new data field) since this is a single
  // personal easter egg, not a general theming system worth building out
  // for three cards total.
  const isSrii = selected?.id === 'srii'
  // The box fits whichever video is actually showing, so neither one ever
  // needs cropping or unnecessary letterboxing — this is what makes the
  // "no matter what, don't crop" requirement actually hold regardless of
  // the two videos having different native shapes (video1 is landscape,
  // video2 is portrait).
  const activeAspectRatio =
    (stage === 'video2' ? video2Ratio ?? video1Ratio : video1Ratio) ?? DEFAULT_ASPECT_RATIO
  // Shared by the quiz overlay's answer buttons below — same treatment as
  // "Watch Now", since these are the primary choice a person's making in
  // that moment, not a secondary hint like the de-emphasized Jkk prompt.
  const quizButtonClass = `rounded-full px-4 py-2 text-sm font-semibold ${
    isSrii
      ? 'bg-linear-to-r from-pink-400 to-rose-400 text-white shadow-[0_6px_20px_-6px_rgba(244,114,182,0.85)]'
      : 'bg-white text-black'
  }`

  return (
    <div
      className={`fixed inset-0 z-40 flex select-none items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`}
      // Every other special card closes on a backdrop click, but Srii's
      // pull-to-break-the-web gesture (see SpiderBuddy) means a hard,
      // fast drag routinely ends with the cursor well outside the card —
      // if backdrop clicks still closed it, a big committed pull would
      // constantly self-sabotage by closing the whole modal right as it
      // paid off. So backdrop-click-to-close is disabled specifically for
      // this card; Back/Close buttons still work as normal.
      onClick={isSrii ? undefined : onClose}
      aria-hidden={!open}
    >
      <motion.div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={BACKDROP_FADE}
      />

      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          scale: open ? 1 : 0.92,
          filter: open ? 'blur(0px)' : 'blur(14px)',
        }}
        transition={MODAL_SPRING}
        style={{ willChange: 'transform, opacity, filter' }}
        className={`relative w-full ${
          // Srii's video content is portrait/near-square — a narrower card
          // fits that far better than the wider 16:9-tuned width every
          // other special card uses.
          isSrii ? 'max-w-sm sm:max-w-md' : 'max-w-xl sm:max-w-2xl'
        }`}
      >
        {/* Only shows up on the Srii card, spawning during video1's final
            few seconds (same video1NearEnd signal that used to gate a
            "Click here" button — see NEAR_END_THRESHOLD_SECONDS) rather than
            waiting for it to fully end. Descends from just above the card on
            mount, then keeps swinging. IS the "Click here" button now — see
            handleWebBreak/onActivate — except pulling him hard enough to
            trigger it is deliberately not easy (see ACTIVATE_THRESHOLD in
            SpiderBuddy.tsx). A sibling of the max-h/overflow wrapper below
            (not nested inside it) so it isn't clipped by that wrapper's own
            overflow-y-auto/overflow-hidden, while still riding along with
            this card's own scale/opacity via `position: absolute` against
            this `relative` motion.div. */}
        {isSrii && video1NearEnd && (
          <SpiderBuddy onActivate={handleWebBreak} onBroken={() => setSpideyGone(true)} />
        )}

        {/* max-h/overflow live on this wrapper (not the rounded card inside)
            so a scrollbar — on the rare device that shows one — rides the
            card's outer edge rather than cutting a straight line through
            its rounded corners. In landscape, or on any short viewport (a
            phone rotated sideways, mainly), the hero image + full text can
            comfortably exceed the visible height; without this the Close
            button and "Watch Now" end up scrolled off-screen with no way
            to reach them. */}
        <div className="max-h-[88dvh] overflow-y-auto overscroll-contain rounded-2xl">
        <div
          className={`relative overflow-hidden rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] ${
            // The pink/sparkly theme is only for the hero screen — once
            // actually watching a video, the card goes solid black instead
            // (and drops the sparkles below) so nothing competes with the
            // video itself for attention.
            isSrii
              ? stage === 'hero'
                ? 'bg-linear-to-b from-[#2a1620] via-[#1a1017] to-[#141418] ring-1 ring-pink-300/25'
                : 'bg-black ring-1 ring-white/10'
              : 'bg-[#141418] ring-1 ring-white/10'
          }`}
        >
          {isSrii && stage === 'hero' && (
            <>
              {/* Ambient colour wash, clipped by the card. Sits at the very
                  bottom of the stack — the hero image paints over its top
                  half, and the text block below is transparent so the drift
                  shows through behind the copy. */}
              <div className="pointer-events-none absolute inset-0 overflow-hidden">
                {SRII_AURORA.map((blob, i) => (
                  <div
                    key={i}
                    className={`srii-aurora-blob ${blob.className}`}
                    style={{ animation: blob.animation }}
                  />
                ))}
              </div>

              <div className="pointer-events-none absolute inset-0 z-10">
                {SRII_SPARKLES.map((s, i) => (
                  <span
                    key={i}
                    className="srii-sparkle select-none"
                    style={{
                      top: s.top,
                      left: s.left,
                      fontSize: s.size,
                      animationDelay: s.delay,
                      animationDuration: s.duration,
                    }}
                  >
                    {s.emoji}
                  </span>
                ))}
              </div>
            </>
          )}

        {/* Hero stage: a single floating Close button, same as every other
            special card. Video stages: a proper toolbar ROW (see below,
            rendered inline in normal flow) replaces it — extending the
            card's own height rather than floating on top of the video. */}
        {stage === 'hero' && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
          >
            <CloseIcon />
          </button>
        )}

        {selected && (
          <>
            {stage !== 'hero' && (
              <div className="relative z-10 flex items-center justify-between gap-2 px-3 py-2.5">
                <button
                  type="button"
                  onClick={handleBack}
                  className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium text-white/85 transition-colors hover:bg-white/15 hover:text-white"
                >
                  <BackIcon />
                  Back
                </button>
                <div className="flex items-center gap-2">
                  {stage !== 'video1-loading' && !hasVideoError && (
                    <button
                      type="button"
                      onClick={() => activeVideoFaceRef.current?.toggleMute()}
                      aria-label={isMuted ? 'Unmute' : 'Mute'}
                      className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/85 transition-colors hover:bg-white/15 hover:text-white"
                    >
                      <MuteIcon muted={isMuted} />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    aria-label="Close"
                    className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 text-white/85 transition-colors hover:bg-white/15 hover:text-white"
                  >
                    <CloseIcon />
                  </button>
                </div>
              </div>
            )}

            {stage === 'hero' ? (
              <motion.div
                initial={{ opacity: 0, scale: 1.04 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                className={`relative h-72 w-full overflow-hidden sm:h-80 ${
                  isSrii ? 'bg-[#241620]' : 'bg-[#1c1c22]'
                }`}
              >
                {heroImage && (
                  <img
                    src={heroImage}
                    alt=""
                    draggable={false}
                    className={`h-full w-full object-cover ${isSrii ? 'srii-kenburns' : ''}`}
                  />
                )}
                <div
                  className={`absolute inset-0 bg-linear-to-t via-transparent to-transparent ${
                    isSrii ? 'from-[#241620]' : 'from-[#141418]'
                  }`}
                />
                {/* A soft pink rim-light along the image's lower edge, so the
                    portrait melts into the card instead of ending on a line. */}
                {isSrii && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-linear-to-t from-pink-500/20 to-transparent" />
                )}
              </motion.div>
            ) : stage === 'video1-loading' ? (
              // A real, byte-accurate loading bar (see fetchVideoWithProgress)
              // rather than a decorative timer — it only reaches full once
              // video1 has actually finished downloading, which is also
              // exactly the moment playback is guaranteed never to buffer.
              <div
                style={{ aspectRatio: DEFAULT_ASPECT_RATIO }}
                className="relative flex w-full max-h-[70vh] flex-col items-center justify-center gap-3 bg-black"
              >
                <div className="h-0.75 w-40 overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-pink-400 to-rose-400 transition-[width] duration-150 ease-out"
                    style={{ width: `${Math.round(video1Progress * 100)}%` }}
                  />
                </div>
                <span className="text-xs text-white/50">Loading… {Math.round(video1Progress * 100)}%</span>
              </div>
            ) : (
              // Sized to the currently-active video's real aspect ratio
              // (see activeAspectRatio above) and capped by max-height so a
              // tall portrait video never forces the modal past the
              // viewport — that's the "responsive" half of the brief;
              // object-contain on the <video> itself is the safety net for
              // "never crop" during the brief window before that
              // measurement lands.
              //
              // Only ONE face (video1 or video2) is ever mounted at a
              // time, swapped at the flip's rotation midpoint rather than
              // keeping both stacked behind `backface-visibility: hidden`.
              // <video> elements are frequently composited on their own
              // GPU layer that doesn't reliably participate in normal CSS
              // backface culling — in practice that showed up as a
              // "hidden" face's controls bleeding through visually AND
              // both videos audibly playing at once. Since the two faces
              // are perpendicular to the viewer (and so already invisible)
              // at the exact moment we swap, unmounting the old one and
              // mounting the new one there is imperceptible — and it's
              // categorically impossible for a face that isn't in the DOM
              // to bleed through or keep playing.
              <div
                style={{ perspective: 1800, aspectRatio: activeAspectRatio, transition: 'aspect-ratio 0.5s ease' }}
                className="relative w-full max-h-[70vh]"
              >
                <motion.div
                  className="relative h-full w-full"
                  style={{ transformStyle: 'preserve-3d' }}
                  animate={{ rotateY: flipped ? 180 : 0 }}
                  transition={{ duration: FLIP_DURATION_MS / 1000, ease: FLIP_EASE }}
                >
                  {stage === 'video2' ? (
                    // Fades/scales in exactly like the hero image does on
                    // first open, for a "new popup appearing" feel — layered
                    // on top of (not instead of) the parent's own rotateY,
                    // which is still what actually masks the video1/video2
                    // DOM swap.
                    <motion.div
                      className="h-full w-full"
                      style={{ transformStyle: 'preserve-3d' }}
                      initial={{ opacity: 0, scale: 1.04 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
                    >
                      <VideoFace
                        ref={activeVideoFaceRef}
                        src={video2Src ?? selected.secondVideoSrc}
                        onAspectRatio={setVideo2Ratio}
                        onMutedChange={setIsMuted}
                        onErrorChange={setHasVideoError}
                        showIntroBar
                        progress={video2Progress}
                        style={{ transform: 'rotateY(180deg)' }}
                      />
                    </motion.div>
                  ) : (
                    <VideoFace
                      ref={activeVideoFaceRef}
                      src={video1Src ?? selected.videoSrc}
                      onAspectRatio={setVideo1Ratio}
                      onMutedChange={setIsMuted}
                      onErrorChange={setHasVideoError}
                      onNearEnd={setVideo1NearEnd}
                      onCurrentTimeChange={(t) => {
                        video1LastTimeRef.current = t
                      }}
                      onEndedChange={(ended) => {
                        video1WasEndedRef.current = ended
                      }}
                      resumeAt={video1ResumeAt}
                      resumeEnded={video1ResumeEnded}
                    />
                  )}
                </motion.div>

                {/* A little joke gate between "Click here" and video2 —
                    video1 is explicitly paused (see handleWebBreak) for
                    as long as this is up, and it fully covers the frozen
                    frame besides, so nothing plays or is even visible
                    behind it. Sits above the 3D-rotating video, not inside
                    it, so it's unaffected by the flip transform. */}
                <AnimatePresence>
                  {stage === 'video1' && quizStage !== 'none' && (
                    <motion.div
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.25 }}
                      className="absolute inset-0 z-20 flex items-center justify-center overflow-hidden bg-black/60 px-6 backdrop-blur-lg"
                    >
                      {/* Warm spotlight behind the card so it reads as lit
                          rather than just pasted onto a dark rectangle. */}
                      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(244,114,182,0.2),transparent_65%)]" />

                      <motion.div
                        initial={{ opacity: 0, scale: 0.8, y: 18, rotate: -3 }}
                        animate={{ opacity: 1, scale: 1, y: 0, rotate: 0 }}
                        exit={{ opacity: 0, scale: 0.86, y: -10 }}
                        transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                        className={`relative w-full max-w-65 rounded-[1.75rem] px-6 py-7 text-center ring-1 backdrop-blur-2xl transition-[background-color,box-shadow] duration-300 ${
                          quizReaction === 'wrong'
                            ? 'bg-red-500/12 shadow-[0_0_60px_-12px_rgba(248,113,113,0.65)] ring-red-400/35'
                            : quizReaction === 'right'
                              ? 'bg-pink-400/12 shadow-[0_0_70px_-10px_rgba(244,114,182,0.85)] ring-pink-300/45'
                              : 'bg-white/10 shadow-[0_20px_60px_-20px_rgba(0,0,0,0.9)] ring-pink-300/25'
                        }`}
                      >
                        {/* One-shot burst on a correct answer. Unmounted the
                            moment the reaction ends, so these never linger as
                            live animations. */}
                        {quizReaction === 'right' && (
                          <div className="pointer-events-none absolute left-1/2 top-1/2 h-0 w-0">
                            {QUIZ_CONFETTI.map((c, i) => (
                              <motion.span
                                key={i}
                                initial={{ opacity: 0, x: 0, y: 0, scale: 0.3, rotate: 0 }}
                                animate={{
                                  opacity: [0, 1, 1, 0],
                                  x: c.x,
                                  y: c.y,
                                  scale: [0.3, 1.1, 1, 0.7],
                                  rotate: c.rotate,
                                }}
                                transition={{ duration: 0.95, delay: c.delay, ease: [0.16, 1, 0.3, 1] }}
                                className="absolute -ml-2 -mt-2 text-base"
                              >
                                {c.emoji}
                              </motion.span>
                            ))}
                          </div>
                        )}

                        <AnimatePresence mode="wait">
                          {quizReaction === 'wrong' ? (
                            <motion.div
                              key="wrong"
                              initial={{ opacity: 0, scale: 0.7 }}
                              animate={{
                                opacity: 1,
                                scale: 1,
                                x: [0, -12, 12, -10, 10, -5, 5, 0],
                                rotate: [0, -3, 3, -2, 2, 0],
                              }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                            >
                              <img
                                src={QUIZ_INCORRECT_IMG}
                                alt=""
                                draggable={false}
                                className="max-h-48 w-auto rounded-2xl object-contain"
                              />
                            </motion.div>
                          ) : quizReaction === 'right' ? (
                            <motion.div
                              key="right"
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: [0.6, 1.2, 0.95, 1.05, 1], rotate: [0, -8, 8, -4, 0] }}
                              exit={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 0.5, ease: 'easeOut' }}
                            >
                              <img
                                src={quizStage === 'quiz1' ? QUIZ_CORRECT_1_IMG : QUIZ_CORRECT_2_IMG}
                                alt=""
                                draggable={false}
                                className="max-h-48 w-auto rounded-2xl object-contain"
                              />
                            </motion.div>
                          ) : (
                            <motion.div
                              key={quizStage}
                              variants={QUIZ_STAGGER}
                              initial="hidden"
                              animate="show"
                              exit={{ opacity: 0, scale: 0.94, transition: { duration: 0.15 } }}
                              className="flex flex-col items-center gap-4"
                            >
                              {/* Two layers on purpose: the outer span takes
                                  part in the parent's stagger, the inner one
                                  owns the endless bob. One element can't do
                                  both — an explicit `animate` object opts a
                                  child out of variant inheritance entirely. */}
                              <motion.span variants={QUIZ_ITEM} className="text-4xl">
                                <motion.span
                                  animate={{ y: [0, -5, 0], rotate: [0, 6, -6, 0] }}
                                  transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
                                  className="inline-block"
                                >
                                  {quizStage === 'quiz1' ? '🤔' : '😏'}
                                </motion.span>
                              </motion.span>

                              <motion.p variants={QUIZ_ITEM} className="text-sm font-semibold text-white">
                                {quizStage === 'quiz1'
                                  ? 'Select the correct word'
                                  : 'Hattttttt!! Nahi dikhaunga'}
                              </motion.p>

                              <motion.div variants={QUIZ_ITEM} className="flex gap-3">
                                <motion.button
                                  type="button"
                                  onClick={quizStage === 'quiz1' ? handleQuizCorrectStep : handleQuizWrong}
                                  whileHover={{ scale: 1.07, y: -2 }}
                                  whileTap={{ scale: 0.94 }}
                                  transition={{ type: 'spring', stiffness: 460, damping: 20 }}
                                  className={quizButtonClass}
                                >
                                  {quizStage === 'quiz1' ? 'vadapav' : 'Dikha bc'}
                                </motion.button>
                                <motion.button
                                  type="button"
                                  onClick={quizStage === 'quiz1' ? handleQuizWrong : handleQuizAdvance}
                                  whileHover={{ scale: 1.07, y: -2 }}
                                  whileTap={{ scale: 0.94 }}
                                  transition={{ type: 'spring', stiffness: 460, damping: 20 }}
                                  className={quizButtonClass}
                                >
                                  {quizStage === 'quiz1' ? 'samosa' : 'Ruk Tu'}
                                </motion.button>
                              </motion.div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </motion.div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            <div className="relative z-10 px-6 pb-6 pt-4">
              {/* Re-keyed when the title actually changes (hero/video1 name vs
                  video2's own title) so it cross-fades on the way in rather
                  than swapping text in place mid-flip. */}
              <motion.h2
                key={stage === 'video2' ? 'title-video2' : 'title-main'}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="text-2xl font-semibold tracking-tight text-white"
              >
                {stage === 'video2' ? selected.secondVideoTitle ?? selected.name : selected.name}
              </motion.h2>

              {stage === 'hero' && (
                <motion.div variants={HERO_STAGGER} initial="hidden" animate="show">
                  {selected.tags && selected.tags.length > 0 && (
                    <motion.div variants={HERO_ITEM} className="mt-2 flex flex-wrap gap-1.5">
                      {selected.tags.map((tag) => (
                        <span
                          key={tag}
                          className={`rounded-full px-2.5 py-1 text-[11px] font-medium ring-1 ${
                            isSrii
                              ? 'bg-pink-400/15 text-pink-100 ring-pink-300/25'
                              : 'bg-white/10 text-white/70 ring-white/15'
                          }`}
                        >
                          {tag}
                        </span>
                      ))}
                    </motion.div>
                  )}

                  {selected.description && (
                    <motion.p
                      variants={HERO_ITEM}
                      className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60"
                    >
                      {selected.description}
                    </motion.p>
                  )}

                  {selected.videoSrc && (
                    <motion.button
                      variants={HERO_ITEM}
                      type="button"
                      onClick={() => setStage(video1LoadState === 'ready' ? 'video1' : 'video1-loading')}
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.97 }}
                      transition={{ type: 'spring', stiffness: 420, damping: 24 }}
                      className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ${
                        isSrii
                          ? 'srii-shimmer relative overflow-hidden bg-linear-to-r from-pink-400 to-rose-400 text-white shadow-[0_8px_24px_-6px_rgba(244,114,182,0.7)]'
                          : 'bg-white text-black hover:bg-white/90'
                      }`}
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Watch Now
                    </motion.button>
                  )}
                </motion.div>
              )}

              {stage === 'video1' && selected.videoDescription && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60">
                  {selected.videoDescription}
                </p>
              )}

              {/* The old "Jkk, heres a short edit" / Click here prompt's
                  replacement now that SpiderBuddy itself is the trigger —
                  same fade-in treatment, same video1NearEnd gate, just a
                  hint instead of a button. Fades back out once he's actually
                  broken free and fallen away (spideyGone, via SpiderBuddy's
                  onBroken) — video1NearEnd itself stays true for the rest of
                  the session, so without this the hint would keep pointing
                  at an empty corner. */}
              <AnimatePresence>
                {selected.secondVideoSrc && video1NearEnd && !spideyGone && (
                  <motion.div
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -4 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="mt-3 flex items-center justify-end"
                  >
                    <span className="text-xs text-white/50">pull spidey for a surprise edit 😜</span>
                  </motion.div>
                )}
              </AnimatePresence>

            </div>
            </>
          )}
        </div>
        </div>
      </motion.div>
    </div>
  )
}
