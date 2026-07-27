import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { BACKDROP_IMAGE_BASE, fetchMovieDetails, posterUrl, type MovieDetails } from '../lib/tmdb'
import Dropdown from './Dropdown'

export interface SelectedMovie {
  id: number
  mediaType: 'movie' | 'tv'
}

interface MovieDetailModalProps {
  selected: SelectedMovie | null
  onClose: () => void
}

const WATCH_EMBED_BASE = 'https://player.vidlove.cc/embed'
const WATCH_EMBED_BASE_ALT = 'https://vidsrcme.ru/embed'
// There's no reliable way to detect whether the primary source actually
// found and is playing the title (cross-origin iframe — no postMessage API,
// same-origin policy blocks reading its DOM, and its backend is behind bot
// protection that blocks external checks). Rather than guess at success/
// failure, just offer a manual escape hatch to a second, independent
// provider a couple seconds in.
const ALT_SOURCE_PROMPT_MS = 2000

// Spring (not a fixed-duration ease) so the card settles with a touch of
// liquid weight rather than a mechanical linear-feeling snap — the same
// motion language as the nav bar's tab indicator.
const MODAL_SPRING = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 } as const
const BACKDROP_FADE = { duration: 0.3, ease: [0.16, 1, 0.3, 1] } as const

