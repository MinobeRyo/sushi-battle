import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rolldownOptions: {
      input: { game: 'index.html', soundLab: 'se-lab.html' },
    },
  },
  server: {
    strictPort: true,
    headers: { 'Cache-Control': 'no-store' },
    proxy: {
      '/socket.io': { target: 'http://127.0.0.1:3001', ws: true },
      // Local testing uses the same request contract as the uploaded PHP bridge.
      '/api.php': { target: 'http://127.0.0.1:3001', rewrite: () => '/api/room' },
      // `--mode cloudflare` の画面を手元の Node 版サーバーで試す場合。
      '/api/room': { target: 'http://127.0.0.1:3001' },
    },
  },
  preview: {
    headers: { 'Cache-Control': 'no-store' },
  },
})
