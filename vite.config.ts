/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // PGlite (dev-only local preview) loads its own WebAssembly; don't pre-bundle it.
  optimizeDeps: { exclude: ['@electric-sql/pglite'] },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // The demo sits behind Cloudflare Access: fetch the manifest with the
      // Access cookie, or Chrome can't read it and won't offer to install.
      useCredentials: true,
      includeAssets: ['icons/favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'Kumara Bhavanam',
        short_name: 'Kumara Bhavanam',
        description: 'Bookings, guests, payments and bills for Kumara Bhavanam homestay.',
        lang: 'en-IN',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'portrait',
        theme_color: '#0F5E5A',
        background_color: '#FFFBF5',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        globPatterns: ['**/*.{js,css,html,svg,png,webp,woff2}'],
        // jsPDF's optional add-ons (HTML and SVG import) are never used: the
        // bill is drawn on a canvas. Don't make every phone download them.
        globIgnores: ['**/html2canvas*.js', '**/purify*.js', '**/index.es-*.js'],
        // Supabase responses hold guest names and phone numbers: never cache them
        // in the service worker. Only Google Fonts are cached at runtime.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts',
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
