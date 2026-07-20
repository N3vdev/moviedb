const TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN as string | undefined
const API_BASE = 'https://api.themoviedb.org/3'
// Cards render at 180x270 CSS px — w185 matches that closely at 1x DPI and
// is roughly a third the bytes of w342, which is what was making posters
// arrive slowly enough to show the loading placeholder during fast zooms.
export const POSTER_IMAGE_BASE = 'https://image.tmdb.org/t/p/w185'

export interface TmdbItem {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  posterPath: string
  year?: string
  voteAverage?: number
  genreIds: number[]
}

export interface Genre {
  id: number
  name: string
}

interface TmdbRawResult {
  id: number
  media_type?: string
  title?: string
  name?: string
  poster_path: string | null
  release_date?: string
  first_air_date?: string
  vote_average?: number
  genre_ids?: number[]
}

async function tmdbFetch<T = { results: TmdbRawResult[] }>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      accept: 'application/json',
    },
  })
  if (!res.ok) throw new Error(`TMDB request failed: ${res.status}`)
  return res.json()
}

function mapResults(results: TmdbRawResult[], fallbackMediaType: 'movie' | 'tv'): TmdbItem[] {
  return results
    .filter((r): r is TmdbRawResult & { poster_path: string } => Boolean(r.poster_path))
    .map((r) => ({
      id: r.id,
      mediaType: (r.media_type as 'movie' | 'tv' | undefined) ?? fallbackMediaType,
      title: r.title ?? r.name ?? 'Untitled',
      posterPath: r.poster_path,
      year: (r.release_date ?? r.first_air_date ?? '').slice(0, 4) || undefined,
      voteAverage: r.vote_average,
      genreIds: r.genre_ids ?? [],
    }))
}

export async function fetchTrending(page: number): Promise<TmdbItem[]> {
  const data = await tmdbFetch(`/trending/all/day?page=${page}`)
  return mapResults(data.results, 'movie')
}

export async function fetchPopular(kind: 'movie' | 'tv', page: number): Promise<TmdbItem[]> {
  const data = await tmdbFetch(`/${kind}/popular?page=${page}`)
  return mapResults(data.results, kind)
}

export interface DiscoverFilters {
  genreIds?: number[]
  sortBy?: string
  minRating?: number
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export async function fetchDiscover(
  kind: 'movie' | 'tv',
  page: number,
  filters: DiscoverFilters = {},
): Promise<TmdbItem[]> {
  const qs = new URLSearchParams({ page: String(page) })
  if (filters.genreIds?.length) qs.set('with_genres', filters.genreIds.join(','))
  if (filters.minRating) qs.set('vote_average.gte', String(filters.minRating))

  if (filters.sortBy === 'primary_release_date.desc') {
    // "Newest" should surface recent-or-upcoming titles that are actually
    // relevant, not just whatever has the latest date stamp — TMDB has a
    // long tail of obscure/unreleased entries with near-zero popularity
    // that a pure chronological sort would otherwise put first. Sorting by
    // popularity within a rolling release-date window (recent past through
    // the next few months) surfaces what's actually buzzy right now or
    // about to drop, which is what "newest" means in practice.
    qs.set('sort_by', 'popularity.desc')
    const dateField = kind === 'tv' ? 'first_air_date' : 'primary_release_date'
    const now = new Date()
    const from = new Date(now)
    from.setMonth(from.getMonth() - 4)
    const to = new Date(now)
    to.setMonth(to.getMonth() + 3)
    qs.set(`${dateField}.gte`, isoDate(from))
    qs.set(`${dateField}.lte`, isoDate(to))
  } else if (filters.sortBy === 'vote_average.desc') {
    // Sorting by rating alone surfaces obscure titles with a handful of
    // 10/10 votes (a known TMDB quirk) — floor the vote count so "top
    // rated" means widely-seen and well-regarded, not just lucky.
    qs.set('sort_by', 'vote_average.desc')
    qs.set('vote_count.gte', String(Math.max(filters.minRating ? 50 : 300, 50)))
  } else {
    qs.set('sort_by', filters.sortBy ?? 'popularity.desc')
    if (filters.minRating) qs.set('vote_count.gte', '50')
  }

  const data = await tmdbFetch(`/discover/${kind}?${qs.toString()}`)
  return mapResults(data.results, kind)
}

export async function fetchGenres(kind: 'movie' | 'tv'): Promise<Genre[]> {
  const data = await tmdbFetch<{ genres: Genre[] }>(`/genre/${kind}/list`)
  return data.genres ?? []
}

export async function searchTitles(query: string): Promise<TmdbItem[]> {
  const qs = new URLSearchParams({ query, include_adult: 'false' })
  const data = await tmdbFetch(`/search/multi?${qs.toString()}`)
  const onlyTitles = data.results.filter((r) => r.media_type === 'movie' || r.media_type === 'tv')
  return mapResults(onlyTitles, 'movie')
}

export const BACKDROP_IMAGE_BASE = 'https://image.tmdb.org/t/p/w780'

export interface MovieDetails {
  id: number
  mediaType: 'movie' | 'tv'
  title: string
  tagline?: string
  overview: string
  posterPath: string | null
  backdropPath: string | null
  year?: string
  runtimeMinutes?: number
  voteAverage?: number
  voteCount?: number
  genres: string[]
}

interface TmdbDetailsRaw {
  id: number
  title?: string
  name?: string
  tagline?: string
  overview?: string
  poster_path: string | null
  backdrop_path: string | null
  release_date?: string
  first_air_date?: string
  runtime?: number
  episode_run_time?: number[]
  vote_average?: number
  vote_count?: number
  genres?: { id: number; name: string }[]
}

export async function fetchMovieDetails(mediaType: 'movie' | 'tv', id: number): Promise<MovieDetails> {
  const data = await tmdbFetch<TmdbDetailsRaw>(`/${mediaType}/${id}`)
  return {
    id: data.id,
    mediaType,
    title: data.title ?? data.name ?? 'Untitled',
    tagline: data.tagline || undefined,
    overview: data.overview ?? '',
    posterPath: data.poster_path,
    backdropPath: data.backdrop_path,
    year: (data.release_date ?? data.first_air_date ?? '').slice(0, 4) || undefined,
    runtimeMinutes: data.runtime || data.episode_run_time?.[0],
    voteAverage: data.vote_average,
    voteCount: data.vote_count,
    genres: (data.genres ?? []).map((g) => g.name),
  }
}

export function posterUrl(posterPath: string): string {
  return `${POSTER_IMAGE_BASE}${posterPath}`
}
