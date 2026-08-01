import { useEffect, useState } from 'react'

interface ZoomControlsProps {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
  filtersOpen: boolean
  onToggleFilters: () => void
  filtersActive: boolean
  onOpenAbout: () => void
}

export default function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
  filtersOpen,
  onToggleFilters,
  filtersActive,
  onOpenAbout,
}: ZoomControlsProps) {
  const [isFullscreen, setIsFullscreen] = useState(() => !!document.fullscreenElement)

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen().catch(() => {})
    }
  }

  return (
    <div
      className="glass-panel fixed right-6 z-10 flex items-center gap-1 rounded-full p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]"
      // A mobile browser's own bottom bar (URL bar / home-indicator) can
      // sit right where a plain `bottom-6` would — env() is 0 on browsers
      // that don't support it (calc() falls back to just the 1.5rem), and
      // real on ones that do (see viewport-fit=cover in index.html), so
      // this never has less than 1.5rem of clearance either way.
      style={{ bottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
    >
      <button
        type="button"
        onClick={onToggleFilters}
        aria-label="Toggle filters"
        aria-pressed={filtersOpen}
        className={`relative flex h-9 w-9 items-center justify-center rounded-full transition-colors ${
          filtersOpen || filtersActive
            ? 'bg-white/15 text-white'
            : 'text-white/80 hover:bg-white/15 hover:text-white'
        }`}
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M7 12h10M10 18h4" />
        </svg>
        {filtersActive && (
          <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-white" />
        )}
      </button>
      <div className="mx-1 h-5 w-px bg-white/15" />
      <button
        type="button"
        onClick={onZoomOut}
        aria-label="Zoom out"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        &#8722;
      </button>
      <span className="w-12 select-none text-center text-xs tabular-nums text-white/70">
        {Math.round(scale * 100)}%
      </span>
      <button
        type="button"
        onClick={onZoomIn}
        aria-label="Zoom in"
        className="flex h-9 w-9 items-center justify-center rounded-full text-lg text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        &#43;
      </button>
      <div className="mx-1 h-5 w-px bg-white/15" />
      <button
        type="button"
        onClick={onReset}
        aria-label="Reset view"
        className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.75">
          <path d="M4 4v6h6M20 20v-6h-6" />
          <path d="M20 10a8 8 0 0 0-14.6-4.6M4 14a8 8 0 0 0 14.6 4.6" />
        </svg>
      </button>
      <div className="mx-1 h-5 w-px bg-white/15" />
      <button
        type="button"
        onClick={onOpenAbout}
        aria-label="About & disclaimer"
        className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 11v5" strokeLinecap="round" />
          <circle cx="12" cy="7.5" r="1.1" fill="currentColor" stroke="none" />
        </svg>
      </button>
      <div className="mx-1 h-5 w-px bg-white/15" />
      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
        aria-pressed={isFullscreen}
        className="flex h-9 w-9 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/15 hover:text-white"
      >
        {isFullscreen ? (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M9 4v3a2 2 0 0 1-2 2H4M20 9h-3a2 2 0 0 1-2-2V4M15 20v-3a2 2 0 0 1 2-2h3M4 15h3a2 2 0 0 1 2 2v3" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 9V6a2 2 0 0 1 2-2h3M20 9V6a2 2 0 0 1-2-2h-3M4 15v3a2 2 0 0 0 2 2h3M20 15v3a2 2 0 0 1-2 2h-3" />
          </svg>
        )}
      </button>
    </div>
  )
}
