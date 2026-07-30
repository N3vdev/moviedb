import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// https://vite.dev/config/
export default defineConfig({
  base: '/moviedb/',
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        // Splits framer-motion into its own cacheable chunk. Still loaded
        // eagerly (no lazy/dynamic import — same load order and timing as
        // before), but since it rarely changes between deploys, returning
        // visitors can reuse the cached chunk instead of re-downloading it
        // every time unrelated app code changes.
        manualChunks(id) {
          if (id.includes('node_modules/framer-motion') || id.includes('node_modules/motion-dom') || id.includes('node_modules/motion-utils')) {
            return 'framer-motion'
          }
        },
      },
    },
  },
})
