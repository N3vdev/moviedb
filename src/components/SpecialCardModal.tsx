import { useEffect, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import type { SpecialCard } from '../lib/specialCards'

interface SpecialCardModalProps {
  selected: SpecialCard | null
  onClose: () => void
}

const MODAL_SPRING = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 } as const
const BACKDROP_FADE = { duration: 0.3, ease: [0.16, 1, 0.3, 1] } as const

// Deterministic — not random per render — scattered sparkles for the #Srii
// card's one-off "cute" theme (see the isSrii check below). Staggered
// delays so they twinkle out of sync with each other rather than in unison.
const SRII_SPARKLES = [
  { top: '7%', left: '9%', size: '1.1rem', delay: '0s', emoji: '✨' },
  { top: '14%', left: '89%', size: '0.9rem', delay: '0.5s', emoji: '💗' },
  { top: '88%', left: '90%', size: '1rem', delay: '1s', emoji: '✨' },
  { top: '82%', left: '7%', size: '0.8rem', delay: '1.5s', emoji: '💫' },
  { top: '48%', left: '95%', size: '0.75rem', delay: '2s', emoji: '✨' },
  { top: '4%', left: '48%', size: '0.7rem', delay: '0.8s', emoji: '💫' },
] as const

export default function SpecialCardModal({ selected, onClose }: SpecialCardModalProps) {
  const [showVideo, setShowVideo] = useState(false)
  // A plain `<video src>` only guarantees the browser has enough of the file
  // buffered to START — on a slow connection it can still stall mid-playback
  // waiting for more to arrive. Fetching the whole file into memory first
  // and only then handing the player a blob URL trades a short loading wait
  // up front for a guarantee it can never rebuffer once it starts.
  const [videoBlobUrl, setVideoBlobUrl] = useState<string | null>(null)
  const [loadProgress, setLoadProgress] = useState<number | null>(null)
  // Surfaces a real decode/playback error instead of leaving the video area
  // silently black — the previous plain `autoPlay` attribute failed with no
  // error at all when a browser's autoplay policy blocked it, which is
  // exactly the kind of failure this exists to catch if it happens again.
  const [videoError, setVideoError] = useState<string | null>(null)
  const blobUrlRef = useRef<string | null>(null)
  const open = selected !== null

  useEffect(() => {
    setShowVideo(false)
  }, [selected])

  // Downloads the entire video the moment "Watch Now" is pressed. Cancels
  // and revokes cleanly on Back/close/unmount so nothing keeps downloading
  // or leaks a blob URL once nobody can see it anymore.
  useEffect(() => {
    if (!showVideo || !selected?.videoSrc) return

    const controller = new AbortController()
    setVideoBlobUrl(null)
    setLoadProgress(0)
    setVideoError(null)

    ;(async () => {
      try {
        const res = await fetch(selected.videoSrc!, { signal: controller.signal })
        const total = Number(res.headers.get('content-length')) || 0
        const reader = res.body?.getReader()
        if (!reader) {
          const blob = await res.blob()
          if (controller.signal.aborted) return
          blobUrlRef.current = URL.createObjectURL(blob)
          setVideoBlobUrl(blobUrlRef.current)
          return
        }
        const chunks: BlobPart[] = []
        let received = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          received += value.byteLength
          if (total > 0) setLoadProgress(Math.min(1, received / total))
        }
        if (controller.signal.aborted) return
        blobUrlRef.current = URL.createObjectURL(new Blob(chunks))
        setVideoBlobUrl(blobUrlRef.current)
      } catch (err) {
        if ((err as Error).name === 'AbortError') return
        // Fall back to a direct, browser-streamed src rather than leaving
        // the user stuck on a loading spinner forever if the fetch itself
        // failed (e.g. blocked by an extension, or a CORS edge case).
        setVideoBlobUrl(selected.videoSrc ?? null)
      }
    })()

    return () => {
      controller.abort()
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current)
        blobUrlRef.current = null
      }
      setVideoBlobUrl(null)
      setLoadProgress(null)
      setVideoError(null)
    }
  }, [showVideo, selected])

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
        className={`relative w-full max-w-xl overflow-hidden rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] sm:max-w-2xl ${
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
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        {selected && (
          <>
            {showVideo && selected.videoSrc ? (
              <div className="relative aspect-video w-full bg-black">
                {videoBlobUrl && !videoError ? (
                  <video
                    ref={(el) => {
                      if (!el) return
                      el.volume = 0.3
                      // Deliberately NOT relying on the bare `autoPlay`
                      // attribute: when a browser's autoplay policy blocks
                      // it, that fails completely silently — no error
                      // event, nothing in the console, just a black
                      // <video> forever. That silent failure is exactly
                      // what showed up here. It's made worse by this
                      // element only mounting once the full download
                      // finishes (could be several seconds after the
                      // "Watch Now" click), which some browsers treat as
                      // too far removed from the original click to still
                      // count as "the user asked for audio." Calling
                      // .play() ourselves lets us detect that rejection
                      // and recover: retry muted (essentially every
                      // browser allows autoplay once muted), then restore
                      // volume immediately after playback has actually
                      // started.
                      el.play().catch(() => {
                        el.muted = true
                        el.play()
                          .then(() => {
                            el.muted = false
                          })
                          .catch(() => {
                            // Still blocked even muted — leave it paused
                            // with controls rather than a dead black box,
                            // so there's at least a way to start it.
                            el.controls = true
                          })
                      })
                    }}
                    onError={(e) => {
                      const err = e.currentTarget.error
                      const messages: Record<number, string> = {
                        1: 'Playback was aborted',
                        2: 'A network error interrupted playback',
                        3: 'The video could not be decoded — the file may be corrupted',
                        4: "This browser can't play this video's format",
                      }
                      setVideoError(err ? messages[err.code] ?? 'Unknown playback error' : 'Unknown playback error')
                    }}
                    src={videoBlobUrl}
                    className="absolute inset-0 h-full w-full"
                  />
                ) : videoError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-6 text-center">
                    <span className="text-sm font-medium text-white/80">Couldn't play this video</span>
                    <span className="text-xs text-white/50">{videoError}</span>
                  </div>
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                    <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/80" />
                    <div className="flex flex-col items-center gap-1.5">
                      <span className="text-xs font-medium text-white/50">
                        {loadProgress !== null && loadProgress > 0
                          ? `Loading ${Math.round(loadProgress * 100)}%`
                          : 'Loading'}
                      </span>
                      {loadProgress !== null && loadProgress > 0 && (
                        <div className="h-1 w-32 overflow-hidden rounded-full bg-white/10">
                          <div
                            className="h-full rounded-full bg-white/70 transition-[width] duration-200 ease-out"
                            style={{ width: `${loadProgress * 100}%` }}
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => setShowVideo(false)}
                  className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Back
                </button>
              </div>
            ) : (
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
            )}

            <div className="px-6 pb-6 pt-4">
              <h2 className="text-2xl font-semibold tracking-tight text-white">{selected.name}</h2>

              {!showVideo && selected.tags && selected.tags.length > 0 && (
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

              {showVideo && selected.videoDescription && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60">
                  {selected.videoDescription}
                </p>
              )}

              {!showVideo && selected.description && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60">
                  {selected.description}
                </p>
              )}

              {!showVideo && selected.videoSrc && (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
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
