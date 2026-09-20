import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      filename: 'app-sw.js',
      includeAssets: ['favicon.svg'],
      manifest: false,
      workbox: { navigateFallback: '/index.html' },
    }),
  ],
  resolve: {
    alias: { '@': '/src' },
  },
})
