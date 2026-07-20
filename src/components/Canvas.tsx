import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import PosterCard from './PosterCard'
import Header from './Header'
import ZoomControls from './ZoomControls'
import {
  CELL_WIDTH,
  CELL_HEIGHT,
  COLUMNS,
  ROWS,
  WORLD_WIDTH,
  WORLD_HEIGHT,
  MIN_SCALE,
  MAX_SCALE,
} from '../lib/gridConfig'

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
  const pinch = useRef<{ lastDist: number; lastMid: Point } | null>(null)
  const velocity = useRef<Point>({ x: 0, y: 0 })
  const lastMoveTime = useRef(0)
  const rafId = useRef<number | null>(null)
  const wheelIdleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasCentered = useRef(false)

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
    if (immediate) {
      setRenderTransform(t)
    } else {
      scheduleSync()
    }
  }, [scheduleSync])

  const setInteracting = useCallback((flag: boolean) => {
    setIsInteracting(flag)
    const el = worldRef.current
    if (el) {
      el.style.transition = flag ? 'none' : 'transform 300ms cubic-bezier(0.16, 1, 0.3, 1)'
    }
  }, [])

  useLayoutEffect(() => {
    const el = worldRef.current
    if (el) el.style.transition = 'none'
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
    applyTransform(
      {
        x: (size.width - WORLD_WIDTH) / 2,
        y: (size.height - WORLD_HEIGHT) / 2,
        scale: 1,
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

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture(e.pointerId)
    cancelInertia()
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    setInteracting(true)

    if (pointers.current.size === 1) {
      dragLast.current = { x: e.clientX, y: e.clientY }
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
      const t = transformRef.current
      applyTransform({ ...t, x: t.x + dx, y: t.y + dy })

      const now = performance.now()
      const dt = Math.max(now - lastMoveTime.current, 1)
      velocity.current = { x: (dx / dt) * 16, y: (dy / dt) * 16 }
      lastMoveTime.current = now
      dragLast.current = { x: e.clientX, y: e.clientY }
    }
  }, [zoomAt, applyTransform])

  const handlePointerUp = useCallback((e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId)
    pinch.current = null

    if (pointers.current.size === 0) {
      dragLast.current = null
      startInertia()
    } else if (pointers.current.size === 1) {
      const remaining = Array.from(pointers.current.values())[0]
      dragLast.current = { x: remaining.x, y: remaining.y }
    }
  }, [startInertia])

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

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    cancelInertia()
    zoomAt(e.clientX - rect.left, e.clientY - rect.top, 1.6)
  }, [zoomAt, cancelInertia])

  const zoomButton = useCallback((factor: number) => {
    cancelInertia()
    setInteracting(false)
    zoomAt(size.width / 2, size.height / 2, factor)
    setRenderTransform(transformRef.current)
  }, [size, zoomAt, cancelInertia, setInteracting])

  const resetView = useCallback(() => {
    cancelInertia()
    setInteracting(false)
    applyTransform(
      {
        x: (size.width - WORLD_WIDTH) / 2,
        y: (size.height - WORLD_HEIGHT) / 2,
        scale: 1,
      },
      true,
    )
  }, [size, cancelInertia, setInteracting, applyTransform])

  // Virtualization: only render the cards whose cells intersect the
  // current viewport, so the world can scale to millions of posters.
  const cards: { id: number; left: number; top: number }[] = []
  if (size.width > 0 && renderTransform.scale > 0) {
    const viewLeft = -renderTransform.x / renderTransform.scale
    const viewTop = -renderTransform.y / renderTransform.scale
    const viewRight = viewLeft + size.width / renderTransform.scale
    const viewBottom = viewTop + size.height / renderTransform.scale

    const colStart = clamp(Math.floor(viewLeft / CELL_WIDTH) - BUFFER_CELLS, 0, COLUMNS - 1)
    const colEnd = clamp(Math.ceil(viewRight / CELL_WIDTH) + BUFFER_CELLS, 0, COLUMNS - 1)
    const rowStart = clamp(Math.floor(viewTop / CELL_HEIGHT) - BUFFER_CELLS, 0, ROWS - 1)
    const rowEnd = clamp(Math.ceil(viewBottom / CELL_HEIGHT) + BUFFER_CELLS, 0, ROWS - 1)

    for (let row = rowStart; row <= rowEnd; row++) {
      for (let col = colStart; col <= colEnd; col++) {
        cards.push({
          id: row * COLUMNS + col,
          left: col * CELL_WIDTH,
          top: row * CELL_HEIGHT,
        })
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      className="relative h-full w-full touch-none overflow-hidden bg-[#08080a] cursor-grab active:cursor-grabbing"
      style={{
        backgroundImage:
          'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.06) 1px, transparent 0)',
        backgroundSize: '32px 32px',
      }}
    >
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
        {cards.map((card) => (
          <PosterCard key={card.id} left={card.left} top={card.top} width={180} height={270} />
        ))}
      </div>

      <div
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: 'inset 0 0 320px 90px rgba(0,0,0,0.95)',
          background:
            'radial-gradient(ellipse at center, transparent 35%, rgba(0,0,0,0.8) 100%)',
        }}
      />

      <Header />
      <ZoomControls
        scale={renderTransform.scale}
        onZoomIn={() => zoomButton(1.4)}
        onZoomOut={() => zoomButton(1 / 1.4)}
        onReset={resetView}
      />
    </div>
  )
}
