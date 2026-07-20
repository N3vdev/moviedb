import { useEffect, useState } from 'react'
import { fetchGenres, type Genre } from '../lib/tmdb'
import type { FeedFilters } from '../hooks/usePosterFeed'
import { DEFAULT_FILTERS } from '../hooks/usePosterFeed'

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

  const setMediaType = (mediaType: FeedFilters['mediaType']) => {
    onChange({ ...filters, mediaType, genreIds: [] })
  }

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
      className={`fixed bottom-6 left-1/2 z-10 w-full max-w-3xl -translate-x-1/2 px-4 transition-all duration-300 ease-out ${
        open
          ? 'translate-y-0 opacity-100'
          : 'pointer-events-none translate-y-4 opacity-0'
      }`}
      aria-hidden={!open}
    >
      <div className="flex flex-col gap-2 rounded-2xl bg-[#1c1c22]/90 px-4 py-3 shadow-[0_8px_30px_rgba(0,0,0,0.6)] ring-1 ring-white/10 backdrop-blur-md">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-full bg-white/5 p-1">
            {(['all', 'movie', 'tv'] as const).map((type) => (
              <button
                key={type}
                type="button"
                onClick={() => setMediaType(type)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                  filters.mediaType === type
                    ? 'bg-white/15 text-white'
                    : 'text-white/50 hover:text-white'
                }`}
              >
                {type === 'all' ? 'All' : type === 'movie' ? 'Movies' : 'Series'}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-white/10" />

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
      </div>
    </div>
  )
}
