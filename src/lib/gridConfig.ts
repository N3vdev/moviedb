// Movie-poster aspect ratio (2:3) grid laid out across a large virtual world.
// Only cards inside the viewport are ever mounted (see Canvas.tsx), so this
// can scale up to a "world's worth" of posters without a performance hit.
export const CARD_WIDTH = 180
export const CARD_HEIGHT = 270
export const GAP = 28

// Sized to represent a library on the order of "every film and series
// worldwide". Rendering cost is independent of these numbers — Canvas.tsx
// only ever mounts the cards that intersect the current viewport (see the
// colStart/colEnd/rowStart/rowEnd math there), so this scales to millions
// without a performance hit.
export const COLUMNS = 2000
export const ROWS = 2000
export const TOTAL_CARDS = COLUMNS * ROWS

export const CELL_WIDTH = CARD_WIDTH + GAP
export const CELL_HEIGHT = CARD_HEIGHT + GAP

export const WORLD_WIDTH = COLUMNS * CELL_WIDTH - GAP
export const WORLD_HEIGHT = ROWS * CELL_HEIGHT - GAP

export const MIN_SCALE = 0.3
export const MAX_SCALE = 2.5
