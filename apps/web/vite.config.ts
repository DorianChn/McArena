import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// McArena web dev server.
// - API requests are proxied to the local Fastify server (default http://127.0.0.1:8787)
// - Override with VITE_API_BASE if the API runs elsewhere.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.MCARENA_API_PROXY ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': {
        target: process.env.MCARENA_API_PROXY ?? 'http://127.0.0.1:8787',
        changeOrigin: true,
      },
    },
  },
})
