import { memo, useState } from 'react'

interface PosterCardProps {
  id: number
  left: number
  top: number
  width: number
  height: number
  posterUrl?: string
  title?: string
  highlighted?: boolean
}

function PosterCard({ id, left, top, width, height, posterUrl, title, highlighted }: PosterCardProps) {
  const [loaded, setLoaded] = useState(false)

  return (
    <div
      data-card-id={id}
      style={{ position: 'absolute', left, top, width, height }}
      className={`group will-change-transform flex cursor-pointer items-center justify-center overflow-hidden rounded-xl bg-[#16161b] shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out hover:z-10 hover:scale-[1.05] ${
        highlighted
          ? 'poster-highlight z-20 scale-[1.12] ring-2 ring-white'
          : 'ring-1 ring-white/6'
      }`}
    >
      {posterUrl && (
        <img
          src={posterUrl}
          alt={title ?? ''}
          loading="lazy"
          decoding="async"
          onLoad={() => setLoaded(true)}
          className={`h-full w-full object-cover transition-opacity duration-300 ease-out ${
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
