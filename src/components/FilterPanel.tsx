import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { fetchGenres, type Genre } from '../lib/tmdb'
import type { FeedFilters } from '../hooks/usePosterFeed'
import { DEFAULT_FILTERS } from '../hooks/usePosterFeed'

const PANEL_SPRING = { type: 'spring', stiffness: 420, damping: 36, mass: 0.8 } as const

interface FilterPanelProps {
  filters: FeedFilters
  onChange: (next: FeedFilters) => void
  open: boolean
  onClose: () => void
}

const SORT_OPTIONS: { value: FeedFilters['sortBy']; label: string }[] = [
  { value: 'popularity.desc', label: 'Popular' },
  { value: 'vote_average.desc', label: 'Top rated' },
  { value: 'primary_release_date.desc', label: 'Newest' },
]

export default function FilterPanel({ filters, onChange, open, onClose }: FilterPanelProps) {
  const [movieGenres, setMovieGenres] = useState<Genre[]>([])
  const [tvGenres, setTvGenres] = useState<Genre[]>([])

  useEffect(() => {
    fetchGenres('movie').then(setMovieGenres).catch(() => {})
    fetchGenres('tv').then(setTvGenres).catch(() => {})
  }, [])

  const genreOptions = filters.mediaType === 'tv' ? tvGenres : movieGenres

  const toggleGenre = (id: number) => {
    const genreIds = filters.genreIds.includes(id)
      ? filters.genreIds.filter((g) => g !== id)
      : [...filters.genreIds, id]
    onChange({ ...filters, genreIds })
  }

  const setSortBy = (sortBy: FeedFilters['sortBy']) => {
    onChange({ ...filters, sortBy })
  }

  const isDefault =
    filters.mediaType === 'all' && filters.genreIds.length === 0 && filters.sortBy === 'popularity.desc'

  return (
    <div
      className={`fixed left-1/2 z-10 w-full max-w-3xl -translate-x-1/2 px-4 ${open ? '' : 'pointer-events-none'}`}
      // Stays clear of ZoomControls (which sits right below it) plus a real
      // safe-area allowance on notched/gesture-bar phones — see the same
      // pattern in ZoomControls.tsx for why calc()+env() rather than a
      // fixed Tailwind bottom-* value.
      style={{ bottom: 'calc(6rem + env(safe-area-inset-bottom, 0px))' }}
      aria-hidden={!open}
    >
      <motion.div
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          scale: open ? 1 : 0.94,
          y: open ? 0 : 16,
          filter: open ? 'blur(0px)' : 'blur(6px)',
        }}
        transition={PANEL_SPRING}
        style={{ transformOrigin: 'bottom center', willChange: 'transform, opacity, filter' }}
        className="glass-panel flex flex-col gap-2 rounded-2xl px-4 py-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-white/5 p-1">
            {SORT_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setSortBy(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filters.sortBy === opt.value
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {!isDefault && (
            <button
              type="button"
              onClick={() => onChange(DEFAULT_FILTERS)}
              className="ml-auto rounded-full px-3 py-1 text-xs text-white/40 hover:text-white"
            >
              Reset
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            aria-label="Close filters"
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white/50 transition-colors hover:bg-white/10 hover:text-white ${
              isDefault ? 'ml-auto' : ''
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>

        {genreOptions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-white/5 pt-2">
            {genreOptions.map((genre) => {
              const active = filters.genreIds.includes(genre.id)
              return (
                <button
                  key={genre.id}
                  type="button"
                  onClick={() => toggleGenre(genre.id)}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${
                    active
                      ? 'bg-white text-black'
                      : 'bg-white/5 text-white/50 hover:bg-white/10 hover:text-white/80'
                  }`}
                >
                  {genre.name}
                </button>
              )
            })}
          </div>
        )}
      </motion.div>
    </div>
  )
}
