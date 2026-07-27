import { useEffect } from 'react'
import { motion } from 'framer-motion'

interface AboutModalProps {
  open: boolean
  onClose: () => void
}

const MODAL_SPRING = { type: 'spring', stiffness: 340, damping: 32, mass: 0.9 } as const
const BACKDROP_FADE = { duration: 0.3, ease: [0.16, 1, 0.3, 1] } as const

export default function AboutModal({ open, onClose }: AboutModalProps) {
  useEffect(() => {
    if (!open) return
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [open, onClose])

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
        className="glass-panel relative w-full max-w-sm overflow-hidden rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)]"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 z-10 flex h-9 w-9 items-center justify-center rounded-full bg-black/30 text-white/80 backdrop-blur-md transition-colors hover:bg-black/50 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>

        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-linear-to-br from-white to-white/60 shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
            <img src={`${import.meta.env.BASE_URL}fmhy.ico`} alt="" className="h-full w-full object-cover" />
          </div>

          <h2 className="text-lg font-extrabold tracking-tight text-white">
            Nev<span className="font-medium text-white/55">Atlas</span>
          </h2>

          <p className="text-sm leading-relaxed text-white/60">
            This is a personal project — the site does not host or store any data.
          </p>

          <p className="text-sm leading-relaxed text-white/60">
            I love building stuff like this in my free time — an excuse to mix design,
            code, and way too many hours spent tweaking animations until they feel
            just right.
          </p>

          <p className="mt-1 text-xs text-white/30">Made with 💖, By Nevin</p>
        </div>
      </motion.div>
    </div>
  )
}