export default function MovieDetailModal({ selected, onClose }: MovieDetailModalProps) {
  const [details, setDetails] = useState<MovieDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [showPlayer, setShowPlayer] = useState(false)
  const [season, setSeason] = useState(1)
  const [episode, setEpisode] = useState(1)
  const [useAltSource, setUseAltSource] = useState(false)
  const [showAltPrompt, setShowAltPrompt] = useState(false)
  const altTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const open = selected !== null

  const embedSrc =
    details &&
    (useAltSource
      ? details.mediaType === 'tv'
        ? `${WATCH_EMBED_BASE_ALT}/tv?tmdb=${details.id}&season=${season}&episode=${episode}`
        : `${WATCH_EMBED_BASE_ALT}/movie?tmdb=${details.id}`
      : details.mediaType === 'tv'
        ? `${WATCH_EMBED_BASE}/tv/${details.id}/${season}/${episode}`
        : `${WATCH_EMBED_BASE}/movie/${details.id}`)

  // The "try alternative source" button shows a couple seconds into loading
  // any source (primary or alt) — restarts whenever the embed src changes,
  // e.g. opening the player or switching season/episode.
  useEffect(() => {
    if (altTimerRef.current) clearTimeout(altTimerRef.current)
    setShowAltPrompt(false)
    if (!showPlayer || !embedSrc) return
    altTimerRef.current = setTimeout(() => setShowAltPrompt(true), ALT_SOURCE_PROMPT_MS)
    return () => {
      if (altTimerRef.current) clearTimeout(altTimerRef.current)
    }
  }, [showPlayer, embedSrc])

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setFailed(false)
    setShowPlayer(false)
    setUseAltSource(false)
    fetchMovieDetails(selected.mediaType, selected.id)
      .then((d) => {
        if (!cancelled) {
          setDetails(d)
          setSeason(d.seasons?.[0]?.seasonNumber ?? 1)
          setEpisode(1)
        }
      })
      .catch(() => {
        if (!cancelled) setFailed(true)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [selected])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  // Closing only fades the modal out — the iframe stays mounted (and its
  // video/audio keeps running) unless we also drop back out of player view,
  // which unmounts it. Covers every way the modal can close (X button,
  // Escape, backdrop click) since they all funnel through `selected`.
  useEffect(() => {
    if (!open) setShowPlayer(false)
  }, [open])

  const isUnreleased = Boolean(details && (!details.releaseDate || new Date(details.releaseDate) > new Date()))

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
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          scale: open ? 1 : 0.92,
        }}
        transition={MODAL_SPRING}
        onAnimationComplete={() => {
          // Chromium treats ANY ancestor with a non-`none` transform — or
          // even just `will-change: transform` — as reason to create a
          // containing block, which silently breaks requestFullscreen()
          // calls made by nested content (e.g. the embedded video player's
          // own fullscreen button). Framer Motion leaves `transform` as an
          // inline style even once settled at its identity value, so once
          // the open animation finishes, strip it — restored automatically
          // when the close animation starts, since Motion tracks the real
          // value internally rather than reading it back from the DOM.
          if (open && panelRef.current) {
            panelRef.current.style.transform = ''
            // 'auto', not '' — clearing to empty just falls back to
            // .glass-panel's own `will-change: backdrop-filter` rule, which
            // (per newer spec) can also establish a containing block. An
            // explicit 'auto' overrides that rule outright.
            panelRef.current.style.willChange = 'auto'
          }
        }}
        style={{ willChange: 'transform, opacity' }}
        className={`glass-panel relative max-h-[88vh] w-full max-w-xl overflow-y-auto rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] transition-[filter] duration-300 ease-out sm:max-w-2xl md:max-w-3xl lg:max-w-4xl ${
          open ? 'blur-none' : 'blur-[14px]'
        }`}
      >
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

        {loading && (
          <div className="flex h-112 items-center justify-center text-sm text-white/40 sm:h-128 md:h-144">
            Loading…
          </div>
        )}

        {!loading && failed && (
          <div className="flex h-112 items-center justify-center text-sm text-white/40 sm:h-128 md:h-144">
            Couldn't load details for this title.
          </div>
        )}

        {!loading && !failed && details && (
          <>
            {showPlayer ? (
              <div className="relative aspect-video w-full bg-black">
                <iframe
                  key={embedSrc}
                  src={embedSrc ?? undefined}
                  title={`Watch ${details.title}`}
                  allow="autoplay; fullscreen; encrypted-media; picture-in-picture"
                  allowFullScreen
                  referrerPolicy={useAltSource ? 'origin' : 'no-referrer'}
                  className="absolute inset-0 h-full w-full"
                />
                <button
                  type="button"
                  onClick={() => setShowPlayer(false)}
                  className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Details
                </button>
                <AnimatePresence>
                  {showAltPrompt && (
                    <motion.button
                      type="button"
                      onClick={() => setUseAltSource((v) => !v)}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 8 }}
                      transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                      className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 items-center gap-2 rounded-full bg-black/70 px-4 py-2 text-xs font-medium text-white/85 shadow-[0_10px_30px_rgba(0,0,0,0.6)] backdrop-blur-md transition-colors hover:bg-black/85 hover:text-white"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M4 4v6h6M20 20v-6h-6" />
                        <path d="M20 10a8 8 0 0 0-14.6-4.6M4 14a8 8 0 0 0 14.6 4.6" />
                      </svg>
                      {useAltSource ? 'Switch back to original source' : "Doesn't load? Try alternative source"}
                    </motion.button>
                  )}
                </AnimatePresence>
              </div>
            ) : (
              <div className="relative h-48 w-full bg-[#1c1c22] sm:h-60 md:h-72">
                {details.backdropPath && (
                  <img
                    src={`${BACKDROP_IMAGE_BASE}${details.backdropPath}`}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/40 to-transparent" />
              </div>
            )}

            <div
              className={`relative flex gap-5 px-6 sm:gap-6 sm:px-8 md:px-10 ${
                showPlayer ? 'mt-4' : '-mt-20 sm:-mt-24 md:-mt-28'
              }`}
            >
              {!showPlayer && (
                <img
                  src={details.posterPath ? posterUrl(details.posterPath) : ''}
                  alt=""
                  className="h-52 w-34 shrink-0 rounded-lg bg-[#1c1c22] object-cover shadow-[0_10px_30px_rgba(0,0,0,0.6)] ring-1 ring-white/10 sm:h-64 sm:w-42 md:h-76 md:w-50"
                />
              )}

              <div className="min-w-0 flex-1 self-end pb-1">
                <h2 className="text-xl font-semibold leading-tight text-white sm:text-2xl md:text-3xl">{details.title}</h2>
                {details.tagline && (
                  <p className="mt-1 text-sm italic text-white/40 sm:text-base">{details.tagline}</p>
                )}
                {!showPlayer && !isUnreleased && (
                  <>
                    {details.mediaType === 'tv' && details.seasons && details.seasons.length > 0 && (
                      <div className="mt-3 flex items-center gap-2">
                        <Dropdown
                          value={String(season)}
                          onChange={(v) => {
                            setSeason(Number(v))
                            setEpisode(1)
                          }}
                          options={details.seasons.map((s) => ({
                            value: String(s.seasonNumber),
                            label: `Season ${s.seasonNumber}`,
                          }))}
                        />
                        <Dropdown
                          value={String(episode)}
                          onChange={(v) => setEpisode(Number(v))}
                          options={Array.from(
                            {
                              length:
                                details.seasons.find((s) => s.seasonNumber === season)?.episodeCount ?? 1,
                            },
                            (_, i) => i + 1,
                          ).map((ep) => ({ value: String(ep), label: `Episode ${ep}` }))}
                        />
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setUseAltSource(false)
                        setShowPlayer(true)
                      }}
                      className="mt-3 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                    >
                      <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                      Watch Now
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="px-6 pb-6 pt-4">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 text-xs text-white/55">
                {details.year && <span>{details.year}</span>}
                <span className="rounded bg-white/10 px-1.5 py-0.5 font-medium uppercase tracking-wide text-white/70">
                  {details.mediaType === 'tv' ? 'Series' : 'Movie'}
                </span>
                {details.runtimeMinutes ? <span>{details.runtimeMinutes} min</span> : null}
                {details.voteAverage !== undefined && details.voteAverage > 0 && (
                  <span className="flex items-center gap-1">
                    <span className="text-yellow-400">★</span>
                    {details.voteAverage.toFixed(1)}
                    {details.voteCount ? (
                      <span className="text-white/35">({details.voteCount.toLocaleString()})</span>
                    ) : null}
                  </span>
                )}
              </div>

              {(isUnreleased || details.genres.length > 0) && (
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {isUnreleased && (
                    <span className="rounded-full bg-amber-400/10 px-2.5 py-1 text-[11px] font-medium text-amber-300 ring-1 ring-amber-400/20">
                      Unreleased
                    </span>
                  )}
                  {details.genres.map((g) => (
                    <span
                      key={g}
                      className="rounded-full bg-white/5 px-2.5 py-1 text-[11px] text-white/60 ring-1 ring-white/5"
                    >
                      {g}
                    </span>
                  ))}
                </div>
              )}

              <p className="mt-4 text-sm leading-relaxed text-white/70">
                {details.overview || 'No description available.'}
              </p>

              <div className="mt-5 flex items-center justify-between border-t border-white/5 pt-3 text-[11px] uppercase tracking-wide text-white/30">
                <span>TMDB ID: {details.id}</span>
                <span>{details.mediaType === 'tv' ? 'TV Series' : 'Movie'}</span>
              </div>
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
