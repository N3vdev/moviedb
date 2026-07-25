import { useEffect, useRef, useState } from 'react'

export interface DropdownOption {
  value: string
  label: string
}

interface DropdownProps {
  value: string
  options: DropdownOption[]
  onChange: (value: string) => void
  className?: string
}

// A styled stand-in for <select> — native dropdown popups are rendered by
// the OS/browser and can't be restyled with CSS, which is what caused the
// contrast issues. This one is fully our own markup, so colors, spacing,
// and open/close animation are all controllable.
export default function Dropdown({ value, options, onChange, className = '' }: DropdownProps) {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const current = options.find((o) => o.value === value)

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={`flex items-center gap-2 rounded-lg bg-white/8 px-3 py-1.5 text-xs font-medium text-white/85 ring-1 ring-white/15 transition-colors hover:bg-white/15 ${
          open ? 'bg-white/15' : ''
        }`}
      >
        <span className="truncate">{current?.label ?? '—'}</span>
        <svg
          viewBox="0 0 24 24"
          className={`h-3.5 w-3.5 shrink-0 text-white/50 transition-transform duration-200 ${
            open ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
      </button>

      <div
        role="listbox"
        className={`absolute left-0 top-[calc(100%+6px)] z-20 max-h-56 min-w-[8rem] origin-top overflow-y-auto rounded-xl bg-[#1c1c22] p-1 shadow-[0_20px_50px_rgba(0,0,0,0.6)] ring-1 ring-white/10 backdrop-blur-md transition-all duration-150 ease-out ${
          open
            ? 'translate-y-0 scale-100 opacity-100'
            : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
        }`}
      >
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            role="option"
            aria-selected={opt.value === value}
            onClick={() => {
              onChange(opt.value)
              setOpen(false)
            }}
            className={`flex w-full items-center rounded-lg px-3 py-1.5 text-left text-xs transition-colors ${
              opt.value === value
                ? 'bg-white font-semibold text-black'
                : 'text-white/75 hover:bg-white/10 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  )
}
