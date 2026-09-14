import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/domain': 'http://127.0.0.1:8000',
      '/map': 'http://127.0.0.1:8000',
      '/profile': 'http://127.0.0.1:8000',
      '/stats': 'http://127.0.0.1:8000',
      '/argo-samples': 'http://127.0.0.1:8000',
      '/embedding-image': 'http://127.0.0.1:8000',
    }
  }
})
