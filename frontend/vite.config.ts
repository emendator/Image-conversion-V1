import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5176,
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
      },
      '/uploads': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
      },
      '/style-images': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
      },
      '/slice-images': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
      },
      '/output': {
        target: 'http://127.0.0.1:8003',
        changeOrigin: true,
      },
    },
  },
})
