import { TOTAL_CARDS } from '../lib/gridConfig'

export default function Header() {
  return (
    <div className="pointer-events-none fixed left-6 top-6 z-10 select-none">
      <h1 className="text-xl font-semibold tracking-tight text-white/90">
        CineAtlas
      </h1>
      <p className="mt-1 text-sm text-white/40">
        Every film, worldwide — one infinite canvas.
      </p>
      <p className="mt-3 text-xs uppercase tracking-widest text-white/25">
        {TOTAL_CARDS.toLocaleString()} slots ready
      </p>
    </div>
  )
}
