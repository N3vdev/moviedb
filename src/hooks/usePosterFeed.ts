import { useCallback, useEffect, useRef, useState } from 'react'
import { fetchDiscover, fetchPopular, fetchTrending, type TmdbItem } from '../lib/tmdb'
import { CELL_WIDTH, CELL_HEIGHT, COLUMNS, TOTAL_CARDS } from '../lib/gridConfig'

export interface CellAssignment {
  tmdbId: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string
}

export interface FeedFilters {
  mediaType: 'all' | 'movie' | 'tv'
  genreIds: number[]
  sortBy: 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc'
}

export const DEFAULT_FILTERS: FeedFilters = {
  mediaType: 'all',
  genreIds: [],
  sortBy: 'popularity.desc',
}

function isDefaultFilters(f: FeedFilters): boolean {
  return f.mediaType === 'all' && f.genreIds.length === 0 && f.sortBy === 'popularity.desc'
}

function filtersKeyOf(f: FeedFilters): string {
  return `${f.mediaType}|${[...f.genreIds].sort((a, b) => a - b).join(',')}|${f.sortBy}`
}

type SourceKind = 'trending' | 'movie' | 'tv'
interface PageSpec {
  kind: SourceKind
  page: number
  filters: FeedFilters
}

const PAGE_SIZE = 20
const PARALLEL_REQUESTS = 8
const MAX_ROUNDS_PER_CALL = 6

// Deterministic so the same title always lands on the same cell — lets
// search-and-focus place a specific movie without disturbing the lazy
// background stream, and repeated searches for it land in the same spot.
function hashToCell(id: number, mediaType: string): number {
  let h = mediaType === 'movie' ? 0x9e3779b1 : 0x85ebca6b
  h = Math.imul(h ^ id, 0x45d9f3b1)
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b1)
  h ^= h >>> 16
  return Math.abs(h) % TOTAL_CARDS
}

