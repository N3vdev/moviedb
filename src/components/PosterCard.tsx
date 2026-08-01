import { memo, useEffect, useRef, useState } from 'react'

interface PosterCardProps {
  id: number
  left: number
  top: number
  width: number
  height: number
  posterUrl?: string
  title?: string
  highlighted?: boolean
  visible?: boolean
  /** False only during the one-time initial "domino" reveal — see Canvas.tsx. */
  revealed?: boolean
}

function PosterCard({ id, left, top, width, height, posterUrl, title, highlighted, visible, revealed = true }: PosterCardProps) {
  const [loaded, setLoaded] = useState(false)
  const imgRef = useRef<HTMLImageElement>(null)

  // Cards are keyed by grid position, not by title — so a cell being
  // reassigned to a different title (e.g. restoring Home's original mix
  // after narrowing to Movies/TV) reuses the same component instance
  // rather than mounting a fresh one. Re-arm the fade so the new poster
  // cross-fades in instead of hard-cutting over the old one.
  useEffect(() => {
    setLoaded(false)
    // If the browser already has this exact image cached (e.g. it's
    // being restored to a title that was showing earlier), `complete`
    // can already be true the instant src changes — before or racing
    // with onLoad, which then never fires. Checking it directly here
    // covers that case; onLoad still covers the genuine-network case.
    if (imgRef.current?.complete && imgRef.current.naturalWidth > 0) {
      setLoaded(true)
    }
  }, [posterUrl])

  return (
    <div
      data-card-id={id}
      style={{ position: 'absolute', left, top, width, height }}
      className={`poster-card group flex cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[#0b0b0b] shadow-[0_8px_30px_rgba(0,0,0,0.5)] hover:z-10 hover:scale-[1.06] hover:shadow-[0_18px_50px_rgba(0,0,0,0.65),0_0_30px_-6px_rgba(255,255,255,0.3)] ${
        revealed ? '' : 'poster-card-hidden'
      } ${
        highlighted
          ? 'poster-highlight z-20 scale-[1.12] ring-2 ring-white'
          : 'ring-1 ring-white/8 hover:ring-white/25'
      }`}
    >
      {posterUrl && (
        <img
          ref={imgRef}
          src={posterUrl}
          alt={title ?? ''}
          loading="lazy"
          decoding="async"
          fetchPriority={visible ? 'high' : 'low'}
          onLoad={() => setLoaded(true)}
          draggable={false}
          onDragStart={(e) => e.preventDefault()}
          className={`poster-card-img h-full w-full object-cover group-hover:scale-[1.04] ${
            loaded ? 'opacity-100' : 'opacity-0'
          }`}
        />
      )}
      {(!posterUrl || !loaded) && (
        <svg
          viewBox="0 0 24 24"
          className="absolute h-10 w-10 text-white/7 transition-colors duration-200 group-hover:text-white/12"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <rect x="2" y="3" width="20" height="18" rx="2" />
          <path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5" />
        </svg>
      )}
    </div>
  )
}

export default memo(PosterCard)
