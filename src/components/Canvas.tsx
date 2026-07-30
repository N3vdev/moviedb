import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import PosterCard from './PosterCard'
import Header from './Header'
import ZoomControls from './ZoomControls'
import SearchBar from './SearchBar'
import NavBar from './NavBar'
import GlassRipple, { type RippleTrigger } from './GlassRipple'
import SpaceBackdrop, { SpaceVeil, type SpaceBackdropHandle } from './SpaceBackdrop'
import FilterPanel from './FilterPanel'
import MovieDetailModal, { type SelectedMovie } from './MovieDetailModal'
import SpecialCardModal from './SpecialCardModal'
import AboutModal from './AboutModal'
import { getSpecialCardPosition, type SpecialCard } from '../lib/specialCards'
import { usePosterFeed, DEFAULT_FILTERS, type FeedFilters } from '../hooks/usePosterFeed'
import { posterUrl, type TmdbItem } from '../lib/tmdb'
import {
  CARD_WIDTH,
  CARD_HEIGHT,
  CELL_WIDTH,
  CELL_HEIGHT,
  COLUMNS,
  ROWS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MIN_SCALE,
  MAX_SCALE,
} from '../lib/gridConfig'

const FOCUS_SCALE = 1.15
const FOCUS_HIGHLIGHT_MS = 2600
const FOCUS_PAN_DURATION_MS = 1200
const TAP_MOVE_THRESHOLD = 6
// Matches Tailwind's `sm` breakpoint, used elsewhere for the same mobile/
// desktop split (e.g. Header's logo visibility).
const MOBILE_BREAKPOINT = 640
const MOBILE_DEFAULT_SCALE = 0.9
const defaultScaleFor = (width: number) => (width < MOBILE_BREAKPOINT ? MOBILE_DEFAULT_SCALE : 1)

interface Transform {
  x: number
  y: number
  scale: number
}

interface Point {
  x: number
  y: number
}

const BUFFER_CELLS = 2
const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value))
const distance = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y)
const midpoint = (a: Point, b: Point) => ({
  x: (a.x + b.x) / 2,
  y: (a.y + b.y) / 2,
})

