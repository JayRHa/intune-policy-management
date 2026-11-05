import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Must match the port uvicorn listens on. start.sh exports BACKEND_PORT
// (default 8000); when running the frontend manually: BACKEND_PORT=8099 npm run dev
const backendPort = process.env.BACKEND_PORT ?? '8000'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': `http://localhost:${backendPort}`,
    },
  },
})
