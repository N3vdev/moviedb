import { useEffect, useState } from 'react'
import Canvas from './components/Canvas'
import IntroReveal from './components/IntroReveal'

function App() {
  const [focused, setFocused] = useState(false)

  useEffect(() => {
    let raf2 = 0
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setFocused(true))
    })
    return () => {
      cancelAnimationFrame(raf1)
      cancelAnimationFrame(raf2)
    }
  }, [])

  return (
    <div className="h-screen w-screen overflow-hidden bg-black">
      <div
        className="h-full w-full"
        style={{
          filter: focused ? 'blur(0px)' : 'blur(18px)',
          transform: focused ? 'scale(1)' : 'scale(1.04)',
          transition:
            'filter 1.1s cubic-bezier(0.16, 1, 0.3, 1), transform 1.3s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <Canvas />
      </div>
      <IntroReveal />
    </div>
  )
}

export default App
