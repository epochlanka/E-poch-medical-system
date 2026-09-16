import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: { dedupe: ['react', 'react-dom', 'react-router', 'react-router-dom'] },

  server: {
    host: true,
    fs: { allow: ['..'] },
    port: Number(process.env.PORT) || 5175,
    watch: {
      usePolling: true
    }
  }
})
