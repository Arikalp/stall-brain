import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.js',
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'favicon.png', 'favicon-192.png', 'favicon-512.png', 'logo.svg', 'logo-icon.png'],
      manifest: {
        name: 'Bazaar Brain',
        short_name: 'BazaarBrain',
        description: 'AI daily procurement planner for street vendors in Lucknow',
        theme_color: '#0D0D0D',
        background_color: '#0D0D0D',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: '/favicon-192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: '/favicon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,ico,png,jpg,svg}'],
      },
    }),
  ],
})
