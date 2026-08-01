import { motion } from 'framer-motion'
import { DEFAULT_FILTERS, type FeedFilters } from '../hooks/usePosterFeed'

interface NavBarProps {
  filters: FeedFilters
  onChangeFilters: (next: FeedFilters) => void
  searchOpen: boolean
  onToggleSearch: () => void
  onTabRipple?: (origin: { x: number; y: number }) => void
}

const TABS: { key: FeedFilters['mediaType']; label: string }[] = [
  { key: 'all', label: 'Home' },
  { key: 'movie', label: 'Movies' },
  { key: 'tv', label: 'TV' },
]

// The position/size morph between tabs; the squash keyframes ride on top
// of that so the pill reads as a soft liquid blob — compressing as it
// leaves, then overshooting slightly as it lands — rather than a rigid
// shape sliding sideways.
const LIQUID_LAYOUT_SPRING = { type: 'spring', stiffness: 500, damping: 30 } as const
const LIQUID_SQUASH = { duration: 0.5, times: [0, 0.35, 0.7, 1], ease: 'easeInOut' as const }

export default function NavBar({
  filters,
  onChangeFilters,
  searchOpen,
  onToggleSearch,
  onTabRipple,
}: NavBarProps) {
  const handleTab = (key: FeedFilters['mediaType'], e: React.MouseEvent<HTMLButtonElement>) => {
    if (filters.mediaType !== key) {
      const rect = e.currentTarget.getBoundingClientRect()
      onTabRipple?.({ x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 })
    }
    if (key === 'all') {
      onChangeFilters(DEFAULT_FILTERS)
    } else {
      onChangeFilters({ ...filters, mediaType: key })
    }
  }

  return (
    <div
      className="fixed left-1/2 z-20 -translate-x-1/2"
      // Real headroom on notched phones in landscape (the notch/status-bar
      // area moves to a side, but some devices still reserve a top inset)
      // — env() is 0 wherever there's nothing to clear.
      style={{ top: 'calc(1.5rem + env(safe-area-inset-top, 0px))' }}
    >
      <div className="glass-panel flex items-center gap-1 rounded-full p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
        {TABS.map((tab) => {
          const active = filters.mediaType === tab.key
          return (
            <motion.button
              key={tab.key}
              type="button"
              onClick={(e) => handleTab(tab.key, e)}
              whileTap={{ scale: 0.95 }}
              className={`relative rounded-full px-5 py-2 text-sm font-semibold transition-colors duration-200 ${
                active ? 'text-black' : 'text-white/70 hover:text-white'
              }`}
            >
              {active && (
                <motion.span
                  layoutId="nav-active-pill"
                  className="absolute inset-0 rounded-full bg-white"
                  initial={false}
                  animate={{ scaleY: [1, 0.55, 1.12, 1], scaleX: [1, 1.08, 0.97, 1] }}
                  transition={{ layout: LIQUID_LAYOUT_SPRING, scaleY: LIQUID_SQUASH, scaleX: LIQUID_SQUASH }}
                />
              )}
              <span className="relative z-10">{tab.label}</span>
            </motion.button>
          )
        })}

        <div className="mx-1 h-6 w-px bg-white/15" />

        <motion.button
          type="button"
          data-search-toggle="true"
          onClick={onToggleSearch}
          whileTap={{ scale: 0.9 }}
          aria-label="Search"
          aria-pressed={searchOpen}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors duration-200 ${
            searchOpen ? 'bg-white/15 text-white' : 'text-white/70 hover:bg-white/10 hover:text-white'
          }`}
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="7" />
            <path d="m21 21-4.3-4.3" />
          </svg>
        </motion.button>

        <motion.button
          type="button"
          whileTap={{ scale: 0.9 }}
          aria-label="Account"
          className="flex h-10 w-10 items-center justify-center rounded-full text-white/70 transition-colors duration-200 hover:bg-white/10 hover:text-white"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 20c0-4 4-6 8-6s8 2 8 6" />
          </svg>
        </motion.button>
      </div>
    </div>
  )
}