// Streams movies/series onto grid cells as they're requested (i.e. as they
// scroll into view), rather than fetching the whole catalog up front. With
// default filters, the pool starts with today's trending titles — in
// reading order that means the very first cell ever requested gets the #1
// trending title — then rotates through popular movies/TV. When filters
// are customized, it pulls from /discover with those constraints instead.
export function usePosterFeed(filters: FeedFilters) {
  const [assignments, setAssignments] = useState<Map<number, CellAssignment>>(new Map())
  const assignedCellsRef = useRef<Set<number>>(new Set())
  const pendingCellsRef = useRef<Set<number>>(new Set())
  const poolRef = useRef<TmdbItem[]>([])
  // Remembers whatever was actually shown on each cell while browsing the
  // unfiltered "Home" view. Narrowing to Movies/TV only hides the
  // non-matching cells (see onlyMediaTypeChanged below) rather than
  // discarding this, so widening back to "all" can restore the exact
  // original mix from cache — instant, no network — instead of leaving
  // whatever the narrower filter happened to backfill those cells with.
  const homeSnapshotRef = useRef<Map<number, CellAssignment>>(new Map())
  const seenIdsRef = useRef<Set<string>>(new Set())
  const sourceRef = useRef<SourceKind>('trending')
  const pageRef = useRef(1)
  const isFetchingRef = useRef(false)
  const filtersRef = useRef(filters)
  filtersRef.current = filters

  // Bumped on every real filter change. A fetch round captures this at
  // reservation time and checks it again after its network call resolves —
  // if it moved on, that round's results came from stale (pre-change)
  // filters and get discarded instead of contaminating the new pool.
  const generationRef = useRef(0)

  const filtersKey = filtersKeyOf(filters)
  const prevFiltersKeyRef = useRef(filtersKey)
  const prevFiltersRef = useRef(filters)

  // Filters changed (not just re-rendered with an equal object). A pure
  // media-type narrowing/widening (e.g. the nav bar's Home/Movies/TV tabs,
  // with genre/sort untouched) doesn't invalidate everything — a card
  // already showing a movie is still correct when switching to "Movies",
  // so only cells that no longer match get cleared and the rest keep
  // showing instantly instead of flashing blank and re-fetching from
  // scratch. Genre/sort changes really do invalidate everything, since
  // "top rated" vs "popular" (etc.) can surface entirely different titles
  // even within the same media type.
  useEffect(() => {
    if (prevFiltersKeyRef.current === filtersKey) return
    const prevFilters = prevFiltersRef.current
    prevFiltersKeyRef.current = filtersKey
    prevFiltersRef.current = filters

    generationRef.current += 1

    const sameGenres =
      prevFilters.genreIds.length === filters.genreIds.length &&
      prevFilters.genreIds.every((g) => filters.genreIds.includes(g))
    const onlyMediaTypeChanged =
      sameGenres && prevFilters.sortBy === filters.sortBy && prevFilters.mediaType !== filters.mediaType

    if (onlyMediaTypeChanged) {
      const stillValid = (mt: 'movie' | 'tv') => filters.mediaType === 'all' || filters.mediaType === mt

      // Mutate assignedCellsRef synchronously here (not inside the
      // setAssignments updater, which only runs on a later render) — the
      // effect below that decides what to fetch runs in this same commit
      // and needs the ref already pruned, or it computes zero cells as
      // needing a refetch and nothing ever gets requested.
      const next = new Map<number, CellAssignment>()
      for (const [cellId, assignment] of assignments) {
        if (stillValid(assignment.mediaType)) {
          next.set(cellId, assignment)
        } else {
          assignedCellsRef.current.delete(cellId)
        }
      }

      // Widening back to "Home" — bring back whatever was actually there
      // before narrowing (e.g. the TV cards that Movies had hidden),
      // instead of leaving the narrower filter's content in place. Pure
      // cache restore: no network call, so this is instant regardless of
      // how much of the grid needs to flip back.
      if (filters.mediaType === 'all') {
        for (const [cellId, homeAssignment] of homeSnapshotRef.current) {
          const current = next.get(cellId)
          if (
            !current ||
            current.tmdbId !== homeAssignment.tmdbId ||
            current.mediaType !== homeAssignment.mediaType
          ) {
            next.set(cellId, homeAssignment)
            assignedCellsRef.current.add(cellId)
          }
        }
      }

      setAssignments(next)
      poolRef.current = poolRef.current.filter((item) => stillValid(item.mediaType))
      pendingCellsRef.current = new Set()
      pageRef.current = 1
      sourceRef.current = isDefaultFilters(filters)
        ? 'trending'
        : filters.mediaType === 'tv'
          ? 'tv'
          : 'movie'
    } else {
      poolRef.current = []
      pendingCellsRef.current = new Set()
      assignedCellsRef.current = new Set()
      seenIdsRef.current = new Set()
      homeSnapshotRef.current = new Map()
      pageRef.current = 1
      sourceRef.current = isDefaultFilters(filters)
        ? 'trending'
        : filters.mediaType === 'tv'
          ? 'tv'
          : 'movie'
      setAssignments(new Map())
    }
  }, [filtersKey, filters, assignments])

  const assignFromPool = useCallback(() => {
    if (poolRef.current.length === 0 || pendingCellsRef.current.size === 0) return

    const newlyAssigned: [number, CellAssignment][] = []
    const recordHome = isDefaultFilters(filtersRef.current)
    for (const cellId of pendingCellsRef.current) {
      if (poolRef.current.length === 0) break
      const item = poolRef.current.shift()!
      assignedCellsRef.current.add(cellId)
      pendingCellsRef.current.delete(cellId)
      const assignment = { tmdbId: item.id, mediaType: item.mediaType, title: item.title, posterPath: item.posterPath }
      newlyAssigned.push([cellId, assignment])
      if (recordHome) homeSnapshotRef.current.set(cellId, assignment)
    }

    if (newlyAssigned.length > 0) {
      setAssignments((prev) => {
        const next = new Map(prev)
        for (const [cellId, assignment] of newlyAssigned) next.set(cellId, assignment)
        return next
      })
    }
  }, [])

  // Synchronously reserves the next N page specs so parallel requests never
  // race on sourceRef/pageRef or fetch the same page twice.
  const reservePageSpecs = useCallback((count: number): PageSpec[] => {
    const specs: PageSpec[] = []
    const current = filtersRef.current
    const rotates = isDefaultFilters(current) || current.mediaType === 'all'

    for (let i = 0; i < count; i++) {
      specs.push({ kind: sourceRef.current, page: pageRef.current, filters: current })
      pageRef.current += 1
      const maxPage = sourceRef.current === 'trending' ? 20 : 500
      if (pageRef.current > maxPage) {
        pageRef.current = 1
        if (rotates) {
          sourceRef.current = sourceRef.current === 'movie' ? 'tv' : 'movie'
        }
      }
    }
    return specs
  }, [])

  const fetchPage = useCallback(async (spec: PageSpec): Promise<TmdbItem[]> => {
    if (spec.kind === 'trending') return fetchTrending(spec.page)
    if (isDefaultFilters(spec.filters)) return fetchPopular(spec.kind, spec.page)
    return fetchDiscover(spec.kind, spec.page, {
      genreIds: spec.filters.genreIds,
      sortBy: spec.filters.sortBy,
    })
  }, [])

  // Fetches parallel batches of pages until there's enough pool to cover
  // everything currently pending. Self-continues via `run` if a low zoom
  // level's demand outlasts a single call and the viewport has since gone
  // idle (so nothing else would re-trigger a fetch).
  const fetchMore = useCallback(async function run(): Promise<void> {
    if (isFetchingRef.current) return
    isFetchingRef.current = true
    try {
      let rounds = 0
      while (
        pendingCellsRef.current.size > poolRef.current.length &&
        rounds < MAX_ROUNDS_PER_CALL
      ) {
        rounds += 1
        const roundGeneration = generationRef.current
        const deficit = pendingCellsRef.current.size - poolRef.current.length
        const pagesNeeded = Math.min(Math.ceil(deficit / PAGE_SIZE), PARALLEL_REQUESTS)
        const specs = reservePageSpecs(pagesNeeded)

        const results = await Promise.allSettled(specs.map(fetchPage))

        // Filters changed while this batch was in flight — its results are
        // from the old query, so drop them and let the next iteration
        // (which reads live refs) pick up fresh specs under the new filters.
        if (generationRef.current !== roundGeneration) continue

        for (const result of results) {
          if (result.status !== 'fulfilled') continue
          const fresh = result.value.filter((item) => {
            const key = `${item.mediaType}-${item.id}`
            if (seenIdsRef.current.has(key)) return false
            seenIdsRef.current.add(key)
            return true
          })
          poolRef.current.push(...fresh)
        }
        assignFromPool()
      }
    } finally {
      isFetchingRef.current = false
    }

    if (pendingCellsRef.current.size > poolRef.current.length) {
      setTimeout(run, 50)
    }
  }, [assignFromPool, reservePageSpecs, fetchPage])

  // `cellIds` is always "everything currently visible (plus buffer)" — the
  // full demand list, not an increment. Pending is replaced (not merged)
  // each call so cells that scrolled out of view stop competing with what's
  // on screen right now. Callers should list strictly-visible cells before
  // buffer-only cells — pool assignment serves pendingCellsRef in insertion
  // order, so what's actually on screen gets images before the margin does.
  const ensureCells = useCallback((cellIds: number[]) => {
    const stillPending = new Set<number>()
    for (const id of cellIds) {
      if (!assignedCellsRef.current.has(id)) stillPending.add(id)
    }
    pendingCellsRef.current = stillPending

    assignFromPool()
    if (pendingCellsRef.current.size > poolRef.current.length) {
      fetchMore()
    }
  }, [assignFromPool, fetchMore])

  // Places a specific (searched) title at a deterministic cell — pinning it
  // in assignedCellsRef so the background stream never overwrites it — and
  // returns where that cell lives in world space so the canvas can pan to it.
  const focusMovie = useCallback((item: TmdbItem) => {
    const cellId = hashToCell(item.id, item.mediaType)
    assignedCellsRef.current.add(cellId)
    pendingCellsRef.current.delete(cellId)
    const assignment = {
      tmdbId: item.id,
      mediaType: item.mediaType,
      title: item.title,
      posterPath: item.posterPath,
    }
    if (isDefaultFilters(filtersRef.current)) homeSnapshotRef.current.set(cellId, assignment)
    setAssignments((prev) => {
      const next = new Map(prev)
      next.set(cellId, assignment)
      return next
    })
    const row = Math.floor(cellId / COLUMNS)
    const col = cellId % COLUMNS
    return { cellId, left: col * CELL_WIDTH, top: row * CELL_HEIGHT }
  }, [])

  return { assignments, ensureCells, focusMovie }
}
