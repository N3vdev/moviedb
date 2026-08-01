import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { SpecialCard } from '../lib/specialCards'

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
  { top: '7%', left: '9%', size: '1.1rem', delay: '0s', emoji: '✨' },
  { top: '14%', left: '89%', size: '0.9rem', delay: '0.5s', emoji: '✨' },
  { top: '88%', left: '90%', size: '1rem', delay: '1s', emoji: '✨' },
  { top: '82%', left: '7%', size: '0.8rem', delay: '1.5s', emoji: '💫' },
  { top: '48%', left: '95%', size: '0.75rem', delay: '2s', emoji: '✨' },
  { top: '4%', left: '48%', size: '0.7rem', delay: '0.8s', emoji: '💫' },
] as const

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
  /** video2 only — shows the decorative loading-bar overlay described above. */
  showIntroBar?: boolean
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
}

const NEAR_END_THRESHOLD_SECONDS = 3

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
  { src, style, onAspectRatio, showIntroBar, onMutedChange, onErrorChange, onNearEnd },
  ref,
) {
  const [isMuted, setIsMuted] = useState(false)
  const [videoError, setVideoError] = useState<string | null>(null)
  // True in the vanishingly-rare case where even muted autoplay was
  // blocked — shows a custom centered play button instead of ever falling
  // back to the browser's native <video controls> bar, which would clash
  // with (and visually break) the custom toolbar.
  const [playBlocked, setPlayBlocked] = useState(false)
  const [introBarVisible, setIntroBarVisible] = useState(!!showIntroBar)
  const [introBarFilled, setIntroBarFilled] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)

  useImperativeHandle(ref, () => ({
    toggleMute: () => {
      setIsMuted((m) => {
        const next = !m
        if (videoRef.current) videoRef.current.muted = next
        onMutedChange?.(next)
        return next
      })
    },
  }))

  useEffect(() => {
    setIsMuted(false)
    setVideoError(null)
    setPlayBlocked(false)
    onMutedChange?.(false)
    onErrorChange?.(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  useEffect(() => {
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
  }, [src])

  useEffect(() => {
    if (!showIntroBar) return
    setIntroBarVisible(true)
    setIntroBarFilled(false)
    // A single rAF isn't reliable here — it can still land in the same
    // paint as the 0% starting style, so the browser never gets a chance
    // to commit "0%" before jumping to "100%", and the transition is
    // skipped (the bar just appears already full). Nesting a second rAF
    // guarantees a real paint of the 0% state happens first.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setIntroBarFilled(true))
    })
    const hideTimer = setTimeout(() => setIntroBarVisible(false), INTRO_BAR_MS)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(hideTimer)
    }
  }, [showIntroBar, src])

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
            if (!onNearEnd) return
            const v = e.currentTarget
            if (!Number.isFinite(v.duration)) return
            onNearEnd(v.duration - v.currentTime <= NEAR_END_THRESHOLD_SECONDS)
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
          autoPlay
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
              className="h-full rounded-full bg-linear-to-r from-pink-400 to-rose-400 transition-[width] ease-linear"
              style={{ width: introBarFilled ? '100%' : '0%', transitionDuration: `${INTRO_BAR_MS}ms` }}
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
  // 'video1-loading' effect below) — same rationale as video2's blob: a
  // <video> playing from a Blob URL can never stall on the network, since
  // every byte is already local. video1Progress (0-1) drives the real,
  // byte-accurate loading bar shown during that stage.
  const [video1Src, setVideo1Src] = useState<string | undefined>(undefined)
  const [video1Progress, setVideo1Progress] = useState(0)
  // The fully-preloaded video2, as a blob URL. Only starts downloading once
  // video1 has FULLY finished loading and started playing (stage becomes
  // 'video1' only after that point — see the loading effect) rather than
  // concurrently with it, so the two downloads never compete for bandwidth
  // and make each other buffer. Falls back to the plain src (ordinary
  // browser streaming) if the fetch hasn't finished yet or failed outright
  // — the flip itself is never blocked waiting on this.
  const [video2Src, setVideo2Src] = useState<string | undefined>(undefined)
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
  // video (see the NEAR_END_THRESHOLD_SECONDS wiring on VideoFace).
  const [video1NearEnd, setVideo1NearEnd] = useState(false)
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

  const resetVideoState = () => {
    setStage('hero')
    setFlipped(false)
    setVideo1Src(undefined)
    setVideo1Progress(0)
    setVideo2Src(undefined)
    setVideo1Ratio(null)
    setVideo2Ratio(null)
    setIsMuted(false)
    setHasVideoError(false)
    setVideo1NearEnd(false)
    revokeVideo1Blob()
    revokeVideo2Blob()
    if (flipTimerRef.current) {
      clearTimeout(flipTimerRef.current)
      flipTimerRef.current = null
    }
  }

  useEffect(() => {
    resetVideoState()
  }, [selected])

  useEffect(() => {
    return () => {
      if (flipTimerRef.current) clearTimeout(flipTimerRef.current)
      revokeVideo1Blob()
      revokeVideo2Blob()
    }
  }, [])

  // Fully preloads video1 into memory before it ever starts playing — see
  // fetchVideoWithProgress above for why this is the only real guarantee
  // against mid-playback buffering. video1Progress drives the loading bar
  // rendered for this stage below. Falls back to the plain src (ordinary
  // streaming) if the fetch fails outright, rather than leaving the modal
  // stuck on a loading bar forever.
  useEffect(() => {
    if (stage !== 'video1-loading' || !selected?.videoSrc) return
    let cancelled = false
    const controller = new AbortController()
    setVideo1Progress(0)

    fetchVideoWithProgress(selected.videoSrc, controller.signal, (fraction) => {
      if (!cancelled) setVideo1Progress(fraction)
    })
      .then((blob) => {
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        video1BlobUrlRef.current = url
        setVideo1Src(url)
        setStage('video1')
      })
      .catch(() => {
        if (cancelled) return
        setVideo1Src(selected.videoSrc)
        setStage('video1')
      })

    return () => {
      cancelled = true
      controller.abort()
    }
  }, [stage, selected])

  // Preloads video2 entirely in the background only once video1 has fully
  // loaded and started playing (stage only reaches 'video1' after that
  // point — see the effect above), not concurrently with video1's own
  // download, so the two fetches never compete for bandwidth and cause
  // each other to buffer. Falls back to the plain src if the fetch fails;
  // either way this never blocks the flip itself.
  useEffect(() => {
    if (stage !== 'video1' || !selected?.secondVideoSrc) return
    let cancelled = false
    const controller = new AbortController()

    fetch(selected.secondVideoSrc, { signal: controller.signal })
      .then((res) => res.blob())
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
  }, [stage, selected])

  const handleFlipToVideo2 = () => {
    setFlipped(true)
    // Swap which video is mounted at the halfway point of the rotation —
    // that's the exact moment the rotating box is perpendicular to the
    // viewer (and so already invisible), so unmounting video1 and mounting
    // video2 there is imperceptible rather than an early, visible pop.
    flipTimerRef.current = setTimeout(() => setStage('video2'), FLIP_DURATION_MS / 2)
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

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`}
      onClick={onClose}
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
        className={`relative w-full overflow-hidden rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] ${
          // Srii's video content is portrait/near-square — a narrower card
          // fits that far better than the wider 16:9-tuned width every
          // other special card uses.
          isSrii ? 'max-w-sm sm:max-w-md' : 'max-w-xl sm:max-w-2xl'
        } ${
          isSrii
            ? 'bg-linear-to-b from-[#2a1620] via-[#1a1017] to-[#141418] ring-1 ring-pink-300/25'
            : 'bg-[#141418] ring-1 ring-white/10'
        }`}
      >
        {isSrii && (
          <div className="pointer-events-none absolute inset-0 z-10">
            {SRII_SPARKLES.map((s, i) => (
              <span
                key={i}
                className="srii-sparkle absolute select-none"
                style={{ top: s.top, left: s.left, fontSize: s.size, animationDelay: s.delay }}
              >
                {s.emoji}
              </span>
            ))}
          </div>
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
                  onClick={resetVideoState}
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
              <div className={`relative h-72 w-full sm:h-80 ${isSrii ? 'bg-[#241620]' : 'bg-[#1c1c22]'}`}>
                {heroImage && (
                  <img src={heroImage} alt="" className="h-full w-full object-cover" />
                )}
                <div
                  className={`absolute inset-0 bg-linear-to-t via-transparent to-transparent ${
                    isSrii ? 'from-[#241620]' : 'from-[#141418]'
                  }`}
                />
              </div>
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
                    <VideoFace
                      ref={activeVideoFaceRef}
                      src={video2Src ?? selected.secondVideoSrc}
                      onAspectRatio={setVideo2Ratio}
                      onMutedChange={setIsMuted}
                      onErrorChange={setHasVideoError}
                      showIntroBar
                      style={{ transform: 'rotateY(180deg)' }}
                    />
                  ) : (
                    <VideoFace
                      ref={activeVideoFaceRef}
                      src={video1Src ?? selected.videoSrc}
                      onAspectRatio={setVideo1Ratio}
                      onMutedChange={setIsMuted}
                      onErrorChange={setHasVideoError}
                      onNearEnd={setVideo1NearEnd}
                    />
                  )}
                </motion.div>
              </div>
            )}

            <div className="px-6 pb-6 pt-4">
              <h2 className="text-2xl font-semibold tracking-tight text-white">
                {stage === 'video2' ? selected.secondVideoTitle ?? selected.name : selected.name}
              </h2>

              {stage === 'hero' && selected.tags && selected.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
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
                </div>
              )}

              {stage === 'video1' && selected.videoDescription && (
                <>
                  <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60">
                    {selected.videoDescription}
                  </p>
                  {selected.secondVideoSrc && video1NearEnd && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                      className="mt-3 flex items-center justify-end gap-2"
                    >
                      <span className="text-xs text-white/50">Jkk, here's a short edit</span>
                      <button
                        type="button"
                        onClick={handleFlipToVideo2}
                        className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                          isSrii
                            ? 'bg-linear-to-r from-pink-400 to-rose-400 text-white hover:from-pink-300 hover:to-rose-300'
                            : 'bg-white text-black hover:bg-white/90'
                        }`}
                      >
                        › Click here
                      </button>
                    </motion.div>
                  )}
                </>
              )}

              {stage === 'hero' && selected.description && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60">
                  {selected.description}
                </p>
              )}

              {stage === 'hero' && selected.videoSrc && (
                <button
                  type="button"
                  onClick={() => setStage('video1-loading')}
                  className={`mt-4 inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold transition-colors ${
                    isSrii
                      ? 'bg-linear-to-r from-pink-400 to-rose-400 text-white hover:from-pink-300 hover:to-rose-300'
                      : 'bg-white text-black hover:bg-white/90'
                  }`}
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Watch Now
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
