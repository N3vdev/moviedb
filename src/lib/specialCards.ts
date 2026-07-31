import { COLUMNS, ROWS, CELL_WIDTH, CELL_HEIGHT } from './gridConfig'

// A handful of personal "easter egg" cards — not real titles, so they're
// never part of the TMDB-driven streaming feed and never occupy a cell
// during normal browsing. Each has a fixed, deterministic spot in world
// space (so repeated searches land in the same place), but that spot only
// ever renders anything while it's actively "summoned" via search.
export interface SpecialCard {
  id: string
  name: string
  cardImage: string
  popupBackground?: string
  videoSrc?: string
  tags?: string[]
  description?: string
  videoDescription?: string
}

const IMG_BASE = `${import.meta.env.BASE_URL}img`

export const SPECIAL_CARDS: SpecialCard[] = [
  {
    id: 'nevin',
    name: 'Nevin',
    cardImage: `${IMG_BASE}/Nevin-2.png`,
    popupBackground: `${IMG_BASE}/Nevin-1.jpeg`,
    description: "yea that's me",
  },
  {
    id: 'srii',
    name: 'Srii',
    cardImage: `${IMG_BASE}/srii.png`,
    videoSrc: `${IMG_BASE}/srii-meme.mp4`,
    tags: ['💅 Chad', '😼 Man Hater'],
    description:
      "Known for being the friend everyone wants and the last person you'd ever want to argue with. Some stories sound too unbelievable to be true, this isn't one of them.\n\nBased on real-life events. She might break your bones. Men, consider this your only warning 💀",
    videoDescription: '😭😭😭😭😭😭😭😭😭😭😭😭😭😭😭😭😭😭😭😭',
  },
  {
    id: 'joel',
    name: 'Joel',
    cardImage: `${IMG_BASE}/Joel.png`,
    tags: ['BKL'],
    description:
      "Nobody knows what he's doing. Not even him.\nSomehow, he keeps moving forward, convinced there's a staircase to success waiting around the next corner. Loyal to the end—but if a fight breaks out, he'll be supporting you from a very safe distance 😭",
  },
]

// Only matches when the query is explicitly hash-tagged (e.g. "#nevin") —
// a plain search for "Srii" should never surface this, only someone who
// already knows the tag.
export function searchSpecialCards(query: string): SpecialCard[] {
  const trimmed = query.trim()
  if (!trimmed.startsWith('#')) return []
  const q = trimmed.slice(1).trim().toLowerCase()
  if (!q) return []
  return SPECIAL_CARDS.filter((c) => c.name.toLowerCase().includes(q))
}

function hashStringToCell(str: string): number {
  let h = 0x9e3779b1
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 0x45d9f3b1)
  }
  h ^= h >>> 16
  return Math.abs(h) % (COLUMNS * ROWS)
}

export function getSpecialCardPosition(card: SpecialCard): { left: number; top: number } {
  const cellId = hashStringToCell(card.id)
  const row = Math.floor(cellId / COLUMNS)
  const col = cellId % COLUMNS
  return { left: col * CELL_WIDTH, top: row * CELL_HEIGHT }
}
