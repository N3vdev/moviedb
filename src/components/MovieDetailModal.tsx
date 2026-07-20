import { useEffect, useState } from 'react'
import { BACKDROP_IMAGE_BASE, fetchMovieDetails, posterUrl, type MovieDetails } from '../lib/tmdb'

export interface SelectedMovie {
  id: number
  mediaType: 'movie' | 'tv'
}

interface MovieDetailModalProps {
  selected: SelectedMovie | null
  onClose: () => void
}

export default function MovieDetailModal({ selected, onClose }: MovieDetailModalProps) {
  const [details, setDetails] = useState<MovieDetails | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const open = selected !== null

  useEffect(() => {
    if (!selected) return
    let cancelled = false
    setLoading(true)
    setFailed(false)
    fetchMovieDetails(selected.mediaType, selected.id)
      .then((d) => {
        if (!cancelled) setDetails(d)
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

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 transition-opacity duration-300 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/75 backdrop-blur-sm" />

      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative max-h-[85vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-[#141418] shadow-[0_30px_90px_rgba(0,0,0,0.8)] ring-1 ring-white/10 transition-all duration-300 ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
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
          <div className="flex h-80 items-center justify-center text-sm text-white/40">Loading…</div>
        )}

        {!loading && failed && (
          <div className="flex h-80 items-center justify-center text-sm text-white/40">
            Couldn't load details for this title.
          </div>
        )}

        {!loading && !failed && details && (
          <>
            <div className="relative h-48 w-full bg-[#1c1c22]">
              {details.backdropPath && (
                <img
                  src={`${BACKDROP_IMAGE_BASE}${details.backdropPath}`}
                  alt=""
                  className="h-full w-full object-cover"
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-[#141418] via-[#141418]/30 to-transparent" />
            </div>

            <div className="relative -mt-20 flex gap-5 px-6">
              <img
                src={details.posterPath ? posterUrl(details.posterPath) : ''}
                alt=""
                className="h-52 w-[136px] shrink-0 rounded-lg bg-[#1c1c22] object-cover shadow-[0_10px_30px_rgba(0,0,0,0.6)] ring-1 ring-white/10"
              />

              <div className="min-w-0 flex-1 self-end pb-1">
                <h2 className="text-xl font-semibold leading-tight text-white">{details.title}</h2>
                {details.tagline && (
                  <p className="mt-1 text-sm italic text-white/40">{details.tagline}</p>
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

              {details.genres.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-1.5">
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
      </div>
    </div>
  )
}
