import { memo } from 'react'

interface PosterCardProps {
  left: number
  top: number
  width: number
  height: number
}

function PosterCard({ left, top, width, height }: PosterCardProps) {
  return (
    <div
      style={{ position: 'absolute', left, top, width, height }}
      className="group will-change-transform flex items-center justify-center rounded-xl bg-white/95 ring-1 ring-black/5 shadow-[0_8px_30px_rgba(0,0,0,0.35)] transition-transform duration-200 ease-out hover:z-10 hover:scale-[1.05]"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-10 w-10 text-black/5 transition-colors duration-200 group-hover:text-black/10"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      >
        <rect x="2" y="3" width="20" height="18" rx="2" />
        <path d="M7 3v18M17 3v18M2 8h5M2 16h5M17 8h5M17 16h5" />
      </svg>
    </div>
  )
}

export default memo(PosterCard)
