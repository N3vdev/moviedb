import { useEffect, useState } from 'react'

// A one-shot cinematic open: starts as a pinpoint (like a projector lamp
// igniting), then the aperture widens — via an animatable radial-gradient
// mask radius, see the @property --reveal-radius rule in index.css — until
// the whole canvas is uncovered, then this overlay fades out and unmounts.
export default function IntroReveal() {
  const [open, setOpen] = useState(false)
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    // Two rAFs so the initial (closed) state actually paints before the
    // transition to `open` kicks in — otherwise the browser can coalesce
    // both states into a single frame and skip the animation entirely.
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setOpen(true))
    })
    const hideTimer = setTimeout(() => setVisible(false), 2000)
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
      clearTimeout(hideTimer)
    }
  }, [])

  if (!visible) return null

  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-50 bg-black"
      style={
        {
          '--reveal-radius': open ? '75%' : '0%',
          WebkitMaskImage:
            'radial-gradient(circle at 50% 50%, transparent var(--reveal-radius), black calc(var(--reveal-radius) + 1%))',
          maskImage:
            'radial-gradient(circle at 50% 50%, transparent var(--reveal-radius), black calc(var(--reveal-radius) + 1%))',
          opacity: open ? 0 : 1,
          transition:
            '--reveal-radius 1.5s cubic-bezier(0.65, 0, 0.35, 1), opacity 0.4s ease 1.4s',
        } as React.CSSProperties
      }
    />
  )
}
