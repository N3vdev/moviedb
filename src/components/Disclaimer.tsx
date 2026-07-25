import { useEffect, useState } from 'react'

const STORAGE_KEY = 'nevatlas-disclaimer-accepted'

// Shown once per browser (localStorage-gated) — a personal-project notice,
// not a cookie-consent-style nag, so it never reappears once accepted and
// never blocks on anything beyond a single explicit click.
export default function Disclaimer() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== 'true') {
        setOpen(true)
      }
    } catch {
      // localStorage unavailable (private browsing, etc.) — fail open
      setOpen(true)
    }
  }, [])

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true')
    } catch {
      // ignore — nothing to persist, it'll just show again next visit
    }
    setOpen(false)
  }

  return (
    <div
      className={`fixed inset-0 z-60 flex items-center justify-center p-4 transition-opacity duration-300 ${
        open ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
      aria-hidden={!open}
    >
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />

      <div
        className={`glass-panel relative w-full max-w-sm overflow-hidden rounded-2xl shadow-[0_30px_90px_rgba(0,0,0,0.8)] transition-all duration-300 ${
          open ? 'scale-100 opacity-100' : 'scale-95 opacity-0'
        }`}
      >
        <div className="flex flex-col items-center gap-3 px-6 pb-6 pt-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-linear-to-br from-white to-white/60 shadow-[0_2px_10px_rgba(255,255,255,0.2)]">
            <svg viewBox="0 0 24 24" className="h-6 w-6 text-black" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          </div>

          <h2 className="text-lg font-extrabold tracking-tight text-white">
            Welcome to Nev<span className="font-medium text-white/55">Atlas</span>
          </h2>

          <p className="text-sm leading-relaxed text-white/60">
            This is a personal project — the site does not host or store any data.
          </p>

          <button
            type="button"
            onClick={accept}
            className="mt-2 w-full rounded-full bg-white px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-white/90"
          >
            Got it
          </button>

          <p className="mt-1 text-xs text-white/30">Made with ❤️, By Nevin</p>
        </div>
      </div>
    </div>
  )
}
