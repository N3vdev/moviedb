import { useEffect, useRef, useState } from 'react'
import { posterUrl, searchTitles, type TmdbItem } from '../lib/tmdb'
import { searchSpecialCards, type SpecialCard } from '../lib/specialCards'

interface SearchBarProps {
  open: boolean
  onClose: () => void
  onSelect: (item: TmdbItem) => void
  onSelectSpecial: (card: SpecialCard) => void
}

interface AdvancedFilters {
  mediaType: 'all' | 'movie' | 'tv'
  yearMin: string
  yearMax: string
  minRating: string
}

type SearchResultItem =
  | { kind: 'tmdb'; data: TmdbItem }
  | { kind: 'special'; data: SpecialCard }

const EMPTY_ADVANCED: AdvancedFilters = { mediaType: 'all', yearMin: '', yearMax: '', minRating: '' }

function applyAdvancedFilters(items: TmdbItem[], adv: AdvancedFilters): TmdbItem[] {
  return items.filter((item) => {
    if (adv.mediaType !== 'all' && item.mediaType !== adv.mediaType) return false
    if (adv.yearMin && (!item.year || Number(item.year) < Number(adv.yearMin))) return false
    if (adv.yearMax && (!item.year || Number(item.year) > Number(adv.yearMax))) return false
    if (adv.minRating && (item.voteAverage ?? 0) < Number(adv.minRating)) return false
    return true
  })
}

