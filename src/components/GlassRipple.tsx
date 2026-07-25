import { useEffect, useState } from 'react'

export interface RippleTrigger {
  x: number
  y: number
  key: number
}

interface GlassRippleProps {
  trigger: RippleTrigger | null
}

// A small-to-huge frosted-glass shockwave centered on wherever the user
// just tapped — a tactile "the interface just reacted to you" flourish
// tying the nav-bar tab switch back into the same liquid-glass language as
// the rest of the chrome, without ever blocking input (fully inert).
export default function GlassRipple({ trigger }: GlassRippleProps) {
  const [expanded, setExpanded] = useState(false)

  useEffect(() => {
    if (!trigger) return
    setExpanded(false)
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setExpanded(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [trigger])

  if (!trigger) return null

  return (
    <div
      key={trigger.key}
      aria-hidden
      className="pointer-events-none fixed z-30 rounded-full"
      style={{
        left: trigger.x,
        top: trigger.y,
        width: 48,
        height: 48,
        marginLeft: -24,
        marginTop: -24,
        background:
          'radial-gradient(circle, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.12) 45%, rgba(255,255,255,0) 75%)',
        backdropFilter: 'blur(4px) saturate(160%)',
        WebkitBackdropFilter: 'blur(4px) saturate(160%)',
        transform: expanded ? 'scale(46)' : 'scale(0.15)',
        opacity: expanded ? 0 : 0.9,
        transition: expanded
          ? 'transform 0.8s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.8s ease-out'
          : 'none',
      }}
    />
  )
}
