interface ZoomControlsProps {
  scale: number
  onZoomIn: () => void
  onZoomOut: () => void
  onReset: () => void
}

export default function ZoomControls({
  scale,
  onZoomIn,
  onZoomOut,
  onReset,
}: ZoomControlsProps) {
  return (
    <div className="fixed bottom-6 right-6 z-10 flex items-center gap-1 rounded-full bg-[#1c1c22]/90 p-1.5 shadow-[0_8px_30px_rgba(0,0,0,0.6)] ring-1 ring-white/15 backdrop-blur-md">
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
    </div>
  )
}
