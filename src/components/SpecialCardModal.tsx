import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import type { SpecialCard } from '../lib/specialCards'

interface SpecialCardModalProps {
  selected: SpecialCard | null
  onClose: () => void
}

const MODAL_SPRING = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 } as const
const BACKDROP_FADE = { duration: 0.3, ease: [0.16, 1, 0.3, 1] } as const

export default function SpecialCardModal({ selected, onClose }: SpecialCardModalProps) {
  const [showVideo, setShowVideo] = useState(false)
  const open = selected !== null

  useEffect(() => {
    setShowVideo(false)
  }, [selected])

  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

  const heroImage = selected?.popupBackground ?? selected?.cardImage

  return (
    <div
      className={`fixed inset-0 z-40 flex items-center justify-center p-4 ${open ? '' : 'pointer-events-none'}`}
      onClick={onClose}
      aria-hidden={!open}
    >
      <motion.div
        className="absolute inset-0 bg-black/75 backdrop-blur-sm"
        initial={false}
        animate={{ opacity: open ? 1 : 0 }}
        transition={BACKDROP_FADE}
      />

      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={false}
        animate={{
          opacity: open ? 1 : 0,
          scale: open ? 1 : 0.92,
          filter: open ? 'blur(0px)' : 'blur(14px)',
        }}
        transition={MODAL_SPRING}
        style={{ willChange: 'transform, opacity, filter' }}
        className="relative w-full max-w-xl overflow-hidden rounded-2xl bg-[#141418] shadow-[0_30px_90px_rgba(0,0,0,0.8)] ring-1 ring-white/10 sm:max-w-2xl"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/50 text-white/80 backdrop-blur-md transition-colors hover:bg-black/70 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        {selected && (
          <>
            {showVideo && selected.videoSrc ? (
              <div className="relative aspect-video w-full bg-black">
                <video
                  ref={(el) => {
                    if (el) el.volume = 0.3
                  }}
                  src={selected.videoSrc}
                  autoPlay
                  className="absolute inset-0 h-full w-full"
                />
                <button
                  type="button"
                  onClick={() => setShowVideo(false)}
                  className="absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-xs font-medium text-white/85 backdrop-blur-md transition-colors hover:bg-black/80 hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M15 18l-6-6 6-6" />
                  </svg>
                  Back
                </button>
              </div>
            ) : (
              <div className="relative h-72 w-full bg-[#1c1c22] sm:h-80">
                {heroImage && (
                  <img src={heroImage} alt="" className="h-full w-full object-cover" />
                )}
                <div className="absolute inset-0 bg-linear-to-t from-[#141418] via-transparent to-transparent" />
              </div>
            )}

            <div className="px-6 pb-6 pt-4">
              <h2 className="text-2xl font-semibold tracking-tight text-white">{selected.name}</h2>

              {!showVideo && selected.tags && selected.tags.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {selected.tags.map((tag) => (
                    <span
                      key={tag}
                      className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-medium text-white/70 ring-1 ring-white/15"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              )}

              {showVideo && selected.videoDescription && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60">
                  {selected.videoDescription}
                </p>
              )}

              {!showVideo && selected.description && (
                <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-white/60">
                  {selected.description}
                </p>
              )}

              {!showVideo && selected.videoSrc && (
                <button
                  type="button"
                  onClick={() => setShowVideo(true)}
                  className="mt-4 inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-semibold text-black transition-colors hover:bg-white/90"
                >
                  <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Watch Now
                </button>
              )}
            </div>
          </>
        )}
      </motion.div>
    </div>
  )
}