export default function SearchBar({ open, onClose, onSelect, onSelectSpecial }: SearchBarProps) {
  const [query, setQuery] = useState('')
  const [rawResults, setRawResults] = useState<TmdbItem[]>([])
  const [resultsOpen, setResultsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [advanced, setAdvanced] = useState<AdvancedFilters>(EMPTY_ADVANCED)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const requestIdRef = useRef(0)

  // Reset to a clean slate whenever the panel closes, and focus the input
  // the moment it opens.
  useEffect(() => {
    if (open) {
      inputRef.current?.focus()
    } else {
      setQuery('')
      setRawResults([])
      setResultsOpen(false)
      setAdvancedOpen(false)
    }
  }, [open])

  useEffect(() => {
    const trimmed = query.trim()
    if (debounceRef.current) clearTimeout(debounceRef.current)
    if (!trimmed) {
      setRawResults([])
      setResultsOpen(false)
      setLoading(false)
      return
    }
    // Open right away — the (instant, local-only) special-card matches
    // can show immediately without waiting on the TMDB round trip.
    setResultsOpen(true)
    setLoading(true)
    const thisRequest = ++requestIdRef.current
    debounceRef.current = setTimeout(() => {
      searchTitles(trimmed)
        .then((items) => {
          if (requestIdRef.current !== thisRequest) return
          setRawResults(items)
        })
        .catch(() => {
          if (requestIdRef.current !== thisRequest) return
          setRawResults([])
        })
        .finally(() => {
          if (requestIdRef.current !== thisRequest) return
          setLoading(false)
        })
    }, 300)
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [query])

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose()
      }
    }
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('keydown', handleKey)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('keydown', handleKey)
    }
  }, [open, onClose])

  const specialMatches: SearchResultItem[] = searchSpecialCards(query).map((data) => ({ kind: 'special', data }))
  const tmdbMatches: SearchResultItem[] = applyAdvancedFilters(rawResults, advanced).map((data) => ({ kind: 'tmdb', data }))
  const results = [...specialMatches, ...tmdbMatches].slice(0, 8)
  const hasActiveAdvanced =
    advanced.mediaType !== 'all' || advanced.yearMin || advanced.yearMax || advanced.minRating

  const handleSelect = (item: TmdbItem) => {
    onSelect(item)
    onClose()
  }

  const handleSelectSpecial = (card: SpecialCard) => {
    onSelectSpecial(card)
    onClose()
  }

  return (
    <div
      ref={containerRef}
      className={`fixed left-1/2 top-24 z-20 w-full max-w-lg -translate-x-1/2 px-4 transition-all duration-200 ease-out ${
        open ? 'translate-y-0 opacity-100' : 'pointer-events-none -translate-y-2 opacity-0'
      }`}
      aria-hidden={!open}
    >
      <div className="relative">
        <div className="glass-panel flex items-center gap-1 rounded-2xl px-2 py-2 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
          <svg viewBox="0 0 24 24" className="ml-2 h-4 w-4 shrink-0 text-white/40" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => (rawResults.length > 0 || query.trim()) && setResultsOpen(true)}
            placeholder="Search any movie or series…"
            className="min-w-0 flex-1 bg-transparent px-1 py-1.5 text-sm text-white placeholder:text-white/35 focus:outline-none"
          />
          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            aria-label="Advanced filters"
            aria-pressed={advancedOpen}
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors ${
              advancedOpen || hasActiveAdvanced
                ? 'bg-white/15 text-white'
                : 'text-white/50 hover:bg-white/10 hover:text-white'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 6h16M7 12h10M10 18h4" />
            </svg>
          </button>
        </div>

        {advancedOpen && (
          <div className="glass-panel mt-2 rounded-xl p-3 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/35">
              Complex filter mode
            </div>
            <div className="flex flex-wrap gap-2">
              <select
                value={advanced.mediaType}
                onChange={(e) => setAdvanced((a) => ({ ...a, mediaType: e.target.value as AdvancedFilters['mediaType'] }))}
                className="rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80 ring-1 ring-white/10 focus:outline-none"
              >
                <option value="all">All types</option>
                <option value="movie">Movies</option>
                <option value="tv">Series</option>
              </select>
              <input
                type="number"
                inputMode="numeric"
                placeholder="Year from"
                value={advanced.yearMin}
                onChange={(e) => setAdvanced((a) => ({ ...a, yearMin: e.target.value }))}
                className="w-24 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80 placeholder:text-white/30 ring-1 ring-white/10 focus:outline-none"
              />
              <input
                type="number"
                inputMode="numeric"
                placeholder="Year to"
                value={advanced.yearMax}
                onChange={(e) => setAdvanced((a) => ({ ...a, yearMax: e.target.value }))}
                className="w-24 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80 placeholder:text-white/30 ring-1 ring-white/10 focus:outline-none"
              />
              <input
                type="number"
                inputMode="decimal"
                min={0}
                max={10}
                placeholder="Min rating"
                value={advanced.minRating}
                onChange={(e) => setAdvanced((a) => ({ ...a, minRating: e.target.value }))}
                className="w-24 rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white/80 placeholder:text-white/30 ring-1 ring-white/10 focus:outline-none"
              />
              {hasActiveAdvanced && (
                <button
                  type="button"
                  onClick={() => setAdvanced(EMPTY_ADVANCED)}
                  className="rounded-lg px-2 py-1.5 text-xs text-white/50 hover:text-white"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        )}

        {resultsOpen && (
          <div className="glass-panel mt-2 max-h-96 overflow-y-auto rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            {results.length === 0 && !loading && (
              <div className="px-4 py-3 text-xs text-white/40">No matches found</div>
            )}
            {results.map((r) =>
              r.kind === 'special' ? (
                <button
                  key={`special-${r.data.id}`}
                  type="button"
                  onClick={() => handleSelectSpecial(r.data)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/10"
                >
                  <img src={r.data.cardImage} alt="" className="h-12 w-8 shrink-0 rounded object-cover" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/90">{r.data.name}</div>
                    <div className="text-xs text-white/40">&nbsp;</div>
                  </div>
                </button>
              ) : (
                <button
                  key={`${r.data.mediaType}-${r.data.id}`}
                  type="button"
                  onClick={() => handleSelect(r.data)}
                  className="flex w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-white/10"
                >
                  <img
                    src={posterUrl(r.data.posterPath)}
                    alt=""
                    className="h-12 w-8 shrink-0 rounded object-cover"
                  />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-white/90">{r.data.title}</div>
                    <div className="text-xs text-white/40">
                      {r.data.year ?? '—'} · {r.data.mediaType === 'tv' ? 'Series' : 'Movie'}
                      {r.data.voteAverage ? ` · ★ ${r.data.voteAverage.toFixed(1)}` : ''}
                    </div>
                  </div>
                </button>
              ),
            )}
            {loading && (
              <div className="px-4 py-2 text-[11px] text-white/30">Searching…</div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