export default function Canvas() {
  const containerRef = useRef<HTMLDivElement>(null)
  const worldRef = useRef<HTMLDivElement>(null)
  const backdropRef = useRef<SpaceBackdropHandle>(null)
  const [size, setSize] = useState({ width: 0, height: 0 })
  const [isInteracting, setIsInteracting] = useState(false)

  // transformRef is the single source of truth for the world's pixel
  // position/scale. Hot-path interactions (drag, wheel, pinch, inertia)
  // write straight to the DOM on every event for 1:1 tracking with the
  // input device, completely bypassing React. renderTransform is a mirror
  // synced at most once per animation frame — it only exists to tell React
  // which cards to virtualize and what to show in the zoom-% readout, so
  // it's fine for it to lag a frame behind.
  const transformRef = useRef<Transform>({ x: 0, y: 0, scale: 1 })
  const [renderTransform, setRenderTransform] = useState<Transform>({ x: 0, y: 0, scale: 1 })
  const syncScheduled = useRef(false)

  const pointers = useRef(new Map<number, Point>())
  const dragLast = useRef<Point | null>(null)
  const dragDistanceRef = useRef(0)
  const pinch = useRef<{ lastDist: number; lastMid: Point } | null>(null)
  const velocity = useRef<Point>({ x: 0, y: 0 })
  const lastMoveTime = useRef(0)
  const rafId = useRef<number | null>(null)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCentered = useRef(false)
  const pressedDirectionsRef = useRef(new Set<'up' | 'down' | 'left' | 'right'>())
  const keyPanRafId = useRef<number | null>(null)

  const [filters, setFilters] = useState<FeedFilters>(DEFAULT_FILTERS)
  const [filterPanelOpen, setFilterPanelOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  // Bumps every time a keystroke opens search "for" the user (see the
  // type-to-search effect below) — SearchBar seeds its query from this and
  // uses the id (not just the char) as its effect dependency, so typing the
  // same letter twice in a row still re-triggers correctly.
  const [searchSeed, setSearchSeed] = useState<{ char: string; id: number } | null>(null)
  const searchSeedCounter = useRef(0)
  const [focusedCellId, setFocusedCellId] = useState<number | null>(null)
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [selectedMovie, setSelectedMovie] = useState<SelectedMovie | null>(null)
  // The special card is revealed on the canvas the instant it's summoned
  // via search, but it only opens its popup once the user taps it — and it
  // disappears again once it's actually scrolled out of the viewport
  // (tracked separately below), not just when the popup is closed.
  const [activeSpecialCard, setActiveSpecialCard] = useState<{ card: SpecialCard; left: number; top: number } | null>(null)
  const [openSpecialCard, setOpenSpecialCard] = useState<SpecialCard | null>(null)
  const [aboutOpen, setAboutOpen] = useState(false)
  const [rippleTrigger, setRippleTrigger] = useState<RippleTrigger | null>(null)
  const rippleCounter = useRef(0)

  const handleTabRipple = useCallback((origin: { x: number; y: number }) => {
    rippleCounter.current += 1
    setRippleTrigger({ x: origin.x, y: origin.y, key: rippleCounter.current })
  }, [])

  const filtersActive =
    filters.mediaType !== 'all' || filters.genreIds.length > 0 || filters.sortBy !== 'popularity.desc'

  const { assignments, ensureCells, focusMovie } = usePosterFeed(filters)

  const scheduleSync = useCallback(() => {
    if (syncScheduled.current) return
    syncScheduled.current = true
    requestAnimationFrame(() => {
      syncScheduled.current = false
      setRenderTransform(transformRef.current)
    })
  }, [])

  // Writes the transform straight to the DOM (compositor-only, no layout/
  // paint) and lazily syncs React state for virtualization/UI purposes.
  const applyTransform = useCallback((t: Transform, immediate = false) => {
    transformRef.current = t
    const el = worldRef.current
    if (el) {
      el.style.transform = `translate3d(${t.x}px, ${t.y}px, 0) scale(${t.scale})`
    }
    // Drift the starfield by a small fraction of the same pan, which is what
    // gives the canvas a sense of depth. Three compositor-only style writes —
    // cheap enough to sit directly on the drag/inertia hot path.
    backdropRef.current?.setParallax(t.x, t.y)
    if (immediate) {
      setRenderTransform(t)
    } else {
      scheduleSync()
    }
  }, [scheduleSync])

  const setInteracting = useCallback((flag: boolean, durationMs = 300) => {
    setIsInteracting(flag)
    const transition = flag ? 'none' : `transform ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`
    const el = worldRef.current
    if (el) {
      el.style.transition = transition
    }
    // Mirror it so animated pans (search focus, reset, zoom buttons) glide the
    // sky along with the world instead of snapping it.
    backdropRef.current?.setTransition(transition)
  }, [])

  useLayoutEffect(() => {
    const el = worldRef.current
    if (el) el.style.transition = 'none'
    backdropRef.current?.setTransition('none')
  }, [])

  // Track viewport size so the world can be centered and cards can be
  // virtualized against the visible bounds.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) {
        setSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        })
      }
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Center the world in the viewport once we know its size.
  useEffect(() => {
    if (hasCentered.current || size.width === 0 || size.height === 0) return
    hasCentered.current = true
    const scale = defaultScaleFor(size.width)
    applyTransform(
      {
        x: (size.width - WORLD_WIDTH * scale) / 2,
        y: (size.height - WORLD_HEIGHT * scale) / 2,
        scale,
      },
      true,
    )
  }, [size, applyTransform])

  const cancelInertia = useCallback(() => {
    if (rafId.current !== null) {
      cancelAnimationFrame(rafId.current)
      rafId.current = null
    }
  }, [])

  const startInertia = useCallback(() => {
    const step = () => {
      velocity.current.x *= 0.93
      velocity.current.y *= 0.93
      if (Math.abs(velocity.current.x) < 0.4 && Math.abs(velocity.current.y) < 0.4) {
        rafId.current = null
        setInteracting(false)
        return
      }
      const t = transformRef.current
      applyTransform({ ...t, x: t.x + velocity.current.x, y: t.y + velocity.current.y })
      rafId.current = requestAnimationFrame(step)
    }
    rafId.current = requestAnimationFrame(step)
  }, [applyTransform, setInteracting])

  const zoomAt = useCallback((clientX: number, clientY: number, factor: number) => {
    const t = transformRef.current
    const newScale = clamp(t.scale * factor, MIN_SCALE, MAX_SCALE)
    const worldX = (clientX - t.x) / t.scale
    const worldY = (clientY - t.y) / t.scale
    applyTransform({
      scale: newScale,
      x: clientX - worldX * newScale,
      y: clientY - worldY * newScale,
    })
  }, [applyTransform])

  // Same math as zoomAt, but takes an absolute target scale rather than a
  // multiplicative factor — used by the +/- buttons so each press lands
  // exactly on a clean 10% step instead of compounding a ratio.
  const zoomToScale = useCallback((clientX: number, clientY: number, targetScale: number) => {
    const t = transformRef.current
    const newScale = clamp(targetScale, MIN_SCALE, MAX_SCALE)
    const worldX = (clientX - t.x) / t.scale
    const worldY = (clientY - t.y) / t.scale
    applyTransform({
      scale: newScale,
      x: clientX - worldX * newScale,
      y: clientY - worldY * newScale,
    })
  }, [applyTransform])

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    cancelInertia()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setInteracting(true)

    if (pointers.current.size === 1) {
      dragLast.current = { x: e.clientX, y: e.clientY }
      dragDistanceRef.current = 0
      velocity.current = { x: 0, y: 0 }
      lastMoveTime.current = performance.now()
    } else if (pointers.current.size === 2) {
      dragLast.current = null
      const pts = Array.from(pointers.current.values())
      pinch.current = { lastDist: distance(pts[0], pts[1]), lastMid: midpoint(pts[0], pts[1]) }
    }
  }, [cancelInertia, setInteracting])

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2 && pinch.current) {
      const pts = Array.from(pointers.current.values())
      const dist = distance(pts[0], pts[1])
      const mid = midpoint(pts[0], pts[1])
      const factor = dist / pinch.current.lastDist
      zoomAt(mid.x, mid.y, factor)
      const t = transformRef.current
      applyTransform({
        ...t,
        x: t.x + (mid.x - pinch.current.lastMid.x),
        y: t.y + (mid.y - pinch.current.lastMid.y),
      })
      pinch.current = { lastDist: dist, lastMid: mid }
    } else if (dragLast.current && pointers.current.size === 1) {
      const dx = e.clientX - dragLast.current.x
      const dy = e.clientY - dragLast.current.y
      dragDistanceRef.current += Math.hypot(dx, dy)
      const t = transformRef.current
      applyTransform({ ...t, x: t.x + dx, y: t.y + dy })

      const now = performance.now()
      const dt = Math.max(now - lastMoveTime.current, 1)
      velocity.current = { x: (dx / dt) * 16, y: (dy / dt) * 16 }
      lastMoveTime.current = now
      dragLast.current = { x: e.clientX, y: e.clientY }
    }
  }, [zoomAt, applyTransform])

  // A card lives inside the same pointer-driven pan surface as the rest of
  // the canvas, so "click" can't be told apart from "drag" by event type
  // alone — track total movement since pointerdown and only treat it as a
  // tap if the pointer barely moved. Pointer capture (set in
  // handlePointerDown) means e.target here is still the exact card element
  // pressed, regardless of where the pointer ended up.
  const handleCardTap = useCallback((cellId: number) => {
    const assignment = assignments.get(cellId)
    if (!assignment) return
    setSelectedMovie({ id: assignment.tmdbId, mediaType: assignment.mediaType })
  }, [assignments])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    const wasSinglePointer = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    pinch.current = null

    if (pointers.current.size === 0) {
      dragLast.current = null
      if (wasSinglePointer && dragDistanceRef.current < TAP_MOVE_THRESHOLD) {
        const cardEl = (e.target as HTMLElement).closest?.('[data-card-id], [data-special-card]')
        if (cardEl?.hasAttribute('data-special-card')) {
          if (activeSpecialCard) setOpenSpecialCard(activeSpecialCard.card)
        } else {
          const cellIdAttr = cardEl?.getAttribute('data-card-id')
          if (cellIdAttr) handleCardTap(Number(cellIdAttr))
        }
      }
      startInertia()
    } else if (pointers.current.size === 1) {
      const remaining = Array.from(pointers.current.values())[0]
      dragLast.current = { x: remaining.x, y: remaining.y }
    }
  }, [startInertia, handleCardTap, activeSpecialCard])

  // Native (non-passive) wheel listener so we can preventDefault and stop
  // the page from scrolling while zooming the canvas.
  useEffect(() => {
    const el = containerRef.current
    if (!el) return

    const handleWheel = (e: WheelEvent) => {
      e.preventDefault()
      cancelInertia()
      const rect = el.getBoundingClientRect()
      const factor = Math.exp(-e.deltaY * 0.0015)
      zoomAt(e.clientX - rect.left, e.clientY - rect.top, factor)

      setInteracting(true)
      if (wheelIdleTimer.current) clearTimeout(wheelIdleTimer.current)
      wheelIdleTimer.current = setTimeout(() => setInteracting(false), 150)
    }

    el.addEventListener('wheel', handleWheel, { passive: false })
    return () => el.removeEventListener('wheel', handleWheel)
  }, [zoomAt, cancelInertia, setInteracting])

  // Arrow-key panning (holding several at once pans diagonally — e.g.
  // Up+Left for top-left) plus a "just start typing" shortcut that opens
  // search and seeds it with whatever was typed. Both skip while an actual
  // form field has focus (the search input, filter number fields) or a
  // modal is open, so normal typing/text-cursor movement is never hijacked.
  useEffect(() => {
    const ARROW_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
      ArrowUp: 'up',
      ArrowDown: 'down',
      ArrowLeft: 'left',
      ArrowRight: 'right',
    }
    const PAN_SPEED = 14 // screen px/frame; diagonals are normalized below

    const stepKeyPan = () => {
      const dirs = pressedDirectionsRef.current
      if (dirs.size === 0) {
        keyPanRafId.current = null
        setInteracting(false)
        return
      }
      let dx = 0
      let dy = 0
      if (dirs.has('left')) dx += PAN_SPEED
      if (dirs.has('right')) dx -= PAN_SPEED
      if (dirs.has('up')) dy += PAN_SPEED
      if (dirs.has('down')) dy -= PAN_SPEED
      if (dx !== 0 && dy !== 0) {
        dx *= Math.SQRT1_2
        dy *= Math.SQRT1_2
      }
      const t = transformRef.current
      applyTransform({ ...t, x: t.x + dx, y: t.y + dy })
      keyPanRafId.current = requestAnimationFrame(stepKeyPan)
    }

    const isFormField = () => {
      const active = document.activeElement as HTMLElement | null
      if (!active) return false
      return (
        active.tagName === 'INPUT' ||
        active.tagName === 'TEXTAREA' ||
        active.tagName === 'SELECT' ||
        active.isContentEditable
      )
    }
    const isModalBlocking = () => Boolean(selectedMovie || openSpecialCard || aboutOpen)

    const handleKeyDown = (e: KeyboardEvent) => {
      const direction = ARROW_KEYS[e.key]
      if (direction) {
        if (e.ctrlKey || e.metaKey || e.altKey || isFormField() || isModalBlocking()) return
        e.preventDefault()
        if (!pressedDirectionsRef.current.has(direction)) {
          pressedDirectionsRef.current.add(direction)
          if (keyPanRafId.current === null) {
            cancelInertia()
            setInteracting(true)
            keyPanRafId.current = requestAnimationFrame(stepKeyPan)
          }
        }
        return
      }

      // "Just start typing" — open search and seed it with the character
      // rather than requiring a click on the search icon first.
      if (
        !searchOpen &&
        !isFormField() &&
        !isModalBlocking() &&
        e.key.length === 1 &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey
      ) {
        e.preventDefault()
        searchSeedCounter.current += 1
        setSearchSeed({ char: e.key, id: searchSeedCounter.current })
        setSearchOpen(true)
      }
    }

    const handleKeyUp = (e: KeyboardEvent) => {
      const direction = ARROW_KEYS[e.key]
      if (direction) pressedDirectionsRef.current.delete(direction)
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('keyup', handleKeyUp)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('keyup', handleKeyUp)
      if (keyPanRafId.current !== null) cancelAnimationFrame(keyPanRafId.current)
    }
  }, [applyTransform, cancelInertia, setInteracting, searchOpen, selectedMovie, openSpecialCard, aboutOpen])

  // Steps to the next/previous clean multiple of 10% from wherever the
  // scale currently sits (which may be off-grid from a pinch/wheel gesture)
  // — rounding down then adding 10 (or up then subtracting 10) guarantees
  // landing exactly on a multiple of 10 while always moving in the
  // requested direction by a meaningful amount.
  const zoomButton = useCallback((direction: 1 | -1) => {
    cancelInertia()
    setInteracting(false)
    // Round to the nearest whole percent first — floating-point round-trips
    // through scale = percent / 100 leave tiny drift (e.g. 110.00000000000001),
    // which is enough to make Math.ceil/floor below think it's not already
    // on a clean multiple and skip a step.
    const currentPercent = Math.round(transformRef.current.scale * 100)
    const targetPercent =
      direction === 1
        ? Math.floor(currentPercent / 10) * 10 + 10
        : Math.ceil(currentPercent / 10) * 10 - 10
    zoomToScale(size.width / 2, size.height / 2, targetPercent / 100)
    setRenderTransform(transformRef.current)
  }, [size, zoomToScale, cancelInertia, setInteracting])

  const resetView = useCallback(() => {
    cancelInertia()
    setInteracting(false)
    const scale = defaultScaleFor(size.width)
    applyTransform(
      {
        x: (size.width - WORLD_WIDTH * scale) / 2,
        y: (size.height - WORLD_HEIGHT * scale) / 2,
        scale,
      },
      true,
    )
  }, [size, cancelInertia, setInteracting, applyTransform])

  // Smoothly pans/zooms so the given world-space cell is centered in the
  // viewport, using the same animated (CSS-transitioned) path as the zoom
  // buttons and reset — not the raw per-event drag/wheel path. Runs slower
  // than those so the canvas actually gliding across to the result reads
  // clearly, rather than an instant cut.
  const focusOnCell = useCallback((left: number, top: number) => {
    cancelInertia()
    setInteracting(false, FOCUS_PAN_DURATION_MS)
    const centerX = left + CARD_WIDTH / 2
    const centerY = top + CARD_HEIGHT / 2
    applyTransform(
      {
        scale: FOCUS_SCALE,
        x: size.width / 2 - centerX * FOCUS_SCALE,
        y: size.height / 2 - centerY * FOCUS_SCALE,
      },
      true,
    )
  }, [size, cancelInertia, setInteracting, applyTransform])

  const handleSelectMovie = useCallback((item: TmdbItem) => {
    const { cellId, left, top } = focusMovie(item)
    focusOnCell(left, top)
    setFocusedCellId(cellId)
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    focusTimerRef.current = setTimeout(() => setFocusedCellId(null), FOCUS_HIGHLIGHT_MS)
  }, [focusMovie, focusOnCell])

  // Special cards live at a fixed world position but should only ever
  // become visible when explicitly summoned via search — so unlike
  // focusOnCell, this jumps the camera there with zero animation (no
  // transition at all) rather than gliding across.
  const handleSelectSpecialCard = useCallback((card: SpecialCard) => {
    cancelInertia()
    const { left, top } = getSpecialCardPosition(card)
    const el = worldRef.current
    if (el) el.style.transition = 'none'
    const centerX = left + CARD_WIDTH / 2
    const centerY = top + CARD_HEIGHT / 2
    applyTransform(
      {
        scale: FOCUS_SCALE,
        x: size.width / 2 - centerX * FOCUS_SCALE,
        y: size.height / 2 - centerY * FOCUS_SCALE,
      },
      true,
    )
    setActiveSpecialCard({ card, left, top })
    // The click that triggered this (search result / dropdown item) already
    // flipped isInteracting on via the shared pointerdown handler; cancelInertia
    // above cancels the rAF that would've flipped it back off, so without this
    // the world stays permanently pointer-events-none.
    setInteracting(false)
  }, [size, cancelInertia, applyTransform, setInteracting])

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) clearTimeout(focusTimerRef.current)
    }
  }, [])

  // Virtualization: only render the cards whose cells intersect the
  // current viewport, so the world can scale to millions of posters.
  const cards = useMemo(() => {
    const list: { id: number; left: number; top: number; visible: boolean }[] = []
    // Skip until the world has actually been centered — otherwise this
    // would momentarily compute cells for the pre-center transform (0,0,1)
    // and burn early poster-feed requests (including the #1 trending slot)
    // on cells nobody will ever see.
    if (size.width === 0 || renderTransform.scale <= 0 || !hasCentered.current) return list

    const viewLeft = -renderTransform.x / renderTransform.scale
    const viewTop = -renderTransform.y / renderTransform.scale
    const viewRight = viewLeft + size.width / renderTransform.scale
    const viewBottom = viewTop + size.height / renderTransform.scale

    // Strictly-on-screen bounds (no buffer) — used to prioritize which
    // cells get poster images first when the fetch pool is scarce.
    const strictColStart = clamp(Math.floor(viewLeft / CELL_WIDTH), 0, COLUMNS - 1)
    const strictColEnd = clamp(Math.ceil(viewRight / CELL_WIDTH), 0, COLUMNS - 1)
    const strictRowStart = clamp(Math.floor(viewTop / CELL_HEIGHT), 0, ROWS - 1)
    const strictRowEnd = clamp(Math.ceil(viewBottom / CELL_HEIGHT), 0, ROWS - 1)

    const colStart = clamp(strictColStart - BUFFER_CELLS, 0, COLUMNS - 1)
    const colEnd = clamp(strictColEnd + BUFFER_CELLS, 0, COLUMNS - 1)
    const rowStart = clamp(strictRowStart - BUFFER_CELLS, 0, ROWS - 1)
    const rowEnd = clamp(strictRowEnd + BUFFER_CELLS, 0, ROWS - 1)

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        list.push({
          id: row * COLUMNS + col,
          left: col * CELL_WIDTH,
          top: row * CELL_HEIGHT,
          visible:
            row >= strictRowStart && row <= strictRowEnd &&
            col >= strictColStart && col <= strictColEnd,
        })
      }
    }
    return list
  }, [size.width, size.height, renderTransform.x, renderTransform.y, renderTransform.scale])

  // Request poster images for whichever cells are currently in view (plus
  // buffer) — the feed hook fetches only as much as needed to fill them.
  // Strictly-visible cells are listed before the buffer ring so they get
  // priority when the fetch pool can't cover everything at once.
  useEffect(() => {
    if (cards.length === 0) return
    const ordered = [...cards].sort((a, b) => Number(b.visible) - Number(a.visible))
    ensureCells(ordered.map((c) => c.id))
  }, [cards, ensureCells, filters])

  // A summoned special card only ever exists on the canvas while its cell
  // is actually within the viewport — once the user pans/zooms it out of
  // view, it disappears (and closes its popup if it was open).
  useEffect(() => {
    if (!activeSpecialCard || size.width === 0) return
    const t = renderTransform
    const viewLeft = -t.x / t.scale
    const viewTop = -t.y / t.scale
    const viewRight = viewLeft + size.width / t.scale
    const viewBottom = viewTop + size.height / t.scale
    const centerX = activeSpecialCard.left + CARD_WIDTH / 2
    const centerY = activeSpecialCard.top + CARD_HEIGHT / 2
    const inView = centerX >= viewLeft && centerX <= viewRight && centerY >= viewTop && centerY <= viewBottom
    if (!inView) {
      setActiveSpecialCard(null)
      setOpenSpecialCard(null)
    }
  }, [renderTransform, activeSpecialCard, size])

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      className="relative h-full w-full touch-none overflow-hidden bg-black cursor-grab active:cursor-grabbing"
    >
      <SpaceBackdrop ref={backdropRef} />

      <div
        ref={worldRef}
        className={isInteracting ? 'pointer-events-none' : ''}
        style={{
          position: 'absolute',
          width: WORLD_WIDTH,
          height: WORLD_HEIGHT,
          transformOrigin: '0 0',
          willChange: 'transform',
        }}
      >
        {cards.map((card) => {
          const assignment = assignments.get(card.id)
          return (
            <PosterCard
              key={card.id}
              id={card.id}
              left={card.left}
              top={card.top}
              width={180}
              height={270}
              posterUrl={assignment ? posterUrl(assignment.posterPath) : undefined}
              title={assignment?.title}
              highlighted={card.id === focusedCellId}
              visible={card.visible}
            />
          )
        })}

        {activeSpecialCard && (
          <div
            data-special-card="true"
            style={{
              position: 'absolute',
              left: activeSpecialCard.left,
              top: activeSpecialCard.top,
              width: CARD_WIDTH,
              height: CARD_HEIGHT,
            }}
            className="z-20 cursor-pointer overflow-hidden rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] ring-2 ring-white transition-transform duration-200 ease-out hover:scale-[1.05]"
          >
            <img
              src={activeSpecialCard.card.cardImage}
              alt={activeSpecialCard.card.name}
              className="h-full w-full object-cover"
            />
          </div>
        )}
      </div>

      <SpaceVeil />

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          // Fixed pixel blur/spread here would eat a much bigger share of a
          // narrow phone viewport than a desktop one (same 320px/90px reads
          // as "edge falloff" on a 1440px-wide screen but "darkens the
          // center" on a 390px one) — scale with the viewport instead so
          // the clear center stays proportionally consistent everywhere.
          // Eased back from near-opaque now that there's an actual starfield
          // behind the grid — the vignette still focuses the centre, but the
          // stars stay legible at the edges instead of being crushed out.
          boxShadow: 'inset 0 0 clamp(120px, 34vmin, 320px) clamp(28px, 9vmin, 90px) rgba(0,0,0,0.82)',
          background:
            'radial-gradient(ellipse at center, transparent 38%, rgba(0,0,0,0.66) 100%)',
        }}
      />

      <Header onOpenAbout={() => setAboutOpen(true)} />
      <NavBar
        filters={filters}
        onChangeFilters={setFilters}
        searchOpen={searchOpen}
        onToggleSearch={() => setSearchOpen((v) => !v)}
        onTabRipple={handleTabRipple}
      />
      <GlassRipple trigger={rippleTrigger} />
      <SearchBar
        open={searchOpen}
        seed={searchSeed}
        onClose={() => setSearchOpen(false)}
        onSelect={(item) => {
          handleSelectMovie(item)
          setSearchOpen(false)
        }}
        onSelectSpecial={(card) => {
          handleSelectSpecialCard(card)
          setSearchOpen(false)
        }}
      />
      <FilterPanel
        filters={filters}
        onChange={setFilters}
        open={filterPanelOpen}
        onClose={() => setFilterPanelOpen(false)}
      />
      <ZoomControls
        scale={renderTransform.scale}
        onZoomIn={() => zoomButton(1)}
        onZoomOut={() => zoomButton(-1)}
        onReset={resetView}
        filtersOpen={filterPanelOpen}
        onToggleFilters={() => setFilterPanelOpen((v) => !v)}
        filtersActive={filtersActive}
        onOpenAbout={() => setAboutOpen(true)}
      />
      <MovieDetailModal selected={selectedMovie} onClose={() => setSelectedMovie(null)} />
      <SpecialCardModal selected={openSpecialCard} onClose={() => setOpenSpecialCard(null)} />
      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} />
    </div>
  )
}
