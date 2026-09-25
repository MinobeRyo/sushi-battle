import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    strictPort: true,
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      // Local testing uses the same request contract as the uploaded PHP bridge.
      '/api.php': { target: 'http://127.0.0.1:3001', rewrite: () => '/api/room' },
    },
  },
})
